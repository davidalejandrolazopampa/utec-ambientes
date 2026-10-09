package pe.edu.utec.reservas.security;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
import org.springframework.web.cors.CorsConfigurationSource;
@Configuration @EnableWebSecurity @EnableMethodSecurity(prePostEnabled = true) @RequiredArgsConstructor
public class SecurityConfig {
    private final JwtAuthenticationFilter jwtAuthFilter;
    private final JwtAuthenticationEntryPoint jwtEntryPoint;
    private final CorsConfigurationSource corsConfigurationSource;
    private static final String[] PUBLIC = {
            "/api/v1/auth/**",
            "/api-docs/**",
            "/v3/api-docs/**",
            "/swagger-ui/**",
            "/swagger-ui.html",
            "/swagger-resources/**",
            "/webjars/**"
    };
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.cors(c -> c.configurationSource(corsConfigurationSource))
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(e -> e.authenticationEntryPoint(jwtEntryPoint))
                .authorizeHttpRequests(a -> a
                        .requestMatchers(PUBLIC).permitAll()
                        // Actuator: solo health/info son públicos (healthcheck del contenedor);
                        // el resto (metrics, flyway, env...) requiere ADMIN para no filtrar el esquema/metadatos.
                        .requestMatchers("/actuator/health/**", "/actuator/info").permitAll()
                        .requestMatchers("/actuator/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/laboratorios/mis-laboratorios").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/v1/laboratorios/**").permitAll()
                        // Datos de personal (PII): requieren autenticación. Los roles finos
                        // se aplican con @PreAuthorize en UsuarioController.
                        .requestMatchers(HttpMethod.GET, "/api/v1/usuarios/**").authenticated()
                        // Bloqueos: requieren autenticación. BloqueoResponse expone el
                        // nombre y correo del responsable (PII); no debe ser público.
                        .requestMatchers(HttpMethod.GET, "/api/v1/bloqueos/**").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/v1/analytics/**").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/v1/estructura/**").permitAll()
                        // SSE: el stream se autentica por TICKET en el query (EventSource no manda
                        // Bearer), así que la ruta es permitAll y RealtimeService valida el ticket.
                        // El ticket (POST /events/ticket) sí exige auth (cae en anyRequest.authenticated).
                        .requestMatchers(HttpMethod.GET, "/api/v1/events/stream").permitAll()
                        // El responsable de laboratorio puede gestionar las mesas/recursos de un lab
                        .requestMatchers(HttpMethod.POST, "/api/v1/laboratorios/*/recursos").hasAnyRole("ADMIN","COORDINADOR","RESPONSABLE_LAB")
                        // Crear un laboratorio nuevo sigue siendo solo ADMIN/COORDINADOR
                        .requestMatchers(HttpMethod.POST,"/api/v1/laboratorios/**").hasAnyRole("ADMIN","COORDINADOR")
                        // Crear/editar bloqueos: autenticado; los roles se aplican con
                        // @PreAuthorize en BloqueoController (ADMIN/COORDINADOR/DIRECTOR/RESPONSABLE_LAB).
                        .requestMatchers(HttpMethod.POST, "/api/v1/bloqueos/**").authenticated()
                        // Generar/leer QR exige autenticación: el contenido del QR incluye el
                        // código de check-in del recurso y no debe ser enumerable públicamente.
                        .requestMatchers(HttpMethod.GET, "/api/v1/qr/**").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/v1/usuarios/*/laboratorios/*").hasAnyRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/v1/usuarios/*/laboratorios/*").hasAnyRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/v1/usuarios/*/responsables/*").hasAnyRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/v1/usuarios/*/responsables/*").hasAnyRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/v1/usuarios/*/labs-dirige/*").hasAnyRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/v1/usuarios/*/labs-dirige/*").hasAnyRole("ADMIN")
                        .requestMatchers("/api/v1/organizacion/**").hasAnyRole("ADMIN")
                        .requestMatchers("/api/v1/reservas/**").authenticated()
                        .requestMatchers("/api/v1/auditoria/**").hasAnyRole("ADMIN")
                        .anyRequest().authenticated())
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
                .headers(h -> h
                        .frameOptions(f -> f.deny())
                        // X-Content-Type-Options: nosniff ya viene por defecto en Spring Security.
                        .httpStrictTransportSecurity(hsts -> hsts.includeSubDomains(true).maxAgeInSeconds(31536000))
                        .referrerPolicy(rp -> rp.policy(ReferrerPolicy.NO_REFERRER))
                        // CSP por ruta: el API es JSON puro → 'none' (endurecido por la auditoría).
                        // Swagger UI necesita ejecutar su JS/estilos y hacer fetch del spec, así que
                        // SOLO en sus rutas se relaja a 'self' + inline (no afecta a los endpoints).
                        .addHeaderWriter((request, response) -> {
                            String uri = request.getRequestURI();
                            boolean swagger = uri.startsWith("/swagger-ui") || uri.startsWith("/api-docs")
                                    || uri.startsWith("/v3/api-docs") || uri.startsWith("/swagger-resources")
                                    || uri.startsWith("/webjars");
                            response.setHeader("Content-Security-Policy", swagger
                                    ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'"
                                    : "default-src 'none'; frame-ancestors 'none'");
                        }));
        return http.build();
    }
    @Bean public AuthenticationManager authenticationManager(AuthenticationConfiguration c) throws Exception { return c.getAuthenticationManager(); }
}
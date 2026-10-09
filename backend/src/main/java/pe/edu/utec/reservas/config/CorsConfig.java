package pe.edu.utec.reservas.config;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import java.util.Arrays;
import java.util.List;
@Configuration
public class CorsConfig {
    @Value("${app.cors.allowed-origins}") private String allowedOrigins;
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration c = new CorsConfiguration();
        // Patterns (no solo exactos): permite comodines como https://*.trycloudflare.com
        // para los túneles de demo, cuya URL cambia en cada reinicio.
        c.setAllowedOriginPatterns(Arrays.asList(allowedOrigins.split(",")));
        c.setAllowedMethods(List.of("GET","POST","PUT","DELETE","PATCH","OPTIONS"));
        // Cabeceras explícitas en vez de "*": con allowCredentials=true conviene no abrir todas.
        c.setAllowedHeaders(List.of("Authorization","Content-Type","Accept","Origin","X-Requested-With"));
        c.setAllowCredentials(true);
        c.setMaxAge(3600L);
        c.setExposedHeaders(List.of("Authorization","X-Total-Count"));
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", c);
        return source;
    }
}

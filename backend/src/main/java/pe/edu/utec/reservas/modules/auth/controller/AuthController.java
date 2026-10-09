package pe.edu.utec.reservas.modules.auth.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import pe.edu.utec.reservas.modules.auth.dto.AuthResponse;
import pe.edu.utec.reservas.modules.auth.dto.GoogleTokenRequest;
import pe.edu.utec.reservas.modules.auth.service.AuthService;
import pe.edu.utec.reservas.modules.iam.dto.UsuarioResponse;
import pe.edu.utec.reservas.modules.iam.service.UsuarioService;
import pe.edu.utec.reservas.shared.dto.ApiResponse;
import pe.edu.utec.reservas.shared.exceptions.BusinessException;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@Tag(name = "Auth", description = "Autenticación con Google OAuth2 y JWT")
public class AuthController {

    /**
     * El refresh token se entrega como cookie HttpOnly (inaccesible a JS, mitiga el
     * robo por XSS). El access token sí viaja en el body porque el frontend lo manda
     * en el header Authorization (no es vulnerable a CSRF). Ruta acotada a /auth para
     * que la cookie no se envíe en cada request de la API.
     */
    private static final String REFRESH_COOKIE = "refresh_token";
    private static final String COOKIE_PATH = "/api/v1/auth";

    private final AuthService authService;
    private final UsuarioService usuarioService;

    @Value("${app.auth.cookie-secure:false}")
    private boolean cookieSecure;

    @Value("${app.jwt.refresh-expiration-ms}")
    private long refreshExpMs;

    @PostMapping("/google")
    @Operation(summary = "Login con Google")
    public ResponseEntity<ApiResponse<AuthResponse>> loginWithGoogle(
            @Valid @RequestBody GoogleTokenRequest request,
            HttpServletResponse response) {
        AuthResponse auth = authService.loginWithGoogle(request.getCredential());
        emitirRefreshCookie(response, auth.getRefreshToken(), refreshExpMs / 1000);
        auth.setRefreshToken(null); // no se expone al cliente (queda solo en la cookie)
        return ResponseEntity.ok(ApiResponse.ok(auth));
    }

    @PostMapping("/refresh")
    @Operation(summary = "Renovar token", description = "Usa el refresh token de la cookie HttpOnly.")
    public ResponseEntity<ApiResponse<AuthResponse>> refreshToken(
            @CookieValue(name = REFRESH_COOKIE, required = false) String refreshToken,
            HttpServletResponse response) {
        if (refreshToken == null || refreshToken.isBlank()) {
            throw new BusinessException("No hay sesión activa", "NO_REFRESH_TOKEN");
        }
        AuthResponse auth = authService.refreshToken(refreshToken);
        emitirRefreshCookie(response, auth.getRefreshToken(), refreshExpMs / 1000); // rotación
        auth.setRefreshToken(null);
        return ResponseEntity.ok(ApiResponse.ok(auth));
    }

    @PostMapping("/logout")
    @Operation(summary = "Cerrar sesión", description = "Borra la cookie del refresh token.")
    public ResponseEntity<ApiResponse<Void>> logout(HttpServletResponse response) {
        emitirRefreshCookie(response, "", 0); // Max-Age=0 → el navegador la elimina
        return ResponseEntity.ok(ApiResponse.<Void>ok(null));
    }

    @GetMapping("/me")
    @Operation(summary = "Mi perfil", description = "Datos del usuario autenticado.")
    public ResponseEntity<ApiResponse<UsuarioResponse>> me(
            @AuthenticationPrincipal UserDetails userDetails) {
        // Sin sesión (p. ej. tras F5: el access token vive solo en memoria y se perdió):
        // devolver 401 para que el interceptor del frontend dispare /auth/refresh con la
        // cookie HttpOnly y rehidrate la sesión. Antes, al ser /auth/** público, llegaba
        // aquí con userDetails=null → NPE → 500, y el interceptor (que solo refresca ante
        // 401) NO reintentaba → el usuario quedaba deslogueado al refrescar la página.
        if (userDetails == null) {
            return ResponseEntity.status(401).body(
                    ApiResponse.error("No autenticado", "UNAUTHENTICATED", 401, "/api/v1/auth/me"));
        }
        return ResponseEntity.ok(ApiResponse.ok(
                usuarioService.obtenerPorCorreo(userDetails.getUsername())));
    }

    private void emitirRefreshCookie(HttpServletResponse response, String value, long maxAgeSeconds) {
        ResponseCookie cookie = ResponseCookie.from(REFRESH_COOKIE, value)
                .httpOnly(true)
                .secure(cookieSecure)   // true en prod (HTTPS); false en local (HTTP)
                .sameSite("Strict")
                .path(COOKIE_PATH)
                .maxAge(maxAgeSeconds)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }
}

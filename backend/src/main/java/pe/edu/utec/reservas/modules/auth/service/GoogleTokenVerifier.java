package pe.edu.utec.reservas.modules.auth.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import pe.edu.utec.reservas.shared.exceptions.BusinessException;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Verifica el token de Google contra la API de Google.
 * Retorna email, nombre y apellido si el token es válido.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GoogleTokenVerifier {

    @Value("${app.google.client-id}")
    private String googleClientId;

    @Value("${app.google.allowed-domain}")
    private String allowedDomain;

    private final ObjectMapper objectMapper;

    // Cliente HTTP reutilizable. Se deja como campo (no se crea por llamada) para poder
    // sustituirlo por un mock en los tests sin tocar la red.
    private HttpClient httpClient = HttpClient.newHttpClient();

    /**
     * Verifica el credential (ID token) de Google.
     * @return Map con "email", "given_name", "family_name", "picture"
     * @throws RuntimeException si el token es inválido o el dominio no es permitido
     */
    public Map<String, String> verify(String credential) {
        try {
            // Llamar a la API de Google para verificar el token. El credential se
            // URL-codifica para que no pueda inyectar parámetros extra en la query (CWE-88).
            String encoded = URLEncoder.encode(credential, StandardCharsets.UTF_8);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create("https://oauth2.googleapis.com/tokeninfo?id_token=" + encoded))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) {
                log.warn("Fallo de autenticación: token de Google rechazado (status {})", response.statusCode());
                throw new BusinessException("No se pudo validar tu sesión de Google. Vuelve a intentarlo.", "INVALID_GOOGLE_TOKEN");
            }

            JsonNode json = objectMapper.readTree(response.body());

            // Verificar que el audience coincida con nuestro client ID
            String aud = json.get("aud").asText();
            if (!aud.equals(googleClientId)) {
                log.warn("Fallo de autenticación: audience del token no coincide con el client ID");
                throw new BusinessException("No se pudo validar tu sesión de Google.", "INVALID_GOOGLE_TOKEN");
            }

            // Extraer email y verificar dominio
            String email = json.get("email").asText();
            if (!email.endsWith("@" + allowedDomain)) {
                log.warn("Fallo de autenticación: dominio no permitido para {}", email);
                throw new BusinessException(
                        "Debes iniciar sesión con tu correo institucional (@" + allowedDomain + "). " +
                        "Usa tu cuenta UTEC, no un correo personal.",
                        "INVALID_DOMAIN");
            }

            // Verificar que el email está verificado
            boolean emailVerified = json.has("email_verified")
                    && json.get("email_verified").asText().equals("true");
            if (!emailVerified) {
                log.warn("Fallo de autenticación: email no verificado por Google para {}", email);
                throw new BusinessException("Tu correo de Google aún no está verificado.", "EMAIL_NOT_VERIFIED");
            }

            return Map.of(
                    "email", email,
                    "given_name", json.has("given_name") ? json.get("given_name").asText() : "",
                    "family_name", json.has("family_name") ? json.get("family_name").asText() : "",
                    "picture", json.has("picture") ? json.get("picture").asText() : ""
            );

        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            log.error("Error verificando token de Google: {}", e.getMessage());
            throw new RuntimeException("Error al verificar con Google: " + e.getMessage());
        }
    }
}
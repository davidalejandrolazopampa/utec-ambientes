package pe.edu.utec.reservas.security;
import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import javax.crypto.SecretKey;
import java.util.Date;
@Slf4j
@Component
public class JwtTokenProvider {
    private final SecretKey key;
    private final long accessExp;
    private final long refreshExp;
    public JwtTokenProvider(@Value("${app.jwt.secret}") String secret,
                            @Value("${app.jwt.access-expiration-ms}") long accessExp,
                            @Value("${app.jwt.refresh-expiration-ms}") long refreshExp) {
        // Fail-fast: el secreto debe estar definido (vía JWT_SECRET) y tener al
        // menos 32 caracteres (256 bits) para HMAC-SHA256. Sin esto, la app no arranca.
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException(
                "app.jwt.secret no está definido. Configura la variable de entorno JWT_SECRET.");
        }
        byte[] secretBytes = secret.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        if (secretBytes.length < 32) {
            throw new IllegalStateException(
                "app.jwt.secret es demasiado corto (" + secretBytes.length +
                " bytes). Se requieren al menos 32 bytes (256 bits) para HMAC-SHA256.");
        }
        this.key = Keys.hmacShaKeyFor(secretBytes);
        this.accessExp = accessExp;
        this.refreshExp = refreshExp;
    }
    public String generateAccessToken(String email, String role) {
        return Jwts.builder().subject(email).claim("roles","ROLE_"+role)
            .issuedAt(new Date()).expiration(new Date(System.currentTimeMillis()+accessExp)).signWith(key).compact();
    }
    public String generateRefreshToken(String email) {
        return Jwts.builder().subject(email)
            .issuedAt(new Date()).expiration(new Date(System.currentTimeMillis()+refreshExp)).signWith(key).compact();
    }
    public String getEmailFromToken(String token) {
        return Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload().getSubject();
    }
    public boolean validateToken(String token) {
        try { Jwts.parser().verifyWith(key).build().parseSignedClaims(token); return true; }
        catch (JwtException | IllegalArgumentException e) { log.error("JWT error: {}", e.getMessage()); return false; }
    }
}

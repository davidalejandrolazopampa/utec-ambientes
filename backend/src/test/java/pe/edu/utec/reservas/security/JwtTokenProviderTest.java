package pe.edu.utec.reservas.security;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/** Tests unitarios puros (sin contexto Spring) del proveedor de JWT. */
class JwtTokenProviderTest {

    private static final String SECRET = "clave-de-desarrollo-suficientemente-larga-1234567890";
    private static final long ACCESS_EXP = 900_000;
    private static final long REFRESH_EXP = 604_800_000;

    private JwtTokenProvider provider() {
        return new JwtTokenProvider(SECRET, ACCESS_EXP, REFRESH_EXP);
    }

    @Test
    void generaYValidaAccessToken() {
        JwtTokenProvider p = provider();
        String token = p.generateAccessToken("admin@utec.edu.pe", "ADMIN");
        assertTrue(p.validateToken(token));
        assertEquals("admin@utec.edu.pe", p.getEmailFromToken(token));
    }

    @Test
    void generaYValidaRefreshToken() {
        JwtTokenProvider p = provider();
        String token = p.generateRefreshToken("resp@utec.edu.pe");
        assertTrue(p.validateToken(token));
        assertEquals("resp@utec.edu.pe", p.getEmailFromToken(token));
    }

    @Test
    void rechazaTokenBasura() {
        assertFalse(provider().validateToken("esto-no-es-un-jwt"));
    }

    @Test
    void rechazaTokenConFirmaAlterada() {
        JwtTokenProvider p = provider();
        String token = p.generateAccessToken("user@utec.edu.pe", "ESTUDIANTE");
        assertFalse(p.validateToken(token + "tampered"));
    }

    @Test
    void rechazaTokenFirmadoConOtroSecreto() {
        JwtTokenProvider otro = new JwtTokenProvider("OTRA-clave-distinta-pero-igual-de-larga-123456", ACCESS_EXP, REFRESH_EXP);
        String token = otro.generateAccessToken("user@utec.edu.pe", "ADMIN");
        assertFalse(provider().validateToken(token));
    }

    @Test
    void secretoNuloOVacioFallaAlArrancar() {
        assertThrows(IllegalStateException.class, () -> new JwtTokenProvider(null, ACCESS_EXP, REFRESH_EXP));
        assertThrows(IllegalStateException.class, () -> new JwtTokenProvider("   ", ACCESS_EXP, REFRESH_EXP));
    }

    @Test
    void secretoCortoFallaAlArrancar() {
        assertThrows(IllegalStateException.class, () -> new JwtTokenProvider("corto", ACCESS_EXP, REFRESH_EXP));
    }

    @Test
    void accessTokenExpiradoNoValida() throws InterruptedException {
        JwtTokenProvider p = new JwtTokenProvider(SECRET, 1, 1); // expira casi de inmediato
        String token = p.generateAccessToken("user@utec.edu.pe", "ADMIN");
        Thread.sleep(15);
        assertFalse(p.validateToken(token));
    }
}

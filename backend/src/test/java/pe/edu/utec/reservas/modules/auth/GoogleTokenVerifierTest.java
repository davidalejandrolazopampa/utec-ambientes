package pe.edu.utec.reservas.modules.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import pe.edu.utec.reservas.modules.auth.service.GoogleTokenVerifier;

import java.net.http.HttpClient;
import java.net.http.HttpResponse;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class GoogleTokenVerifierTest {

    @Mock private HttpClient httpClient;
    @Mock private HttpResponse<String> httpResponse;

    private GoogleTokenVerifier verifier;

    @BeforeEach
    void setUp() {
        verifier = new GoogleTokenVerifier(new ObjectMapper());
        ReflectionTestUtils.setField(verifier, "googleClientId", "client-id-123");
        ReflectionTestUtils.setField(verifier, "allowedDomain", "utec.edu.pe");
        ReflectionTestUtils.setField(verifier, "httpClient", httpClient);
    }

    private void stub(int status, String body) throws Exception {
        when(httpResponse.statusCode()).thenReturn(status);
        if (status == 200) when(httpResponse.body()).thenReturn(body);
        doReturn(httpResponse).when(httpClient).send(any(), any());
    }

    @Test
    void verify_exito() throws Exception {
        stub(200, "{\"aud\":\"client-id-123\",\"email\":\"leo@utec.edu.pe\",\"email_verified\":\"true\",\"given_name\":\"Leo\",\"family_name\":\"Diaz\"}");
        Map<String, String> r = verifier.verify("token");
        assertEquals("leo@utec.edu.pe", r.get("email"));
        assertEquals("Leo", r.get("given_name"));
        assertEquals("Diaz", r.get("family_name"));
    }

    @Test
    void verify_statusNo200() throws Exception {
        stub(401, null);
        RuntimeException ex = assertThrows(RuntimeException.class, () -> verifier.verify("token"));
        assertTrue(ex.getMessage().contains("Google"));
    }

    @Test
    void verify_audNoCoincide() throws Exception {
        stub(200, "{\"aud\":\"otro\",\"email\":\"leo@utec.edu.pe\",\"email_verified\":\"true\"}");
        RuntimeException ex = assertThrows(RuntimeException.class, () -> verifier.verify("token"));
        assertTrue(ex.getMessage().contains("Google"));
    }

    @Test
    void verify_dominioNoPermitido() throws Exception {
        stub(200, "{\"aud\":\"client-id-123\",\"email\":\"leo@gmail.com\",\"email_verified\":\"true\"}");
        RuntimeException ex = assertThrows(RuntimeException.class, () -> verifier.verify("token"));
        assertTrue(ex.getMessage().contains("utec.edu.pe"));
    }

    @Test
    void verify_emailNoVerificado() throws Exception {
        stub(200, "{\"aud\":\"client-id-123\",\"email\":\"leo@utec.edu.pe\",\"email_verified\":\"false\"}");
        RuntimeException ex = assertThrows(RuntimeException.class, () -> verifier.verify("token"));
        assertTrue(ex.getMessage().contains("verificado"));
    }

    @Test
    void verify_errorDeRed() throws Exception {
        doThrow(new java.io.IOException("red caída")).when(httpClient).send(any(), any());
        RuntimeException ex = assertThrows(RuntimeException.class, () -> verifier.verify("token"));
        assertTrue(ex.getMessage().contains("Error al verificar"));
    }
}

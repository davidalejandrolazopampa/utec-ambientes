package pe.edu.utec.reservas.modules.auth;

import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.test.util.ReflectionTestUtils;
import pe.edu.utec.reservas.modules.auth.controller.AuthController;
import pe.edu.utec.reservas.modules.auth.dto.AuthResponse;
import pe.edu.utec.reservas.modules.auth.dto.GoogleTokenRequest;
import pe.edu.utec.reservas.modules.auth.service.AuthService;
import pe.edu.utec.reservas.modules.iam.dto.UsuarioResponse;
import pe.edu.utec.reservas.modules.iam.service.UsuarioService;
import pe.edu.utec.reservas.shared.exceptions.BusinessException;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthControllerTest {

    @Mock private AuthService authService;
    @Mock private UsuarioService usuarioService;
    @Mock private HttpServletResponse response;
    @InjectMocks private AuthController controller;

    private AuthResponse auth() {
        return AuthResponse.builder().accessToken("at").refreshToken("rt").build();
    }

    @Test
    void loginWithGoogle_emiteCookieYOcultaRefresh() {
        ReflectionTestUtils.setField(controller, "refreshExpMs", 604800000L);
        GoogleTokenRequest req = new GoogleTokenRequest();
        req.setCredential("cred");
        when(authService.loginWithGoogle("cred")).thenReturn(auth());

        var r = controller.loginWithGoogle(req, response);

        assertEquals(200, r.getStatusCode().value());
        assertNull(r.getBody().getData().getRefreshToken(), "el refresh no debe exponerse en el body");
        verify(response).addHeader(eq(HttpHeaders.SET_COOKIE), contains("refresh_token=rt"));
    }

    @Test
    void refresh_conToken_rota() {
        ReflectionTestUtils.setField(controller, "refreshExpMs", 604800000L);
        when(authService.refreshToken("oldrt")).thenReturn(auth());
        var r = controller.refreshToken("oldrt", response);
        assertEquals(200, r.getStatusCode().value());
        verify(response).addHeader(eq(HttpHeaders.SET_COOKIE), contains("refresh_token=rt"));
    }

    @Test
    void refresh_sinToken_falla() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> controller.refreshToken(null, response));
        assertEquals("NO_REFRESH_TOKEN", ex.getErrorCode());
    }

    @Test
    void refresh_tokenBlanco_falla() {
        assertThrows(BusinessException.class, () -> controller.refreshToken("  ", response));
    }

    @Test
    void logout_borraCookie() {
        var r = controller.logout(response);
        assertEquals(200, r.getStatusCode().value());
        verify(response).addHeader(eq(HttpHeaders.SET_COOKIE), contains("Max-Age=0"));
    }

    @Test
    void me() {
        UserDetails ud = mock(UserDetails.class);
        when(ud.getUsername()).thenReturn("u@utec.edu.pe");
        UsuarioResponse u = new UsuarioResponse();
        when(usuarioService.obtenerPorCorreo("u@utec.edu.pe")).thenReturn(u);
        assertSame(u, controller.me(ud).getBody().getData());
    }

    @Test
    void me_sinSesion_devuelve401() {
        // Tras F5 (sin access token) el principal llega null: debe responder 401 (no NPE→500)
        // para que el frontend dispare /auth/refresh con la cookie y rehidrate la sesión.
        var resp = controller.me(null);
        assertEquals(401, resp.getStatusCode().value());
        assertEquals("UNAUTHENTICATED", resp.getBody().getError());
        verifyNoInteractions(usuarioService);
    }
}

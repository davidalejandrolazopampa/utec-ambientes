package pe.edu.utec.reservas.modules.auth;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.utec.reservas.modules.auth.dto.AuthResponse;
import pe.edu.utec.reservas.modules.auth.service.AuthService;
import pe.edu.utec.reservas.modules.auth.service.GoogleTokenVerifier;
import pe.edu.utec.reservas.modules.iam.model.Role;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.iam.repository.RoleRepository;
import pe.edu.utec.reservas.modules.iam.repository.UsuarioRepository;
import pe.edu.utec.reservas.security.JwtTokenProvider;
import pe.edu.utec.reservas.shared.exceptions.BusinessException;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class AuthServiceTest {

    @Autowired private AuthService authService;
    @Autowired private JwtTokenProvider jwtTokenProvider;
    @Autowired private UsuarioRepository usuarioRepository;
    @Autowired private RoleRepository roleRepository;

    @MockitoBean private GoogleTokenVerifier googleTokenVerifier;

    @Test
    @DisplayName("login con Google auto-registra a un correo nuevo como ESTUDIANTE")
    void loginAutoRegistraEstudiante() {
        when(googleTokenVerifier.verify("cred")).thenReturn(Map.of(
                "email", "auth.nuevo@utec.edu.pe", "given_name", "Nuevo", "family_name", "Estud", "picture", ""));
        AuthResponse r = authService.loginWithGoogle("cred");
        assertEquals("auth.nuevo@utec.edu.pe", r.getCorreoUtec());
        assertNotNull(r.getAccessToken());
        assertNotNull(r.getRefreshToken());
        // El correo nuevo quedó persistido (auto-registrado).
        assertTrue(usuarioRepository.findByCorreoUtec("auth.nuevo@utec.edu.pe").isPresent());
    }

    @Test
    @DisplayName("login de correo administrativo (sin punto) no se auto-registra: pide contactar al coordinador")
    void loginAdministrativoNoRegistrado_falla() {
        when(googleTokenVerifier.verify("cred")).thenReturn(Map.of(
                "email", "aalvarezh@utec.edu.pe", "given_name", "Aixa", "family_name", "Alvarez", "picture", ""));
        BusinessException ex = assertThrows(BusinessException.class, () -> authService.loginWithGoogle("cred"));
        assertTrue(ex.getMessage().toLowerCase().contains("coordinador"));
        assertFalse(usuarioRepository.findByCorreoUtec("aalvarezh@utec.edu.pe").isPresent());
    }

    @Test
    @DisplayName("login con Google de un usuario existente devuelve su rol")
    void loginUsuarioExistente() {
        Role rol = roleRepository.findByNombre("RESPONSABLE_LAB").orElseThrow();
        usuarioRepository.save(Usuario.builder()
                .correoUtec("auth-exist@utec.edu.pe").nombres("Ya").apellidos("Existe")
                .rol(rol).activo(true).build());
        when(googleTokenVerifier.verify("cred")).thenReturn(Map.of(
                "email", "auth-exist@utec.edu.pe", "given_name", "Ya", "family_name", "Existe", "picture", ""));
        AuthResponse r = authService.loginWithGoogle("cred");
        assertEquals("RESPONSABLE_LAB", r.getRol());
    }

    @Test
    @DisplayName("refreshToken con un refresh válido emite nuevos tokens")
    void refreshTokenValido() {
        Role rol = roleRepository.findByNombre("ESTUDIANTE").orElseThrow();
        usuarioRepository.save(Usuario.builder()
                .correoUtec("auth-refresh@utec.edu.pe").nombres("Re").apellidos("Fresh")
                .rol(rol).activo(true).build());
        String refresh = jwtTokenProvider.generateRefreshToken("auth-refresh@utec.edu.pe");
        AuthResponse r = authService.refreshToken(refresh);
        assertNotNull(r.getAccessToken());
        assertNotNull(r.getRefreshToken());
        assertEquals("auth-refresh@utec.edu.pe", r.getCorreoUtec());
    }

    @Test
    @DisplayName("refreshToken inválido lanza BusinessException")
    void refreshTokenInvalido() {
        assertThrows(BusinessException.class, () -> authService.refreshToken("no-es-un-token"));
    }
}

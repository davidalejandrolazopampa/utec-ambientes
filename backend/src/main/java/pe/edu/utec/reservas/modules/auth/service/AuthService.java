package pe.edu.utec.reservas.modules.auth.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.utec.reservas.modules.auth.dto.AuthResponse;
import pe.edu.utec.reservas.modules.iam.model.Role;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.iam.repository.UsuarioRepository;
import pe.edu.utec.reservas.security.JwtTokenProvider;
import pe.edu.utec.reservas.shared.exceptions.BusinessException;

import java.time.LocalDateTime;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final GoogleTokenVerifier googleTokenVerifier;
    private final JwtTokenProvider jwtTokenProvider;
    private final UsuarioRepository usuarioRepository;

    /**
     * Autentica un usuario con el credential de Google.
     * Si el usuario existe en la BD, genera tokens JWT.
     * Si no existe pero tiene dominio @utec.edu.pe, lo registra como ESTUDIANTE.
     */
    @Transactional
    public AuthResponse loginWithGoogle(String credential) {
        // 1. Verificar token con Google
        Map<String, String> googleData = googleTokenVerifier.verify(credential);

        String email = googleData.get("email");
        String givenName = googleData.get("given_name");
        String familyName = googleData.get("family_name");
        String picture = googleData.get("picture");

        log.info("Login Google - email: {}", email);

        // 2. Buscar usuario en BD o auto-registrar como estudiante
        Usuario usuario = usuarioRepository.findByCorreoUtec(email)
                .orElseGet(() -> autoRegistrarEstudiante(email, givenName, familyName, picture));

        // 3. Verificar que el usuario esté activo
        if (!usuario.getActivo()) {
            throw new BusinessException("Tu cuenta está desactivada. Contacta al administrador.", "ACCOUNT_DISABLED");
        }

        // 4. Actualizar último login y avatar
        usuario.setLastLogin(LocalDateTime.now());
        if (picture != null && !picture.isEmpty()) {
            usuario.setAvatarUrl(picture);
        }
        usuarioRepository.save(usuario);

        // 5. Generar tokens JWT
        String rolNombre = usuario.getRol().getNombre();
        String accessToken = jwtTokenProvider.generateAccessToken(email, rolNombre);
        String refreshToken = jwtTokenProvider.generateRefreshToken(email);

        log.info("Login exitoso - usuario: {} | rol: {}", email, rolNombre);

        // 6. Retornar respuesta
        return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .correoUtec(usuario.getCorreoUtec())
                .nombres(usuario.getNombres())
                .apellidos(usuario.getApellidos())
                .rol(rolNombre)
                .cargo(usuario.getCargo())
                .build();
    }

    /**
     * Renueva el access token usando un refresh token válido.
     */
    public AuthResponse refreshToken(String refreshToken) {
        if (!jwtTokenProvider.validateToken(refreshToken)) {
            throw new BusinessException("Refresh token inválido o expirado", "INVALID_REFRESH_TOKEN");
        }

        String email = jwtTokenProvider.getEmailFromToken(refreshToken);

        Usuario usuario = usuarioRepository.findByCorreoUtec(email)
                .orElseThrow(() -> new BusinessException("Usuario no encontrado", "USER_NOT_FOUND"));

        String rolNombre = usuario.getRol().getNombre();
        String newAccessToken = jwtTokenProvider.generateAccessToken(email, rolNombre);
        String newRefreshToken = jwtTokenProvider.generateRefreshToken(email);

        return AuthResponse.builder()
                .accessToken(newAccessToken)
                .refreshToken(newRefreshToken)
                .correoUtec(usuario.getCorreoUtec())
                .nombres(usuario.getNombres())
                .apellidos(usuario.getApellidos())
                .rol(rolNombre)
                .cargo(usuario.getCargo())
                .build();
    }

    /**
     * Auto-registra un usuario nuevo como ESTUDIANTE — SOLO si el correo tiene patrón de
     * alumno (nombre.apellido@utec.edu.pe, con punto en la parte local).
     * Los correos ADMINISTRATIVOS (inicialApellido@utec.edu.pe, sin punto) NO se auto-registran:
     * si se logean es porque serán responsables de un laboratorio y aún no los han dado de alta,
     * así que se les pide contactar al coordinador.
     */
    private Usuario autoRegistrarEstudiante(String email, String nombres, String apellidos, String avatar) {
        String localPart = email.contains("@") ? email.substring(0, email.indexOf('@')) : email;
        if (!localPart.contains(".")) {
            log.info("Login de correo administrativo no registrado: {}", email);
            throw new BusinessException(
                    "No estás registrado en el sistema. Si vas a ser responsable de un laboratorio, " +
                    "comunícate con el coordinador para que te asignen tus credenciales.",
                    "NOT_REGISTERED");
        }
        log.info("Auto-registrando estudiante: {}", email);

        // Rol 6 = ESTUDIANTE (definido en V2__seed_data.sql)
        Role rolEstudiante = new Role();
        rolEstudiante.setId(6L);

        Usuario nuevo = Usuario.builder()
                .correoUtec(email)
                .nombres(nombres != null && !nombres.isEmpty() ? nombres : "Sin nombre")
                .apellidos(apellidos != null && !apellidos.isEmpty() ? apellidos : "Sin apellido")
                .rol(rolEstudiante)
                .avatarUrl(avatar)
                .activo(true)
                .build();

        return usuarioRepository.save(nuevo);
    }
}
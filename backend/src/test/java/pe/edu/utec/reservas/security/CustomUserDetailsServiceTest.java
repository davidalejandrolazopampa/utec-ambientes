package pe.edu.utec.reservas.security;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import pe.edu.utec.reservas.modules.iam.model.Role;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.iam.repository.UsuarioRepository;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CustomUserDetailsServiceTest {

    @Mock private UsuarioRepository usuarioRepository;
    @InjectMocks private CustomUserDetailsService service;

    @Test
    void loadUserByUsername_ok() {
        Usuario u = Usuario.builder()
                .correoUtec("leo@utec.edu.pe").activo(true)
                .rol(Role.builder().nombre("ESTUDIANTE").build())
                .build();
        when(usuarioRepository.findByCorreoUtec("leo@utec.edu.pe")).thenReturn(Optional.of(u));

        UserDetails ud = service.loadUserByUsername("leo@utec.edu.pe");

        assertEquals("leo@utec.edu.pe", ud.getUsername());
        assertTrue(ud.isEnabled());
        assertTrue(ud.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_ESTUDIANTE")));
    }

    @Test
    void loadUserByUsername_inactivo() {
        Usuario u = Usuario.builder()
                .correoUtec("x@utec.edu.pe").activo(false)
                .rol(Role.builder().nombre("ADMIN").build())
                .build();
        when(usuarioRepository.findByCorreoUtec("x@utec.edu.pe")).thenReturn(Optional.of(u));
        assertFalse(service.loadUserByUsername("x@utec.edu.pe").isEnabled());
    }

    @Test
    void loadUserByUsername_noEncontrado() {
        when(usuarioRepository.findByCorreoUtec("nadie@utec.edu.pe")).thenReturn(Optional.empty());
        assertThrows(UsernameNotFoundException.class,
                () -> service.loadUserByUsername("nadie@utec.edu.pe"));
    }
}

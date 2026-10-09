package pe.edu.utec.reservas.modules.laboratorios;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;
import pe.edu.utec.reservas.modules.iam.model.Role;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.iam.repository.UsuarioRepository;
import pe.edu.utec.reservas.modules.laboratorios.service.CalendarioAccessGuard;
import pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CalendarioAccessGuardTest {

    @Mock private UsuarioRepository usuarioRepository;
    @Mock private EntityManager entityManager;
    @Mock private Query query;
    @InjectMocks private CalendarioAccessGuard guard;

    private Usuario conRol(String rol) {
        Usuario u = new Usuario();
        u.setId(10L);
        Role r = new Role();
        r.setNombre(rol);
        u.setRol(r);
        return u;
    }

    @Test
    void admin_coordinador_estudiante_venCualquierLab_sinTocarBD() {
        for (String rol : List.of("ADMIN", "COORDINADOR", "ESTUDIANTE")) {
            when(usuarioRepository.findByCorreoUtec(anyString())).thenReturn(Optional.of(conRol(rol)));
            assertDoesNotThrow(() -> guard.asegurarAccesoCalendario(99L, "x@utec.edu.pe"));
        }
        // nunca consulta la BD de labs para esos roles
        verify(entityManager, never()).createNativeQuery(anyString());
    }

    @Test
    void responsable_conElLabAsignado_pasa() {
        when(usuarioRepository.findByCorreoUtec(anyString())).thenReturn(Optional.of(conRol("RESPONSABLE_LAB")));
        when(entityManager.createNativeQuery(anyString())).thenReturn(query);
        when(query.setParameter(anyString(), any())).thenReturn(query);
        when(query.getResultList()).thenReturn(List.of((Number) 7L));
        assertDoesNotThrow(() -> guard.asegurarAccesoCalendario(7L, "resp@utec.edu.pe"));
    }

    @Test
    void responsable_conLabAjeno_lanza403() {
        when(usuarioRepository.findByCorreoUtec(anyString())).thenReturn(Optional.of(conRol("RESPONSABLE_LAB")));
        when(entityManager.createNativeQuery(anyString())).thenReturn(query);
        when(query.setParameter(anyString(), any())).thenReturn(query);
        when(query.getResultList()).thenReturn(List.of((Number) 7L));
        assertThrows(AccessDeniedException.class, () -> guard.asegurarAccesoCalendario(99L, "resp@utec.edu.pe"));
    }

    @Test
    void director_usaConsultaConUnion() {
        when(usuarioRepository.findByCorreoUtec(anyString())).thenReturn(Optional.of(conRol("DIRECTOR")));
        when(entityManager.createNativeQuery(anyString())).thenReturn(query);
        when(query.setParameter(anyString(), any())).thenReturn(query);
        when(query.getResultList()).thenReturn(List.of((Number) 3L));
        assertDoesNotThrow(() -> guard.asegurarAccesoCalendario(3L, "dir@utec.edu.pe"));
        verify(entityManager).createNativeQuery(contains("UNION"));
    }

    @Test
    void usuarioInexistente_lanzaResourceNotFound() {
        when(usuarioRepository.findByCorreoUtec(anyString())).thenReturn(Optional.empty());
        assertThrows(ResourceNotFoundException.class, () -> guard.asegurarAccesoCalendario(1L, "no@utec.edu.pe"));
    }
}

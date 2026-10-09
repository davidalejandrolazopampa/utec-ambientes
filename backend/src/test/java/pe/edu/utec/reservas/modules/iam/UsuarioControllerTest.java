package pe.edu.utec.reservas.modules.iam;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.userdetails.UserDetails;
import pe.edu.utec.reservas.modules.iam.controller.UsuarioController;
import pe.edu.utec.reservas.modules.iam.dto.CreateUsuarioRequest;
import pe.edu.utec.reservas.modules.iam.dto.UpdateUsuarioRequest;
import pe.edu.utec.reservas.modules.iam.dto.UsuarioResponse;
import pe.edu.utec.reservas.modules.iam.service.UsuarioService;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UsuarioControllerTest {

    @Mock private UsuarioService usuarioService;
    @Mock private UserDetails userDetails;
    @InjectMocks private UsuarioController controller;

    private final UsuarioResponse u = new UsuarioResponse();

    @Test
    void listar() {
        when(usuarioService.listarTodos()).thenReturn(List.of(u));
        assertEquals(1, controller.listar().getBody().getData().size());
    }

    @Test
    void crear() {
        CreateUsuarioRequest req = new CreateUsuarioRequest();
        when(usuarioService.crear(req)).thenReturn(u);
        assertSame(u, controller.crear(req).getBody().getData());
    }

    @Test
    void miPerfil() {
        when(userDetails.getUsername()).thenReturn("u@utec.edu.pe");
        when(usuarioService.obtenerPorCorreo("u@utec.edu.pe")).thenReturn(u);
        assertSame(u, controller.miPerfil(userDetails).getBody().getData());
    }

    @Test
    void obtener() {
        when(usuarioService.obtenerPorId(3L)).thenReturn(u);
        assertSame(u, controller.obtener(3L).getBody().getData());
    }

    @Test
    void actualizar() {
        UpdateUsuarioRequest req = new UpdateUsuarioRequest();
        when(usuarioService.actualizar(3L, req)).thenReturn(u);
        assertSame(u, controller.actualizar(3L, req).getBody().getData());
    }

    @Test
    void desactivar() {
        when(usuarioService.desactivar(3L)).thenReturn(u);
        assertSame(u, controller.desactivar(3L).getBody().getData());
    }

    @Test
    void porDirector() {
        when(usuarioService.listarPorDirector(7L)).thenReturn(List.of(u));
        assertEquals(1, controller.porDirector(7L).getBody().getData().size());
    }

    @Test
    void eliminar() {
        controller.eliminar(3L);
        verify(usuarioService).eliminar(3L);
    }

    @Test
    void asignarYQuitarLab() {
        controller.asignarLab(1L, 2L);
        controller.quitarLab(1L, 2L);
        verify(usuarioService).asignarLaboratorio(1L, 2L);
        verify(usuarioService).quitarLaboratorio(1L, 2L);
    }

    @Test
    void listarResponsables() {
        when(usuarioService.listarPorRol("RESPONSABLE_LAB")).thenReturn(List.of(u));
        assertEquals(1, controller.listarResponsables().getBody().getData().size());
    }

    @Test
    void listarDirectores_todos() {
        when(usuarioService.listarPorRol("DIRECTOR")).thenReturn(List.of(u));
        assertEquals(1, controller.listarDirectores(null).getBody().getData().size());
    }

    @Test
    void listarDirectores_porFacultad() {
        when(usuarioService.listarDirectoresPorFacultad(3L)).thenReturn(List.of(u));
        assertEquals(1, controller.listarDirectores(3L).getBody().getData().size());
    }

    @Test
    void directorDe() {
        when(usuarioService.directorDe(7L)).thenReturn(u);
        assertEquals(u, controller.directorDe(7L).getBody().getData());
    }

    @Test
    void asignarYQuitarResponsable() {
        controller.asignarResponsable(1L, 2L);
        controller.quitarResponsable(1L, 2L);
        verify(usuarioService).asignarResponsableADirector(1L, 2L);
        verify(usuarioService).quitarResponsableDeDirector(1L, 2L);
    }

    @Test
    void asignarYQuitarLabDirector() {
        controller.asignarLabDirector(1L, 2L);
        controller.quitarLabDirector(1L, 2L);
        verify(usuarioService).asignarLabComoDirector(1L, 2L);
        verify(usuarioService).quitarLabComoDirector(1L, 2L);
    }
}

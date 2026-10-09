package pe.edu.utec.reservas.modules.laboratorios;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.userdetails.UserDetails;
import pe.edu.utec.reservas.modules.iam.repository.UsuarioRepository;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.laboratorios.controller.LaboratorioController;
import pe.edu.utec.reservas.modules.laboratorios.dto.CreateLaboratorioRequest;
import pe.edu.utec.reservas.modules.laboratorios.dto.LaboratorioResponse;
import pe.edu.utec.reservas.modules.laboratorios.dto.RecursoLabResponse;
import pe.edu.utec.reservas.modules.laboratorios.model.Laboratorio;
import pe.edu.utec.reservas.modules.laboratorios.repository.LaboratorioRepository;
import pe.edu.utec.reservas.modules.laboratorios.service.LaboratorioService;
import pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class LaboratorioControllerTest {

    @Mock private LaboratorioService laboratorioService;
    @Mock private LaboratorioRepository laboratorioRepository;
    @Mock private UsuarioRepository usuarioRepository;
    @Mock private EntityManager entityManager;
    @InjectMocks private LaboratorioController controller;

    private final LaboratorioResponse lab = new LaboratorioResponse();

    // ── delegadores ──
    @Test
    void crear() {
        CreateLaboratorioRequest req = new CreateLaboratorioRequest();
        when(laboratorioService.crear(req)).thenReturn(lab);
        var r = controller.crear(req);
        assertEquals(201, r.getStatusCode().value());
    }

    @Test
    void listarTodosAdmin() {
        when(laboratorioService.listarTodosIncluyendoInactivos()).thenReturn(List.of(lab));
        assertEquals(1, controller.listarTodosAdmin().getBody().getData().size());
    }

    @Test
    void listar_porPiso() {
        when(laboratorioService.listarPorPiso(2)).thenReturn(List.of(lab));
        assertEquals(1, controller.listar(2, null).getBody().getData().size());
    }

    @Test
    void listar_porFase() {
        when(laboratorioService.listarPorFase("F1")).thenReturn(List.of(lab));
        assertEquals(1, controller.listar(null, "F1").getBody().getData().size());
    }

    @Test
    void listar_todos() {
        when(laboratorioService.listarTodos()).thenReturn(List.of());
        assertTrue(controller.listar(null, null).getBody().getData().isEmpty());
    }

    @Test
    void obtenerPorId() {
        when(laboratorioService.obtenerPorId(1L)).thenReturn(lab);
        assertSame(lab, controller.obtenerPorId(1L).getBody().getData());
    }

    @Test
    void obtenerPorCodigo() {
        when(laboratorioService.obtenerPorCodigo("L108")).thenReturn(lab);
        assertSame(lab, controller.obtenerPorCodigo("L108").getBody().getData());
    }

    @Test
    void listarRecursos() {
        when(laboratorioService.listarRecursos(1L)).thenReturn(List.of(new RecursoLabResponse()));
        assertEquals(1, controller.listarRecursos(1L).getBody().getData().size());
    }

    @Test
    void eliminar() {
        controller.eliminar(1L);
        verify(laboratorioService).eliminar(1L);
    }

    @Test
    void cambiarEstado() {
        when(laboratorioService.cambiarEstado(1L, "ACTIVO")).thenReturn(lab);
        assertSame(lab, controller.cambiarEstado(1L, "ACTIVO").getBody().getData());
    }

    @Test
    void editar() {
        CreateLaboratorioRequest req = new CreateLaboratorioRequest();
        when(laboratorioService.editar(1L, req)).thenReturn(lab);
        assertSame(lab, controller.editar(1L, req).getBody().getData());
    }

    @Test
    void agregarRecurso() {
        Map<String, Object> req = Map.of("tipo", "MESA");
        when(laboratorioService.agregarRecurso(1L, req)).thenReturn(new RecursoLabResponse());
        assertEquals(201, controller.agregarRecurso(1L, req).getStatusCode().value());
    }

    @Test
    void editarRecurso() {
        Map<String, Object> req = Map.of("capacidad", 4);
        when(laboratorioService.editarRecurso(1L, 2L, req)).thenReturn(new RecursoLabResponse());
        assertEquals(200, controller.editarRecurso(1L, 2L, req).getStatusCode().value());
    }

    @Test
    void eliminarRecurso() {
        controller.eliminarRecurso(1L, 2L);
        verify(laboratorioService).eliminarRecurso(1L, 2L);
    }

    @Test
    void misLaboratorios() {
        UserDetails ud = mock(UserDetails.class);
        when(ud.getUsername()).thenReturn("u@utec.edu.pe");
        when(laboratorioService.listarPorUsuario("u@utec.edu.pe")).thenReturn(List.of(lab));
        assertEquals(1, controller.misLaboratorios(ud).getBody().getData().size());
    }

    // ── asignarDirector ──
    @Test
    void asignarDirector_ok() {
        when(laboratorioRepository.findById(1L)).thenReturn(Optional.of(new Laboratorio()));
        when(usuarioRepository.findById(5L)).thenReturn(Optional.of(new Usuario()));
        Query q = mock(Query.class);
        when(q.setParameter(anyString(), any())).thenReturn(q);
        when(entityManager.createNativeQuery(anyString())).thenReturn(q);
        var r = controller.asignarDirector(1L, 5L);
        assertEquals(200, r.getStatusCode().value());
        verify(q).executeUpdate();
    }

    @Test
    void asignarDirector_labNoExiste() {
        when(laboratorioRepository.findById(1L)).thenReturn(Optional.empty());
        assertThrows(ResourceNotFoundException.class, () -> controller.asignarDirector(1L, 5L));
    }

    @Test
    void asignarDirector_usuarioNoExiste() {
        when(laboratorioRepository.findById(1L)).thenReturn(Optional.of(new Laboratorio()));
        when(usuarioRepository.findById(5L)).thenReturn(Optional.empty());
        assertThrows(ResourceNotFoundException.class, () -> controller.asignarDirector(1L, 5L));
    }

    // ── asignarResponsable (cascada) ──
    @Test
    void asignarResponsable_sinCascada() {
        when(laboratorioRepository.findById(1L)).thenReturn(Optional.of(new Laboratorio()));
        when(usuarioRepository.findById(5L)).thenReturn(Optional.of(new Usuario()));
        Query q = mock(Query.class);
        when(q.setParameter(anyString(), any())).thenReturn(q);
        when(q.getResultList()).thenReturn(List.of()); // sin director → no cascada
        when(entityManager.createNativeQuery(anyString())).thenReturn(q);
        var r = controller.asignarResponsable(1L, 5L);
        assertEquals(200, r.getStatusCode().value());
    }

    @Test
    void asignarResponsable_cascadaCompleta() {
        when(laboratorioRepository.findById(1L)).thenReturn(Optional.of(new Laboratorio()));
        when(usuarioRepository.findById(5L)).thenReturn(Optional.of(new Usuario()));
        Query q = mock(Query.class);
        when(q.setParameter(anyString(), any())).thenReturn(q);
        // 1ª SELECT → director 7; 2ª SELECT → departamento 9
        when(q.getResultList()).thenReturn(List.of(7L), List.of(9L));
        when(entityManager.createNativeQuery(anyString())).thenReturn(q);
        var r = controller.asignarResponsable(1L, 5L);
        assertTrue(r.getBody().getData().contains("auto-vinculados"));
    }

    @Test
    void removerResponsable() {
        Query q = mock(Query.class);
        when(q.setParameter(anyString(), any())).thenReturn(q);
        when(entityManager.createNativeQuery(anyString())).thenReturn(q);
        var r = controller.removerResponsable(1L, 5L);
        assertEquals(200, r.getStatusCode().value());
        verify(q).executeUpdate();
    }
}

package pe.edu.utec.reservas.modules.laboratorios;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import pe.edu.utec.reservas.modules.laboratorios.controller.OrganizacionController;
import pe.edu.utec.reservas.modules.laboratorios.model.Carrera;
import pe.edu.utec.reservas.modules.laboratorios.model.Departamento;
import pe.edu.utec.reservas.modules.laboratorios.model.Facultad;
import pe.edu.utec.reservas.modules.iam.repository.UsuarioRepository;
import pe.edu.utec.reservas.modules.laboratorios.repository.CarreraRepository;
import pe.edu.utec.reservas.modules.laboratorios.repository.DepartamentoRepository;
import pe.edu.utec.reservas.modules.laboratorios.repository.FacultadRepository;
import pe.edu.utec.reservas.modules.laboratorios.repository.LaboratorioRepository;
import pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OrganizacionControllerTest {

    @Mock private FacultadRepository facultadRepository;
    @Mock private DepartamentoRepository departamentoRepository;
    @Mock private CarreraRepository carreraRepository;
    @Mock private LaboratorioRepository laboratorioRepository;
    @Mock private UsuarioRepository usuarioRepository;
    @InjectMocks private OrganizacionController controller;

    @Test
    void listarFacultades() {
        when(facultadRepository.findAll()).thenReturn(List.of(new Facultad()));
        assertEquals(1, controller.listarFacultades().getBody().getData().size());
    }

    @Test
    void crearFacultad() {
        when(facultadRepository.save(any(Facultad.class))).thenAnswer(i -> i.getArgument(0));
        var r = controller.crearFacultad(Map.of("nombre", "Ingeniería"));
        assertEquals("Ingeniería", r.getBody().getData().getNombre());
    }

    @Test
    void editarFacultad_conNombreYDecano() {
        Facultad f = Facultad.builder().nombre("Old").build();
        when(facultadRepository.findById(1L)).thenReturn(Optional.of(f));
        when(facultadRepository.save(f)).thenReturn(f);
        controller.editarFacultad(1L, Map.of("nombre", "New", "decanoId", "7"));
        assertEquals("New", f.getNombre());
        assertEquals(7L, f.getDecanoId());
    }

    @Test
    void editarFacultad_decanoNull() {
        Facultad f = Facultad.builder().build();
        java.util.HashMap<String, Object> body = new java.util.HashMap<>();
        body.put("decanoId", null);
        when(facultadRepository.findById(1L)).thenReturn(Optional.of(f));
        when(facultadRepository.save(f)).thenReturn(f);
        controller.editarFacultad(1L, body);
        assertNull(f.getDecanoId());
    }

    @Test
    void editarFacultad_noEncontrada() {
        when(facultadRepository.findById(9L)).thenReturn(Optional.empty());
        assertThrows(ResourceNotFoundException.class, () -> controller.editarFacultad(9L, Map.of()));
    }

    @Test
    void eliminarFacultad() {
        controller.eliminarFacultad(3L);
        verify(facultadRepository).deleteById(3L);
    }

    @Test
    void listarDepartamentos_conFacultad() {
        when(departamentoRepository.findByFacultadId(2L)).thenReturn(List.of(new Departamento()));
        assertEquals(1, controller.listarDepartamentos(2L).getBody().getData().size());
    }

    @Test
    void listarDepartamentos_sinFacultad() {
        when(departamentoRepository.findAll()).thenReturn(List.of());
        assertTrue(controller.listarDepartamentos(null).getBody().getData().isEmpty());
    }

    @Test
    void crearDepartamento_conFacultad() {
        when(departamentoRepository.save(any(Departamento.class))).thenAnswer(i -> i.getArgument(0));
        var r = controller.crearDepartamento(Map.of("nombre", "Sistemas", "facultadId", "4"));
        assertEquals("Sistemas", r.getBody().getData().getNombre());
        assertEquals(4L, r.getBody().getData().getFacultadId());
    }

    @Test
    void crearDepartamento_sinFacultad() {
        when(departamentoRepository.save(any(Departamento.class))).thenAnswer(i -> i.getArgument(0));
        java.util.HashMap<String, Object> body = new java.util.HashMap<>();
        body.put("nombre", "X");
        var r = controller.crearDepartamento(body);
        assertNull(r.getBody().getData().getFacultadId());
    }

    @Test
    void editarDepartamento_todosLosCampos() {
        Departamento d = Departamento.builder().build();
        when(departamentoRepository.findById(1L)).thenReturn(Optional.of(d));
        when(departamentoRepository.save(d)).thenReturn(d);
        // Al asignar directorId, el controller sincroniza el depto del director (findById).
        when(usuarioRepository.findById(3L)).thenReturn(Optional.empty());
        controller.editarDepartamento(1L, Map.of("nombre", "N", "facultadId", "2", "directorId", "3"));
        assertEquals("N", d.getNombre());
        assertEquals(2L, d.getFacultadId());
        assertEquals(3L, d.getDirectorId());
    }

    @Test
    void editarDepartamento_noEncontrado() {
        when(departamentoRepository.findById(9L)).thenReturn(Optional.empty());
        assertThrows(ResourceNotFoundException.class, () -> controller.editarDepartamento(9L, Map.of()));
    }

    @Test
    void eliminarDepartamento() {
        // Ahora valida existencia y desvincula labs/usuarios (departamento_id → null) antes de borrar.
        when(departamentoRepository.existsById(3L)).thenReturn(true);
        when(laboratorioRepository.desvincularDepartamento(3L)).thenReturn(0);
        when(usuarioRepository.desvincularDepartamento(3L)).thenReturn(0);
        controller.eliminarDepartamento(3L);
        verify(laboratorioRepository).desvincularDepartamento(3L);
        verify(usuarioRepository).desvincularDepartamento(3L);
        verify(departamentoRepository).deleteById(3L);
    }

    @Test
    void eliminarDepartamento_noEncontrado() {
        when(departamentoRepository.existsById(9L)).thenReturn(false);
        assertThrows(ResourceNotFoundException.class, () -> controller.eliminarDepartamento(9L));
        verify(departamentoRepository, never()).deleteById(anyLong());
    }

    // ─── Carreras ───

    @Test
    void listarCarreras_porDepartamento() {
        when(carreraRepository.findByDepartamentoId(5L)).thenReturn(List.of(new Carrera()));
        assertEquals(1, controller.listarCarreras(null, 5L).getBody().getData().size());
    }

    @Test
    void listarCarreras_porFacultad() {
        when(carreraRepository.findByFacultadId(2L)).thenReturn(List.of(new Carrera()));
        assertEquals(1, controller.listarCarreras(2L, null).getBody().getData().size());
    }

    @Test
    void listarCarreras_todas() {
        when(carreraRepository.findAll()).thenReturn(List.of());
        assertTrue(controller.listarCarreras(null, null).getBody().getData().isEmpty());
    }

    @Test
    void crearCarrera() {
        when(carreraRepository.save(any(Carrera.class))).thenAnswer(i -> i.getArgument(0));
        var r = controller.crearCarrera(Map.of("nombre", "Ing. de Prueba", "facultadId", "2", "departamentoId", "5"));
        assertEquals("Ing. de Prueba", r.getBody().getData().getNombre());
        assertEquals(2L, r.getBody().getData().getFacultadId());
        assertEquals(5L, r.getBody().getData().getDepartamentoId());
    }

    @Test
    void editarCarrera_todosLosCampos() {
        Carrera c = Carrera.builder().build();
        when(carreraRepository.findById(1L)).thenReturn(Optional.of(c));
        when(carreraRepository.save(c)).thenReturn(c);
        controller.editarCarrera(1L, Map.of("nombre", "N", "facultadId", "2", "departamentoId", "9"));
        assertEquals("N", c.getNombre());
        assertEquals(2L, c.getFacultadId());
        assertEquals(9L, c.getDepartamentoId());
    }

    @Test
    void editarCarrera_noEncontrada() {
        when(carreraRepository.findById(9L)).thenReturn(Optional.empty());
        assertThrows(ResourceNotFoundException.class, () -> controller.editarCarrera(9L, Map.of()));
    }

    @Test
    void eliminarCarrera() {
        controller.eliminarCarrera(3L);
        verify(carreraRepository).deleteById(3L);
    }
}

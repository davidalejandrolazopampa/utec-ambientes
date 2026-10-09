package pe.edu.utec.reservas.modules.laboratorios;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import pe.edu.utec.reservas.modules.laboratorios.controller.EstructuraAcademicaController;
import pe.edu.utec.reservas.modules.laboratorios.model.Carrera;
import pe.edu.utec.reservas.modules.laboratorios.model.Departamento;
import pe.edu.utec.reservas.modules.laboratorios.model.Facultad;
import pe.edu.utec.reservas.modules.laboratorios.repository.CarreraRepository;
import pe.edu.utec.reservas.modules.laboratorios.repository.DepartamentoRepository;
import pe.edu.utec.reservas.modules.laboratorios.repository.FacultadRepository;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EstructuraAcademicaControllerTest {

    @Mock private FacultadRepository facultadRepository;
    @Mock private DepartamentoRepository departamentoRepository;
    @Mock private CarreraRepository carreraRepository;
    @InjectMocks private EstructuraAcademicaController controller;

    @Test
    void facultades() {
        when(facultadRepository.findAll()).thenReturn(List.of(new Facultad()));
        assertEquals(1, controller.facultades().getBody().getData().size());
    }

    @Test
    void departamentos_conFacultad_incluyeSinFacultad() {
        when(departamentoRepository.findByFacultadId(1L)).thenReturn(new ArrayList<>(List.of(new Departamento())));
        when(departamentoRepository.findByFacultadIdIsNull()).thenReturn(List.of(new Departamento()));
        assertEquals(2, controller.departamentos(1L).getBody().getData().size());
    }

    @Test
    void departamentos_sinFacultad_findAll() {
        when(departamentoRepository.findAll()).thenReturn(List.of(new Departamento()));
        assertEquals(1, controller.departamentos(null).getBody().getData().size());
    }

    @Test
    void carreras_porFacultad() {
        when(carreraRepository.findByFacultadId(2L)).thenReturn(List.of(new Carrera()));
        assertEquals(1, controller.carreras(2L, null).getBody().getData().size());
    }

    @Test
    void carreras_porDepartamento_precede() {
        when(carreraRepository.findByDepartamentoId(5L)).thenReturn(List.of(new Carrera()));
        // Con departamentoId presente, filtra por departamento (no por facultad).
        assertEquals(1, controller.carreras(2L, 5L).getBody().getData().size());
    }

    @Test
    void carreras_todas() {
        when(carreraRepository.findAll()).thenReturn(List.of());
        assertTrue(controller.carreras(null, null).getBody().getData().isEmpty());
    }

    @Test
    void departamentoPorDirector_encontrado() {
        Departamento d = Departamento.builder().id(5L).directorId(9L).facultadId(2L).build();
        when(departamentoRepository.findFirstByDirectorId(9L)).thenReturn(java.util.Optional.of(d));
        assertEquals(5L, controller.departamentoPorDirector(9L).getBody().getData().getId());
    }

    @Test
    void departamentoPorDirector_sinDepartamento_devuelveNull() {
        when(departamentoRepository.findFirstByDirectorId(99L)).thenReturn(java.util.Optional.empty());
        assertNull(controller.departamentoPorDirector(99L).getBody().getData());
    }
}

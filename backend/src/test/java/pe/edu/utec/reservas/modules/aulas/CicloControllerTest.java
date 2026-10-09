package pe.edu.utec.reservas.modules.aulas;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import pe.edu.utec.reservas.modules.aulas.controller.CicloController;
import pe.edu.utec.reservas.modules.aulas.dto.CicloResponse;
import pe.edu.utec.reservas.modules.aulas.dto.CreateExcepcionRequest;
import pe.edu.utec.reservas.modules.aulas.dto.UpdateCicloRequest;
import pe.edu.utec.reservas.modules.aulas.service.CicloService;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Cobertura de CicloController: cada endpoint delega en CicloService (Mockito). */
@ExtendWith(MockitoExtension.class)
class CicloControllerTest {

    @Mock private CicloService cicloService;
    @InjectMocks private CicloController controller;

    @Test
    void listar_y_crearAnio() {
        when(cicloService.listar()).thenReturn(List.of());
        assertNotNull(controller.listar().getBody().getData());
        when(cicloService.crearAnio(2027)).thenReturn(List.of());
        assertNotNull(controller.crearAnio(2027).getBody().getData());
    }

    @Test
    void actualizar_delega() {
        UpdateCicloRequest req = new UpdateCicloRequest();
        when(cicloService.actualizar(eq(1L), any())).thenReturn(new CicloResponse());
        assertNotNull(controller.actualizar(1L, req).getBody().getData());
    }

    @Test
    void excepciones_agregar_y_eliminar() {
        CreateExcepcionRequest req = new CreateExcepcionRequest();
        when(cicloService.agregarExcepcion(eq("2026-1"), any(), any(), any(), any()))
                .thenReturn(new CicloResponse());
        assertNotNull(controller.agregarExcepcion("2026-1", req).getBody().getData());

        assertNotNull(controller.eliminarExcepcion(9L).getBody());
        verify(cicloService).eliminarExcepcion(9L);
    }
}

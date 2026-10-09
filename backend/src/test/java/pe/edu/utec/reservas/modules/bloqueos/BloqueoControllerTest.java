package pe.edu.utec.reservas.modules.bloqueos;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.userdetails.UserDetails;
import pe.edu.utec.reservas.modules.bloqueos.controller.BloqueoController;
import pe.edu.utec.reservas.modules.bloqueos.dto.BloqueoResponse;
import pe.edu.utec.reservas.modules.bloqueos.dto.CreateBloqueoRequest;
import pe.edu.utec.reservas.modules.bloqueos.service.BloqueoService;
import pe.edu.utec.reservas.modules.laboratorios.service.CalendarioAccessGuard;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BloqueoControllerTest {

    @Mock private BloqueoService bloqueoService;
    @Mock private pe.edu.utec.reservas.modules.bloqueos.service.BloqueoImportService bloqueoImportService;
    @Mock private CalendarioAccessGuard calendarioAccessGuard;
    @Mock private UserDetails userDetails;
    @InjectMocks private BloqueoController controller;

    private final BloqueoResponse resp = new BloqueoResponse();

    private void user() { when(userDetails.getUsername()).thenReturn("resp@utec.edu.pe"); }

    @Test
    void crear() {
        user();
        CreateBloqueoRequest req = new CreateBloqueoRequest();
        when(bloqueoService.crear(req, "resp@utec.edu.pe")).thenReturn(resp);
        var r = controller.crear(req, userDetails);
        assertEquals(HttpStatus.CREATED, r.getStatusCode());
        assertSame(resp, r.getBody().getData());
    }

    @Test
    void importar() {
        user();
        var file = new org.springframework.mock.web.MockMultipartFile("archivo", "e.csv", "text/csv", new byte[]{1});
        var resultado = pe.edu.utec.reservas.modules.bloqueos.dto.ImportBloqueosResponse.builder().creados(2).build();
        when(bloqueoImportService.importar(file, 5L, true, "resp@utec.edu.pe")).thenReturn(resultado);
        var r = controller.importar(file, 5L, true, userDetails);
        assertEquals(2, r.getBody().getData().getCreados());
    }

    @Test
    void plantillaCsv() {
        when(bloqueoImportService.plantillaCsv()).thenReturn("Codigo Lab".getBytes());
        var r = controller.plantilla("csv");
        assertEquals(HttpStatus.OK, r.getStatusCode());
        assertTrue(r.getHeaders().getFirst("Content-Disposition").contains("plantilla-bloqueos.csv"));
    }

    @Test
    void plantillaXlsxPorDefecto() {
        when(bloqueoImportService.plantillaXlsx()).thenReturn(new byte[]{1, 2, 3});
        var r = controller.plantilla("xlsx");
        assertTrue(r.getHeaders().getFirst("Content-Disposition").contains(".xlsx"));
    }

    @Test
    void editar() {
        user();
        CreateBloqueoRequest req = new CreateBloqueoRequest();
        when(bloqueoService.editar(2L, req, "resp@utec.edu.pe")).thenReturn(resp);
        var r = controller.editar(2L, req, userDetails);
        assertSame(resp, r.getBody().getData());
    }

    @Test
    void porLaboratorio() {
        user();
        when(bloqueoService.listarPorLaboratorio(7L)).thenReturn(List.of(resp));
        assertEquals(1, controller.porLaboratorio(7L, userDetails).getBody().getData().size());
        verify(calendarioAccessGuard).asegurarAccesoCalendario(7L, "resp@utec.edu.pe");
    }

    @Test
    void activosHoy() {
        when(bloqueoService.listarActivosHoy()).thenReturn(List.of(resp));
        assertEquals(1, controller.activosHoy().getBody().getData().size());
    }

    @Test
    void generarAlmuerzos() {
        user();
        var rep = pe.edu.utec.reservas.modules.bloqueos.dto.GenerarAlmuerzosResponse.builder()
                .creados(5).reservasCanceladas(0).omitidos(List.of()).build();
        var req = new pe.edu.utec.reservas.modules.bloqueos.dto.GenerarAlmuerzosRequest();
        when(bloqueoService.generarAlmuerzos(eq(7L), any(), eq("resp@utec.edu.pe"))).thenReturn(rep);
        assertEquals(5, controller.generarAlmuerzos(7L, req, userDetails).getBody().getData().getCreados());
    }

    @Test
    void feriados() {
        var fer = pe.edu.utec.reservas.modules.bloqueos.dto.FeriadoResponse.builder()
                .fecha(java.time.LocalDate.of(2026, 8, 6)).descripcion("Batalla de Junín").build();
        when(bloqueoService.listarFeriadosDelAnio(2026)).thenReturn(List.of(fer));
        assertEquals(1, controller.feriados(2026).getBody().getData().size());
    }

    @Test
    void todosActivos() {
        user();
        when(bloqueoService.listarTodosActivos("resp@utec.edu.pe", false)).thenReturn(List.of());
        assertTrue(controller.todosActivos(userDetails, false).getBody().getData().isEmpty());
    }

    @Test
    void eliminar() {
        user();
        var r = controller.eliminar(2L, userDetails);
        assertEquals(200, r.getStatusCode().value());
        verify(bloqueoService).eliminar(2L, "resp@utec.edu.pe");
    }
}

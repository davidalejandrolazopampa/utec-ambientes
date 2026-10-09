package pe.edu.utec.reservas.modules.aulas;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.core.userdetails.UserDetails;
import pe.edu.utec.reservas.modules.aulas.controller.AulaController;
import pe.edu.utec.reservas.modules.aulas.dto.AulaResponse;
import pe.edu.utec.reservas.modules.aulas.dto.CreateAulaRequest;
import pe.edu.utec.reservas.modules.aulas.dto.ImportHorariosResponse;
import pe.edu.utec.reservas.modules.aulas.service.AulaService;
import pe.edu.utec.reservas.modules.aulas.service.HorarioImportService;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Cobertura de AulaController: cada endpoint delega en el servicio (Mockito, sin contexto). */
@ExtendWith(MockitoExtension.class)
class AulaControllerTest {

    @Mock private AulaService aulaService;
    @Mock private HorarioImportService horarioImportService;
    @Mock private UserDetails userDetails;
    @InjectMocks private AulaController controller;

    @Test
    void listar_activasYTodas() {
        when(aulaService.listar("AULA")).thenReturn(List.of());
        assertNotNull(controller.listar("AULA", false).getBody().getData());
        when(aulaService.listarTodas()).thenReturn(List.of());
        assertNotNull(controller.listar(null, true).getBody().getData());
    }

    @Test
    void crear_editar_desactivar() {
        CreateAulaRequest req = new CreateAulaRequest();
        when(aulaService.crear(req)).thenReturn(new AulaResponse());
        assertEquals(HttpStatus.CREATED, controller.crear(req).getStatusCode());

        when(aulaService.actualizar(1L, req)).thenReturn(new AulaResponse());
        assertNotNull(controller.editar(1L, req).getBody().getData());

        assertNotNull(controller.desactivar(1L).getBody());
        verify(aulaService).desactivar(1L);
    }

    @Test
    void consultas_delegan() {
        when(aulaService.areasConClases("2026-1")).thenReturn(List.of());
        controller.areas("2026-1");
        when(aulaService.laboratoriosConOcupacion("2026-1")).thenReturn(List.of());
        controller.laboratoriosConOcupacion("2026-1");
        when(aulaService.buscarClases("2026-1", null, null, null, null)).thenReturn(List.of());
        controller.clases("2026-1", null, null, null, null);
        when(aulaService.buscarCursos("2026-1", null, null)).thenReturn(List.of());
        controller.cursos("2026-1", null, null);
        when(aulaService.clasesDeCurso("2026-1", 5L)).thenReturn(List.of());
        controller.clasesDeCurso(5L, "2026-1");
        when(aulaService.buscarLibres(eq("2026-1"), eq("LUNES"), any(), any(), isNull(), isNull(), any())).thenReturn(List.of());
        controller.libres("2026-1", "LUNES", "08:00", "10:00", null, null, "2026-07-20");
        when(aulaService.ocupacionDia(eq("2026-1"), eq("LUNES"), isNull(), any())).thenReturn(List.of());
        assertNotNull(controller.ocupacion("2026-1", "LUNES", null, "2026-07-20").getBody().getData());
    }

    @Test
    void importarHorarios_delega() {
        when(userDetails.getUsername()).thenReturn("doc@utec.edu.pe");
        var file = new MockMultipartFile("archivo", "h.csv", "text/csv", "x".getBytes());
        when(horarioImportService.importar(file, "doc@utec.edu.pe", false)).thenReturn(new ImportHorariosResponse());
        assertNotNull(controller.importarHorarios(file, false, userDetails).getBody().getData());
        // El flag sincronizar se propaga al servicio.
        when(horarioImportService.importar(file, "doc@utec.edu.pe", true)).thenReturn(new ImportHorariosResponse());
        assertNotNull(controller.importarHorarios(file, true, userDetails).getBody().getData());
    }
}

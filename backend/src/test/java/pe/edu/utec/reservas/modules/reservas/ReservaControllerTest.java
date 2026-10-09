package pe.edu.utec.reservas.modules.reservas;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.userdetails.UserDetails;
import pe.edu.utec.reservas.modules.laboratorios.service.CalendarioAccessGuard;
import pe.edu.utec.reservas.modules.reservas.controller.ReservaController;
import pe.edu.utec.reservas.modules.reservas.dto.CreateReservaRequest;
import pe.edu.utec.reservas.modules.reservas.dto.ReservaResponse;
import pe.edu.utec.reservas.modules.reservas.service.ReservaService;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ReservaControllerTest {

    @Mock private ReservaService reservaService;
    @Mock private CalendarioAccessGuard calendarioAccessGuard;
    @Mock private UserDetails userDetails;
    @InjectMocks private ReservaController controller;

    private final ReservaResponse resp = new ReservaResponse();

    private void user() { when(userDetails.getUsername()).thenReturn("alumno@utec.edu.pe"); }

    @Test
    void crear() {
        user();
        CreateReservaRequest req = new CreateReservaRequest();
        when(reservaService.crear(req, "alumno@utec.edu.pe")).thenReturn(resp);
        var r = controller.crear(req, userDetails);
        assertEquals(HttpStatus.CREATED, r.getStatusCode());
        assertSame(resp, r.getBody().getData());
    }

    @Test
    void misReservas() {
        user();
        when(reservaService.listarMisReservas("alumno@utec.edu.pe")).thenReturn(List.of(resp));
        var r = controller.misReservas(userDetails);
        assertEquals(1, r.getBody().getData().size());
    }

    @Test
    void porRecurso_conFechaNull_usaHoy() {
        when(reservaService.listarPorRecursoYFecha(5L, LocalDate.now())).thenReturn(List.of(resp));
        var r = controller.porRecurso(5L, null);
        assertEquals(200, r.getStatusCode().value());
    }

    @Test
    void porRecurso_conFecha() {
        LocalDate f = LocalDate.of(2026, 6, 1);
        when(reservaService.listarPorRecursoYFecha(5L, f)).thenReturn(List.of());
        var r = controller.porRecurso(5L, f);
        assertTrue(r.getBody().getData().isEmpty());
    }

    @Test
    void porLaboratorio() {
        user();
        when(reservaService.listarPorLaboratorio(9L)).thenReturn(List.of(resp));
        var r = controller.porLaboratorio(9L, userDetails);
        assertEquals(1, r.getBody().getData().size());
        verify(calendarioAccessGuard).asegurarAccesoCalendario(9L, "alumno@utec.edu.pe");
    }

    @Test
    void cancelar() {
        user();
        when(reservaService.cancelar(3L, "alumno@utec.edu.pe")).thenReturn(resp);
        var r = controller.cancelar(3L, userDetails);
        assertSame(resp, r.getBody().getData());
    }

    @Test
    void editar() {
        user();
        CreateReservaRequest req = new CreateReservaRequest();
        when(reservaService.editar(3L, req, "alumno@utec.edu.pe")).thenReturn(resp);
        var r = controller.editar(3L, req, userDetails);
        assertSame(resp, r.getBody().getData());
    }

    @Test
    void reactivar() {
        user();
        when(reservaService.reactivar(3L, "alumno@utec.edu.pe")).thenReturn(resp);
        var r = controller.reactivar(3L, userDetails);
        assertSame(resp, r.getBody().getData());
    }

    @Test
    void completar() {
        user();
        when(reservaService.marcarEstado(3L, "COMPLETADA", "alumno@utec.edu.pe")).thenReturn(resp);
        assertSame(resp, controller.completar(3L, userDetails).getBody().getData());
    }

    @Test
    void noShow() {
        user();
        when(reservaService.marcarEstado(3L, "NO_SHOW", "alumno@utec.edu.pe")).thenReturn(resp);
        assertSame(resp, controller.noShow(3L, userDetails).getBody().getData());
    }
}

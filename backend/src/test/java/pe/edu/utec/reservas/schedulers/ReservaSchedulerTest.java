package pe.edu.utec.reservas.schedulers;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.laboratorios.model.Laboratorio;
import pe.edu.utec.reservas.modules.laboratorios.model.RecursoLab;
import pe.edu.utec.reservas.modules.laboratorios.repository.RecursoLabRepository;
import pe.edu.utec.reservas.modules.reservas.model.Reserva;
import pe.edu.utec.reservas.modules.reservas.repository.ReservaRepository;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ReservaSchedulerTest {

    @Mock private ReservaRepository reservaRepository;
    @Mock private RecursoLabRepository recursoLabRepository;
    @Mock private pe.edu.utec.reservas.modules.notificaciones.EmailService emailService;
    @InjectMocks private ReservaScheduler scheduler;

    private Reserva reserva(String estado, LocalDate fecha, LocalTime ini, LocalTime fin) {
        RecursoLab recurso = RecursoLab.builder().nombre("MESA 1").qrCode("Q1").estado("OCUPADO").build();
        Usuario u = Usuario.builder().correoUtec("u@utec.edu.pe").build();
        Reserva r = Reserva.builder().recurso(recurso).usuario(u)
                .estado(estado).fecha(fecha).horaInicio(ini).horaFin(fin).build();
        r.setId(1L);
        return r;
    }

    @Test
    void anularReservasSinCheckin_anulaNoShow() {
        Assumptions.assumeTrue(LocalTime.now().getHour() >= 1, "se evita la ventana de medianoche");
        ReflectionTestUtils.setField(scheduler, "checkinTimeoutMinutos", 15);
        Reserva r = reserva("PENDIENTE", LocalDate.now(), LocalTime.of(0, 0), LocalTime.of(1, 0));
        when(reservaRepository.findPendingReservationsToCancel(any(), any())).thenReturn(List.of(r));

        scheduler.anularReservasSinCheckin();

        assertEquals("NO_SHOW", r.getEstado());
        verify(reservaRepository).save(r);
    }

    @Test
    void anularReservasSinCheckin_sinPendientes_noHaceNada() {
        Assumptions.assumeTrue(LocalTime.now().getHour() >= 1);
        ReflectionTestUtils.setField(scheduler, "checkinTimeoutMinutos", 15);
        when(reservaRepository.findPendingReservationsToCancel(any(), any())).thenReturn(List.of());
        scheduler.anularReservasSinCheckin();
        verify(reservaRepository, never()).save(any());
    }

    @Test
    void completarReservasExpiradas_completaYLibera() {
        Reserva r = reserva("EN_CURSO", LocalDate.now().minusDays(1), LocalTime.of(10, 0), LocalTime.of(11, 0));
        when(reservaRepository.findAll()).thenReturn(List.of(r));
        scheduler.completarReservasExpiradas();
        assertEquals("COMPLETADA", r.getEstado());
        assertEquals("DISPONIBLE", r.getRecurso().getEstado());
        verify(reservaRepository).save(r);
    }

    @Test
    void completarReservasExpiradas_noTocaOtrasEstados() {
        Reserva r = reserva("PENDIENTE", LocalDate.now().minusDays(1), LocalTime.of(10, 0), LocalTime.of(11, 0));
        when(reservaRepository.findAll()).thenReturn(List.of(r));
        scheduler.completarReservasExpiradas();
        assertEquals("PENDIENTE", r.getEstado());
        verify(reservaRepository, never()).save(any());
    }

    @Test
    void liberarRecursosCompletados_sinHuerfanos_noHaceNada() {
        when(recursoLabRepository.findOcupadosHuerfanos(any())).thenReturn(List.of());
        scheduler.liberarRecursosCompletados();
        verify(recursoLabRepository, never()).saveAll(any());
    }

    @Test
    void liberarRecursosCompletados_liberaMesaHuerfana() {
        Laboratorio lab = Laboratorio.builder().build();
        lab.setId(127L);
        RecursoLab huerfana = RecursoLab.builder().nombre("MESA 11").qrCode("Q11")
                .estado("OCUPADO").laboratorio(lab).build();
        huerfana.setId(100L);
        when(recursoLabRepository.findOcupadosHuerfanos(any())).thenReturn(List.of(huerfana));

        scheduler.liberarRecursosCompletados();

        assertEquals("DISPONIBLE", huerfana.getEstado());
        verify(recursoLabRepository).saveAll(List.of(huerfana));
    }

    @Test
    void enviarRecordatoriosVispera_enviaCorreoPorReservaActiva() {
        LocalDate manana = LocalDate.now().plusDays(1);
        Laboratorio lab = Laboratorio.builder().nombre("Concept Lab").build();
        RecursoLab recurso = RecursoLab.builder().nombre("MESA 1").laboratorio(lab).build();
        Usuario u = Usuario.builder().correoUtec("u@utec.edu.pe").nombres("Ana").apellidos("Lopez").build();
        Reserva r = Reserva.builder().recurso(recurso).usuario(u).estado("CONFIRMADA")
                .fecha(manana).horaInicio(LocalTime.of(10, 0)).horaFin(LocalTime.of(11, 0)).build();
        r.setId(5L);
        when(reservaRepository.findVigentesEnFecha(manana)).thenReturn(List.of(r));

        scheduler.enviarRecordatoriosVispera();

        verify(emailService).enviarRecordatorioReserva(eq("u@utec.edu.pe"), any(),
                eq("Concept Lab"), eq("MESA 1"), any(), any(), any());
    }

    @Test
    void enviarRecordatoriosVispera_ignoraEnCurso() {
        Reserva r = reserva("EN_CURSO", LocalDate.now().plusDays(1), LocalTime.of(10, 0), LocalTime.of(11, 0));
        when(reservaRepository.findVigentesEnFecha(any())).thenReturn(List.of(r));
        scheduler.enviarRecordatoriosVispera();
        verify(emailService, never()).enviarRecordatorioReserva(any(), any(), any(), any(), any(), any(), any());
    }
}

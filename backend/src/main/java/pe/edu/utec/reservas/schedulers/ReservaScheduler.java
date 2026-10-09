package pe.edu.utec.reservas.schedulers;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.utec.reservas.modules.laboratorios.model.RecursoLab;
import pe.edu.utec.reservas.modules.laboratorios.repository.RecursoLabRepository;
import pe.edu.utec.reservas.modules.reservas.model.Reserva;
import pe.edu.utec.reservas.modules.reservas.repository.ReservaRepository;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/**
 * Cron job que:
 * 1. Anula reservas sin check-in después de 15 minutos
 * 2. Completa reservas EN_CURSO cuando pasa la hora_fin y libera mesas
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ReservaScheduler {

    private final ReservaRepository reservaRepository;
    private final RecursoLabRepository recursoLabRepository;
    private final pe.edu.utec.reservas.modules.notificaciones.EmailService emailService;

    @Value("${app.reservas.checkin-timeout-minutos:15}")
    private int checkinTimeoutMinutos;

    /**
     * Cada 5 minutos busca reservas PENDIENTES cuya hora de inicio
     * ya pasó hace más de 15 minutos, y las anula automáticamente.
     * Incluye protección contra wrap de medianoche.
     */
    @Scheduled(fixedRate = 300000)
    @SchedulerLock(name = "anularReservasSinCheckin", lockAtMostFor = "PT4M", lockAtLeastFor = "PT0S")
    @Transactional
    public void anularReservasSinCheckin() {
        LocalDate hoy = LocalDate.now();
        LocalTime ahora = LocalTime.now();

        // Protección: si es entre 00:00 y 00:16, no procesar
        // Evita que el cutoff se envuelva a 23:45 cuando son las 00:05
        if (ahora.getHour() == 0 && ahora.getMinute() < (checkinTimeoutMinutos + 1)) {
            return;
        }

        LocalTime cutoff = ahora.minusMinutes(checkinTimeoutMinutos);

        List<Reserva> pendientes = reservaRepository.findPendingReservationsToCancel(hoy, cutoff);

        // Filtro adicional: solo anular si la hora actual realmente pasó inicio + timeout
        pendientes = pendientes.stream()
                .filter(r -> ahora.isAfter(r.getHoraInicio().plusMinutes(checkinTimeoutMinutos)))
                .toList();

        if (pendientes.isEmpty()) {
            return;
        }

        for (Reserva reserva : pendientes) {
            reserva.setEstado("NO_SHOW");
            reservaRepository.save(reserva);

            log.info("Auto-anulada reserva ID: {} | Usuario: {} | Recurso: {} | Hora: {}",
                    reserva.getId(),
                    reserva.getUsuario().getCorreoUtec(),
                    reserva.getRecurso().getQrCode(),
                    reserva.getHoraInicio());
        }

        log.info("Scheduler: {} reservas anuladas por no-show", pendientes.size());
    }

    /**
     * Cada 2 minutos completa las reservas EN_CURSO
     * cuya hora_fin ya pasó y LIBERA los recursos (mesas).
     */
    @Scheduled(fixedRate = 120000)
    @SchedulerLock(name = "completarReservasExpiradas", lockAtMostFor = "PT90S", lockAtLeastFor = "PT0S")
    @Transactional
    public void completarReservasExpiradas() {
        LocalDate hoy = LocalDate.now();
        LocalTime ahora = LocalTime.now();

        List<Reserva> reservas = reservaRepository.findAll();

        int completadas = 0;
        for (Reserva reserva : reservas) {
            if ("EN_CURSO".equals(reserva.getEstado()) &&
                (reserva.getFecha().isBefore(hoy) ||
                 (reserva.getFecha().equals(hoy) && reserva.getHoraFin().isBefore(ahora)))) {

                reserva.setEstado("COMPLETADA");
                reservaRepository.save(reserva);

                reserva.getRecurso().setEstado("DISPONIBLE");

                completadas++;

                log.info("Reserva completada y mesa liberada - ID: {} | Usuario: {} | Mesa: {} | Fin: {}",
                        reserva.getId(),
                        reserva.getUsuario().getCorreoUtec(),
                        reserva.getRecurso().getNombre(),
                        reserva.getHoraFin());
            }
        }

        if (completadas > 0) {
            log.info("Scheduler: {} reservas completadas y mesas liberadas", completadas);
        }
    }

    /**
     * Recordatorio anti-no-show: la NOCHE ANTERIOR (20:00 por defecto, configurable con
     * app.reservas.recordatorio-cron) envía un correo al titular de cada reserva ACTIVA
     * (PENDIENTE/CONFIRMADA) del día siguiente. Best-effort: un fallo de correo no corta el barrido.
     */
    @Scheduled(cron = "${app.reservas.recordatorio-cron:0 0 20 * * *}")
    @SchedulerLock(name = "recordatorioVisperaReservas", lockAtMostFor = "PT10M", lockAtLeastFor = "PT2M")
    @Transactional(readOnly = true)
    public void enviarRecordatoriosVispera() {
        LocalDate manana = LocalDate.now().plusDays(1);
        List<Reserva> reservas = reservaRepository.findVigentesEnFecha(manana);

        int enviados = 0;
        for (Reserva reserva : reservas) {
            if ("EN_CURSO".equals(reserva.getEstado())) continue; // no aplica a una reserva futura
            try {
                emailService.enviarRecordatorioReserva(
                        reserva.getUsuario().getCorreoUtec(),
                        reserva.getUsuario().getNombreCompleto(),
                        reserva.getRecurso().getLaboratorio().getNombre(),
                        reserva.getRecurso().getNombre(),
                        reserva.getFecha().toString(),
                        reserva.getHoraInicio().toString(),
                        reserva.getHoraFin().toString());
                enviados++;
            } catch (Exception e) {
                log.warn("No se pudo enviar recordatorio de la reserva {}: {}", reserva.getId(), e.getMessage());
            }
        }
        if (enviados > 0) {
            log.info("Scheduler: {} recordatorio(s) de víspera enviados para el {}", enviados, manana);
        }
    }

    /**
     * Cada hora reconcilia recursos en estado huérfano: mesas marcadas OCUPADO
     * que NO tienen ninguna reserva EN_CURSO de hoy que lo justifique (p. ej. un
     * check-in viejo cuya mesa nunca volvió a DISPONIBLE). Red de seguridad además
     * de la liberación que hace completarReservasExpiradas.
     */
    @Scheduled(fixedRate = 3600000)
    @SchedulerLock(name = "liberarRecursosCompletados", lockAtMostFor = "PT5M", lockAtLeastFor = "PT0S")
    @Transactional
    public void liberarRecursosCompletados() {
        List<RecursoLab> huerfanos = recursoLabRepository.findOcupadosHuerfanos(LocalDate.now());
        if (huerfanos.isEmpty()) {
            return;
        }
        for (RecursoLab recurso : huerfanos) {
            recurso.setEstado("DISPONIBLE");
            log.warn("Reconciliación: liberada mesa con estado huérfano OCUPADO - Recurso ID: {} | Mesa: {} | Lab: {}",
                    recurso.getId(), recurso.getNombre(), recurso.getLaboratorio().getId());
        }
        recursoLabRepository.saveAll(huerfanos);
        log.info("Scheduler reconciliación: {} recurso(s) OCUPADO sin reserva activa liberados", huerfanos.size());
    }
}
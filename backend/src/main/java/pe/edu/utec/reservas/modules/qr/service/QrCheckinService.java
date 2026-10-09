package pe.edu.utec.reservas.modules.qr.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.iam.repository.UsuarioRepository;
import pe.edu.utec.reservas.modules.laboratorios.model.RecursoLab;
import pe.edu.utec.reservas.modules.laboratorios.repository.RecursoLabRepository;
import pe.edu.utec.reservas.modules.notificaciones.EmailService;
import pe.edu.utec.reservas.modules.qr.dto.CheckinRequest;
import pe.edu.utec.reservas.modules.qr.dto.CheckinResponse;
import pe.edu.utec.reservas.modules.qr.model.QrValidacion;
import pe.edu.utec.reservas.modules.qr.repository.QrValidacionRepository;
import pe.edu.utec.reservas.modules.reservas.model.Reserva;
import pe.edu.utec.reservas.modules.reservas.repository.ReservaRepository;
import pe.edu.utec.reservas.shared.exceptions.BusinessException;
import pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException;

import java.time.LocalDate;
import java.time.LocalTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class QrCheckinService {

    private final ReservaRepository reservaRepository;
    private final RecursoLabRepository recursoLabRepository;
    private final QrValidacionRepository qrValidacionRepository;
    private final UsuarioRepository usuarioRepository;
    private final EmailService emailService;
    private final org.springframework.context.ApplicationEventPublisher eventPublisher;

    /**
     * Punto común de TODO check-in válido (los 3 caminos llaman aquí): envía el correo
     * "Check-in confirmado" y publica el evento de tiempo real (CHECKIN) para que los
     * calendarios/listas conectados se refresquen al instante.
     */
    private void notificarCheckin(Reserva reserva) {
        Usuario titular = reserva.getUsuario();
        RecursoLab rec = reserva.getRecurso();
        emailService.enviarCheckinConfirmado(
                titular.getCorreoUtec(), titular.getNombreCompleto(),
                rec.getLaboratorio().getNombre() + " (" + rec.getLaboratorio().getCodigoLab() + ")",
                rec.getNombre(),
                reserva.getFecha().toString(),
                reserva.getHoraInicio().toString(),
                reserva.getHoraFin().toString());
        eventPublisher.publishEvent(new pe.edu.utec.reservas.modules.realtime.LabActivityEvent(
                "CHECKIN", rec.getLaboratorio().getId()));
    }

    /**
     * Procesa el check-in escaneando el QR del recurso físico.
     *
     * Validaciones:
     * 1. La reserva existe y es del usuario
     * 2. La reserva es para hoy
     * 3. El estado es PENDIENTE o CONFIRMADA
     * 4. El QR escaneado coincide con el recurso de la reserva
     * 5. Estamos dentro del horario de la reserva
     */
    @Transactional
    public CheckinResponse checkin(CheckinRequest request, String correoUsuario) {

        // 1. Obtener reserva
        Reserva reserva = reservaRepository.findById(request.getReservaId())
                .orElseThrow(() -> new ResourceNotFoundException("Reserva", "id", request.getReservaId()));

        // 2. Obtener usuario
        Usuario usuario = usuarioRepository.findByCorreoUtec(correoUsuario)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "correo", correoUsuario));

        // 3. Obtener recurso por QR
        RecursoLab recursoEscaneado = recursoLabRepository.findByQrCode(request.getQrCode())
                .orElse(null);

        // 4. Validar QR y determinar resultado
        String resultado;
        String mensaje;

        if (recursoEscaneado == null) {
            resultado = "INVALIDO";
            mensaje = "Código QR no reconocido";
        } else if (!recursoEscaneado.getId().equals(reserva.getRecurso().getId())) {
            resultado = "RECURSO_NO_COINCIDE";
            mensaje = "Este QR corresponde a " + recursoEscaneado.getNombre()
                    + " pero tu reserva es en " + reserva.getRecurso().getNombre();
        } else if (!reserva.getFecha().equals(LocalDate.now())) {
            resultado = "INVALIDO";
            mensaje = "La reserva no es para hoy";
        } else if (!"PENDIENTE".equals(reserva.getEstado()) && !"CONFIRMADA".equals(reserva.getEstado())) {
            resultado = "INVALIDO";
            mensaje = "La reserva no está en estado válido para check-in. Estado actual: " + reserva.getEstado();
        } else if (!reserva.getUsuario().getCorreoUtec().equals(correoUsuario)) {
            resultado = "INVALIDO";
            mensaje = "Esta reserva no te pertenece";
        } else if (LocalTime.now().isBefore(reserva.getHoraInicio().minusMinutes(10))) {
            resultado = "INVALIDO";
            mensaje = "Aún es muy temprano. El check-in se habilita 10 minutos antes";
        } else {
            resultado = "VALIDO";
            mensaje = "Check-in exitoso";

            // Actualizar estado de la reserva
            reserva.setEstado("EN_CURSO");
            reservaRepository.save(reserva);

            // Actualizar estado del recurso
            recursoEscaneado.setEstado("OCUPADO");
            recursoLabRepository.save(recursoEscaneado);

            // Notificar al titular que su asistencia quedó confirmada (EN_CURSO)
            notificarCheckin(reserva);
        }

        // 5. Registrar la validación
        QrValidacion validacion = QrValidacion.builder()
                .reserva(reserva)
                .recurso(recursoEscaneado != null ? recursoEscaneado : reserva.getRecurso())
                .qrEscaneado(request.getQrCode())
                .resultado(resultado)
                .validadoPor(usuario)
                .build();

        qrValidacionRepository.save(validacion);

        log.info("QR Check-in - Reserva: {} | QR: {} | Resultado: {} | Usuario: {}",
                request.getReservaId(), request.getQrCode(), resultado, correoUsuario);

        // 6. Respuesta
        return CheckinResponse.builder()
                .reservaId(reserva.getId())
                .resultado(resultado)
                .mensaje(mensaje)
                .recursoNombre(reserva.getRecurso().getNombre())
                .laboratorioNombre(reserva.getRecurso().getLaboratorio().getNombre())
                .validadoEn(validacion.getValidadoEn())
                .build();
    }

    /**
     * Check-in automático: el alumno escanea el QR y el sistema busca su reserva activa.
     */
    @Transactional
    public CheckinResponse checkinPorQr(String qrCode, String correoUsuario) {
        Usuario usuario = usuarioRepository.findByCorreoUtec(correoUsuario)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "correo", correoUsuario));

        RecursoLab recurso = recursoLabRepository.findByQrCode(qrCode)
                .orElseThrow(() -> new BusinessException("Código QR no reconocido: " + qrCode, "QR_INVALIDO"));

        // Buscar reserva activa del usuario para este recurso hoy
        LocalDate hoy = LocalDate.now();
        LocalTime ahora = LocalTime.now();

        var reservas = reservaRepository.findByRecursoIdAndFecha(recurso.getId(), hoy).stream()
                .filter(r -> r.getUsuario().getId().equals(usuario.getId()))
                .filter(r -> "PENDIENTE".equals(r.getEstado()) || "CONFIRMADA".equals(r.getEstado()))
                .filter(r -> ahora.isAfter(r.getHoraInicio().minusMinutes(10)) && ahora.isBefore(r.getHoraFin()))
                .toList();

        if (reservas.isEmpty()) {
            throw new BusinessException(
                    "No tienes una reserva activa para " + recurso.getNombre() + " en este momento",
                    "NO_RESERVA_ACTIVA"
            );
        }

        Reserva reserva = reservas.get(0);
        reserva.setEstado("EN_CURSO");
        reservaRepository.save(reserva);

        recurso.setEstado("OCUPADO");
        recursoLabRepository.save(recurso);

        // Registrar validación
        QrValidacion validacion = QrValidacion.builder()
                .reserva(reserva)
                .recurso(recurso)
                .qrEscaneado(qrCode)
                .resultado("VALIDO")
                .validadoPor(usuario)
                .build();
        qrValidacionRepository.save(validacion);

        notificarCheckin(reserva);

        log.info("QR Check-in automático - Reserva: {} | QR: {} | Usuario: {}", reserva.getId(), qrCode, correoUsuario);

        return CheckinResponse.builder()
                .reservaId(reserva.getId())
                .resultado("VALIDO")
                .mensaje("Check-in exitoso — ¡disfruta tu espacio!")
                .recursoNombre(recurso.getNombre())
                .laboratorioNombre(recurso.getLaboratorio().getNombre())
                .validadoEn(validacion.getValidadoEn())
                .build();
    }

    /**
     * Check-in manual: el responsable confirma la asistencia sin necesidad de QR.
     */
    @Transactional
    public CheckinResponse checkinManual(Long reservaId, String correoResponsable) {
        Reserva reserva = reservaRepository.findById(reservaId)
                .orElseThrow(() -> new ResourceNotFoundException("Reserva", "id", reservaId));

        if (!"PENDIENTE".equals(reserva.getEstado()) && !"CONFIRMADA".equals(reserva.getEstado())) {
            throw new BusinessException("La reserva no está en estado válido para check-in", "INVALID_STATE");
        }
        // ✅ Solo permitir check-in para reservas de HOY
        if (!reserva.getFecha().equals(java.time.LocalDate.now())) {
            throw new BusinessException("Solo se puede hacer check-in de reservas del día de hoy", "NOT_TODAY");
        }
        // ✅ El check-in se habilita 10 minutos antes de la hora de inicio
        if (LocalTime.now().isBefore(reserva.getHoraInicio().minusMinutes(10))) {
            throw new BusinessException(
                    "Aún es muy temprano. El check-in se habilita 10 minutos antes de la hora de la reserva ("
                            + reserva.getHoraInicio() + ").", "TOO_EARLY");
        }

        Usuario responsable = usuarioRepository.findByCorreoUtec(correoResponsable)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "correo", correoResponsable));

        reserva.setEstado("EN_CURSO");
        reservaRepository.save(reserva);

        RecursoLab recurso = reserva.getRecurso();
        recurso.setEstado("OCUPADO");
        recursoLabRepository.save(recurso);

        notificarCheckin(reserva);

        // Registrar validación
        QrValidacion validacion = QrValidacion.builder()
                .reserva(reserva)
                .recurso(recurso)
                .qrEscaneado("MANUAL-" + correoResponsable)
                // El enum resultado_qr solo admite VALIDO/INVALIDO/EXPIRADO/RECURSO_NO_COINCIDE.
                // La marca "manual" queda en qrEscaneado y en el mensaje de respuesta.
                .resultado("VALIDO")
                .validadoPor(responsable)
                .build();
        qrValidacionRepository.save(validacion);

        log.info("Check-in manual - Reserva: {} | Responsable: {}", reservaId, correoResponsable);

        return CheckinResponse.builder()
                .reservaId(reserva.getId())
                .resultado("VALIDO")
                .mensaje("Check-in manual confirmado por " + responsable.getNombreCompleto())
                .recursoNombre(recurso.getNombre())
                .laboratorioNombre(recurso.getLaboratorio().getNombre())
                .validadoEn(validacion.getValidadoEn())
                .build();
    }
}
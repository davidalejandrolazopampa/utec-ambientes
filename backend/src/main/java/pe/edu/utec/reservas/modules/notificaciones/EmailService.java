package pe.edu.utec.reservas.modules.notificaciones;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.util.HtmlUtils;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmailService {

    private final JavaMailSender mailSender;

    @Value("${app.mail.from:conceptlab@utec.edu.pe}")
    private String fromEmail;

    @Value("${app.mail.from-name:UTEC Labs}")
    private String fromName;

    @Async
    public void enviarReservaConfirmada(String destinatario, String nombreUsuario,
                                        String laboratorio, String recurso,
                                        String fecha, String horaInicio, String horaFin) {
        // Hora a la que se habilita el check-in (10 minutos antes del inicio)
        String horaCheckin = horaInicio;
        try {
            String hi = horaInicio != null && horaInicio.length() >= 5 ? horaInicio.substring(0, 5) : horaInicio;
            horaCheckin = java.time.LocalTime.parse(hi).minusMinutes(10).toString();
        } catch (Exception ignored) {}

        String asunto = "Reserva registrada — recuerda tu check-in · " + recurso + ", " + laboratorio;
        String html = """
            <div style="font-family: Calibri, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #231F20;">
                <div style="background: #231F20; padding: 22px; text-align: center;">
                    <span style="color: #00BFFF; font-size: 26px; font-weight: bold;">UTEC Labs</span>
                </div>
                <div style="padding: 30px; border: 1px solid #eee; border-top: none;">
                    <div style="display: inline-block; background: #fff7ed; color: #c2410c; border: 1px solid #fdba74; border-radius: 999px; padding: 5px 14px; font-size: 13px; font-weight: bold;">
                        ⏳ Pendiente de check-in
                    </div>
                    <h2 style="margin: 16px 0 4px;">¡Reserva registrada, %s!</h2>
                    <p style="color: #555; margin-top: 0;">Tu espacio está apartado. <strong>Aún no está confirmada</strong>: se confirma cuando hagas el check-in.</p>

                    <div style="background: #f8fafc; border-left: 4px solid #00BFFF; padding: 16px; margin: 22px 0; border-radius: 6px;">
                        <p style="margin: 6px 0;">🏫 <strong>Laboratorio:</strong> %s</p>
                        <p style="margin: 6px 0;">🪑 <strong>Recurso:</strong> %s</p>
                        <p style="margin: 6px 0;">📅 <strong>Fecha:</strong> %s</p>
                        <p style="margin: 6px 0;">🕘 <strong>Horario:</strong> %s — %s</p>
                    </div>

                    <div style="background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 18px; margin: 22px 0;">
                        <p style="margin: 0 0 8px; font-weight: bold; color: #b45309;">✅ Cómo confirmar tu asistencia (check-in)</p>
                        <p style="margin: 6px 0; color: #92400e;">El check-in se habilita <strong>10 minutos antes</strong>, es decir <strong>desde las %s</strong>.</p>
                        <p style="margin: 6px 0; color: #92400e;">Escanea el <strong>QR del recurso</strong> al llegar, o pide al responsable del laboratorio que confirme tu asistencia.</p>
                        <p style="margin: 6px 0; color: #92400e;">⚠️ Si no haces check-in dentro de los <strong>primeros 15 minutos</strong>, la reserva se cancelará automáticamente y el recurso se liberará.</p>
                    </div>
                </div>
                %s
            </div>
            """.formatted(HtmlUtils.htmlEscape(nombreUsuario), HtmlUtils.htmlEscape(laboratorio),
                          HtmlUtils.htmlEscape(recurso), fecha, horaInicio, horaFin, horaCheckin, pieHtml());

        enviarHtml(destinatario, asunto, html);
    }

    /**
     * Recordatorio la VÍSPERA: se envía al titular la noche anterior a su reserva, para bajar los
     * no-shows. Incluye los datos y el recordatorio de hacer check-in (o cancelar si ya no irá).
     */
    @Async
    public void enviarRecordatorioReserva(String destinatario, String nombreUsuario,
                                          String laboratorio, String recurso,
                                          String fecha, String horaInicio, String horaFin) {
        String asunto = "Recordatorio: tu reserva de mañana · " + recurso + ", " + laboratorio;
        String html = """
            <div style="font-family: Calibri, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #231F20;">
                <div style="background: #231F20; padding: 22px; text-align: center;">
                    <span style="color: #00BFFF; font-size: 26px; font-weight: bold;">UTEC Labs</span>
                </div>
                <div style="padding: 30px; border: 1px solid #eee; border-top: none;">
                    <div style="display: inline-block; background: #eff6ff; color: #1d4ed8; border: 1px solid #93c5fd; border-radius: 999px; padding: 5px 14px; font-size: 13px; font-weight: bold;">
                        🔔 Recordatorio
                    </div>
                    <h2 style="margin: 16px 0 4px;">¡Tienes una reserva mañana, %s!</h2>
                    <p style="color: #555; margin-top: 0;">Te recordamos tu reserva para <strong>mañana</strong>. No olvides tu <strong>check-in</strong> al llegar.</p>

                    <div style="background: #f8fafc; border-left: 4px solid #00BFFF; padding: 16px; margin: 22px 0; border-radius: 6px;">
                        <p style="margin: 6px 0;">🏫 <strong>Laboratorio:</strong> %s</p>
                        <p style="margin: 6px 0;">🪑 <strong>Recurso:</strong> %s</p>
                        <p style="margin: 6px 0;">📅 <strong>Fecha:</strong> %s</p>
                        <p style="margin: 6px 0;">🕘 <strong>Horario:</strong> %s — %s</p>
                    </div>

                    <div style="background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 18px; margin: 22px 0;">
                        <p style="margin: 0 0 8px; font-weight: bold; color: #b45309;">⚠️ Recuerda</p>
                        <p style="margin: 6px 0; color: #92400e;">Si no haces check-in dentro de los <strong>primeros 15 minutos</strong>, la reserva se cancela y el recurso se libera.</p>
                        <p style="margin: 6px 0; color: #92400e;">Si ya no vas a usarla, <strong>cancélala</strong> para que otro alumno pueda reservar.</p>
                    </div>
                </div>
                %s
            </div>
            """.formatted(HtmlUtils.htmlEscape(nombreUsuario), HtmlUtils.htmlEscape(laboratorio),
                          HtmlUtils.htmlEscape(recurso), fecha, horaInicio, horaFin, pieHtml());

        enviarHtml(destinatario, asunto, html);
    }

    /**
     * Correo de check-in confirmado: la reserva pasó a EN_CURSO (asistencia registrada).
     * Se envía al titular tras un check-in válido (QR, auto-scan o manual del responsable).
     */
    @Async
    public void enviarCheckinConfirmado(String destinatario, String nombreUsuario,
                                        String laboratorio, String recurso,
                                        String fecha, String horaInicio, String horaFin) {
        String asunto = "Check-in confirmado — estás En curso · " + recurso + ", " + laboratorio;
        String html = """
            <div style="font-family: Calibri, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #231F20;">
                <div style="background: #231F20; padding: 22px; text-align: center;">
                    <span style="color: #00BFFF; font-size: 26px; font-weight: bold;">UTEC Labs</span>
                </div>
                <div style="padding: 30px; border: 1px solid #eee; border-top: none;">
                    <div style="display: inline-block; background: #ecfdf5; color: #047857; border: 1px solid #6ee7b7; border-radius: 999px; padding: 5px 14px; font-size: 13px; font-weight: bold;">
                        ✅ Check-in confirmado
                    </div>
                    <h2 style="margin: 16px 0 4px;">¡Asistencia confirmada, %s!</h2>
                    <p style="color: #555; margin-top: 0;">Tu reserva está ahora <strong>En curso</strong>. ¡Disfruta tu espacio!</p>

                    <div style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px; margin: 22px 0; border-radius: 6px;">
                        <p style="margin: 6px 0;">🏫 <strong>Laboratorio:</strong> %s</p>
                        <p style="margin: 6px 0;">🪑 <strong>Recurso:</strong> %s</p>
                        <p style="margin: 6px 0;">📅 <strong>Fecha:</strong> %s</p>
                        <p style="margin: 6px 0;">🕘 <strong>Horario:</strong> %s — %s</p>
                    </div>

                    <p style="color: #666; font-size: 13px;">Cuando termine tu franja horaria, la reserva se marcará automáticamente como <strong>completada</strong> y el recurso quedará libre para otros.</p>
                </div>
                %s
            </div>
            """.formatted(HtmlUtils.htmlEscape(nombreUsuario), HtmlUtils.htmlEscape(laboratorio),
                          HtmlUtils.htmlEscape(recurso), fecha, horaInicio, horaFin, pieHtml());

        enviarHtml(destinatario, asunto, html);
    }

    /**
     * Correo de bloqueo creado o editado. Para PARCIAL lista los recursos reservados;
     * incluye un bloque de indicaciones (armado/desmontaje, pizarras, retráctiles, etc.).
     */
    @Async
    public void enviarBloqueoCreado(String destinatario, String nombreResponsable,
                                    String laboratorio, String tipo, String motivo,
                                    String fecha, String horaInicio, String horaFin,
                                    String descripcion, List<String> recursosNombres, boolean edicion) {
        boolean total = "TOTAL".equalsIgnoreCase(tipo);
        String tipoTexto = total ? "Bloqueo TOTAL (todo el laboratorio)" : "Bloqueo PARCIAL (recursos específicos)";
        String horarioTexto = (horaInicio != null && horaFin != null) ? (horaInicio + " — " + horaFin) : "Todo el día";
        String desc = (descripcion != null && !descripcion.isBlank()) ? descripcion : "—";
        String verbo = edicion ? "actualizó" : "registró";

        // Uso del espacio: deja claro qué se puede usar y qué pasa con el resto del lab.
        String usoEspacio = total
                ? "Durante el horario indicado, <strong>todo el laboratorio queda reservado para tu actividad</strong>: puedes usar todos sus recursos y <strong>nadie más podrá reservar</strong> en ese periodo."
                : "Durante el horario indicado, <strong>los recursos que reservaste son para tu actividad</strong>; el resto del laboratorio <strong>sigue disponible</strong> para que otras personas hagan sus reservas.";

        // Recursos reservados (solo PARCIAL): se listan por nombre.
        String recursosHtml = "";
        if (!total && recursosNombres != null && !recursosNombres.isEmpty()) {
            StringBuilder li = new StringBuilder();
            for (String r : recursosNombres) li.append("<li>").append(HtmlUtils.htmlEscape(r)).append("</li>");
            recursosHtml = """
                <p style="margin: 6px 0;">🪑 <strong>Recursos reservados (%d):</strong></p>
                <ul style="margin: 4px 0 6px 20px; padding: 0; color: #333;">%s</ul>
                """.formatted(recursosNombres.size(), li);
        }

        String asunto = (edicion ? "Bloqueo actualizado · " : "Bloqueo registrado · ")
                + laboratorio + " (" + (total ? "TOTAL" : "PARCIAL") + ")";
        String html = """
            <div style="font-family: Calibri, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #231F20;">
                <div style="background: #231F20; padding: 22px; text-align: center;">
                    <span style="color: #00BFFF; font-size: 26px; font-weight: bold;">UTEC Labs</span>
                </div>
                <div style="padding: 30px; border: 1px solid #eee; border-top: none;">
                    <div style="display: inline-block; background: #fef2f2; color: #b91c1c; border: 1px solid #fca5a5; border-radius: 999px; padding: 5px 14px; font-size: 13px; font-weight: bold;">
                        🔒 %s
                    </div>
                    <h2 style="margin: 16px 0 4px;">Hola %s,</h2>
                    <p style="color: #555; margin-top: 0;">Se %s la reserva del laboratorio según el siguiente detalle. %s</p>

                    <div style="background: #f8fafc; border-left: 4px solid #dc2626; padding: 16px; margin: 22px 0; border-radius: 6px;">
                        <p style="margin: 6px 0;">🏫 <strong>Laboratorio:</strong> %s</p>
                        <p style="margin: 6px 0;">📌 <strong>Motivo:</strong> %s</p>
                        <p style="margin: 6px 0;">📅 <strong>Fecha:</strong> %s</p>
                        <p style="margin: 6px 0;">🕘 <strong>Horario:</strong> %s</p>
                        %s
                        <p style="margin: 6px 0;">📝 <strong>Detalle:</strong> %s</p>
                    </div>
                </div>
                %s
                %s
            </div>
            """.formatted(tipoTexto, HtmlUtils.htmlEscape(nombreResponsable), verbo, usoEspacio,
                          HtmlUtils.htmlEscape(laboratorio), HtmlUtils.htmlEscape(motivo), fecha, horarioTexto,
                          recursosHtml, HtmlUtils.htmlEscape(desc), reglasHtml(), pieHtml());

        enviarHtml(destinatario, asunto, html);
    }

    @Async
    public void enviarReservaCancelada(String destinatario, String nombreUsuario,
                                       String laboratorio, String recurso,
                                       String fecha, String horaInicio, String horaFin) {
        String asunto = "Reserva Cancelada — " + recurso + ", " + laboratorio;
        String html = """
            <div style="font-family: Calibri, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #231F20; padding: 20px; text-align: center;">
                    <span style="color: #00BFFF; font-size: 24px; font-weight: bold;">UTEC Labs</span>
                </div>
                <div style="padding: 30px; border: 1px solid #eee;">
                    <h2 style="color: #dc2626; margin-top: 0;">Reserva Cancelada</h2>
                    <p>Hola <strong>%s</strong>,</p>
                    <p>Tu reserva ha sido cancelada.</p>
                    <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Laboratorio:</strong> %s</p>
                        <p style="margin: 5px 0;"><strong>Recurso:</strong> %s</p>
                        <p style="margin: 5px 0;"><strong>Fecha:</strong> %s</p>
                        <p style="margin: 5px 0;"><strong>Horario:</strong> %s — %s</p>
                    </div>
                    <p style="color: #666; font-size: 13px;">El recurso ha sido liberado y está disponible para otros usuarios.</p>
                </div>
                %s
            </div>
            """.formatted(HtmlUtils.htmlEscape(nombreUsuario), HtmlUtils.htmlEscape(laboratorio),
                          HtmlUtils.htmlEscape(recurso), fecha, horaInicio, horaFin, pieHtml());

        enviarHtml(destinatario, asunto, html);
    }

    /** Correo de bloqueo cancelado (al eliminar el bloqueo): el espacio/recursos quedan libres. */
    @Async
    public void enviarBloqueoCancelado(String destinatario, String nombreResponsable,
                                       String laboratorio, String tipo, String motivo,
                                       String fecha, String horaInicio, String horaFin) {
        boolean total = "TOTAL".equalsIgnoreCase(tipo);
        String horarioTexto = (horaInicio != null && horaFin != null) ? (horaInicio + " — " + horaFin) : "Todo el día";
        String liberado = total
                ? "El laboratorio queda nuevamente <strong>disponible</strong> para que otras personas hagan sus reservas."
                : "Los recursos que habías reservado quedan nuevamente <strong>disponibles</strong> para otras reservas.";
        String asunto = "Bloqueo cancelado · " + laboratorio + " (" + (total ? "TOTAL" : "PARCIAL") + ")";
        String html = """
            <div style="font-family: Calibri, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #231F20;">
                <div style="background: #231F20; padding: 22px; text-align: center;">
                    <span style="color: #00BFFF; font-size: 26px; font-weight: bold;">UTEC Labs</span>
                </div>
                <div style="padding: 30px; border: 1px solid #eee; border-top: none;">
                    <h2 style="color: #dc2626; margin-top: 0;">Bloqueo cancelado</h2>
                    <p>Hola <strong>%s</strong>,</p>
                    <p style="color: #555;">Se canceló la reserva del laboratorio. %s</p>
                    <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin: 22px 0; border-radius: 6px;">
                        <p style="margin: 6px 0;">🏫 <strong>Laboratorio:</strong> %s</p>
                        <p style="margin: 6px 0;">📌 <strong>Motivo:</strong> %s</p>
                        <p style="margin: 6px 0;">📅 <strong>Fecha:</strong> %s</p>
                        <p style="margin: 6px 0;">🕘 <strong>Horario:</strong> %s</p>
                    </div>
                </div>
                %s
            </div>
            """.formatted(HtmlUtils.htmlEscape(nombreResponsable), liberado, HtmlUtils.htmlEscape(laboratorio),
                          HtmlUtils.htmlEscape(motivo), fecha, horarioTexto, pieHtml());

        enviarHtml(destinatario, asunto, html);
    }

    /** Bloque de indicaciones de uso del espacio, común a los correos de bloqueo creado/editado. */
    private String reglasHtml() {
        return """
            <div style="background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin: 0 30px 24px;">
                <p style="margin: 0 0 8px; font-weight: bold; color: #92400e;">📋 Indicaciones para el uso del espacio</p>
                <ul style="margin: 0; padding-left: 18px; color: #555; font-size: 13px; line-height: 1.6;">
                    <li>El horario reservado <strong>incluye 1 hora de armado</strong> al inicio y <strong>1 hora de desmontaje</strong> al final; tu actividad se desarrolla en el tramo intermedio.</li>
                    <li>El responsable deberá estar presente durante toda la actividad.</li>
                    <li>Los requerimientos adicionales se gestionan mediante <strong>ticket</strong> con las áreas correspondientes, con la debida anticipación.</li>
                    <li>Las pizarras móviles deben mantenerse organizadas en <strong>4 pares a la derecha y 3 pares a la izquierda</strong> del proyector (según las flechas de dirección). No está permitido moverlas para mejorar la visualización.</li>
                    <li>Si solicitas elevar los retráctiles, durante el tiempo de desmontaje deberás coordinar su descenso.</li>
                    <li>El laboratorio no se responsabiliza por objetos o materiales olvidados dentro del ambiente.</li>
                    <li>El tiempo de desmontaje busca dejar el espacio en condiciones adecuadas para los estudiantes que lo usen después.</li>
                    <li><strong>No se brindará tiempo adicional</strong> bajo ninguna circunstancia, incluso si lo solicitan empresas externas. Gestiona tus tickets con anticipación.</li>
                </ul>
            </div>
            """;
    }

    /** Pie de página común a todos los correos: firma del equipo + aviso de correo automático + derechos. */
    private String pieHtml() {
        int anio = java.time.Year.now().getValue();
        return """
            <div style="background: #f0f2f5; padding: 18px; text-align: center; border-top: 2px solid #00BFFF;">
                <p style="color: #231F20; font-size: 13px; font-weight: bold; margin: 0 0 2px;">Equipo de UTEC Labs · Concept Lab</p>
                <p style="color: #999; font-size: 12px; margin: 0;">Universidad de Ingeniería y Tecnología — UTEC</p>
                <p style="color: #bbb; font-size: 11px; margin: 8px 0 0;">Este es un mensaje automático, por favor no respondas a este correo.</p>
                <p style="color: #bbb; font-size: 11px; margin: 2px 0 0;">© %d UTEC. Todos los derechos reservados.</p>
            </div>
            """.formatted(anio);
    }

    private void enviarHtml(String destinatario, String asunto, String html) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(fromEmail, fromName);
            helper.setTo(destinatario);
            helper.setSubject(asunto);
            helper.setText(html, true);
            mailSender.send(message);
            log.info("Email enviado a {} — {}", destinatario, asunto);
        } catch (MessagingException | java.io.UnsupportedEncodingException | org.springframework.mail.MailException e) {
            // El correo es best-effort: un fallo de SMTP (conexión/auth caída) NO debe
            // romper la operación de negocio (reserva, check-in, bloqueo). Solo se registra.
            log.error("Error enviando email a {}: {}", destinatario, e.getMessage());
        }
    }
}
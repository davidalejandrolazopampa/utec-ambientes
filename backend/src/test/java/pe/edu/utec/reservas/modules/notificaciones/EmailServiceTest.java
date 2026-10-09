package pe.edu.utec.reservas.modules.notificaciones;

import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;

import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EmailServiceTest {

    @Mock private JavaMailSender mailSender;
    @InjectMocks private EmailService emailService;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(emailService, "fromEmail", "conceptlab@utec.edu.pe");
        ReflectionTestUtils.setField(emailService, "fromName", "UTEC Labs");
        when(mailSender.createMimeMessage()).thenReturn(new MimeMessage((jakarta.mail.Session) null));
    }

    @Test
    void reservaConfirmada_envia() {
        emailService.enviarReservaConfirmada("a@utec.edu.pe", "Leo <b>", "Lab 1",
                "MESA 1", "2026-06-12", "10:00", "11:00");
        verify(mailSender).send(any(MimeMessage.class));
    }

    @Test
    void recordatorioReserva_envia() {
        emailService.enviarRecordatorioReserva("a@utec.edu.pe", "Ana <b>", "Concept Lab",
                "MESA 1", "2026-06-12", "10:00", "11:00");
        verify(mailSender).send(any(MimeMessage.class));
    }

    @Test
    void reservaConfirmada_horaInvalida_noRevienta() {
        // horaInicio no parseable → el cálculo del check-in cae al catch silencioso
        emailService.enviarReservaConfirmada("a@utec.edu.pe", "Leo", "Lab 1",
                "MESA 1", "2026-06-12", "xx", "11:00");
        verify(mailSender).send(any(MimeMessage.class));
    }

    @Test
    void bloqueoTotal_conDescripcion() {
        emailService.enviarBloqueoCreado("r@utec.edu.pe", "Resp <script>", "Lab 1",
                "TOTAL", "MANTENIMIENTO", "2026-06-12", "10:00", "12:00", "Cambio de equipos",
                java.util.List.of(), false);
        verify(mailSender).send(any(MimeMessage.class));
    }

    @Test
    void bloqueoParcial_conRecursos_edicion() {
        emailService.enviarBloqueoCreado("r@utec.edu.pe", "Resp", "Lab 1",
                "PARCIAL", "CLASE", "2026-06-12", "08:00", "10:00", null,
                java.util.List.of("MESA 1", "MESA 2"), true);
        verify(mailSender).send(any(MimeMessage.class));
    }

    @Test
    void bloqueoCancelado_envia() {
        emailService.enviarBloqueoCancelado("r@utec.edu.pe", "Resp", "Lab 1",
                "TOTAL", "EVENTO", "2026-06-12", "10:00", "12:00");
        verify(mailSender).send(any(MimeMessage.class));
    }

    @Test
    void reservaCancelada_envia() {
        emailService.enviarReservaCancelada("a@utec.edu.pe", "Leo", "Lab 1",
                "MESA 1", "2026-06-12", "10:00", "11:00");
        verify(mailSender).send(any(MimeMessage.class));
    }
}

package pe.edu.utec.reservas.modules.realtime;

import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import static org.junit.jupiter.api.Assertions.*;

class RealtimeServiceTest {

    private final RealtimeService svc = new RealtimeService();

    @Test
    void ticketInexistenteONull_lanza403() {
        assertThrows(AccessDeniedException.class, () -> svc.suscribir("no-existe"));
        assertThrows(AccessDeniedException.class, () -> svc.suscribir(null));
    }

    @Test
    void ticketValido_registraEmisor_yEsDeUnSoloUso() {
        String ticket = svc.crearTicket();
        SseEmitter emitter = svc.suscribir(ticket);
        assertNotNull(emitter);
        assertEquals(1, svc.conexionesActivas());
        // El mismo ticket ya consumido no vale otra vez.
        assertThrows(AccessDeniedException.class, () -> svc.suscribir(ticket));
    }

    @Test
    void onLabActivity_sinConexiones_noFalla() {
        assertDoesNotThrow(() -> svc.onLabActivity(new LabActivityEvent("CHECKIN", 1L)));
    }

    @Test
    void onLabActivity_conConexion_noRompe() {
        svc.suscribir(svc.crearTicket());
        assertDoesNotThrow(() -> svc.onLabActivity(new LabActivityEvent("RESERVA", 42L)));
    }
}

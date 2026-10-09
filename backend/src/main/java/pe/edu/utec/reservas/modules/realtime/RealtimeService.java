package pe.edu.utec.reservas.modules.realtime;

import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Empuje en tiempo real por Server-Sent Events (SSE). Cuando ocurre un check-in, reserva o
 * bloqueo, {@link #onLabActivity} reenvía el {@link LabActivityEvent} a todos los navegadores
 * conectados, que refrescan sus datos al instante (sin esperar al polling).
 *
 * <p><b>Auth:</b> {@code EventSource} del navegador NO puede mandar {@code Authorization: Bearer},
 * así que el cliente pide primero un <b>ticket</b> de corta vida (endpoint autenticado) y abre el
 * stream con {@code ?ticket=...}. El ticket es de un solo uso y caduca en 60s.
 *
 * <p><b>Alcance:</b> emisores en memoria → válido para UNA instancia (el caso actual). Para escalar
 * horizontalmente habría que hacer fan-out por Redis/Rabbit (pendiente si se escala). El payload
 * NO lleva PII (solo tipo + labId); el dato real lo re-obtiene el cliente por sus endpoints ya
 * autorizados, así que el stream no filtra información sensible.
 */
@Slf4j
@Service
public class RealtimeService {

    private static final long TICKET_TTL_MS = 60_000;
    private static final long EMITTER_TIMEOUT_MS = 30 * 60_000L;

    private final Map<String, SseEmitter> emitters = new ConcurrentHashMap<>();
    private final Map<String, Long> tickets = new ConcurrentHashMap<>(); // ticket -> instante de expiración

    /** Un usuario autenticado pide un ticket para poder abrir el stream. */
    public String crearTicket() {
        long now = System.currentTimeMillis();
        tickets.entrySet().removeIf(e -> e.getValue() < now); // limpieza barata de vencidos
        String ticket = UUID.randomUUID().toString();
        tickets.put(ticket, now + TICKET_TTL_MS);
        return ticket;
    }

    /** Valida y CONSUME el ticket, y registra un nuevo emisor SSE. */
    public SseEmitter suscribir(String ticket) {
        Long exp = ticket == null ? null : tickets.remove(ticket);
        if (exp == null || exp < System.currentTimeMillis()) {
            throw new AccessDeniedException("Ticket de stream inválido o vencido");
        }
        SseEmitter emitter = new SseEmitter(EMITTER_TIMEOUT_MS);
        String id = UUID.randomUUID().toString();
        emitters.put(id, emitter);
        emitter.onCompletion(() -> emitters.remove(id));
        emitter.onTimeout(() -> { emitters.remove(id); emitter.complete(); });
        emitter.onError(e -> emitters.remove(id));
        try {
            emitter.send(SseEmitter.event().name("ready").data("ok")); // handshake inicial
        } catch (IOException e) {
            emitters.remove(id);
        }
        return emitter;
    }

    /** Reenvía cada cambio de dominio (tras el COMMIT) a todos los emisores. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onLabActivity(LabActivityEvent ev) {
        if (emitters.isEmpty()) return;
        String data = "{\"tipo\":\"" + ev.tipo() + "\",\"labId\":" + ev.labId() + "}";
        emitters.forEach((id, emitter) -> {
            try {
                emitter.send(SseEmitter.event().name("lab-activity").data(data));
            } catch (Exception e) {
                emitters.remove(id); // conexión muerta → descartar
            }
        });
    }

    /** Solo para tests/observabilidad. */
    public int conexionesActivas() { return emitters.size(); }
}

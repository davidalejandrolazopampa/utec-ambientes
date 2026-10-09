package pe.edu.utec.reservas.modules.realtime;

/**
 * Evento de dominio que se emite cuando cambia la actividad de un laboratorio (check-in,
 * reserva o bloqueo). Se publica con {@code ApplicationEventPublisher} DENTRO de la transacción
 * y {@link RealtimeService} lo reenvía por SSE **tras el COMMIT** (para que los clientes al
 * refrescar vean el dato ya persistido). El payload NO lleva PII: solo tipo + labId.
 *
 * @param tipo  "CHECKIN" | "RESERVA" | "BLOQUEO"
 * @param labId laboratorio afectado (para que el cliente refresque solo lo relevante)
 */
public record LabActivityEvent(String tipo, Long labId) {}

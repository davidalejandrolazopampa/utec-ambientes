package pe.edu.utec.reservas.modules.realtime;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import pe.edu.utec.reservas.shared.dto.ApiResponse;

import java.util.Map;

/**
 * Canal de tiempo real (SSE). El cliente:
 *   1) POST /events/ticket   (autenticado con Bearer) → recibe un ticket de corta vida.
 *   2) EventSource('/events/stream?ticket=...')        → recibe eventos "lab-activity".
 */
@RestController
@RequestMapping("/api/v1/events")
@RequiredArgsConstructor
@Tag(name = "Tiempo real", description = "Empuje de cambios (check-in/reservas/bloqueos) por SSE")
public class RealtimeController {

    private final RealtimeService realtimeService;

    @PostMapping("/ticket")
    @Operation(summary = "Ticket de conexión SSE (corta vida, un solo uso)")
    public ResponseEntity<ApiResponse<Map<String, String>>> ticket() {
        return ResponseEntity.ok(ApiResponse.ok(Map.of("ticket", realtimeService.crearTicket())));
    }

    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "Stream SSE de actividad de labs (validado por ticket)")
    public SseEmitter stream(@RequestParam String ticket) {
        return realtimeService.suscribir(ticket);
    }
}

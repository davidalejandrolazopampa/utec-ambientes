package pe.edu.utec.reservas.modules.audit.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import pe.edu.utec.reservas.modules.audit.dto.AuditoriaResponse;
import pe.edu.utec.reservas.modules.audit.service.AuditoriaService;
import pe.edu.utec.reservas.shared.dto.ApiResponse;

import java.util.List;

@RestController
@RequestMapping("/api/v1/auditoria")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('ADMIN')")
@Tag(name = "Auditoría", description = "Registro inmutable de acciones sobre reservas")
public class AuditoriaController {

    private final AuditoriaService auditoriaService;

    @GetMapping
    @Operation(summary = "Listar auditoría", description = "Lista paginada de todas las acciones de auditoría.")
    public ResponseEntity<ApiResponse<Page<AuditoriaResponse>>> listar(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(ApiResponse.ok(auditoriaService.listar(page, size)));
    }

    @GetMapping("/reserva/{reservaId}")
    @Operation(summary = "Historial de reserva", description = "Todas las acciones realizadas sobre una reserva.")
    public ResponseEntity<ApiResponse<List<AuditoriaResponse>>> historialReserva(
            @PathVariable Long reservaId) {
        return ResponseEntity.ok(ApiResponse.ok(auditoriaService.historialReserva(reservaId)));
    }

    @GetMapping("/usuario/{usuarioId}")
    @Operation(summary = "Historial de usuario", description = "Todas las acciones realizadas por un usuario.")
    public ResponseEntity<ApiResponse<List<AuditoriaResponse>>> historialUsuario(
            @PathVariable Long usuarioId) {
        return ResponseEntity.ok(ApiResponse.ok(auditoriaService.historialUsuario(usuarioId)));
    }
}
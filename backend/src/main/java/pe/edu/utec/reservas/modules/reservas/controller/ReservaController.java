package pe.edu.utec.reservas.modules.reservas.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import pe.edu.utec.reservas.modules.laboratorios.service.CalendarioAccessGuard;
import pe.edu.utec.reservas.modules.reservas.dto.CreateReservaRequest;
import pe.edu.utec.reservas.modules.reservas.dto.ReservaPageResponse;
import pe.edu.utec.reservas.modules.reservas.dto.ReservaResponse;
import pe.edu.utec.reservas.modules.reservas.service.ReservaService;
import pe.edu.utec.reservas.shared.dto.ApiResponse;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/v1/reservas")
@RequiredArgsConstructor
@Tag(name = "Reservas", description = "Gestión de reservas de recursos de laboratorio")
public class ReservaController {

    private final ReservaService reservaService;
    private final CalendarioAccessGuard calendarioAccessGuard;

    @PostMapping
    @Operation(summary = "Crear reserva", description = "Crea una nueva reserva con control de concurrencia. Previene doble booking.")
    public ResponseEntity<ApiResponse<ReservaResponse>> crear(
            @Valid @RequestBody CreateReservaRequest request,
            @AuthenticationPrincipal UserDetails userDetails) {

        ReservaResponse reserva = reservaService.crear(request, userDetails.getUsername());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(reserva, "Reserva creada exitosamente"));
    }

    @GetMapping("/mis-reservas")
    @Operation(summary = "Mis reservas", description = "Lista las reservas del usuario autenticado para hoy.")
    public ResponseEntity<ApiResponse<List<ReservaResponse>>> misReservas(
            @AuthenticationPrincipal UserDetails userDetails) {

        List<ReservaResponse> reservas = reservaService.listarMisReservas(userDetails.getUsername());
        return ResponseEntity.ok(ApiResponse.ok(reservas));
    }

    @GetMapping("/mis-reservas/buscar")
    @Operation(summary = "Mis reservas (paginado)",
            description = "Gestión de Reservas paginada y filtrada en el servidor (evita bajar todas las reservas de golpe). Respeta el alcance por rol.")
    public ResponseEntity<ApiResponse<ReservaPageResponse>> buscarMisReservas(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Long labId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal UserDetails userDetails) {

        ReservaPageResponse pagina = reservaService.buscarMisReservas(userDetails.getUsername(), q, labId, page, size);
        return ResponseEntity.ok(ApiResponse.ok(pagina));
    }

    @GetMapping("/recurso/{recursoId}")
    @Operation(summary = "Reservas por recurso", description = "Lista las reservas de un recurso en una fecha.")
    public ResponseEntity<ApiResponse<List<ReservaResponse>>> porRecurso(
            @PathVariable Long recursoId,
            @RequestParam(required = false) LocalDate fecha) {

        if (fecha == null) fecha = LocalDate.now();
        List<ReservaResponse> reservas = reservaService.listarPorRecursoYFecha(recursoId, fecha);
        return ResponseEntity.ok(ApiResponse.ok(reservas));
    }

    @GetMapping("/laboratorio/{labId}")
    @Operation(summary = "Reservas por laboratorio", description = "Lista todas las reservas de un laboratorio (para el calendario).")
    public ResponseEntity<ApiResponse<List<ReservaResponse>>> porLaboratorio(
            @PathVariable Long labId,
            @AuthenticationPrincipal UserDetails userDetails) {
        // DIRECTOR/RESPONSABLE_LAB solo su(s) lab(s); ADMIN/COORDINADOR/ESTUDIANTE cualquiera.
        calendarioAccessGuard.asegurarAccesoCalendario(labId, userDetails.getUsername());
        return ResponseEntity.ok(ApiResponse.ok(reservaService.listarPorLaboratorio(labId)));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Cancelar reserva", description = "Cancela una reserva pendiente o confirmada.")
    public ResponseEntity<ApiResponse<ReservaResponse>> cancelar(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails userDetails) {

        ReservaResponse reserva = reservaService.cancelar(id, userDetails.getUsername());
        return ResponseEntity.ok(ApiResponse.ok(reserva));
    }

    @PostMapping("/{id}/reactivar")
    @Operation(summary = "Reactivar reserva", description = "Revierte una cancelación (todos menos estudiante, solo el mismo día).")
    public ResponseEntity<ApiResponse<ReservaResponse>> reactivar(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails userDetails) {
        ReservaResponse reserva = reservaService.reactivar(id, userDetails.getUsername());
        return ResponseEntity.ok(ApiResponse.ok(reserva));
    }

    @PostMapping("/{id}/confirmar")
    @Operation(summary = "Confirmar reserva", description = "Pasa una reserva PENDIENTE a CONFIRMADA (gestión; no hace check-in).")
    public ResponseEntity<ApiResponse<ReservaResponse>> confirmar(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails userDetails) {
        ReservaResponse reserva = reservaService.confirmar(id, userDetails.getUsername());
        return ResponseEntity.ok(ApiResponse.ok(reserva));
    }

    @PostMapping("/{id}/completar")
    @Operation(summary = "Marcar reserva COMPLETADA", description = "Cierra una reserva activa como COMPLETADA (gestión). Útil para reservas colgadas sin check-in.")
    public ResponseEntity<ApiResponse<ReservaResponse>> completar(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(ApiResponse.ok(reservaService.marcarEstado(id, "COMPLETADA", userDetails.getUsername())));
    }

    @PostMapping("/{id}/no-show")
    @Operation(summary = "Marcar reserva NO_SHOW", description = "Marca una reserva activa como NO_SHOW (gestión): el alumno no se presentó.")
    public ResponseEntity<ApiResponse<ReservaResponse>> noShow(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(ApiResponse.ok(reservaService.marcarEstado(id, "NO_SHOW", userDetails.getUsername())));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Editar reserva", description = "Admin/Responsable puede cambiar horario, recurso o fecha.")
    public ResponseEntity<ApiResponse<ReservaResponse>> editar(
            @PathVariable Long id,
            @Valid @RequestBody CreateReservaRequest request,
            @AuthenticationPrincipal UserDetails userDetails) {
        ReservaResponse reserva = reservaService.editar(id, request, userDetails.getUsername());
        return ResponseEntity.ok(ApiResponse.ok(reserva));
    }

}
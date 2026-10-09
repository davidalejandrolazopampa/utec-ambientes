package pe.edu.utec.reservas.modules.sanciones.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import pe.edu.utec.reservas.modules.sanciones.dto.CreateSancionRequest;
import pe.edu.utec.reservas.modules.sanciones.dto.SancionResponse;
import pe.edu.utec.reservas.modules.sanciones.service.SancionService;
import pe.edu.utec.reservas.shared.dto.ApiResponse;

import java.util.List;

@RestController
@RequestMapping("/api/v1/sanciones")
@RequiredArgsConstructor
@Tag(name = "Sanciones", description = "Castigos que impiden a un alumno reservar (todos o ciertos labs)")
public class SancionController {

    private final SancionService sancionService;

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR')")
    @Operation(summary = "Sancionar a un alumno",
            description = "Crea una o varias sanciones (una por lab; sin labs = todos). Impide reservar, no el login.")
    public ResponseEntity<ApiResponse<List<SancionResponse>>> crear(
            @RequestBody CreateSancionRequest request,
            @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(ApiResponse.ok(sancionService.crear(request, userDetails.getUsername())));
    }

    @GetMapping("/usuario/{usuarioId}")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR')")
    @Operation(summary = "Sanciones de un alumno", description = "Historial de sanciones (vigentes primero).")
    public ResponseEntity<ApiResponse<List<SancionResponse>>> porUsuario(@PathVariable Long usuarioId) {
        return ResponseEntity.ok(ApiResponse.ok(sancionService.listarPorUsuario(usuarioId)));
    }

    @GetMapping("/activas")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR')")
    @Operation(summary = "Sanciones activas (global)", description = "Todas las sanciones sin levantar, para gestión.")
    public ResponseEntity<ApiResponse<List<SancionResponse>>> activas() {
        return ResponseEntity.ok(ApiResponse.ok(sancionService.listarActivas()));
    }

    @GetMapping("/mias")
    @Operation(summary = "Mis sanciones vigentes", description = "Las del alumno logueado que están en efecto hoy (para el aviso en su UI).")
    public ResponseEntity<ApiResponse<List<SancionResponse>>> mias(@AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(ApiResponse.ok(sancionService.misVigentes(userDetails.getUsername())));
    }

    @PatchMapping("/{id}/levantar")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR')")
    @Operation(summary = "Levantar sanción", description = "Desactiva la sanción (conserva el historial).")
    public ResponseEntity<ApiResponse<SancionResponse>> levantar(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(sancionService.levantar(id)));
    }
}

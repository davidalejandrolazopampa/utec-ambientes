package pe.edu.utec.reservas.modules.aulas.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import pe.edu.utec.reservas.modules.aulas.dto.CicloResponse;
import pe.edu.utec.reservas.modules.aulas.dto.CreateExcepcionRequest;
import pe.edu.utec.reservas.modules.aulas.dto.UpdateCicloRequest;
import pe.edu.utec.reservas.modules.aulas.service.CicloService;
import pe.edu.utec.reservas.shared.dto.ApiResponse;

import java.util.List;

@RestController
@RequestMapping("/api/v1/ciclos")
@RequiredArgsConstructor
@Tag(name = "Ciclos", description = "Calendario académico (fechas de cada ciclo)")
public class CicloController {

    private final CicloService cicloService;

    @GetMapping
    @Operation(summary = "Listar ciclos", description = "Ciclos académicos con sus fechas (para el calendario del horario).")
    public ResponseEntity<ApiResponse<List<CicloResponse>>> listar() {
        return ResponseEntity.ok(ApiResponse.ok(cicloService.listar()));
    }

    @PostMapping("/anio/{anio}")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR','DOCENCIA')")
    @Operation(summary = "Agregar un año", description = "Crea los ciclos 0, 1 y 2 del año con fechas por defecto (editables).")
    public ResponseEntity<ApiResponse<List<CicloResponse>>> crearAnio(@PathVariable int anio) {
        return ResponseEntity.ok(ApiResponse.ok(cicloService.crearAnio(anio)));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR','DOCENCIA')")
    @Operation(summary = "Editar fechas de un ciclo")
    public ResponseEntity<ApiResponse<CicloResponse>> actualizar(
            @PathVariable Long id, @Valid @RequestBody UpdateCicloRequest req) {
        return ResponseEntity.ok(ApiResponse.ok(cicloService.actualizar(id, req)));
    }

    @PostMapping("/{codigo}/excepciones")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR','DOCENCIA')")
    @Operation(summary = "Agregar excepción (examen/feriado) a un ciclo")
    public ResponseEntity<ApiResponse<CicloResponse>> agregarExcepcion(
            @PathVariable String codigo, @Valid @RequestBody CreateExcepcionRequest req) {
        return ResponseEntity.ok(ApiResponse.ok(cicloService.agregarExcepcion(
                codigo, req.getFechaInicio(), req.getFechaFin(), req.getTipo(), req.getDescripcion())));
    }

    @DeleteMapping("/excepciones/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR','DOCENCIA')")
    @Operation(summary = "Eliminar una excepción")
    public ResponseEntity<ApiResponse<Void>> eliminarExcepcion(@PathVariable Long id) {
        cicloService.eliminarExcepcion(id);
        return ResponseEntity.ok(ApiResponse.ok(null));
    }
}

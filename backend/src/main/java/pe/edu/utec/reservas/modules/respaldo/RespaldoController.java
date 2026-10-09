package pe.edu.utec.reservas.modules.respaldo;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import pe.edu.utec.reservas.shared.dto.ApiResponse;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/respaldo")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('ADMIN')")
@Tag(name = "Respaldo", description = "Descarga y restauración de datos (alumnos + reservas + bloqueos)")
public class RespaldoController {

    private final RespaldoService respaldoService;

    @GetMapping
    @Operation(summary = "Descargar respaldo", description = "Exporta alumnos, reservas y bloqueos (con sus IDs) como JSON.")
    public ResponseEntity<ApiResponse<RespaldoDto>> descargar() {
        return ResponseEntity.ok(ApiResponse.ok(respaldoService.exportar()));
    }

    @PostMapping
    @Operation(summary = "Restaurar respaldo", description = "Reinserta el respaldo; deduplica por ID (no duplica lo que ya existe).")
    public ResponseEntity<ApiResponse<Map<String, Object>>> restaurar(@RequestBody RespaldoDto data) {
        return ResponseEntity.ok(ApiResponse.ok(respaldoService.importar(data)));
    }
}

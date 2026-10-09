package pe.edu.utec.reservas.modules.bloqueos.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.multipart.MultipartFile;
import pe.edu.utec.reservas.modules.bloqueos.dto.BloqueoResponse;
import pe.edu.utec.reservas.modules.bloqueos.dto.CreateBloqueoRequest;
import pe.edu.utec.reservas.modules.bloqueos.dto.ImportBloqueosResponse;
import pe.edu.utec.reservas.modules.bloqueos.service.BloqueoImportService;
import pe.edu.utec.reservas.modules.bloqueos.service.BloqueoService;
import pe.edu.utec.reservas.modules.laboratorios.service.CalendarioAccessGuard;
import pe.edu.utec.reservas.shared.dto.ApiResponse;

import java.util.List;

@RestController
@RequestMapping("/api/v1/bloqueos")
@RequiredArgsConstructor
@Tag(name = "Bloqueos", description = "Bloqueos parciales y totales de laboratorios")
public class BloqueoController {

    private final BloqueoService bloqueoService;
    private final BloqueoImportService bloqueoImportService;
    private final CalendarioAccessGuard calendarioAccessGuard;

    @PostMapping(value = "/importar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR','DIRECTOR','RESPONSABLE_LAB')")
    @Operation(summary = "Importar bloqueos", description = "Crea bloqueos en lote desde un archivo Excel (.xlsx) o CSV. "
            + "Cada fila se crea por separado; las que tengan conflicto se omiten y se reportan.")
    public ResponseEntity<ApiResponse<ImportBloqueosResponse>> importar(
            @RequestParam("archivo") MultipartFile archivo,
            @RequestParam(value = "laboratorioId", required = false) Long laboratorioId,
            @RequestParam(value = "enviarCorreos", defaultValue = "false") boolean enviarCorreos,
            @AuthenticationPrincipal UserDetails userDetails) {

        ImportBloqueosResponse resultado = bloqueoImportService.importar(
                archivo, laboratorioId, enviarCorreos, userDetails.getUsername());
        return ResponseEntity.ok(ApiResponse.ok(resultado));
    }

    @GetMapping("/importar/plantilla")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR','DIRECTOR','RESPONSABLE_LAB')")
    @Operation(summary = "Descargar plantilla de importación", description = "Devuelve una plantilla (.xlsx o .csv) con las columnas esperadas.")
    public ResponseEntity<ByteArrayResource> plantilla(
            @RequestParam(value = "formato", defaultValue = "xlsx") String formato) {

        boolean esCsv = "csv".equalsIgnoreCase(formato);
        byte[] datos = esCsv ? bloqueoImportService.plantillaCsv() : bloqueoImportService.plantillaXlsx();
        String nombre = esCsv ? "plantilla-bloqueos.csv" : "plantilla-bloqueos.xlsx";
        MediaType tipo = esCsv ? MediaType.parseMediaType("text/csv")
                : MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + nombre + "\"")
                .contentType(tipo)
                .body(new ByteArrayResource(datos));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR','DIRECTOR','RESPONSABLE_LAB','DOCENCIA')")
    @Operation(summary = "Crear bloqueo", description = "Crea un bloqueo (parcial/total) en un laboratorio, o un bloqueo total en un aula.")
    public ResponseEntity<ApiResponse<BloqueoResponse>> crear(
            @Valid @RequestBody CreateBloqueoRequest request,
            @AuthenticationPrincipal UserDetails userDetails) {

        BloqueoResponse response = bloqueoService.crear(request, userDetails.getUsername());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(response, "Bloqueo creado exitosamente"));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR','DIRECTOR','RESPONSABLE_LAB','DOCENCIA')")
    @Operation(summary = "Editar bloqueo", description = "Edita un bloqueo existente.")
    public ResponseEntity<ApiResponse<BloqueoResponse>> editar(
            @PathVariable Long id,
            @Valid @RequestBody CreateBloqueoRequest request,
            @AuthenticationPrincipal UserDetails userDetails) {

        BloqueoResponse response = bloqueoService.editar(id, request, userDetails.getUsername());
        return ResponseEntity.ok(ApiResponse.ok(response));
    }

    @GetMapping("/laboratorio/{labId}")
    @Operation(summary = "Bloqueos por laboratorio", description = "Lista los bloqueos activos de un laboratorio.")
    public ResponseEntity<ApiResponse<List<BloqueoResponse>>> porLaboratorio(
            @PathVariable Long labId,
            @AuthenticationPrincipal UserDetails userDetails) {
        // DIRECTOR/RESPONSABLE_LAB solo su(s) lab(s); ADMIN/COORDINADOR/ESTUDIANTE cualquiera.
        calendarioAccessGuard.asegurarAccesoCalendario(labId, userDetails.getUsername());
        return ResponseEntity.ok(ApiResponse.ok(bloqueoService.listarPorLaboratorio(labId)));
    }

    @GetMapping("/aula/{aulaId}")
    @Operation(summary = "Bloqueos por aula", description = "Lista los bloqueos (eventos) activos de un aula.")
    public ResponseEntity<ApiResponse<List<BloqueoResponse>>> porAula(@PathVariable Long aulaId) {
        return ResponseEntity.ok(ApiResponse.ok(bloqueoService.listarPorAula(aulaId)));
    }

    @GetMapping("/activos")
    @Operation(summary = "Bloqueos activos hoy", description = "Lista todos los bloqueos activos para el día de hoy.")
    public ResponseEntity<ApiResponse<List<BloqueoResponse>>> activosHoy() {
        return ResponseEntity.ok(ApiResponse.ok(bloqueoService.listarActivosHoy()));
    }

    @GetMapping("/feriados")
    @Operation(summary = "Feriados del año", description = "Fechas de feriado operativo (todos los labs) del año, para marcarlas en el calendario aunque caigan fuera del rango de un ciclo (receso).")
    public ResponseEntity<ApiResponse<List<pe.edu.utec.reservas.modules.bloqueos.dto.FeriadoResponse>>> feriados(
            @RequestParam int anio) {
        return ResponseEntity.ok(ApiResponse.ok(bloqueoService.listarFeriadosDelAnio(anio)));
    }

    @PostMapping("/laboratorio/{labId}/almuerzos")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR','DIRECTOR','RESPONSABLE_LAB')")
    @Operation(summary = "Programar almuerzo recurrente", description = "Crea el almuerzo (una fila por día) en los días de atención del lab dentro del rango. Omite días con evento/clase/reserva y los reporta; con forzar=true cancela las reservas en conflicto.")
    public ResponseEntity<ApiResponse<pe.edu.utec.reservas.modules.bloqueos.dto.GenerarAlmuerzosResponse>> generarAlmuerzos(
            @PathVariable Long labId,
            @Valid @RequestBody pe.edu.utec.reservas.modules.bloqueos.dto.GenerarAlmuerzosRequest req,
            @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(ApiResponse.ok(bloqueoService.generarAlmuerzos(labId, req, userDetails.getUsername())));
    }

    @GetMapping("/todos")
    @Operation(summary = "Todos los bloqueos activos", description = "Lista todos los bloqueos activos sin filtro de fecha. Con incluirClases=true agrega las clases del horario académico.")
    public ResponseEntity<ApiResponse<List<BloqueoResponse>>> todosActivos(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestParam(value = "incluirClases", defaultValue = "false") boolean incluirClases) {
        return ResponseEntity.ok(ApiResponse.ok(
                bloqueoService.listarTodosActivos(userDetails.getUsername(), incluirClases)));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR','DIRECTOR','RESPONSABLE_LAB','DOCENCIA')")
    @Operation(summary = "Eliminar bloqueo", description = "Borra definitivamente un bloqueo (y sus recursos en cascada).")
    public ResponseEntity<ApiResponse<Void>> eliminar(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails userDetails) {

        bloqueoService.eliminar(id, userDetails.getUsername());
        return ResponseEntity.ok(ApiResponse.ok(null));
    }
}

package pe.edu.utec.reservas.modules.aulas.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import pe.edu.utec.reservas.modules.aulas.dto.AulaResponse;
import pe.edu.utec.reservas.modules.aulas.dto.ClaseResponse;
import pe.edu.utec.reservas.modules.aulas.dto.CreateAulaRequest;
import pe.edu.utec.reservas.modules.aulas.dto.CursoResponse;
import pe.edu.utec.reservas.modules.aulas.dto.OcupacionAulaResponse;
import pe.edu.utec.reservas.modules.aulas.dto.ImportHorariosResponse;
import pe.edu.utec.reservas.modules.aulas.service.AulaService;
import pe.edu.utec.reservas.modules.aulas.service.HorarioImportService;
import pe.edu.utec.reservas.shared.dto.ApiResponse;

import java.time.LocalTime;
import java.util.List;

@RestController
@RequestMapping("/api/v1/aulas")
@RequiredArgsConstructor
@Tag(name = "Aulas", description = "Aulas, cursos y horarios de clase")
public class AulaController {

    private final HorarioImportService horarioImportService;
    private final AulaService aulaService;

    @GetMapping
    @Operation(summary = "Listar aulas", description = "Aulas activas (o todas con ?todas=true para gestión), filtrables por tipo.")
    public ResponseEntity<ApiResponse<List<AulaResponse>>> listar(
            @RequestParam(value = "tipo", required = false) String tipo,
            @RequestParam(value = "todas", defaultValue = "false") boolean todas) {
        return ResponseEntity.ok(ApiResponse.ok(todas ? aulaService.listarTodas() : aulaService.listar(tipo)));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR','DOCENCIA')")
    @Operation(summary = "Crear aula")
    public ResponseEntity<ApiResponse<AulaResponse>> crear(@Valid @RequestBody CreateAulaRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(aulaService.crear(req), "Aula creada"));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR','DOCENCIA')")
    @Operation(summary = "Editar aula")
    public ResponseEntity<ApiResponse<AulaResponse>> editar(@PathVariable Long id, @Valid @RequestBody CreateAulaRequest req) {
        return ResponseEntity.ok(ApiResponse.ok(aulaService.actualizar(id, req)));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR','DOCENCIA')")
    @Operation(summary = "Desactivar aula", description = "Soft-delete: no borra las clases del aula.")
    public ResponseEntity<ApiResponse<Void>> desactivar(@PathVariable Long id) {
        aulaService.desactivar(id);
        return ResponseEntity.ok(ApiResponse.ok(null));
    }

    @GetMapping("/areas")
    @Operation(summary = "Áreas/carreras con clases", description = "Prefijos de curso con clases en el ciclo (filtro).")
    public ResponseEntity<ApiResponse<List<String>>> areas(
            @RequestParam(value = "ciclo", defaultValue = "2026-1") String ciclo) {
        return ResponseEntity.ok(ApiResponse.ok(aulaService.areasConClases(ciclo)));
    }

    @GetMapping("/laboratorios-con-ocupacion")
    @Operation(summary = "Labs con ocupación", description = "Laboratorios con clases o eventos en el ciclo (tipo 'Laboratorio' del selector).")
    public ResponseEntity<ApiResponse<List<AulaResponse>>> laboratoriosConOcupacion(
            @RequestParam(value = "ciclo", defaultValue = "2026-1") String ciclo) {
        return ResponseEntity.ok(ApiResponse.ok(aulaService.laboratoriosConOcupacion(ciclo)));
    }

    @GetMapping("/clases")
    @Operation(summary = "Clases del calendario", description = "Clases del ciclo filtradas por aula, laboratorio, área o texto de curso.")
    public ResponseEntity<ApiResponse<List<ClaseResponse>>> clases(
            @RequestParam(value = "ciclo", defaultValue = "2026-1") String ciclo,
            @RequestParam(value = "aulaId", required = false) Long aulaId,
            @RequestParam(value = "labId", required = false) Long labId,
            @RequestParam(value = "area", required = false) String area,
            @RequestParam(value = "q", required = false) String q) {
        return ResponseEntity.ok(ApiResponse.ok(aulaService.buscarClases(ciclo, aulaId, labId, area, q)));
    }

    @GetMapping("/cursos")
    @Operation(summary = "Cursos con clases", description = "Cursos del ciclo, filtrables por carrera/área y texto.")
    public ResponseEntity<ApiResponse<List<CursoResponse>>> cursos(
            @RequestParam(value = "ciclo", defaultValue = "2026-1") String ciclo,
            @RequestParam(value = "area", required = false) String area,
            @RequestParam(value = "q", required = false) String q) {
        return ResponseEntity.ok(ApiResponse.ok(aulaService.buscarCursos(ciclo, area, q)));
    }

    @GetMapping("/cursos/{cursoId}/clases")
    @Operation(summary = "Horario de un curso", description = "Las clases (sesiones) de un curso concreto.")
    public ResponseEntity<ApiResponse<List<ClaseResponse>>> clasesDeCurso(
            @PathVariable Long cursoId,
            @RequestParam(value = "ciclo", defaultValue = "2026-1") String ciclo) {
        return ResponseEntity.ok(ApiResponse.ok(aulaService.clasesDeCurso(ciclo, cursoId)));
    }

    @GetMapping("/libres")
    @Operation(summary = "Buscar aulas libres", description = "Aulas sin clase en ese día/franja, filtrables por tipo y capacidad mínima. Con fecha: los eventos de aula ocupan y en días de excepción (feriado/exámenes) las clases no cuentan.")
    public ResponseEntity<ApiResponse<List<AulaResponse>>> libres(
            @RequestParam(value = "ciclo", defaultValue = "2026-1") String ciclo,
            @RequestParam("dia") String dia,
            @RequestParam("horaInicio") String horaInicio,
            @RequestParam("horaFin") String horaFin,
            @RequestParam(value = "tipo", required = false) String tipo,
            @RequestParam(value = "capacidadMin", required = false) Integer capacidadMin,
            @RequestParam(value = "fecha", required = false) String fecha) {
        return ResponseEntity.ok(ApiResponse.ok(aulaService.buscarLibres(
                ciclo, dia, LocalTime.parse(horaInicio), LocalTime.parse(horaFin), tipo, capacidadMin,
                fecha != null ? java.time.LocalDate.parse(fecha) : null)));
    }

    @GetMapping("/ocupacion")
    @Operation(summary = "Grilla de ocupación", description = "Ocupación (clases + eventos si se pasa fecha) de cada aula en un día → grilla aulas×horas.")
    public ResponseEntity<ApiResponse<List<OcupacionAulaResponse>>> ocupacion(
            @RequestParam(value = "ciclo", defaultValue = "2026-1") String ciclo,
            @RequestParam("dia") String dia,
            @RequestParam(value = "tipo", required = false) String tipo,
            @RequestParam(value = "fecha", required = false) String fecha) {
        return ResponseEntity.ok(ApiResponse.ok(aulaService.ocupacionDia(ciclo, dia, tipo,
                fecha != null ? java.time.LocalDate.parse(fecha) : null)));
    }

    @PostMapping(value = "/horarios/importar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR','DOCENCIA')")
    @Operation(summary = "Importar horario académico",
            description = "Carga un Excel/CSV de horarios (idempotente: lo repetido no se duplica). Con sincronizar=true además elimina las clases del ciclo que ya no están en el archivo.")
    public ResponseEntity<ApiResponse<ImportHorariosResponse>> importarHorarios(
            @RequestParam("archivo") MultipartFile archivo,
            @RequestParam(name = "sincronizar", defaultValue = "false") boolean sincronizar,
            @AuthenticationPrincipal UserDetails userDetails) {
        ImportHorariosResponse r = horarioImportService.importar(archivo, userDetails.getUsername(), sincronizar);
        return ResponseEntity.ok(ApiResponse.ok(r));
    }
}

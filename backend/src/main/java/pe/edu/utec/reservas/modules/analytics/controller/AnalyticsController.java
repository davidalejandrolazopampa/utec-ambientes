package pe.edu.utec.reservas.modules.analytics.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import pe.edu.utec.reservas.modules.analytics.dto.*;
import pe.edu.utec.reservas.modules.analytics.service.AnalyticsService;
import pe.edu.utec.reservas.shared.dto.ApiResponse;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/v1/analytics")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('ADMIN','COORDINADOR','DIRECTOR','RESPONSABLE_LAB')")
@Tag(name = "Analytics", description = "Dashboards y KPIs de uso de laboratorios")
public class AnalyticsController {

    private final AnalyticsService analyticsService;

    @GetMapping("/dashboard")
    @Operation(summary = "Dashboard en vivo (KPIs del día)")
    public ResponseEntity<ApiResponse<KpiResponse>> dashboardHoy() {
        return ResponseEntity.ok(ApiResponse.ok(analyticsService.getDashboardHoy()));
    }

    @GetMapping("/anios")
    @Operation(summary = "Años con datos (reservas o bloqueos), descendente")
    public ResponseEntity<ApiResponse<List<Integer>>> anios() {
        return ResponseEntity.ok(ApiResponse.ok(analyticsService.getAniosConDatos()));
    }

    @GetMapping("/periodos")
    @Operation(summary = "Periodos 'YYYY-C' (año+ciclo) con data analizable, para el filtro año/ciclo")
    public ResponseEntity<ApiResponse<List<String>>> periodos() {
        return ResponseEntity.ok(ApiResponse.ok(analyticsService.getPeriodosConDatos()));
    }

    @GetMapping("/dashboard/full")
    @Operation(summary = "Dashboard completo con filtros avanzados")
    public ResponseEntity<ApiResponse<DashboardFullResponse>> dashboardFull(
            @RequestParam(required = false) Long labId,
            @RequestParam(required = false) String ciclo,
            @RequestParam(required = false) Integer anio,
            @RequestParam(required = false) String tipoReserva,
            @RequestParam(required = false) String carrera,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fechaInicio,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fechaFin,
            @AuthenticationPrincipal UserDetails userDetails) {

        analyticsService.validarAccesoLab(labId, userDetails.getUsername());
        AnalyticsFilterRequest filter = AnalyticsFilterRequest.builder()
                .labId(labId).ciclo(ciclo).anio(anio).tipoReserva(tipoReserva).carrera(carrera)
                .fechaInicio(fechaInicio).fechaFin(fechaFin).build();

        return ResponseEntity.ok(ApiResponse.ok(analyticsService.getDashboardFull(filter)));
    }

    @GetMapping("/operativos")
    @Operation(summary = "Bloqueos operativos (mantenimiento + almuerzo): por lab, por mes e historial")
    public ResponseEntity<ApiResponse<OperativosResponse>> operativos(
            @RequestParam(required = false) Long labId,
            @RequestParam(required = false) String ciclo,
            @RequestParam(required = false) Integer anio,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fechaInicio,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fechaFin,
            @AuthenticationPrincipal UserDetails userDetails) {

        analyticsService.validarAccesoLab(labId, userDetails.getUsername());
        AnalyticsFilterRequest filter = AnalyticsFilterRequest.builder()
                .labId(labId).ciclo(ciclo).anio(anio)
                .fechaInicio(fechaInicio).fechaFin(fechaFin).build();

        return ResponseEntity.ok(ApiResponse.ok(analyticsService.getOperativos(filter)));
    }

    @GetMapping("/insights")
    @Operation(summary = "Insights: % de ocupación por lab (tasa de utilización) + tamaño de grupo")
    public ResponseEntity<ApiResponse<InsightsResponse>> insights(
            @RequestParam(required = false) Long labId,
            @RequestParam(required = false) String ciclo,
            @RequestParam(required = false) Integer anio,
            @RequestParam(required = false) String carrera,
            @RequestParam(required = false) Boolean soloReservas,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fechaInicio,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fechaFin,
            @AuthenticationPrincipal UserDetails userDetails) {

        analyticsService.validarAccesoLab(labId, userDetails.getUsername());
        AnalyticsFilterRequest filter = AnalyticsFilterRequest.builder()
                .labId(labId).ciclo(ciclo).anio(anio).carrera(carrera).soloReservas(soloReservas)
                .fechaInicio(fechaInicio).fechaFin(fechaFin).build();

        return ResponseEntity.ok(ApiResponse.ok(analyticsService.getInsights(filter)));
    }

    @GetMapping("/resumen-ejecutivo")
    @Operation(summary = "Resumen ejecutivo: Δ vs periodo anterior + insights automáticos + procedencia de datos")
    public ResponseEntity<ApiResponse<ResumenEjecutivoResponse>> resumenEjecutivo(
            @RequestParam(required = false) Long labId,
            @RequestParam(required = false) String ciclo,
            @RequestParam(required = false) Integer anio,
            @RequestParam(required = false) String tipoReserva,
            @RequestParam(required = false) String carrera,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fechaInicio,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fechaFin,
            @AuthenticationPrincipal UserDetails userDetails) {

        analyticsService.validarAccesoLab(labId, userDetails.getUsername());
        AnalyticsFilterRequest filter = AnalyticsFilterRequest.builder()
                .labId(labId).ciclo(ciclo).anio(anio).tipoReserva(tipoReserva).carrera(carrera)
                .fechaInicio(fechaInicio).fechaFin(fechaFin).build();

        return ResponseEntity.ok(ApiResponse.ok(analyticsService.getResumenEjecutivo(filter)));
    }

    @GetMapping("/aulas")
    @PreAuthorize("hasAnyRole('ADMIN','DOCENCIA')")   // ámbito Aulas: DOCENCIA no ve labs; ADMIN ve ambos
    @Operation(summary = "Analítica del ámbito AULAS: KPIs de clases + ocupación/tipo/heatmap/eventos")
    public ResponseEntity<ApiResponse<AulasAnalyticsResponse>> aulas(
            @RequestParam(required = false) String ciclo,
            @RequestParam(required = false) Integer anio) {
        return ResponseEntity.ok(ApiResponse.ok(analyticsService.getAulasAnalytics(ciclo, anio)));
    }

    @GetMapping("/tabla")
    @Operation(summary = "Tabla de reservas exportable con filtros")
    public ResponseEntity<ApiResponse<List<ReservaDetalleExportResponse>>> tablaReservas(
            @RequestParam(required = false) Long labId,
            @RequestParam(required = false) String ciclo,
            @RequestParam(required = false) Integer anio,
            @RequestParam(required = false) String tipoReserva,
            @RequestParam(required = false) String carrera,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fechaInicio,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fechaFin,
            @AuthenticationPrincipal UserDetails userDetails) {

        analyticsService.validarAccesoLab(labId, userDetails.getUsername());
        AnalyticsFilterRequest filter = AnalyticsFilterRequest.builder()
                .labId(labId).ciclo(ciclo).anio(anio).tipoReserva(tipoReserva).carrera(carrera)
                .fechaInicio(fechaInicio).fechaFin(fechaFin).build();

        return ResponseEntity.ok(ApiResponse.ok(analyticsService.getTablaReservas(filter)));
    }
}
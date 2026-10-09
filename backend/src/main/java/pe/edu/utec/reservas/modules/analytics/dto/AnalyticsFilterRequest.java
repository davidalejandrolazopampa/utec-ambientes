package pe.edu.utec.reservas.modules.analytics.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AnalyticsFilterRequest {
    private Long labId;
    private String ciclo;        // "2026-0", "2026-1", "2026-2"
    private Integer anio;        // 2025, 2026
    private String tipoReserva;  // ALUMNO, EVENTO
    private String carrera;      // filtro por carrera del alumno (de Affluences)
    private LocalDate fechaInicio;
    private LocalDate fechaFin;
    // Vista "Solo reservas": el % de ocupación cuenta SOLO reservas de alumnos (excluye los
    // bloqueos de evento del numerador). En "Todo"/"Solo bloqueos" queda null/false → combinada.
    private Boolean soloReservas;

    /** Límites de "histórico completo" cuando no se filtra por fecha/ciclo/año. */
    private static final LocalDate INICIO_HISTORICO = LocalDate.of(2000, 1, 1);

    /**
     * Resuelve fechas según ciclo o año si no se pasan explícitamente.
     * Ciclo UTEC: 0=verano(ene-feb), 1=regular(mar-jul), 2=regular(ago-dic)
     * Sin filtro alguno → histórico completo (global), no "últimos 30 días".
     */
    public LocalDate getResolvedInicio() {
        if (fechaInicio != null) return fechaInicio;
        if (ciclo != null && ciclo.matches("\\d{4}-[012]")) {
            String[] parts = ciclo.split("-");
            int y = Integer.parseInt(parts[0]);
            int c = Integer.parseInt(parts[1]);
            return switch (c) {
                case 0 -> LocalDate.of(y, 1, 1);
                case 1 -> LocalDate.of(y, 3, 1);
                case 2 -> LocalDate.of(y, 8, 1);
                default -> INICIO_HISTORICO;
            };
        }
        if (anio != null) return LocalDate.of(anio, 1, 1);
        return INICIO_HISTORICO;
    }

    public LocalDate getResolvedFin() {
        if (fechaFin != null) return fechaFin;
        if (ciclo != null && ciclo.matches("\\d{4}-[012]")) {
            String[] parts = ciclo.split("-");
            int y = Integer.parseInt(parts[0]);
            int c = Integer.parseInt(parts[1]);
            return switch (c) {
                case 0 -> LocalDate.of(y, 2, 28);
                case 1 -> LocalDate.of(y, 7, 31);
                case 2 -> LocalDate.of(y, 12, 31);
                default -> LocalDate.now().plusYears(5);
            };
        }
        if (anio != null) return LocalDate.of(anio, 12, 31);
        return LocalDate.now().plusYears(5);
    }
}
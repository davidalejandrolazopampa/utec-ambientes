package pe.edu.utec.reservas.modules.analytics.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Analítica del ámbito AULAS (espacios NO-lab gestionados por Docencia): las clases son
 * bloqueos recurrentes ({@code es_clase = true, aula_id NOT NULL}) y los eventos son los
 * bloqueos normales de aula. Payload agregador: KPIs + las 4 gráficas núcleo en UNA
 * respuesta (una entrada de caché, un solo round-trip).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AulasAnalyticsResponse {

    private long totalClases;        // clases programadas (sesiones/semana del ciclo filtrado)
    private double horasSemanales;   // horas dictadas por semana (frecuencia A/B pondera 0.5)
    private long aulasActivas;       // aulas activas en el catálogo
    private long totalEventos;       // bloqueos de aula NO-clase en el periodo

    private List<OcupacionAula> ocupacionPorAula;   // % de la ventana semanal ocupado por clases
    private List<TipoAmbiente> porTipoAmbiente;     // clases y horas semanales por tipo de aula
    private List<HeatmapCellResponse> heatmap;      // día × hora: n° de clases activas en la franja
    private List<EventoMes> eventosPorMes;          // eventos de aula por mes (YYYY-MM)

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class OcupacionAula {
        private String codigo;
        private String tipo;
        private Integer piso;
        private double horasSemana;   // horas de clase por semana (A/B = 0.5)
        private double porcentaje;    // horasSemana ÷ ventana semanal (07–22 × Lun–Sáb = 90 h)
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TipoAmbiente {
        private String tipo;
        private long clases;
        private double horasSemana;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class EventoMes {
        private String mes;      // YYYY-MM
        private long cantidad;
    }
}

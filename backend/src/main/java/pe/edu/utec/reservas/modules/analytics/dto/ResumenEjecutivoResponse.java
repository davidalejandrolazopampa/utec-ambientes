package pe.edu.utec.reservas.modules.analytics.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Resumen EJECUTIVO del dashboard, pensado para una audiencia de dirección
 * (rector / decanos / directores). Sube del peldaño "descriptivo" al "diagnóstico":
 *
 *  - comparacion: variación (Δ) de los KPIs clave contra el PERIODO ANTERIOR equivalente
 *    (año → año-1, ciclo → mismo ciclo del año anterior, rango libre → ventana previa de
 *    igual longitud). null cuando no hay periodo comparable (histórico completo).
 *  - insights: conclusiones NARRATIVAS auto-generadas de los datos (lo que un analista
 *    "presenta": qué lab está ocioso, qué día concentra demanda, etc.).
 *  - procedencia: sello de FUENTE y CORTE de datos → un tablero ejecutivo debe declarar
 *    de dónde salió y de cuándo es para ser defendible.
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class ResumenEjecutivoResponse {

    private Comparacion comparacion;      // null si no hay periodo anterior comparable
    private List<Insight> insights;
    private Procedencia procedencia;

    @Data @Builder @AllArgsConstructor @NoArgsConstructor
    public static class Comparacion {
        private String periodoActual;     // etiqueta legible del periodo actual
        private String periodoAnterior;   // etiqueta legible del periodo comparado
        private List<Metrica> metricas;
    }

    @Data @Builder @AllArgsConstructor @NoArgsConstructor
    public static class Metrica {
        private String etiqueta;          // "Reservas", "Completadas", "Aprovechamiento", "Ocupación"
        private double actual;
        private double anterior;
        private Double deltaPct;          // variación % (null si el anterior era 0 → no divisible)
        private String direccion;         // "sube" | "baja" | "igual"
        private String unidad;            // "" (conteo) | "%" (tasa)
    }

    @Data @Builder @AllArgsConstructor @NoArgsConstructor
    public static class Insight {
        private String texto;
        private String tipo;              // "positivo" | "negativo" | "neutro"
    }

    @Data @Builder @AllArgsConstructor @NoArgsConstructor
    public static class Procedencia {
        private String fuente;            // origen de los datos
        private String rangoInicio;       // fecha real mínima con datos (yyyy-MM-dd) o null
        private String rangoFin;          // fecha real máxima con datos
        private String corte;             // fecha de generación del reporte (hoy)
        private long totalRegistros;      // reservas en el filtro
        private int labsConDatos;         // n° de labs con al menos una reserva
    }
}

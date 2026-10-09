package pe.edu.utec.reservas.modules.analytics.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Bloqueos OPERATIVOS (ALMUERZO + MANTENIMIENTO + FERIADO) para la sección "Operativo" de la
 * vista Solo bloqueos: cantidad por laboratorio, por mes e historial detallado. Estos motivos
 * se excluyen del resto del dashboard; aquí se muestran aparte.
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class OperativosResponse {
    private List<PorLab> porLaboratorio;
    private List<PorMes> porMes;
    private List<Historial> historial;
    private int totalMantenimiento;
    private int totalAlmuerzo;
    private int totalFeriado;
    private int totalRetiro;             // bloqueos de mesas retiradas (motivo RETIRO)
    // Cierres institucionales (todo UTEC) que caen en el periodo — NO son bloqueos por-lab.
    private List<Cierre> cierres;
    private int totalDiasCierre;         // días distintos de cierre institucional en el periodo

    @Data @Builder @AllArgsConstructor @NoArgsConstructor
    public static class PorLab {
        private String laboratorio;
        private int mantenimiento;
        private int almuerzo;
        private int feriado;
        private int retiro;
        private int total;
    }

    @Data @Builder @AllArgsConstructor @NoArgsConstructor
    public static class PorMes {
        private String mes;          // "YYYY-MM"
        private int mantenimiento;
        private int almuerzo;
        private int feriado;
        private int retiro;
        private int total;
    }

    @Data @Builder @AllArgsConstructor @NoArgsConstructor
    public static class Historial {
        private Long id;
        private String laboratorio;
        private String motivo;       // ALMUERZO | MANTENIMIENTO | FERIADO | RETIRO
        private String tipo;         // TOTAL | PARCIAL
        private String fecha;        // YYYY-MM-DD
        private String horaInicio;   // HH:mm | null
        private String horaFin;      // HH:mm | null
        private String recursos;     // nombres separados por coma (solo PARCIAL) | null
        private String descripcion;
    }

    @Data @Builder @AllArgsConstructor @NoArgsConstructor
    public static class Cierre {
        private String fechaInicio;  // YYYY-MM-DD
        private String fechaFin;
        private String descripcion;
        private int dias;            // días del cierre dentro del periodo
    }
}

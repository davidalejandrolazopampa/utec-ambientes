package pe.edu.utec.reservas.modules.aulas.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalTime;
import java.util.List;

/** Ocupación de un aula en un día (para la grilla aulas×horas de "buscar libres"). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OcupacionAulaResponse {
    private Long id;
    private String codigo;
    private String tipo;
    private Integer capacidad;
    private Integer piso;
    /** true si la fila es un LABORATORIO (los ids de labs y aulas pueden coincidir). */
    private Boolean esLab;
    private List<Franja> ocupado;

    // ── Solo LABS: ventana de ATENCIÓN al alumno (fuera de ella no se reserva; eventos sí). ──
    private LocalTime atencionInicio;   // horaApertura del lab (p. ej. 09:00)
    private LocalTime atencionFin;      // horaCierre del lab (p. ej. 18:00)
    /** Solo LABS: false si el lab NO atiende ese día de la semana (p. ej. sábado en labs L–V). */
    private Boolean atiende;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Franja {
        private LocalTime horaInicio;
        private LocalTime horaFin;
        private String etiqueta;
        /** true = ocupación PARCIAL (bloqueo parcial o reserva de mesa): el ambiente sigue usable. */
        private Boolean parcial;
    }
}

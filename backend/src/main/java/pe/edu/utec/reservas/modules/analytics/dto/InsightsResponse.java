package pe.edu.utec.reservas.modules.analytics.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Insights analíticos extra del dashboard:
 *  - ocupacionPorLab: **% de ocupación (tasa de utilización)** por laboratorio =
 *    (horas reservadas + horas de EVENTOS) ÷ (capacidad − horas OPERATIVAS). Normaliza por
 *    CAPACIDAD → comparable entre labs de distinto tamaño. Los bloqueos de evento (clase/
 *    examen/evento) cuentan como USO del lab; los operativos (mantenimiento/almuerzo/feriado)
 *    se descuentan de la capacidad porque no estaban disponibles para reservar.
 *  - tamanoGrupo: distribución del tamaño de grupo (n° de participantes por reserva) → sirve
 *    para decidir capacidad de mesas.
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class InsightsResponse {
    private List<LabOcupacion> ocupacionPorLab;
    private List<GrupoTamano> tamanoGrupo;
    // Cruce carrera × laboratorio: n° de reservas (por participante) de cada carrera en cada lab.
    // Revela qué carrera domina qué laboratorio (planificación de horarios/convenios). Escala a
    // varios labs; con un solo lab con datos es una columna.
    private List<CruceCarreraLab> cruceCarreraLab;

    @Data @Builder @AllArgsConstructor @NoArgsConstructor
    public static class LabOcupacion {
        private String codigoLab;
        private double horasReservadas;    // reservas de alumnos
        private double horasEventos;       // bloqueos de evento (examen/evento puntual) = uso del lab
        private double horasClases;        // clases del horario académico (bloqueos recurrentes es_clase) = uso del lab
        private double horasOperativas;    // feriado/mantenimiento/almuerzo (cierre = downtime)
        private double horasCierre;        // CIERRE institucional (todo UTEC): horas-mesa que el lab estuvo cerrado por el cierre
        private double capacidadTotal;     // capacidad teórica bruta (horario × mesas × días), antes de descontar downtime
        private double horasDisponibles;   // capacidad NETA usada como denominador del % (excluye downtime)
        private double porcentaje;         // ocupación NETA = uso ÷ capacidad disponible × 100 (0..100)
        private double porcentajeReservas; // parte del % de ocupación aportada por reservas
        private double porcentajeEventos;  // parte del % de ocupación aportada por eventos
        private double porcentajeClases;   // parte del % de ocupación aportada por clases del horario
        private double porcentajeCerrado;  // DISPONIBILIDAD: % del periodo cerrado por operativos (operativas ÷ capacidad bruta)
        private double porcentajeCierre;   // DISPONIBILIDAD: % del periodo cerrado por CIERRE institucional (cierre ÷ capacidad bruta)
    }

    @Data @Builder @AllArgsConstructor @NoArgsConstructor
    public static class GrupoTamano {
        private int participantes;
        private long cantidad;
    }

    @Data @Builder @AllArgsConstructor @NoArgsConstructor
    public static class CruceCarreraLab {
        private String carrera;
        private String codigoLab;
        private long cantidad;
    }
}

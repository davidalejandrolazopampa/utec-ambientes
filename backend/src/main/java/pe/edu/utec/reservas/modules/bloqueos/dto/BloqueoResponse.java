package pe.edu.utec.reservas.modules.bloqueos.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BloqueoResponse {

    private Long id;
    // Compatibilidad: sigue poblado para bloqueos de LAB (null si el bloqueo es de un aula).
    private String laboratorioCodigo;
    private String laboratorioNombre;
    // Espacio genérico del bloqueo (lab O aula) — el frontend muestra esto de forma uniforme.
    private Long aulaId;
    private String espacioCodigo;   // código del lab o del aula
    private String espacioNombre;   // nombre del lab o del aula
    private String espacioTipo;     // "LABORATORIO" o el tipo del aula (AULA, AUDITORIO, …)
    private String tipo;
    private String motivo;
    private String descripcion;
    private String responsableNombre;
    private String responsableCorreo;
    private LocalDate fechaInicio;
    private LocalDate fechaFin;
    private LocalTime horaInicio;
    private LocalTime horaFin;
    private Boolean activo;
    private String creadoPorNombre;
    private LocalDateTime createdAt;
    /** IDs de los recursos afectados (solo en bloqueos PARCIAL; vacío en TOTAL). */
    private List<Long> recursosAfectados;

    /** Campos de CLASE (es_clase=true): permiten mostrar la recurrencia (día/hora/frecuencia/curso)
     *  en vez del rango de fechas del ciclo, y separar las clases en su propia sección. */
    private Boolean esClase;
    private String diaSemana;    // LUNES..DOMINGO
    private String frecuencia;   // SEMANA_GENERAL / SEMANA_A / SEMANA_B
    private String ciclo;
    private String seccion;
    private String cursoCodigo;
    private String cursoNombre;
}
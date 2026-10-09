package pe.edu.utec.reservas.modules.aulas.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalTime;

/** Una clase (sesión recurrente) del horario, para pintar el calendario semanal. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ClaseResponse {
    private Long id;
    private String espacioCodigo;   // A501, M604, L108…
    private String espacioTipo;     // AULA, AULA_MIXTA, LABORATORIO…
    private boolean esLab;
    private String diaSemana;       // LUNES..DOMINGO
    private LocalDate fechaInicio;  // rango del ciclo (para acotar la recurrencia a fechas reales)
    private LocalDate fechaFin;
    private LocalTime horaInicio;
    private LocalTime horaFin;
    private String cursoCodigo;
    private String cursoNombre;
    private String area;
    private String seccion;
    private String tipoSesion;      // TEORICO, LABORATORIO, PRACTICO
    private String modalidad;
    private String frecuencia;      // SEMANA_GENERAL, SEMANA_A, SEMANA_B
    private String docente;
}

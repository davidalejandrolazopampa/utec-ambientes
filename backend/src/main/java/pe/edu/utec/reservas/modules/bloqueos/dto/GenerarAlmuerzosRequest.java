package pe.edu.utec.reservas.modules.bloqueos.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalTime;

/** Programa el ALMUERZO recurrente de un lab en un rango, sobre sus días de atención. */
@Data
public class GenerarAlmuerzosRequest {
    @NotNull private LocalTime horaInicio;
    @NotNull private LocalTime horaFin;
    @NotNull private LocalDate fechaInicio;
    @NotNull private LocalDate fechaFin;
    /** Si true, cancela (y notifica) las reservas de alumno en conflicto en vez de omitir el día. */
    private Boolean forzar = false;
}

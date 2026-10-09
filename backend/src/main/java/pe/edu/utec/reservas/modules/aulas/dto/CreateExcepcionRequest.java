package pe.edu.utec.reservas.modules.aulas.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;

@Data
public class CreateExcepcionRequest {
    @NotNull private LocalDate fechaInicio;
    @NotNull private LocalDate fechaFin;
    @NotBlank private String tipo;        // EXAMEN, FERIADO, OTRO
    private String descripcion;
}

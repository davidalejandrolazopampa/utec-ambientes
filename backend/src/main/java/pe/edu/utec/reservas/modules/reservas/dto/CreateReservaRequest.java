package pe.edu.utec.reservas.modules.reservas.dto;

import jakarta.validation.constraints.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

@Data
public class CreateReservaRequest {

    @NotNull(message = "El recurso es obligatorio")
    private Long recursoId;

    @NotNull(message = "La fecha es obligatoria")
    @FutureOrPresent(message = "La fecha no puede ser pasada")
    private LocalDate fecha;

    @NotNull(message = "La hora de inicio es obligatoria")
    private LocalTime horaInicio;

    @NotNull(message = "La hora de fin es obligatoria")
    private LocalTime horaFin;

    @Min(value = 1, message = "Mínimo 1 participante")
    @Max(value = 20, message = "Máximo 20 participantes")
    private Integer participantes = 1;

    private String motivo;

    private String carrera;   // carrera del alumno; también se guarda en su perfil

    private List<String> participantesEmails;
}
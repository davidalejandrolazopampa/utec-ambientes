package pe.edu.utec.reservas.modules.bloqueos.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

@Data
public class CreateBloqueoRequest {

    // Espacio del bloqueo: un LABORATORIO o un AULA (exactamente uno; se valida en el servicio).
    private Long laboratorioId;
    private Long aulaId;

    @NotBlank(message = "El tipo es obligatorio (PARCIAL o TOTAL)")
    private String tipo;

    @NotBlank(message = "El motivo es obligatorio")
    private String motivo;

    private String descripcion;

    private String responsableNombre;
    private String responsableCorreo;

    @NotNull(message = "La fecha de inicio es obligatoria")
    private LocalDate fechaInicio;

    @NotNull(message = "La fecha de fin es obligatoria")
    private LocalDate fechaFin;

    // Solo para bloqueos parciales
    private LocalTime horaInicio;
    private LocalTime horaFin;

    // Recursos (mesas/PCs) afectados — solo para bloqueos PARCIALES
    private List<Long> recursosIds;
}
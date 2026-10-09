package pe.edu.utec.reservas.modules.aulas.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class CreateAulaRequest {
    @NotBlank(message = "El código es obligatorio")
    private String codigo;
    private String nombre;
    @NotBlank(message = "El tipo es obligatorio")
    private String tipo;
    private Integer capacidad;
    private Integer piso;
    private Boolean activo;
}

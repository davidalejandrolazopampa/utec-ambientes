package pe.edu.utec.reservas.modules.auth.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class GoogleTokenRequest {

    @NotBlank(message = "El token de Google es obligatorio")
    private String credential;
}
package pe.edu.utec.reservas.modules.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuthResponse {

    private String accessToken;
    private String refreshToken;
    private String correoUtec;
    private String nombres;
    private String apellidos;
    private String rol;
    private String cargo;
}
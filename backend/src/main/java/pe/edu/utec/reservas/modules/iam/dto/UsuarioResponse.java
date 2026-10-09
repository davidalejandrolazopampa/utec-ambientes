package pe.edu.utec.reservas.modules.iam.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UsuarioResponse {
    private Long id;
    private String correoUtec;
    private String nombres;
    private String apellidos;
    private String nombreCompleto;
    private String rol;
    private String cargo;
    private String carrera;
    private Long departamentoId;
    private String avatarUrl;
    private Boolean activo;
    private LocalDateTime lastLogin;
    private LocalDateTime createdAt;
    private List<String> laboratoriosAsignados;
}
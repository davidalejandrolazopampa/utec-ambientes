package pe.edu.utec.reservas.modules.iam.dto;

import lombok.Data;

@Data
public class UpdateUsuarioRequest {

    private String nombres;
    private String apellidos;
    private String cargo;
    private Long rolId;
    private String rol;   // alternativa a rolId: nombre del rol (ADMIN, COORDINADOR, ...)
    private Boolean activo;
    private Long departamentoId; // 0 = quitar el departamento
    private String carrera;      // nombre de la carrera (solo aplica a alumnos/estudiantes)
}

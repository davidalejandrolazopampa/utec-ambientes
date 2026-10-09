package pe.edu.utec.reservas.modules.iam.dto;

import lombok.Data;

/**
 * Alta manual de un usuario desde Organización (sin esperar al login con Google).
 * El rol se manda por nombre (ADMIN, COORDINADOR, DIRECTOR, RESPONSABLE_LAB, ESTUDIANTE).
 */
@Data
public class CreateUsuarioRequest {
    private String nombres;
    private String apellidos;
    private String correoUtec;
    private String rol;
    private String cargo;
    private Long departamentoId;
    private String carrera;   // solo para alumnos (ESTUDIANTE)
}

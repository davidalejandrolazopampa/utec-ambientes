package pe.edu.utec.reservas.modules.laboratorios.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Datos de contacto de un director/responsable para mostrar en el laboratorio. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PersonaResumen {
    private Long id;
    private String nombreCompleto;
    private String correoUtec;
    private String cargo;
}

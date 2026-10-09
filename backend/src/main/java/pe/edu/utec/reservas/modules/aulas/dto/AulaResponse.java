package pe.edu.utec.reservas.modules.aulas.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AulaResponse {
    private Long id;
    private String codigo;
    private String nombre;
    private String tipo;       // AULA, AULA_MIXTA, AUDITORIO, AULA_MAGNA, SALA_ESTUDIO_SUM… o LABORATORIO
    private Integer capacidad;
    private Integer piso;
    private Boolean activo;
    /** true si es un LABORATORIO (Buscar libres también los lista; su id es de `laboratorios`). */
    private Boolean esLab;
}

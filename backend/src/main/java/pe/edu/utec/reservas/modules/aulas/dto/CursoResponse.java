package pe.edu.utec.reservas.modules.aulas.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CursoResponse {
    private Long id;
    private String codCurso;
    private String nombre;
    private String area;
}

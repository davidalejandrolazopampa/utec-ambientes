package pe.edu.utec.reservas.modules.sanciones.dto;

import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.util.List;

/**
 * Alta de una sanción. Si {@code laboratorioIds} viene vacío/null = veta TODOS los labs
 * (se crea una sola fila con laboratorio_id NULL). Si trae ids, se crea una sanción por lab.
 * {@code fechaFin} null = indefinida.
 */
@Getter @Setter
public class CreateSancionRequest {
    private Long usuarioId;
    private List<Long> laboratorioIds;
    private String motivo;
    private LocalDate fechaInicio;
    private LocalDate fechaFin;
}

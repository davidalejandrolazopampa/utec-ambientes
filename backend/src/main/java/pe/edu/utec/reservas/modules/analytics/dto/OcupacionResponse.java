package pe.edu.utec.reservas.modules.analytics.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OcupacionResponse {

    private String codigoLab;
    private String laboratorioNombre;
    private Integer totalRecursos;
    private Integer recursosOcupados;
    private Integer recursosDisponibles;
    private Double porcentajeOcupacion;
}
package pe.edu.utec.reservas.modules.analytics.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class KpiResponse {

    private Integer totalReservasHoy;
    private Integer reservasActivas;
    private Integer reservasCanceladas;
    private Integer noShows;
    private Double tasaOcupacionGeneral;
    private Double tasaAusentismo;
    private List<OcupacionResponse> ocupacionPorLaboratorio;
}
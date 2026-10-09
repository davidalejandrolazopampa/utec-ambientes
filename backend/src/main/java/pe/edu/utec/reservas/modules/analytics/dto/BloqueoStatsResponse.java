package pe.edu.utec.reservas.modules.analytics.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BloqueoStatsResponse {
    private Long totalParciales;
    private Long totalTotales;
    private String laboratorioMasBloqueado;
    private String motivoMasFrecuente;
}
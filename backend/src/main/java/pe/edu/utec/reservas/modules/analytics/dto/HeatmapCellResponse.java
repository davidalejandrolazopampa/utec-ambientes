package pe.edu.utec.reservas.modules.analytics.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class HeatmapCellResponse {
    private String dia;       // Lunes, Martes...
    private Integer hora;     // 8, 9, 10...
    private Long cantidad;
}
package pe.edu.utec.reservas.modules.analytics.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReservaPorMesResponse {
    private String mes;
    private Long total;
    private Long completadas;
    private Long canceladas;
    private Long noShows;
}
package pe.edu.utec.reservas.modules.qr.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CheckinResponse {

    private Long reservaId;
    private String resultado;
    private String mensaje;
    private String recursoNombre;
    private String laboratorioNombre;
    private LocalDateTime validadoEn;
}
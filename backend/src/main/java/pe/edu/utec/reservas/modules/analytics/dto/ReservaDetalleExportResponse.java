package pe.edu.utec.reservas.modules.analytics.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReservaDetalleExportResponse {
    private Long id;
    private String fecha;
    private String horaInicio;
    private String horaFin;
    private String estado;
    private String laboratorioCodigo;
    private String laboratorioNombre;
    private String recursoNombre;
    private String recursoTipo;
    private String usuarioNombre;
    private String usuarioCorreo;
    private Integer participantes;
    private String tipoReserva;
    private String carrera;
}
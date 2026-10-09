package pe.edu.utec.reservas.modules.laboratorios.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RecursoLabResponse {

    private Long id;
    private String tipo;
    private String nombre;
    private Integer numero;
    private String qrCode;
    private String estado;
    private Integer capacidadPersonas;
    private Boolean esEquipo;

    public Boolean getEsEquipo() {
        return "EQUIPO".equals(tipo);
    }
}
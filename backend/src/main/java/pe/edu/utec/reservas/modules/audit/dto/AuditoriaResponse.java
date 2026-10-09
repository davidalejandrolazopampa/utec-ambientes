package pe.edu.utec.reservas.modules.audit.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuditoriaResponse {

    private Long id;
    private Long reservaId;
    private String usuarioCorreo;
    private String usuarioNombre;
    private String accion;
    private Map<String, Object> valoresAnteriores;
    private Map<String, Object> valoresNuevos;
    private String ipAddress;
    private LocalDateTime createdAt;
}
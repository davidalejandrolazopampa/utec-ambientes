package pe.edu.utec.reservas.modules.bloqueos.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * Resultado de una importación masiva de bloqueos desde un archivo Excel/CSV.
 * Reporta el desenlace fila por fila para que el usuario vea qué se creó y qué se omitió/falló,
 * sin abortar todo el lote por una fila con conflicto (cada fila se crea en su propia transacción).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImportBloqueosResponse {

    private int total;
    private int creados;
    private int omitidos;
    private int errores;

    @Builder.Default
    private List<Fila> detalle = new ArrayList<>();

    public enum Estado { CREADO, OMITIDO, ERROR }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Fila {
        /** Número de fila del archivo (1-based, sin contar la cabecera). */
        private int fila;
        private String titulo;
        private Estado estado;
        /** Motivo del omitido/error, o el código del bloqueo creado. */
        private String mensaje;
        private Long bloqueoId;
    }
}

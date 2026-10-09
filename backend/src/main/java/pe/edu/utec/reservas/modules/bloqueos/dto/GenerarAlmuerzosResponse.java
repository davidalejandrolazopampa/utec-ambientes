package pe.edu.utec.reservas.modules.bloqueos.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.List;

/** Reporte de la generación de almuerzos: cuántos se crearon y qué días se omitieron (y por qué). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GenerarAlmuerzosResponse {
    private int creados;
    private int reservasCanceladas; // solo con forzar=true
    private List<Omitido> omitidos;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Omitido {
        private LocalDate fecha;
        private String motivo; // "ya existe" | "evento" | "clase" | "reserva"
    }
}

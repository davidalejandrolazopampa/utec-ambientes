package pe.edu.utec.reservas.modules.aulas.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CicloResponse {
    private Long id;
    private Integer anio;
    private Integer ciclo;
    private String codigo;        // 2026-1
    private LocalDate fechaInicio;
    private LocalDate fechaFin;

    /** Días/semanas sin clases regulares (exámenes, feriados). */
    @Builder.Default
    private List<Excepcion> excepciones = new ArrayList<>();

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Excepcion {
        private Long id;
        private LocalDate fechaInicio;
        private LocalDate fechaFin;
        private String tipo;         // EXAMEN, FERIADO, OTRO
        private String descripcion;
    }
}

package pe.edu.utec.reservas.modules.bloqueos.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

/**
 * Feriado operativo (fecha DISTINTA de bloqueos motivo=FERIADO, uno por lab) con su nombre oficial.
 * Se usa para pintar la marca "Feriado" en el calendario INDEPENDIENTE del ciclo (los feriados de
 * receso —fuera del rango de cualquier ciclo, p. ej. 6-ago— no tienen excepción académica derivada).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FeriadoResponse {
    private LocalDate fecha;
    private String descripcion;
}

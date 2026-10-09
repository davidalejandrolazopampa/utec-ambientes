package pe.edu.utec.reservas.modules.reservas.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Página de reservas (Gestión de Reservas paginada). Evita traer las 8k+ reservas
 * de golpe: el frontend pide de a `size` filas y muestra controles de paginación.
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class ReservaPageResponse {
    private List<ReservaResponse> content;
    private long total;       // total de filas que cumplen el filtro
    private int page;         // página actual (0-based)
    private int size;         // tamaño de página
    private int totalPages;
}

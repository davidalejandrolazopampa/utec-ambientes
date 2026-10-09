package pe.edu.utec.reservas.modules.iam.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Página de usuarios (búsqueda paginada). Evita traer miles de alumnos de golpe:
 * el frontend pide de a `size` filas y muestra los controles de paginación.
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class UsuarioPageResponse {
    private List<UsuarioResponse> content;
    private long total;       // total de filas que cumplen el filtro
    private int page;         // página actual (0-based)
    private int size;         // tamaño de página
    private int totalPages;
}

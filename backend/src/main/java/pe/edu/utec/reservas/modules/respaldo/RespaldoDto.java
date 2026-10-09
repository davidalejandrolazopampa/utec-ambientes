package pe.edu.utec.reservas.modules.respaldo;

import java.util.List;
import java.util.Map;

/**
 * Respaldo descargable/restaurable de los datos generados en runtime
 * (alumnos + reservas + bloqueos y sus recursos afectados). Cada fila conserva
 * su `id` para que al restaurar se deduplique por clave primaria (no se vuelve a
 * insertar lo que ya existe).
 */
public record RespaldoDto(
        List<Map<String, Object>> usuarios,
        List<Map<String, Object>> reservas,
        List<Map<String, Object>> bloqueos,
        List<Map<String, Object>> bloqueoRecursos
) {}

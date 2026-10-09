package pe.edu.utec.reservas.modules.respaldo;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class RespaldoService {

    private final JdbcTemplate jdbc;

    /** Exporta alumnos + reservas + bloqueos (con sus IDs) para descargar como respaldo. */
    @Transactional(readOnly = true)
    public RespaldoDto exportar() {
        List<Map<String, Object>> usuarios = jdbc.queryForList(
                "SELECT id, correo_utec, nombres, apellidos, rol_id, cargo, carrera, departamento_id, activo " +
                "FROM usuarios ORDER BY id");
        List<Map<String, Object>> reservas = jdbc.queryForList(
                "SELECT id, recurso_id, usuario_id, fecha::text AS fecha, hora_inicio::text AS hora_inicio, " +
                "hora_fin::text AS hora_fin, estado::text AS estado, tipo_reserva::text AS tipo_reserva, " +
                "participantes, motivo, carrera, creado_por FROM reservas ORDER BY id");
        List<Map<String, Object>> bloqueos = jdbc.queryForList(
                "SELECT id, laboratorio_id, tipo::text AS tipo, motivo::text AS motivo, descripcion, " +
                "fecha_inicio::text AS fecha_inicio, fecha_fin::text AS fecha_fin, " +
                "hora_inicio::text AS hora_inicio, hora_fin::text AS hora_fin, " +
                "recursos_afectados::text AS recursos_afectados, activo, creado_por, " +
                "responsable_nombre, responsable_correo FROM bloqueos WHERE es_clase = false ORDER BY id");
        List<Map<String, Object>> bloqueoRecursos = jdbc.queryForList(
                "SELECT id, bloqueo_id, recurso_id FROM bloqueo_recursos ORDER BY id");
        return new RespaldoDto(usuarios, reservas, bloqueos, bloqueoRecursos);
    }

    /**
     * Restaura un respaldo. Inserta con ON CONFLICT (id) DO NOTHING, así re-subir
     * el mismo archivo NO duplica (deduplica por la clave primaria). Luego ajusta
     * las secuencias para que las próximas inserciones no colisionen.
     */
    @Transactional
    public Map<String, Object> importar(RespaldoDto data) {
        int usuariosIns = 0, reservasIns = 0, bloqueosIns = 0, bloqueoRecursosIns = 0;

        for (Map<String, Object> u : nullSafe(data.usuarios())) {
            usuariosIns += jdbc.update(
                    "INSERT INTO usuarios (id, correo_utec, nombres, apellidos, rol_id, cargo, carrera, " +
                    "departamento_id, activo, created_at, updated_at) " +
                    "VALUES (?,?,?,?,?,?,?,?,?, now(), now()) ON CONFLICT (id) DO NOTHING",
                    asLong(u.get("id")), u.get("correo_utec"), u.get("nombres"), u.get("apellidos"),
                    asLong(u.get("rol_id")), u.get("cargo"), u.get("carrera"),
                    asLong(u.get("departamento_id")), asBool(u.get("activo")));
        }

        for (Map<String, Object> r : nullSafe(data.reservas())) {
            reservasIns += jdbc.update(
                    "INSERT INTO reservas (id, recurso_id, usuario_id, fecha, hora_inicio, hora_fin, estado, " +
                    "tipo_reserva, participantes, motivo, carrera, creado_por, version, created_at, updated_at) " +
                    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 0, now(), now()) ON CONFLICT (id) DO NOTHING",
                    asLong(r.get("id")), asLong(r.get("recurso_id")), asLong(r.get("usuario_id")),
                    r.get("fecha"), r.get("hora_inicio"), r.get("hora_fin"), r.get("estado"),
                    r.get("tipo_reserva"), asInt(r.get("participantes")), r.get("motivo"),
                    r.get("carrera"), asLong(r.get("creado_por")));
        }

        // Bloqueos: el jsonb recursos_afectados se castea explícitamente; tipo/motivo
        // son enums nativos coaccionados por stringtype=unspecified.
        for (Map<String, Object> b : nullSafe(data.bloqueos())) {
            bloqueosIns += jdbc.update(
                    "INSERT INTO bloqueos (id, laboratorio_id, tipo, motivo, descripcion, fecha_inicio, fecha_fin, " +
                    "hora_inicio, hora_fin, recursos_afectados, activo, creado_por, responsable_nombre, " +
                    "responsable_correo, created_at, updated_at) " +
                    "VALUES (?,?,?,?,?,?,?,?,?, CAST(? AS jsonb), ?,?,?,?, now(), now()) ON CONFLICT (id) DO NOTHING",
                    asLong(b.get("id")), asLong(b.get("laboratorio_id")), b.get("tipo"), b.get("motivo"),
                    b.get("descripcion"), b.get("fecha_inicio"), b.get("fecha_fin"),
                    b.get("hora_inicio"), b.get("hora_fin"), b.get("recursos_afectados"),
                    asBool(b.get("activo")), asLong(b.get("creado_por")),
                    b.get("responsable_nombre"), b.get("responsable_correo"));
        }

        // bloqueo_recursos depende de bloqueos: va después. ON CONFLICT sin objetivo
        // cubre tanto la PK (id) como el UNIQUE (bloqueo_id, recurso_id).
        for (Map<String, Object> br : nullSafe(data.bloqueoRecursos())) {
            bloqueoRecursosIns += jdbc.update(
                    "INSERT INTO bloqueo_recursos (id, bloqueo_id, recurso_id, created_at) " +
                    "VALUES (?,?,?, now()) ON CONFLICT DO NOTHING",
                    asLong(br.get("id")), asLong(br.get("bloqueo_id")), asLong(br.get("recurso_id")));
        }

        // Re-alinea las secuencias al MAX(id) para no colisionar en próximas inserciones.
        jdbc.execute("SELECT setval('usuarios_id_seq', GREATEST((SELECT COALESCE(MAX(id),1) FROM usuarios), 1))");
        jdbc.execute("SELECT setval('reservas_id_seq', GREATEST((SELECT COALESCE(MAX(id),1) FROM reservas), 1))");
        jdbc.execute("SELECT setval('bloqueos_id_seq', GREATEST((SELECT COALESCE(MAX(id),1) FROM bloqueos), 1))");
        jdbc.execute("SELECT setval('bloqueo_recursos_id_seq', GREATEST((SELECT COALESCE(MAX(id),1) FROM bloqueo_recursos), 1))");

        log.info("Respaldo restaurado - usuarios: {} | reservas: {} | bloqueos: {} | bloqueo_recursos: {}",
                usuariosIns, reservasIns, bloqueosIns, bloqueoRecursosIns);
        return Map.of("usuariosInsertados", usuariosIns, "reservasInsertadas", reservasIns,
                "bloqueosInsertados", bloqueosIns, "bloqueoRecursosInsertados", bloqueoRecursosIns);
    }

    private static <T> List<T> nullSafe(List<T> l) { return l == null ? List.of() : l; }
    private static Long asLong(Object o) { return o == null ? null : ((Number) o).longValue(); }
    private static Integer asInt(Object o) { return o == null ? null : ((Number) o).intValue(); }
    private static Boolean asBool(Object o) { return o == null ? Boolean.TRUE : (Boolean) o; }
}

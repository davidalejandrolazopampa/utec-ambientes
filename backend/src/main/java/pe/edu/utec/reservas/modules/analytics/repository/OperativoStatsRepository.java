package pe.edu.utec.reservas.modules.analytics.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import pe.edu.utec.reservas.modules.bloqueos.model.Bloqueo;

import java.time.LocalDate;
import java.util.List;

/**
 * Estadísticas de bloqueos OPERATIVOS (ALMUERZO, MANTENIMIENTO y FERIADO). Son lo contrario
 * de {@link BloqueoStatsRepository}: aquí SÓLO cuentan esos motivos, que se excluyen del
 * resto del dashboard por ser operativos internos. Alimenta la sección "Operativo" de la
 * vista Solo bloqueos (gráfica por lab, por mes e historial).
 * (motivo/tipo se mapean como String; en queries nativas se castean a VARCHAR por ser enum nativo.)
 */
public interface OperativoStatsRepository extends JpaRepository<Bloqueo, Long> {

    // Conteo por laboratorio y motivo → (nombreLab, motivo, cantidad).
    @Query(value = "SELECT l.nombre, CAST(b.motivo AS VARCHAR) AS motivo, COUNT(*) " +
            "FROM bloqueos b JOIN laboratorios l ON l.id = b.laboratorio_id " +
            "WHERE b.fecha_inicio <= :fin AND b.fecha_fin >= :inicio " +
            "AND CAST(b.motivo AS VARCHAR) IN ('ALMUERZO', 'MANTENIMIENTO', 'FERIADO', 'RETIRO') " +
            "AND (:labId IS NULL OR b.laboratorio_id = CAST(:labId AS BIGINT)) " +
            "GROUP BY l.nombre, b.motivo", nativeQuery = true)
    List<Object[]> countPorLabYMotivo(LocalDate inicio, LocalDate fin, Long labId);

    // Conteo por mes (YYYY-MM) y motivo → (mes, motivo, cantidad).
    @Query(value = "SELECT to_char(b.fecha_inicio, 'YYYY-MM') AS mes, CAST(b.motivo AS VARCHAR) AS motivo, COUNT(*) " +
            "FROM bloqueos b " +
            "WHERE b.fecha_inicio <= :fin AND b.fecha_fin >= :inicio " +
            "AND CAST(b.motivo AS VARCHAR) IN ('ALMUERZO', 'MANTENIMIENTO', 'FERIADO', 'RETIRO') " +
            "AND (:labId IS NULL OR b.laboratorio_id = CAST(:labId AS BIGINT)) " +
            "GROUP BY mes, b.motivo ORDER BY mes", nativeQuery = true)
    List<Object[]> countPorMesYMotivo(LocalDate inicio, LocalDate fin, Long labId);

    // Historial detallado → (id, lab, motivo, tipo, fecha, horaInicio, horaFin, recursos, descripcion).
    // `recursos` agrega los nombres de los recursos afectados (solo bloqueos PARCIAL los tienen).
    @Query(value = "SELECT b.id, l.nombre, CAST(b.motivo AS VARCHAR), CAST(b.tipo AS VARCHAR), " +
            "b.fecha_inicio, b.hora_inicio, b.hora_fin, " +
            "(SELECT string_agg(rl.nombre, ', ' ORDER BY rl.nombre) FROM bloqueo_recursos br " +
            " JOIN recursos_lab rl ON rl.id = br.recurso_id WHERE br.bloqueo_id = b.id) AS recursos, " +
            "b.descripcion " +
            "FROM bloqueos b JOIN laboratorios l ON l.id = b.laboratorio_id " +
            "WHERE b.fecha_inicio <= :fin AND b.fecha_fin >= :inicio " +
            "AND CAST(b.motivo AS VARCHAR) IN ('ALMUERZO', 'MANTENIMIENTO', 'FERIADO', 'RETIRO') " +
            "AND (:labId IS NULL OR b.laboratorio_id = CAST(:labId AS BIGINT)) " +
            "ORDER BY b.fecha_inicio DESC, b.hora_inicio", nativeQuery = true)
    List<Object[]> historial(LocalDate inicio, LocalDate fin, Long labId);
}

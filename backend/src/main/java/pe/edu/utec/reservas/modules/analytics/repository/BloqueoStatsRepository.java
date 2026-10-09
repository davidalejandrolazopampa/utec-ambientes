package pe.edu.utec.reservas.modules.analytics.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import pe.edu.utec.reservas.modules.bloqueos.model.Bloqueo;

import java.time.LocalDate;

/**
 * Estadísticas de bloqueos para el dashboard. TODAS las queries EXCLUYEN los motivos
 * OPERATIVOS (ALMUERZO, MANTENIMIENTO y FERIADO): cierran el lab pero no cuentan como
 * eventos a analizar (siguen visibles en la página de Bloqueos).
 * (motivo se mapea como String; en queries nativas se castea a VARCHAR por ser enum nativo.)
 */
public interface BloqueoStatsRepository extends JpaRepository<Bloqueo, Long> {

    @Query("SELECT COUNT(b) FROM Bloqueo b WHERE b.tipo = 'PARCIAL' AND b.esClase = false " +
            "AND b.fechaInicio <= :fin AND b.fechaFin >= :inicio " +
            "AND b.motivo NOT IN ('ALMUERZO', 'MANTENIMIENTO', 'FERIADO', 'RETIRO') " +
            "AND (:labId IS NULL OR b.laboratorio.id = :labId)")
    Long countParcialesFiltered(LocalDate inicio, LocalDate fin, Long labId);

    @Query("SELECT COUNT(b) FROM Bloqueo b WHERE b.tipo = 'TOTAL' AND b.esClase = false " +
            "AND b.fechaInicio <= :fin AND b.fechaFin >= :inicio " +
            "AND b.motivo NOT IN ('ALMUERZO', 'MANTENIMIENTO', 'FERIADO', 'RETIRO') " +
            "AND (:labId IS NULL OR b.laboratorio.id = :labId)")
    Long countTotalesFiltered(LocalDate inicio, LocalDate fin, Long labId);

    @Query(value = "SELECT l.nombre FROM bloqueos b JOIN laboratorios l ON l.id = b.laboratorio_id " +
            "WHERE b.fecha_inicio <= :fin AND b.fecha_fin >= :inicio AND b.es_clase = false " +
            "AND CAST(b.motivo AS VARCHAR) NOT IN ('ALMUERZO', 'MANTENIMIENTO', 'FERIADO', 'RETIRO') " +
            "AND (:labId IS NULL OR b.laboratorio_id = CAST(:labId AS BIGINT)) " +
            "GROUP BY l.nombre ORDER BY COUNT(*) DESC LIMIT 1", nativeQuery = true)
    String findLabMasBloqueado(LocalDate inicio, LocalDate fin, Long labId);

    @Query(value = "SELECT CAST(b.motivo AS VARCHAR) FROM bloqueos b " +
            "WHERE b.fecha_inicio <= :fin AND b.fecha_fin >= :inicio AND b.es_clase = false " +
            "AND CAST(b.motivo AS VARCHAR) NOT IN ('ALMUERZO', 'MANTENIMIENTO', 'FERIADO', 'RETIRO') " +
            "AND (:labId IS NULL OR b.laboratorio_id = CAST(:labId AS BIGINT)) " +
            "GROUP BY b.motivo ORDER BY COUNT(*) DESC LIMIT 1", nativeQuery = true)
    String findMotivoMasFrecuente(LocalDate inicio, LocalDate fin, Long labId);
}

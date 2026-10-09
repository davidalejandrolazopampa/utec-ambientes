package pe.edu.utec.reservas.modules.sanciones.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pe.edu.utec.reservas.modules.sanciones.model.Sancion;

import java.time.LocalDate;
import java.util.List;

public interface SancionRepository extends JpaRepository<Sancion, Long> {

    /** Sanciones de un usuario (activas primero, más recientes primero) — para el panel de la persona. */
    List<Sancion> findByUsuarioIdOrderByActivoDescFechaInicioDesc(Long usuarioId);

    /** Todas las sanciones activas (no levantadas) — para la vista global del admin. */
    List<Sancion> findByActivoTrueOrderByFechaInicioDesc();

    /**
     * ¿Tiene el usuario una sanción VIGENTE que le impida reservar ese lab en esa fecha?
     * Vigente = activa, ya empezó (fechaInicio ≤ fecha), no ha vencido (fechaFin NULL o ≥ fecha)
     * y aplica al lab (laboratorioId NULL = todos, o coincide con :labId).
     * Se ordena por alcance-global primero para que el mensaje priorice "todos los labs".
     */
    @Query("""
        SELECT s FROM Sancion s
        WHERE s.usuarioId = :usuarioId
          AND s.activo = true
          AND s.fechaInicio <= :fecha
          AND (s.fechaFin IS NULL OR s.fechaFin >= :fecha)
          AND (s.laboratorioId IS NULL OR s.laboratorioId = :labId)
        ORDER BY s.laboratorioId ASC NULLS FIRST
        """)
    List<Sancion> findVigentes(@Param("usuarioId") Long usuarioId,
                               @Param("labId") Long labId,
                               @Param("fecha") LocalDate fecha);
}

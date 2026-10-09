package pe.edu.utec.reservas.modules.reservas.repository;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import pe.edu.utec.reservas.modules.reservas.model.Reserva;

import java.time.*;
import java.util.List;

public interface ReservaRepository extends JpaRepository<Reserva, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM Reserva r WHERE r.recurso.id = :recursoId AND r.fecha = :fecha " +
            "AND r.estado IN ('PENDIENTE','CONFIRMADA','EN_CURSO') " +
            "AND ((r.horaInicio < :horaFin AND r.horaFin > :horaInicio))")
    List<Reserva> findConflictingReservationsWithLock(Long recursoId, LocalDate fecha, LocalTime horaInicio, LocalTime horaFin);

    List<Reserva> findByUsuarioIdAndFecha(Long usuarioId, LocalDate fecha);

    List<Reserva> findByRecursoIdAndFecha(Long recursoId, LocalDate fecha);

    /** Reservas VIGENTES de una fecha (todas las mesas/labs) — ocupación parcial en Buscar libres. */
    @Query("SELECT r FROM Reserva r WHERE r.fecha = :fecha AND r.estado IN ('PENDIENTE','CONFIRMADA','EN_CURSO')")
    List<Reserva> findVigentesEnFecha(LocalDate fecha);

    @Query("SELECT r FROM Reserva r WHERE r.estado = 'PENDIENTE' AND r.fecha = :fecha " +
            "AND r.horaInicio < :cutoffTime")
    List<Reserva> findPendingReservationsToCancel(LocalDate fecha, LocalTime cutoffTime);

    @Query("SELECT r FROM Reserva r WHERE r.usuario.id = :usuarioId AND r.fecha = :fecha " +
            "AND r.estado IN ('PENDIENTE','CONFIRMADA','EN_CURSO') " +
            "AND ((r.horaInicio < :horaFin AND r.horaFin > :horaInicio))")
    List<Reserva> findReservasSimultaneasDelUsuario(Long usuarioId, LocalDate fecha, LocalTime horaInicio, LocalTime horaFin);

    // Reservas del usuario: donde es TITULAR (r.usuario) o ACOMPAÑANTE
    // (reserva_participantes). Antes solo traía las del titular, así que un
    // acompañante no veía en "Mis Reservas" las reservas en las que participa.
    @Query("SELECT r FROM Reserva r WHERE r.usuario.id = :usuarioId " +
            "OR EXISTS (SELECT 1 FROM ReservaParticipante p WHERE p.reserva = r AND p.usuario.id = :usuarioId) " +
            "ORDER BY r.fecha ASC, r.horaInicio ASC")
    List<Reserva> findReservasActivasDelUsuario(Long usuarioId);

    @Query("SELECT r FROM Reserva r WHERE r.recurso.laboratorio.id = :labId " +
            "ORDER BY r.fecha ASC, r.horaInicio ASC")
    List<Reserva> findByLaboratorioId(Long labId);

    // Reservas ACTIVAS de un laboratorio dentro de un rango de fechas (para validar bloqueos
    // sin cargar toda la tabla con findAll; escalable). El solape de horas se evalúa en el servicio.
    @Query("SELECT r FROM Reserva r WHERE r.recurso.laboratorio.id = :labId " +
            "AND r.estado IN ('PENDIENTE','CONFIRMADA','EN_CURSO') " +
            "AND r.fecha BETWEEN :fechaInicio AND :fechaFin")
    List<Reserva> findActivasPorLabYRango(Long labId, LocalDate fechaInicio, LocalDate fechaFin);

    // ✅ CORREGIDO: Ahora trae TODAS las reservas (para admin)
    @Query("SELECT r FROM Reserva r ORDER BY r.fecha ASC, r.horaInicio ASC")
    List<Reserva> findAllReservasActivas();

    // ✅ CORREGIDO: Ahora trae TODAS las reservas de laboratorios del director
    @Query("SELECT r FROM Reserva r " +
            "WHERE r.recurso.laboratorio.director.id = :directorId " +
            "ORDER BY r.fecha ASC, r.horaInicio ASC")
    List<Reserva> findReservasActivasPorDirector(Long directorId);

    // Reservas de los labs que gestiona el responsable + sus propias reservas
    @Query(value = "SELECT DISTINCT r.* FROM reservas r " +
            "INNER JOIN recursos_lab rl ON rl.id = r.recurso_id " +
            "WHERE r.usuario_id = :responsableId " +
            "OR rl.laboratorio_id IN (SELECT lr.laboratorio_id FROM lab_responsables lr WHERE lr.usuario_id = :responsableId) " +
            "ORDER BY r.fecha ASC, r.hora_inicio ASC", nativeQuery = true)
    List<Reserva> findReservasActivasPorResponsable(Long responsableId);

    // ─────────────────────────────────────────────────────────────────────────
    // Versiones PAGINADAS de "mis reservas" (Gestión de Reservas). Antes se bajaban
    // TODAS las reservas de golpe (8k+ para el admin) y se paginaba en el cliente →
    // se colgaba y empeora al crecer. Ahora el servidor pagina y filtra (patrón
    // /usuarios/buscar). El `:patron` (`%q%` en minúsculas) va con CAST(...) por el
    // gotcha de Postgres+stringtype. El orden lo pone el Pageable (fecha desc).
    // El filtro busca por código/nombre de lab, mesa/recurso y nombre/correo del titular.
    String FILTRO = " AND (CAST(:patron AS string) IS NULL "
            + "     OR LOWER(r.recurso.laboratorio.codigoLab) LIKE CAST(:patron AS string) "
            + "     OR LOWER(r.recurso.laboratorio.nombre) LIKE CAST(:patron AS string) "
            + "     OR LOWER(r.recurso.nombre) LIKE CAST(:patron AS string) "
            + "     OR LOWER(r.usuario.nombres) LIKE CAST(:patron AS string) "
            + "     OR LOWER(r.usuario.apellidos) LIKE CAST(:patron AS string) "
            + "     OR LOWER(r.usuario.correoUtec) LIKE CAST(:patron AS string))"
            // Filtro opcional por laboratorio (desplegable de Gestión de Reservas). CAST por el
            // gotcha Postgres+stringtype: sin él, un :labId NULL no infiere tipo.
            + " AND (CAST(:labId AS long) IS NULL OR r.recurso.laboratorio.id = :labId)";

    @Query("SELECT r FROM Reserva r WHERE 1=1" + FILTRO)
    Page<Reserva> buscarTodas(String patron, Long labId, Pageable pageable);

    @Query("SELECT r FROM Reserva r WHERE r.recurso.laboratorio.director.id = :directorId" + FILTRO)
    Page<Reserva> buscarPorDirector(Long directorId, String patron, Long labId, Pageable pageable);

    @Query("SELECT r FROM Reserva r WHERE (r.usuario.id = :respId "
            + "OR EXISTS (SELECT 1 FROM Laboratorio l JOIN l.responsables u "
            + "           WHERE l = r.recurso.laboratorio AND u.id = :respId))" + FILTRO)
    Page<Reserva> buscarPorResponsable(Long respId, String patron, Long labId, Pageable pageable);

    @Query("SELECT r FROM Reserva r WHERE (r.usuario.id = :usuarioId "
            + "OR EXISTS (SELECT 1 FROM ReservaParticipante p WHERE p.reserva = r AND p.usuario.id = :usuarioId))" + FILTRO)
    Page<Reserva> buscarDelUsuario(Long usuarioId, String patron, Long labId, Pageable pageable);
}
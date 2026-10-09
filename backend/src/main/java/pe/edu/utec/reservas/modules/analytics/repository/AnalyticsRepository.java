package pe.edu.utec.reservas.modules.analytics.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import pe.edu.utec.reservas.modules.reservas.model.Reserva;

import java.time.LocalDate;
import java.util.List;

public interface AnalyticsRepository extends JpaRepository<Reserva, Long> {

    @Query("SELECT COUNT(r) FROM Reserva r WHERE r.fecha = :fecha")
    Integer countByFecha(LocalDate fecha);

    // Años que tienen datos (reservas o bloqueos activos), desc. Alimenta el
    // filtro de años del dashboard: solo aparecen años con registros (no años
    // vacíos por delante/detrás del reloj).
    @Query(value = "SELECT DISTINCT y FROM ("
            + " SELECT EXTRACT(YEAR FROM fecha)::int AS y FROM reservas"
            + " UNION SELECT EXTRACT(YEAR FROM fecha_inicio)::int FROM bloqueos WHERE activo = true AND es_clase = false"
            + " ) t ORDER BY y DESC", nativeQuery = true)
    List<Integer> findAniosConDatos();

    // Periodos "YYYY-C" (año + ciclo UTEC: 0=Ene-Feb, 1=Mar-Jul, 2=Ago-Dic) que
    // tienen data ANALIZABLE: reservas o bloqueos NO operativos. Se EXCLUYEN los
    // operativos (FERIADO/ALMUERZO/MANTENIMIENTO) porque el feriado, que ahora
    // existe en todos los labs/años, poblaría todos los ciclos y el filtro
    // volvería a ofrecer ciclos vacíos. Alimenta año + ciclo del dashboard.
    @Query(value = "SELECT DISTINCT y || '-' || c AS periodo FROM ("
            + " SELECT EXTRACT(YEAR FROM fecha)::int AS y,"
            + "   (CASE WHEN EXTRACT(MONTH FROM fecha) IN (1,2) THEN 0"
            + "         WHEN EXTRACT(MONTH FROM fecha) BETWEEN 3 AND 7 THEN 1 ELSE 2 END) AS c"
            + " FROM reservas"
            + " UNION"
            + " SELECT EXTRACT(YEAR FROM fecha_inicio)::int,"
            + "   (CASE WHEN EXTRACT(MONTH FROM fecha_inicio) IN (1,2) THEN 0"
            + "         WHEN EXTRACT(MONTH FROM fecha_inicio) BETWEEN 3 AND 7 THEN 1 ELSE 2 END)"
            + " FROM bloqueos WHERE activo = true AND es_clase = false"
            + "   AND CAST(motivo AS varchar) NOT IN ('FERIADO','ALMUERZO','MANTENIMIENTO','RETIRO')"
            + " ) t ORDER BY periodo DESC", nativeQuery = true)
    List<String> findPeriodosConDatos();

    @Query("SELECT COUNT(r) FROM Reserva r WHERE r.fecha = :fecha AND r.estado IN ('PENDIENTE','CONFIRMADA','EN_CURSO')")
    Integer countActivasByFecha(LocalDate fecha);

    @Query("SELECT r FROM Reserva r WHERE r.recurso.laboratorio.id = :labId AND r.fecha = :fecha AND r.estado IN ('PENDIENTE','CONFIRMADA','EN_CURSO')")
    List<Reserva> findActivasByLabAndFecha(Long labId, LocalDate fecha);

    @Query("SELECT COUNT(r) FROM Reserva r WHERE r.fecha BETWEEN :inicio AND :fin"
            + " AND (:labId IS NULL OR r.recurso.laboratorio.id = :labId)"
            + " AND (CAST(:tipo AS string) IS NULL OR r.tipoReserva = :tipo)"
            + " AND (CAST(:carrera AS string) IS NULL OR r.carrera = :carrera)")
    Integer countFiltered(LocalDate inicio, LocalDate fin, Long labId, String tipo, String carrera);

    @Query("SELECT COUNT(r) FROM Reserva r WHERE r.fecha BETWEEN :inicio AND :fin"
            + " AND r.estado IN ('PENDIENTE','CONFIRMADA','EN_CURSO')"
            + " AND (:labId IS NULL OR r.recurso.laboratorio.id = :labId)"
            + " AND (CAST(:tipo AS string) IS NULL OR r.tipoReserva = :tipo)"
            + " AND (CAST(:carrera AS string) IS NULL OR r.carrera = :carrera)")
    Integer countActivasFiltered(LocalDate inicio, LocalDate fin, Long labId, String tipo, String carrera);

    @Query("SELECT COUNT(r) FROM Reserva r WHERE r.fecha BETWEEN :inicio AND :fin"
            + " AND r.estado = 'CANCELADA'"
            + " AND (:labId IS NULL OR r.recurso.laboratorio.id = :labId)"
            + " AND (CAST(:tipo AS string) IS NULL OR r.tipoReserva = :tipo)"
            + " AND (CAST(:carrera AS string) IS NULL OR r.carrera = :carrera)")
    Integer countCanceladasFiltered(LocalDate inicio, LocalDate fin, Long labId, String tipo, String carrera);

    @Query("SELECT COUNT(r) FROM Reserva r WHERE r.fecha BETWEEN :inicio AND :fin"
            + " AND r.estado = 'NO_SHOW'"
            + " AND (:labId IS NULL OR r.recurso.laboratorio.id = :labId)"
            + " AND (CAST(:tipo AS string) IS NULL OR r.tipoReserva = :tipo)"
            + " AND (CAST(:carrera AS string) IS NULL OR r.carrera = :carrera)")
    Integer countNoShowsFiltered(LocalDate inicio, LocalDate fin, Long labId, String tipo, String carrera);

    @Query("SELECT COUNT(r) FROM Reserva r WHERE r.fecha BETWEEN :inicio AND :fin"
            + " AND r.estado = 'COMPLETADA'"
            + " AND (:labId IS NULL OR r.recurso.laboratorio.id = :labId)"
            + " AND (CAST(:tipo AS string) IS NULL OR r.tipoReserva = :tipo)"
            + " AND (CAST(:carrera AS string) IS NULL OR r.carrera = :carrera)")
    Integer countCompletadasFiltered(LocalDate inicio, LocalDate fin, Long labId, String tipo, String carrera);

    @Query("SELECT COUNT(r) FROM Reserva r WHERE r.fecha BETWEEN :inicio AND :fin"
            + " AND r.tipoReserva = :tipo"
            + " AND (:labId IS NULL OR r.recurso.laboratorio.id = :labId)"
            + " AND (CAST(:carrera AS string) IS NULL OR r.carrera = :carrera)")
    Integer countByTipoReserva(LocalDate inicio, LocalDate fin, String tipo, Long labId, String carrera);

    @Query(value = "SELECT EXTRACT(DOW FROM r.fecha), EXTRACT(HOUR FROM r.hora_inicio), COUNT(*)"
            + " FROM reservas r JOIN recursos_lab rl ON rl.id = r.recurso_id"
            + " WHERE r.fecha BETWEEN :inicio AND :fin AND r.estado NOT IN ('CANCELADA')"
            + " AND (:labId IS NULL OR rl.laboratorio_id = CAST(:labId AS BIGINT))"
            + " AND (CAST(:tipo AS VARCHAR) IS NULL OR CAST(r.tipo_reserva AS VARCHAR) = CAST(:tipo AS VARCHAR))"
            + " AND (CAST(:carrera AS VARCHAR) IS NULL OR r.carrera = CAST(:carrera AS VARCHAR))"
            + " GROUP BY 1, 2 ORDER BY 1, 2", nativeQuery = true)
    List<Object[]> countHeatmapFiltered(LocalDate inicio, LocalDate fin, Long labId, String tipo, String carrera);

    @Query(value = "SELECT EXTRACT(HOUR FROM r.hora_inicio), COUNT(*)"
            + " FROM reservas r JOIN recursos_lab rl ON rl.id = r.recurso_id"
            + " WHERE r.fecha BETWEEN :inicio AND :fin AND r.estado NOT IN ('CANCELADA')"
            + " AND (:labId IS NULL OR rl.laboratorio_id = CAST(:labId AS BIGINT))"
            + " AND (CAST(:tipo AS VARCHAR) IS NULL OR CAST(r.tipo_reserva AS VARCHAR) = CAST(:tipo AS VARCHAR))"
            + " AND (CAST(:carrera AS VARCHAR) IS NULL OR r.carrera = CAST(:carrera AS VARCHAR))"
            + " GROUP BY 1 ORDER BY 1", nativeQuery = true)
    List<Object[]> countPorHoraFiltered(LocalDate inicio, LocalDate fin, Long labId, String tipo, String carrera);

    @Query(value = "SELECT r.fecha, COUNT(*),"
            + " COUNT(*) FILTER (WHERE r.estado = 'COMPLETADA'),"
            + " COUNT(*) FILTER (WHERE r.estado = 'CANCELADA'),"
            + " COUNT(*) FILTER (WHERE r.estado = 'NO_SHOW')"
            + " FROM reservas r JOIN recursos_lab rl ON rl.id = r.recurso_id"
            + " WHERE r.fecha BETWEEN :inicio AND :fin"
            + " AND (:labId IS NULL OR rl.laboratorio_id = CAST(:labId AS BIGINT))"
            + " AND (CAST(:tipo AS VARCHAR) IS NULL OR CAST(r.tipo_reserva AS VARCHAR) = CAST(:tipo AS VARCHAR))"
            + " AND (CAST(:carrera AS VARCHAR) IS NULL OR r.carrera = CAST(:carrera AS VARCHAR))"
            + " GROUP BY r.fecha ORDER BY r.fecha", nativeQuery = true)
    List<Object[]> countPorDiaFiltered(LocalDate inicio, LocalDate fin, Long labId, String tipo, String carrera);

    @Query(value = "SELECT TO_CHAR(r.fecha, 'YYYY-MM'), COUNT(*),"
            + " COUNT(*) FILTER (WHERE r.estado = 'COMPLETADA'),"
            + " COUNT(*) FILTER (WHERE r.estado = 'CANCELADA'),"
            + " COUNT(*) FILTER (WHERE r.estado = 'NO_SHOW')"
            + " FROM reservas r JOIN recursos_lab rl ON rl.id = r.recurso_id"
            + " WHERE r.fecha BETWEEN :inicio AND :fin"
            + " AND (:labId IS NULL OR rl.laboratorio_id = CAST(:labId AS BIGINT))"
            + " AND (CAST(:tipo AS VARCHAR) IS NULL OR CAST(r.tipo_reserva AS VARCHAR) = CAST(:tipo AS VARCHAR))"
            + " AND (CAST(:carrera AS VARCHAR) IS NULL OR r.carrera = CAST(:carrera AS VARCHAR))"
            + " GROUP BY 1 ORDER BY 1", nativeQuery = true)
    List<Object[]> countPorMesFiltered(LocalDate inicio, LocalDate fin, Long labId, String tipo, String carrera);

    // Cuenta POR PARTICIPANTE: cada persona de la reserva suma a su carrera (no una por
    // reserva). Las reservas históricas tienen un único participante (su titular) por el
    // backfill de V10, así que sus números se conservan.
    @Query(value = "SELECT p.carrera, COUNT(*)"
            + " FROM reserva_participantes p"
            + " JOIN reservas r ON r.id = p.reserva_id"
            + " JOIN recursos_lab rl ON rl.id = r.recurso_id"
            + " WHERE r.fecha BETWEEN :inicio AND :fin AND r.estado NOT IN ('CANCELADA') AND p.carrera IS NOT NULL"
            + " AND (:labId IS NULL OR rl.laboratorio_id = CAST(:labId AS BIGINT))"
            + " AND (CAST(:tipo AS VARCHAR) IS NULL OR CAST(r.tipo_reserva AS VARCHAR) = CAST(:tipo AS VARCHAR))"
            + " AND (CAST(:carrera AS VARCHAR) IS NULL OR p.carrera = CAST(:carrera AS VARCHAR))"
            + " GROUP BY p.carrera ORDER BY 2 DESC", nativeQuery = true)
    List<Object[]> countPorCarreraFiltered(LocalDate inicio, LocalDate fin, Long labId, String tipo, String carrera);

    @Query("SELECT r FROM Reserva r JOIN FETCH r.recurso rec JOIN FETCH rec.laboratorio"
            + " JOIN FETCH r.usuario WHERE r.fecha BETWEEN :inicio AND :fin"
            + " AND (:labId IS NULL OR rec.laboratorio.id = :labId)"
            + " AND (CAST(:tipo AS string) IS NULL OR r.tipoReserva = :tipo)"
            + " AND (CAST(:carrera AS string) IS NULL OR r.carrera = :carrera)"
            + " ORDER BY r.fecha DESC, r.horaInicio")
    List<Reserva> findAllFiltered(LocalDate inicio, LocalDate fin, Long labId, String tipo, String carrera);

    // Horas RESERVADAS por laboratorio en el periodo (ocupación real, no la foto de "ahora"):
    // suma de la duración (hora_fin − hora_inicio) de las reservas no canceladas. Parte de los
    // labs ACTIVOS con LEFT JOIN → aparecen TODOS (0 h los que no tienen reservas). Los filtros
    // de reserva (fecha/tipo/carrera) van en el ON del LEFT JOIN para no convertirlo en INNER.
    // → (codigoLab, horas).
    @Query(value = "SELECT l.codigo_lab, COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (r.hora_fin - r.hora_inicio)) / 3600.0)::numeric, 1), 0)"
            + " FROM laboratorios l"
            + " LEFT JOIN recursos_lab rl ON rl.laboratorio_id = l.id"
            + " LEFT JOIN reservas r ON r.recurso_id = rl.id"
            + "   AND r.fecha BETWEEN :inicio AND :fin AND CAST(r.estado AS VARCHAR) <> 'CANCELADA'"
            + "   AND (CAST(:tipo AS VARCHAR) IS NULL OR CAST(r.tipo_reserva AS VARCHAR) = CAST(:tipo AS VARCHAR))"
            + "   AND (CAST(:carrera AS VARCHAR) IS NULL OR r.carrera = CAST(:carrera AS VARCHAR))"
            + " WHERE (:labId IS NULL OR l.id = CAST(:labId AS BIGINT))"   // sin filtro de estado: el dashboard es INDEPENDIENTE de activo/inactivo
            + " GROUP BY l.codigo_lab ORDER BY 2 DESC", nativeQuery = true)
    List<Object[]> horasReservadasPorLab(LocalDate inicio, LocalDate fin, Long labId, String tipo, String carrera);

    // Horas de CLASE por laboratorio en el periodo (clases del horario académico = bloqueos
    // recurrentes es_clase). Se cuentan APARTE de reservas/eventos (categoría propia en la
    // ocupación). Cada clase es recurrente (día de la semana + frecuencia), así que sus horas =
    // duración × (nº de veces que cae ese día dentro del periodo). Se descuentan:
    //   - las SEMANAS A/B (quincenales): SEMANA_A solo semanas ISO impares, SEMANA_B pares;
    //   - los días de EXCEPCIÓN del ciclo (exámenes/feriados → no hay clase).
    // La DURACIÓN se recorta a la ventana reservable del lab [hora_apertura, hora_cierre] igual
    // que los eventos, para que numerador y denominador (capacidad) sean coherentes.
    // → (codigoLab, horasClase). Aproximación: usa fecha_inicio/fecha_fin del bloqueo (rango del ciclo).
    @Query(value = "SELECT l.codigo_lab, COALESCE(SUM("
            + "   GREATEST(0, EXTRACT(EPOCH FROM (LEAST(b.hora_fin, l.hora_cierre) - GREATEST(b.hora_inicio, l.hora_apertura))) / 3600.0)"
            + "   * (SELECT COUNT(*) FROM generate_series(GREATEST(b.fecha_inicio, :inicio), LEAST(b.fecha_fin, :fin), interval '1 day') g"
            + "        WHERE EXTRACT(DOW FROM g) = CASE CAST(b.dia_semana AS VARCHAR)"
            + "              WHEN 'LUNES' THEN 1 WHEN 'MARTES' THEN 2 WHEN 'MIERCOLES' THEN 3"
            + "              WHEN 'JUEVES' THEN 4 WHEN 'VIERNES' THEN 5 WHEN 'SABADO' THEN 6 WHEN 'DOMINGO' THEN 0 END"
            + "          AND (CAST(b.frecuencia AS VARCHAR) = 'SEMANA_GENERAL'"
            + "               OR (CAST(b.frecuencia AS VARCHAR) = 'SEMANA_A' AND MOD(EXTRACT(WEEK FROM g)::int, 2) = 1)"
            + "               OR (CAST(b.frecuencia AS VARCHAR) = 'SEMANA_B' AND MOD(EXTRACT(WEEK FROM g)::int, 2) = 0))"
            + "          AND NOT EXISTS (SELECT 1 FROM ciclo_excepciones ce"
            + "               WHERE CAST(ce.ciclo AS VARCHAR) = CAST(b.ciclo AS VARCHAR)"
            + "                 AND g::date BETWEEN ce.fecha_inicio AND ce.fecha_fin))"
            + " ), 0)"
            + " FROM bloqueos b JOIN laboratorios l ON l.id = b.laboratorio_id"
            + " WHERE b.es_clase = true AND b.laboratorio_id IS NOT NULL AND b.activo = true"
            + "   AND b.fecha_inicio <= :fin AND b.fecha_fin >= :inicio"
            + "   AND (:labId IS NULL OR b.laboratorio_id = CAST(:labId AS BIGINT))"
            + " GROUP BY l.codigo_lab", nativeQuery = true)
    List<Object[]> horasClasePorLab(LocalDate inicio, LocalDate fin, Long labId);

    // Rango REAL de fechas con reservas dentro del filtro (para acotar el periodo del % de
    // ocupación: en "Histórico completo" el filtro es 2000–2030 y el denominador se dispararía).
    // → una fila (min_fecha, max_fecha) o (null, null) si no hay reservas.
    @Query(value = "SELECT MIN(r.fecha), MAX(r.fecha) FROM reservas r"
            + " WHERE r.fecha BETWEEN :inicio AND :fin AND CAST(r.estado AS VARCHAR) <> 'CANCELADA'", nativeQuery = true)
    List<Object[]> rangoFechasReservas(LocalDate inicio, LocalDate fin);

    // Horas BLOQUEADAS por laboratorio en el periodo, separadas en OPERATIVAS (ALMUERZO/
    // MANTENIMIENTO/FERIADO → downtime, se restan de la capacidad) y EVENTOS (clase/examen/
    // evento → uso del lab). Por bloqueo: n° recursos × duración × días
    // (TOTAL = todas las mesas; PARCIAL = bloqueo_recursos; el rango de días se acota al periodo
    // efectivo). ⚠️ La DURACIÓN se RECORTA a la ventana reservable del lab [hora_apertura,
    // hora_cierre]: un evento 07:00–23:00 sobre un lab 09:00–18:00 aporta 9h (la intersección),
    // no 16h — así numerador y denominador (capacidad = horario del lab) son coherentes y el %
    // no se dispara. Sin hora (todo el día) = ventana completa del lab. → (codigoLab, operativas, eventos).
    @Query(value = "SELECT l.codigo_lab,"
            + " COALESCE(SUM(CASE WHEN CAST(b.motivo AS VARCHAR) IN ('ALMUERZO','MANTENIMIENTO','FERIADO','RETIRO') THEN h.horas ELSE 0 END), 0),"
            + " COALESCE(SUM(CASE WHEN CAST(b.motivo AS VARCHAR) NOT IN ('ALMUERZO','MANTENIMIENTO','FERIADO','RETIRO') THEN h.horas ELSE 0 END), 0)"
            + " FROM bloqueos b JOIN laboratorios l ON l.id = b.laboratorio_id"
            + " CROSS JOIN LATERAL ("
            + "   SELECT ("
            + "     (CASE WHEN CAST(b.tipo AS VARCHAR) = 'TOTAL'"
            + "           THEN (SELECT COUNT(*) FROM recursos_lab rl WHERE rl.laboratorio_id = b.laboratorio_id)"
            + "           ELSE (SELECT COUNT(*) FROM bloqueo_recursos br WHERE br.bloqueo_id = b.id) END)"
            + "     * (CASE WHEN b.hora_inicio IS NULL THEN EXTRACT(EPOCH FROM (l.hora_cierre - l.hora_apertura)) / 3600.0"
            + "             ELSE GREATEST(0, EXTRACT(EPOCH FROM (LEAST(b.hora_fin, l.hora_cierre) - GREATEST(b.hora_inicio, l.hora_apertura))) / 3600.0) END)"
            + "     * GREATEST(0, (LEAST(b.fecha_fin, :fin) - GREATEST(b.fecha_inicio, :inicio) + 1))"
            + "   ) AS horas ) h"
            + " WHERE b.fecha_inicio <= :fin AND b.fecha_fin >= :inicio AND b.activo = true AND b.es_clase = false"
            + " AND (:labId IS NULL OR b.laboratorio_id = CAST(:labId AS BIGINT))"
            + " GROUP BY l.codigo_lab", nativeQuery = true)
    List<Object[]> horasBloqueadasPorLab(LocalDate inicio, LocalDate fin, Long labId);

    // Cruce CARRERA × LABORATORIO: reservas por participante de cada carrera en cada lab.
    // → (carrera, codigoLab, cantidad).
    @Query(value = "SELECT p.carrera, l.codigo_lab, COUNT(*)"
            + " FROM reserva_participantes p"
            + " JOIN reservas r ON r.id = p.reserva_id"
            + " JOIN recursos_lab rl ON rl.id = r.recurso_id"
            + " JOIN laboratorios l ON l.id = rl.laboratorio_id"
            + " WHERE r.fecha BETWEEN :inicio AND :fin AND CAST(r.estado AS VARCHAR) <> 'CANCELADA' AND p.carrera IS NOT NULL"
            + " AND (:labId IS NULL OR rl.laboratorio_id = CAST(:labId AS BIGINT))"
            + " AND (CAST(:tipo AS VARCHAR) IS NULL OR CAST(r.tipo_reserva AS VARCHAR) = CAST(:tipo AS VARCHAR))"
            + " AND (CAST(:carrera AS VARCHAR) IS NULL OR p.carrera = CAST(:carrera AS VARCHAR))"
            + " GROUP BY p.carrera, l.codigo_lab ORDER BY 3 DESC", nativeQuery = true)
    List<Object[]> countPorCarreraYLab(LocalDate inicio, LocalDate fin, Long labId, String tipo, String carrera);

    // N° de laboratorios DISTINTOS con al menos una reserva (no cancelada) en el filtro.
    // Para el sello de procedencia ("datos de N labs"). → un entero.
    @Query(value = "SELECT COUNT(DISTINCT rl.laboratorio_id)"
            + " FROM reservas r JOIN recursos_lab rl ON rl.id = r.recurso_id"
            + " WHERE r.fecha BETWEEN :inicio AND :fin AND CAST(r.estado AS VARCHAR) <> 'CANCELADA'"
            + " AND (:labId IS NULL OR rl.laboratorio_id = CAST(:labId AS BIGINT))"
            + " AND (CAST(:tipo AS VARCHAR) IS NULL OR CAST(r.tipo_reserva AS VARCHAR) = CAST(:tipo AS VARCHAR))"
            + " AND (CAST(:carrera AS VARCHAR) IS NULL OR r.carrera = CAST(:carrera AS VARCHAR))", nativeQuery = true)
    Integer countLabsConReservas(LocalDate inicio, LocalDate fin, Long labId, String tipo, String carrera);

    // Distribución del TAMAÑO DE GRUPO (participantes por reserva). → (participantes, cantidad).
    @Query(value = "SELECT r.participantes, COUNT(*)"
            + " FROM reservas r JOIN recursos_lab rl ON rl.id = r.recurso_id"
            + " WHERE r.fecha BETWEEN :inicio AND :fin AND CAST(r.estado AS VARCHAR) <> 'CANCELADA'"
            + " AND (:labId IS NULL OR rl.laboratorio_id = CAST(:labId AS BIGINT))"
            + " AND (CAST(:tipo AS VARCHAR) IS NULL OR CAST(r.tipo_reserva AS VARCHAR) = CAST(:tipo AS VARCHAR))"
            + " AND (CAST(:carrera AS VARCHAR) IS NULL OR r.carrera = CAST(:carrera AS VARCHAR))"
            + " GROUP BY r.participantes ORDER BY r.participantes", nativeQuery = true)
    List<Object[]> tamanoGrupo(LocalDate inicio, LocalDate fin, Long labId, String tipo, String carrera);
}

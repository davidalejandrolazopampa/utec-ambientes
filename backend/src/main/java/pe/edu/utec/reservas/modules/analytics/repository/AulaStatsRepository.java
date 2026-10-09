package pe.edu.utec.reservas.modules.analytics.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import pe.edu.utec.reservas.modules.bloqueos.model.Bloqueo;

import java.time.LocalDate;
import java.util.List;

/**
 * Estadísticas del ámbito AULAS. Las clases del horario académico son bloqueos RECURRENTES
 * ({@code es_clase = true}) sobre un aula ({@code aula_id NOT NULL}): se agregan por
 * PROYECCIÓN (día de semana + franja), sin expandir fechas con generate_series sobre el
 * calendario — mucho más barato. Las frecuencias quincenales (SEMANA_A/SEMANA_B) ponderan
 * 0.5 en las horas semanales. Los eventos de aula son los bloqueos normales (no-clase).
 * Gotcha Postgres + stringtype=unspecified: los {@code :param IS NULL} van con CAST (§9).
 */
public interface AulaStatsRepository extends JpaRepository<Bloqueo, Long> {

    // Peso semanal de una clase: SEMANA_A/SEMANA_B se dictan semana por medio → 0.5.
    String FRECUENCIA_PESO = "(CASE WHEN b.frecuencia IN ('SEMANA_A','SEMANA_B') THEN 0.5 ELSE 1 END)";
    // Filtro de ciclo: exacto ("2026-1") o por año (LIKE "2026-%"); ambos opcionales.
    String FILTRO_CICLO = "AND (CAST(:ciclo AS VARCHAR) IS NULL OR b.ciclo = CAST(:ciclo AS VARCHAR)) " +
            "AND (CAST(:anio AS VARCHAR) IS NULL OR b.ciclo LIKE CAST(:anio AS VARCHAR) || '-%') ";

    // KPIs de clases → (totalClases, horasSemanales ponderadas por frecuencia).
    @Query(value = "SELECT COUNT(*), COALESCE(SUM(EXTRACT(EPOCH FROM (b.hora_fin - b.hora_inicio)) / 3600.0 * " +
            FRECUENCIA_PESO + "), 0) " +
            "FROM bloqueos b WHERE b.es_clase = true AND b.aula_id IS NOT NULL " + FILTRO_CICLO,
            nativeQuery = true)
    List<Object[]> kpisClases(String ciclo, String anio);

    // Horas semanales de clase por aula → (codigo, tipo, piso, horasSemana).
    @Query(value = "SELECT a.codigo, a.tipo, a.piso, " +
            "SUM(EXTRACT(EPOCH FROM (b.hora_fin - b.hora_inicio)) / 3600.0 * " + FRECUENCIA_PESO + ") AS horas " +
            "FROM bloqueos b JOIN aulas a ON a.id = b.aula_id " +
            "WHERE b.es_clase = true " + FILTRO_CICLO +
            "GROUP BY a.codigo, a.tipo, a.piso ORDER BY horas DESC", nativeQuery = true)
    List<Object[]> horasPorAula(String ciclo, String anio);

    // Clases y horas semanales por tipo de ambiente → (tipo, clases, horasSemana).
    @Query(value = "SELECT a.tipo, COUNT(*), " +
            "SUM(EXTRACT(EPOCH FROM (b.hora_fin - b.hora_inicio)) / 3600.0 * " + FRECUENCIA_PESO + ") " +
            "FROM bloqueos b JOIN aulas a ON a.id = b.aula_id " +
            "WHERE b.es_clase = true " + FILTRO_CICLO +
            "GROUP BY a.tipo ORDER BY COUNT(*) DESC", nativeQuery = true)
    List<Object[]> clasesPorTipoAmbiente(String ciclo, String anio);

    // Heatmap día × hora: clases ACTIVAS en cada franja horaria (proyección: el generate_series
    // es solo sobre las ~15 horas del día, no sobre el calendario) → (diaSemana, hora, cantidad).
    @Query(value = "SELECT b.dia_semana, gs.h, COUNT(*) " +
            "FROM bloqueos b CROSS JOIN LATERAL generate_series(7, 21) AS gs(h) " +
            "WHERE b.es_clase = true AND b.aula_id IS NOT NULL " + FILTRO_CICLO +
            "AND b.hora_inicio < make_time(gs.h + 1, 0, 0) AND b.hora_fin > make_time(gs.h, 0, 0) " +
            "GROUP BY b.dia_semana, gs.h", nativeQuery = true)
    List<Object[]> heatmapClases(String ciclo, String anio);

    // Eventos de aula (bloqueos NO-clase) por mes → (mes YYYY-MM, cantidad).
    @Query(value = "SELECT to_char(b.fecha_inicio, 'YYYY-MM') AS mes, COUNT(*) " +
            "FROM bloqueos b WHERE b.es_clase = false AND b.aula_id IS NOT NULL " +
            "AND b.fecha_inicio <= :fin AND b.fecha_fin >= :inicio " +
            "GROUP BY mes ORDER BY mes", nativeQuery = true)
    List<Object[]> eventosAulaPorMes(LocalDate inicio, LocalDate fin);
}

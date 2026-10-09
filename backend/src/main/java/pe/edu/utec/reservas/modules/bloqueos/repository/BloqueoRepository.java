package pe.edu.utec.reservas.modules.bloqueos.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import pe.edu.utec.reservas.modules.bloqueos.model.Bloqueo;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public interface BloqueoRepository extends JpaRepository<Bloqueo, Long> {

    // ── Bloqueos "normales" (NO clases): las clases (es_clase=true) se excluyen de estas
    //    consultas para que la página de Bloqueos y la disponibilidad de labs no cambien.
    //    Las clases se consultan aparte (ver más abajo) desde el módulo de Aulas.

    @Query("SELECT b FROM Bloqueo b WHERE b.laboratorio.id = :laboratorioId AND b.activo = true AND b.esClase = false")
    List<Bloqueo> findByLaboratorioIdAndActivoTrue(Long laboratorioId);

    // Bloqueos activos de un AULA (eventos que ocupan el aula; las clases se excluyen).
    @Query("SELECT b FROM Bloqueo b WHERE b.aula.id = :aulaId AND b.activo = true AND b.esClase = false")
    List<Bloqueo> findByAulaIdAndActivoTrue(Long aulaId);

    /** Eventos/bloqueos (no clases) de TODAS las aulas que cubren una fecha — para que la
     *  búsqueda de ambientes libres y la grilla de ocupación reflejen lo que crean los
     *  administrativos, no solo el horario de clases. */
    @Query("SELECT b FROM Bloqueo b WHERE b.activo = true AND b.esClase = false AND b.aula IS NOT NULL " +
            "AND b.fechaInicio <= :fecha AND b.fechaFin >= :fecha")
    List<Bloqueo> findBloqueosAulaEnFecha(LocalDate fecha);

    /** Clases de LABORATORIOS de un ciclo/día (análogo a findClasesAulaByCicloDia). */
    @Query("SELECT b FROM Bloqueo b WHERE b.activo = true AND b.esClase = true " +
            "AND b.ciclo = :ciclo AND b.diaSemana = :dia AND b.laboratorio IS NOT NULL")
    List<Bloqueo> findClasesLabByCicloDia(String ciclo, String dia);

    /** Eventos/bloqueos (no clases) de LABORATORIOS que cubren una fecha (TOTAL y PARCIAL). */
    @Query("SELECT b FROM Bloqueo b WHERE b.activo = true AND b.esClase = false AND b.laboratorio IS NOT NULL " +
            "AND b.fechaInicio <= :fecha AND b.fechaFin >= :fecha")
    List<Bloqueo> findBloqueosLabEnFecha(LocalDate fecha);

    @Query("SELECT b FROM Bloqueo b WHERE b.laboratorio.id = :labId AND b.activo = true AND b.esClase = false " +
            "AND b.fechaInicio <= :fecha AND b.fechaFin >= :fecha")
    List<Bloqueo> findActiveByLaboratorioAndFecha(Long labId, LocalDate fecha);

    @Query("SELECT b FROM Bloqueo b WHERE b.activo = true AND b.esClase = false " +
            "AND b.fechaInicio <= :fecha AND b.fechaFin >= :fecha")
    List<Bloqueo> findAllActiveByFecha(LocalDate fecha);

    @Query("SELECT b FROM Bloqueo b WHERE b.activo = true AND b.esClase = false")
    List<Bloqueo> findByActivoTrue();

    /**
     * Fechas DISTINTAS de feriado operativo (bloqueos motivo=FERIADO, uno por lab) en el rango,
     * con su nombre oficial. Lo usa CicloService.crearAnio para DERIVAR las excepciones
     * académicas FERIADO del calendario (misma lógica que la migración V9, ahora automática).
     */
    @Query(value = "SELECT b.fecha_inicio, MIN(b.descripcion) FROM bloqueos b " +
            "WHERE CAST(b.motivo AS VARCHAR) = 'FERIADO' AND b.activo = true AND b.es_clase = false " +
            "AND b.fecha_inicio BETWEEN :inicio AND :fin " +
            "GROUP BY b.fecha_inicio ORDER BY b.fecha_inicio", nativeQuery = true)
    List<Object[]> findFeriadosOperativosEnRango(LocalDate inicio, LocalDate fin);

    /** Todos los bloqueos activos INCLUYENDO las clases (para el toggle "Mostrar clases" de la página de Bloqueos). */
    @Query("SELECT b FROM Bloqueo b WHERE b.activo = true")
    List<Bloqueo> findByActivoTrueIncluyendoClases();

    // Pares (bloqueo_id, recurso_id) de los bloqueos PARCIALES activos del lab que cubren `fecha`.
    @Query(value = "SELECT br.bloqueo_id, br.recurso_id FROM bloqueo_recursos br " +
            "JOIN bloqueos b ON b.id = br.bloqueo_id " +
            "WHERE b.laboratorio_id = :labId AND b.activo = true AND b.tipo = 'PARCIAL' " +
            "AND b.fecha_inicio <= :fecha AND b.fecha_fin >= :fecha", nativeQuery = true)
    List<Object[]> findParcialRecursoPairs(Long labId, LocalDate fecha);

    // Bloqueos TOTALES que se cruzan con un horario
    @Query("SELECT b FROM Bloqueo b WHERE b.laboratorio.id = :labId AND b.activo = true AND b.esClase = false " +
            "AND b.tipo = 'TOTAL' " +
            "AND b.fechaInicio <= :fecha AND b.fechaFin >= :fecha " +
            "AND ((b.horaInicio IS NULL) OR (b.horaInicio < :horaFin AND b.horaFin > :horaInicio))")
    List<Bloqueo> findBloqueosTotalesEnHorario(Long labId, LocalDate fecha, LocalTime horaInicio, LocalTime horaFin);

    // Bloqueos PARCIALES que incluyen un recurso específico
    @Query(value = "SELECT b.* FROM bloqueos b " +
            "INNER JOIN bloqueo_recursos br ON br.bloqueo_id = b.id " +
            "WHERE b.laboratorio_id = :labId AND b.activo = true " +
            "AND b.tipo = 'PARCIAL' " +
            "AND b.fecha_inicio <= :fecha AND b.fecha_fin >= :fecha " +
            "AND ((b.hora_inicio < :horaFin AND b.hora_fin > :horaInicio)) " +
            "AND br.recurso_id = :recursoId", nativeQuery = true)
    List<Bloqueo> findBloqueosParcialesToRecurso(Long labId, Long recursoId, LocalDate fecha, LocalTime horaInicio, LocalTime horaFin);

    // ── CLASES (bloqueos recurrentes del horario académico) ──

    /** Clases activas de un aula en un ciclo (para el calendario del aula). */
    @Query("SELECT b FROM Bloqueo b WHERE b.aula.id = :aulaId AND b.activo = true AND b.esClase = true " +
            "AND (CAST(:ciclo AS string) IS NULL OR b.ciclo = :ciclo)")
    List<Bloqueo> findClasesByAula(Long aulaId, String ciclo);

    /** Clases activas de un laboratorio en un ciclo (para mostrarlas en el calendario del lab). */
    @Query("SELECT b FROM Bloqueo b WHERE b.laboratorio.id = :labId AND b.activo = true AND b.esClase = true " +
            "AND (CAST(:ciclo AS string) IS NULL OR b.ciclo = :ciclo)")
    List<Bloqueo> findClasesByLaboratorio(Long labId, String ciclo);

    /** Todas las clases activas de un ciclo (para la grilla/búsqueda de aulas libres). */
    @Query("SELECT b FROM Bloqueo b WHERE b.activo = true AND b.esClase = true AND b.ciclo = :ciclo")
    List<Bloqueo> findClasesByCiclo(String ciclo);

    /** Clases de un ciclo filtradas por área (carrera) y/o texto de curso (código/nombre). */
    @Query("SELECT b FROM Bloqueo b JOIN b.curso c WHERE b.activo = true AND b.esClase = true AND b.ciclo = :ciclo " +
            "AND (CAST(:area AS string) IS NULL OR c.area = CAST(:area AS string)) " +
            "AND (CAST(:q AS string) IS NULL OR LOWER(c.nombre) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%')) " +
            "     OR LOWER(c.codCurso) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%')))")
    List<Bloqueo> findClasesByCicloAreaQ(String ciclo, String area, String q);

    /**
     * Clases programadas en un LAB que caen en una fecha concreta (su día de semana está dentro
     * del rango del ciclo) y cruzan la franja — para impedir reservar un lab encima de su clase.
     */
    @Query("SELECT b FROM Bloqueo b WHERE b.activo = true AND b.esClase = true AND b.laboratorio.id = :labId " +
            "AND b.diaSemana = :dia AND b.fechaInicio <= :fecha AND b.fechaFin >= :fecha " +
            "AND b.horaInicio < :horaFin AND b.horaFin > :horaInicio")
    List<Bloqueo> findClasesEnLabParaFechaHora(Long labId, String dia, LocalDate fecha, LocalTime horaInicio, LocalTime horaFin);

    /** Clases (en aulas) de un ciclo/día — para la grilla de ocupación aulas×horas. */
    @Query("SELECT b FROM Bloqueo b WHERE b.activo = true AND b.esClase = true " +
            "AND b.ciclo = :ciclo AND b.diaSemana = :dia AND b.aula IS NOT NULL")
    List<Bloqueo> findClasesAulaByCicloDia(String ciclo, String dia);

    /** IDs de aulas ocupadas por alguna clase en ese ciclo/día y franja (para "buscar libres"). */
    @Query("SELECT DISTINCT b.aula.id FROM Bloqueo b WHERE b.activo = true AND b.esClase = true " +
            "AND b.ciclo = :ciclo AND b.diaSemana = :dia AND b.aula IS NOT NULL " +
            "AND b.horaInicio < :horaFin AND b.horaFin > :horaInicio")
    List<Long> findAulaIdsOcupadas(String ciclo, String dia, LocalTime horaInicio, LocalTime horaFin);

    /**
     * Laboratorios con OCUPACIÓN para el selector de ambiente del calendario: clases del ciclo
     * O eventos/bloqueos (así aparecen también labs como L108, que tiene eventos pero no clases).
     */
    @Query("SELECT DISTINCT b.laboratorio FROM Bloqueo b WHERE b.activo = true AND b.laboratorio IS NOT NULL " +
            "AND (b.esClase = false OR b.ciclo = :ciclo)")
    List<pe.edu.utec.reservas.modules.laboratorios.model.Laboratorio> findLaboratoriosConOcupacion(String ciclo);

    /** Áreas (prefijos de curso) que tienen clases en el ciclo — alimenta el filtro de carrera/área. */
    @Query("SELECT DISTINCT c.area FROM Bloqueo b JOIN b.curso c WHERE b.activo = true AND b.esClase = true " +
            "AND b.ciclo = :ciclo AND c.area IS NOT NULL ORDER BY c.area")
    List<String> findAreasConClases(String ciclo);

    /** Cursos DISTINTOS con clases en el ciclo, filtrables por área y texto — para la sección Cursos. */
    @Query("SELECT DISTINCT c FROM Bloqueo b JOIN b.curso c WHERE b.activo = true AND b.esClase = true AND b.ciclo = :ciclo " +
            "AND (CAST(:area AS string) IS NULL OR c.area = CAST(:area AS string)) " +
            "AND (CAST(:q AS string) IS NULL OR LOWER(c.nombre) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%')) " +
            "     OR LOWER(c.codCurso) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%'))) " +
            "ORDER BY c.codCurso")
    List<pe.edu.utec.reservas.modules.aulas.model.Curso> findCursosConClases(String ciclo, String area, String q);

    /** Clases de un curso concreto en el ciclo (para ver su horario). */
    @Query("SELECT b FROM Bloqueo b WHERE b.activo = true AND b.esClase = true AND b.ciclo = :ciclo AND b.curso.id = :cursoId")
    List<Bloqueo> findClasesByCurso(String ciclo, Long cursoId);

    /** ¿Ya hay una clase en ese AULA, mismo ciclo/día, con la franja cruzada? (dedup/solape en import). */
    @Query("SELECT COUNT(b) > 0 FROM Bloqueo b WHERE b.activo = true AND b.esClase = true " +
            "AND b.aula.id = :aulaId AND b.ciclo = :ciclo AND b.diaSemana = :diaSemana " +
            "AND b.horaInicio < :horaFin AND b.horaFin > :horaInicio")
    boolean existeClaseSolapadaAula(Long aulaId, String ciclo, String diaSemana,
                                    LocalTime horaInicio, LocalTime horaFin);

    /** ¿Ya hay una clase en ese LAB, mismo ciclo/día, con la franja cruzada? */
    @Query("SELECT COUNT(b) > 0 FROM Bloqueo b WHERE b.activo = true AND b.esClase = true " +
            "AND b.laboratorio.id = :labId AND b.ciclo = :ciclo AND b.diaSemana = :diaSemana " +
            "AND b.horaInicio < :horaFin AND b.horaFin > :horaInicio")
    boolean existeClaseSolapadaLab(Long labId, String ciclo, String diaSemana,
                                   LocalTime horaInicio, LocalTime horaFin);
}

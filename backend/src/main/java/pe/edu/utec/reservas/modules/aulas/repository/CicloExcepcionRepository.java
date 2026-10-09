package pe.edu.utec.reservas.modules.aulas.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import pe.edu.utec.reservas.modules.aulas.model.CicloExcepcion;

import java.time.LocalDate;
import java.util.List;

public interface CicloExcepcionRepository extends JpaRepository<CicloExcepcion, Long> {

    List<CicloExcepcion> findByCicloOrderByFechaInicioAsc(String ciclo);

    /** ¿La fecha cae en alguna excepción (examen/feriado) del ciclo? → ese día NO hay clases. */
    @Query("SELECT COUNT(e) > 0 FROM CicloExcepcion e WHERE e.ciclo = :ciclo " +
            "AND e.fechaInicio <= :fecha AND e.fechaFin >= :fecha")
    boolean esDiaSinClases(String ciclo, LocalDate fecha);

    /**
     * ¿La fecha cae en un CIERRE institucional? Es GENERAL (todo UTEC), así que no filtra por
     * ciclo. Un CIERRE, además de detener clases, bloquea las reservas de labs ese día
     * (lo usa ReservaService).
     */
    @Query("SELECT COUNT(e) > 0 FROM CicloExcepcion e WHERE e.tipo = 'CIERRE' " +
            "AND e.fechaInicio <= :fecha AND e.fechaFin >= :fecha")
    boolean esCierreInstitucional(LocalDate fecha);

    /** Excepciones de CIERRE institucional que se cruzan con el rango [inicio, fin] (para el dashboard). */
    @Query("SELECT e FROM CicloExcepcion e WHERE e.tipo = 'CIERRE' " +
            "AND e.fechaInicio <= :fin AND e.fechaFin >= :inicio")
    List<CicloExcepcion> findCierresEnRango(LocalDate inicio, LocalDate fin);
}

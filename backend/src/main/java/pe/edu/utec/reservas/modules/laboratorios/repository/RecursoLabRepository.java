package pe.edu.utec.reservas.modules.laboratorios.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pe.edu.utec.reservas.modules.laboratorios.model.RecursoLab;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface RecursoLabRepository extends JpaRepository<RecursoLab, Long> {

    List<RecursoLab> findByLaboratorioIdAndActivoTrue(Long laboratorioId);

    Optional<RecursoLab> findByQrCode(String qrCode);

    /**
     * Recursos marcados OCUPADO sin ninguna reserva EN_CURSO de hoy que lo justifique
     * (estado huérfano). El estado OCUPADO solo lo pone el check-in; los bloqueos no
     * tocan recurso.estado, así que estos recursos pueden liberarse con seguridad.
     */
    @Query("""
            SELECT r FROM RecursoLab r
            WHERE r.estado = 'OCUPADO'
              AND NOT EXISTS (
                SELECT 1 FROM Reserva res
                WHERE res.recurso = r
                  AND res.estado = 'EN_CURSO'
                  AND res.fecha = :hoy)
            """)
    List<RecursoLab> findOcupadosHuerfanos(@Param("hoy") LocalDate hoy);

    @Query("SELECT COUNT(r) FROM RecursoLab r WHERE r.laboratorio.id = :labId AND r.estado = 'DISPONIBLE' AND r.activo = true")
    Integer countDisponiblesByLaboratorioId(Long labId);

    @Query("SELECT COUNT(r) FROM RecursoLab r WHERE r.laboratorio.id = :labId AND r.activo = true")
    Integer countByLaboratorioId(Long labId);

    void deleteByLaboratorioId(Long laboratorioId);
}
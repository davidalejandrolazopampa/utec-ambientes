package pe.edu.utec.reservas.modules.laboratorios.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pe.edu.utec.reservas.modules.laboratorios.model.Laboratorio;
import java.util.List;
import java.util.Optional;
public interface LaboratorioRepository extends JpaRepository<Laboratorio, Long> {
    Optional<Laboratorio> findByCodigoLab(String codigoLab);
    List<Laboratorio> findByPiso(Integer piso);
    List<Laboratorio> findByUbicacionFase(String fase);
    List<Laboratorio> findByEstado(String estado);
    boolean existsByCodigoLab(String codigoLab);
    List<Laboratorio> findByDirectorId(Long directorId);
    long countByDepartamentoId(Long departamentoId);

    @Modifying
    @Query("UPDATE Laboratorio l SET l.departamentoId = null WHERE l.departamentoId = :departamentoId")
    int desvincularDepartamento(@Param("departamentoId") Long departamentoId);
}

package pe.edu.utec.reservas.modules.aulas.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import pe.edu.utec.reservas.modules.aulas.model.CicloAcademico;

import java.util.List;

public interface CicloAcademicoRepository extends JpaRepository<CicloAcademico, Long> {
    List<CicloAcademico> findAllByOrderByAnioDescCicloAsc();
    boolean existsByAnio(Integer anio);
    java.util.Optional<CicloAcademico> findByAnioAndCiclo(Integer anio, Integer ciclo);
}

package pe.edu.utec.reservas.modules.aulas.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import pe.edu.utec.reservas.modules.aulas.model.Curso;

import java.util.List;
import java.util.Optional;

public interface CursoRepository extends JpaRepository<Curso, Long> {

    Optional<Curso> findByCodCurso(String codCurso);

    boolean existsByCodCurso(String codCurso);

    List<Curso> findByCarreraIdOrderByCodCursoAsc(Long carreraId);
}

package pe.edu.utec.reservas.modules.aulas.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import pe.edu.utec.reservas.modules.aulas.model.Aula;

import java.util.List;
import java.util.Optional;

public interface AulaRepository extends JpaRepository<Aula, Long> {

    Optional<Aula> findByCodigo(String codigo);

    List<Aula> findByActivoTrueOrderByCodigoAsc();

    List<Aula> findByTipoAndActivoTrueOrderByCodigoAsc(String tipo);

    boolean existsByCodigo(String codigo);

    long countByActivoTrue();
}

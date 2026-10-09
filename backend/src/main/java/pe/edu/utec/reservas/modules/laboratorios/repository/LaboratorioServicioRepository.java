package pe.edu.utec.reservas.modules.laboratorios.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import pe.edu.utec.reservas.modules.laboratorios.model.LaboratorioServicio;

import java.util.List;

public interface LaboratorioServicioRepository extends JpaRepository<LaboratorioServicio, Long> {
    List<LaboratorioServicio> findByLaboratorioIdOrderById(Long laboratorioId);
    void deleteByLaboratorioId(Long laboratorioId);
}

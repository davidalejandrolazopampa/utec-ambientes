package pe.edu.utec.reservas.modules.laboratorios.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import pe.edu.utec.reservas.modules.laboratorios.model.Carrera;

import java.util.List;

public interface CarreraRepository extends JpaRepository<Carrera, Long> {
    List<Carrera> findByFacultadId(Long facultadId);
    List<Carrera> findByDepartamentoId(Long departamentoId);
}
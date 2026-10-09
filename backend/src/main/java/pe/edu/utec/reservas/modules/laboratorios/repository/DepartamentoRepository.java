package pe.edu.utec.reservas.modules.laboratorios.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import pe.edu.utec.reservas.modules.laboratorios.model.Departamento;

import java.util.List;
import java.util.Optional;

public interface DepartamentoRepository extends JpaRepository<Departamento, Long> {
    List<Departamento> findByFacultadId(Long facultadId);
    List<Departamento> findByFacultadIdIsNull();
    // Departamento que dirige un director (cascada director → departamento → facultad).
    Optional<Departamento> findFirstByDirectorId(Long directorId);
}
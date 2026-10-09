package pe.edu.utec.reservas.modules.laboratorios.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import pe.edu.utec.reservas.modules.laboratorios.model.Facultad;

public interface FacultadRepository extends JpaRepository<Facultad, Long> {
}
package pe.edu.utec.reservas.modules.iam.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import pe.edu.utec.reservas.modules.iam.model.Role;

import java.util.Optional;

public interface RoleRepository extends JpaRepository<Role, Long> {

    Optional<Role> findByNombre(String nombre);
}
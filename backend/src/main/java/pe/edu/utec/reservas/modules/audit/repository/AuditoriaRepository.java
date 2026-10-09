package pe.edu.utec.reservas.modules.audit.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import pe.edu.utec.reservas.modules.audit.model.AuditoriaReserva;

import java.time.LocalDateTime;
import java.util.List;

public interface AuditoriaRepository extends JpaRepository<AuditoriaReserva, Long> {

    List<AuditoriaReserva> findByReservaIdOrderByCreatedAtDesc(Long reservaId);

    List<AuditoriaReserva> findByUsuarioIdOrderByCreatedAtDesc(Long usuarioId);

    Page<AuditoriaReserva> findByCreatedAtBetweenOrderByCreatedAtDesc(
            LocalDateTime inicio, LocalDateTime fin, Pageable pageable);

    Page<AuditoriaReserva> findAllByOrderByCreatedAtDesc(Pageable pageable);
}
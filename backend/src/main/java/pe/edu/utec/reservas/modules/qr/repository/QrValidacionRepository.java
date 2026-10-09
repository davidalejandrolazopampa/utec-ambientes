package pe.edu.utec.reservas.modules.qr.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import pe.edu.utec.reservas.modules.qr.model.QrValidacion;

import java.util.List;

public interface QrValidacionRepository extends JpaRepository<QrValidacion, Long> {

    List<QrValidacion> findByReservaId(Long reservaId);

    boolean existsByReservaIdAndResultado(Long reservaId, String resultado);
}
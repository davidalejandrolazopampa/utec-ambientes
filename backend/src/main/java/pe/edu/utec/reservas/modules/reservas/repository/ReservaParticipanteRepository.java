package pe.edu.utec.reservas.modules.reservas.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pe.edu.utec.reservas.modules.reservas.model.ReservaParticipante;

import java.util.List;

public interface ReservaParticipanteRepository extends JpaRepository<ReservaParticipante, Long> {
    List<ReservaParticipante> findByReservaId(Long reservaId);

    // Carga en UNA query los participantes de varias reservas (evita N+1 al armar
    // el listado de gestión). El titular primero (es_titular=true).
    List<ReservaParticipante> findByReservaIdInOrderByEsTitularDescNombreCompletoAsc(List<Long> reservaIds);

    // Bulk delete inmediato (evita que las inserciones del reemplazo choquen con las filas
    // viejas en el constraint único reserva_id+correo_utec).
    @Modifying
    @Query("DELETE FROM ReservaParticipante p WHERE p.reserva.id = :reservaId")
    void deleteByReservaId(@Param("reservaId") Long reservaId);
}

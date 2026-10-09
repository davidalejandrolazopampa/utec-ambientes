package pe.edu.utec.reservas.modules.audit.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.utec.reservas.modules.audit.dto.AuditoriaResponse;
import pe.edu.utec.reservas.modules.audit.model.AuditoriaReserva;
import pe.edu.utec.reservas.modules.audit.repository.AuditoriaRepository;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.reservas.model.Reserva;

import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuditoriaService {

    private final AuditoriaRepository auditoriaRepository;

    /**
     * Registra una acción de auditoría sobre una reserva.
     * Se llama internamente desde los servicios de reservas.
     */
    @Transactional
    public void registrar(Reserva reserva, Usuario usuario, String accion,
                          Map<String, Object> antes, Map<String, Object> despues,
                          String ipAddress) {

        AuditoriaReserva audit = AuditoriaReserva.builder()
                .reserva(reserva)
                .usuario(usuario)
                .accion(accion)
                .valoresAnteriores(antes)
                .valoresNuevos(despues)
                .ipAddress(ipAddress)
                .build();

        auditoriaRepository.save(audit);

        log.info("Auditoría - Reserva: {} | Acción: {} | Usuario: {}",
                reserva.getId(), accion, usuario.getCorreoUtec());
    }

    /**
     * Lista auditoría paginada.
     */
    @Transactional(readOnly = true)
    public Page<AuditoriaResponse> listar(int page, int size) {
        Pageable pageable = PageRequest.of(page, size);
        return auditoriaRepository.findAllByOrderByCreatedAtDesc(pageable)
                .map(this::toResponse);
    }

    /**
     * Historial de auditoría de una reserva específica.
     */
    @Transactional(readOnly = true)
    public List<AuditoriaResponse> historialReserva(Long reservaId) {
        return auditoriaRepository.findByReservaIdOrderByCreatedAtDesc(reservaId).stream()
                .map(this::toResponse)
                .toList();
    }

    /**
     * Historial de acciones de un usuario.
     */
    @Transactional(readOnly = true)
    public List<AuditoriaResponse> historialUsuario(Long usuarioId) {
        return auditoriaRepository.findByUsuarioIdOrderByCreatedAtDesc(usuarioId).stream()
                .map(this::toResponse)
                .toList();
    }

    private AuditoriaResponse toResponse(AuditoriaReserva a) {
        return AuditoriaResponse.builder()
                .id(a.getId())
                .reservaId(a.getReserva().getId())
                .usuarioCorreo(a.getUsuario().getCorreoUtec())
                .usuarioNombre(a.getUsuario().getNombreCompleto())
                .accion(a.getAccion())
                .valoresAnteriores(a.getValoresAnteriores())
                .valoresNuevos(a.getValoresNuevos())
                .ipAddress(a.getIpAddress())
                .createdAt(a.getCreatedAt())
                .build();
    }
}
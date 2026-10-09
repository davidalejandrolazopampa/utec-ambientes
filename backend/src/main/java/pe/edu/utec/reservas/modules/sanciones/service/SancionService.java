package pe.edu.utec.reservas.modules.sanciones.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.iam.repository.UsuarioRepository;
import pe.edu.utec.reservas.modules.laboratorios.model.Laboratorio;
import pe.edu.utec.reservas.modules.laboratorios.repository.LaboratorioRepository;
import pe.edu.utec.reservas.modules.sanciones.dto.CreateSancionRequest;
import pe.edu.utec.reservas.modules.sanciones.dto.SancionResponse;
import pe.edu.utec.reservas.modules.sanciones.model.Sancion;
import pe.edu.utec.reservas.modules.sanciones.repository.SancionRepository;
import pe.edu.utec.reservas.shared.exceptions.BusinessException;
import pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class SancionService {

    private final SancionRepository sancionRepository;
    private final UsuarioRepository usuarioRepository;
    private final LaboratorioRepository laboratorioRepository;

    @Transactional
    public List<SancionResponse> crear(CreateSancionRequest req, String creadoPor) {
        Usuario usuario = usuarioRepository.findById(req.getUsuarioId())
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "id", req.getUsuarioId()));

        if (req.getMotivo() == null || req.getMotivo().isBlank()) {
            throw new BusinessException("El motivo de la sanción es obligatorio", "MISSING_REASON");
        }
        LocalDate inicio = req.getFechaInicio() != null ? req.getFechaInicio() : LocalDate.now();
        if (req.getFechaFin() != null && req.getFechaFin().isBefore(inicio)) {
            throw new BusinessException("La fecha de fin no puede ser anterior a la de inicio", "INVALID_RANGE");
        }

        // laboratorioIds vacío/null → una sola sanción global (laboratorio_id NULL = todos los labs).
        List<Long> labIds = (req.getLaboratorioIds() == null || req.getLaboratorioIds().isEmpty())
                ? java.util.Collections.singletonList(null)
                : req.getLaboratorioIds();

        List<Sancion> creadas = new ArrayList<>();
        for (Long labId : labIds) {
            if (labId != null && !laboratorioRepository.existsById(labId)) {
                throw new ResourceNotFoundException("Laboratorio", "id", labId);
            }
            creadas.add(sancionRepository.save(Sancion.builder()
                    .usuarioId(usuario.getId())
                    .laboratorioId(labId)
                    .motivo(req.getMotivo().trim())
                    .fechaInicio(inicio)
                    .fechaFin(req.getFechaFin())
                    .creadoPor(creadoPor)
                    .activo(true)
                    .build()));
        }
        return creadas.stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<SancionResponse> listarPorUsuario(Long usuarioId) {
        return sancionRepository.findByUsuarioIdOrderByActivoDescFechaInicioDesc(usuarioId)
                .stream().map(this::toResponse).toList();
    }

    /** Todas las sanciones activas del sistema (vista global del gestor). */
    @Transactional(readOnly = true)
    public List<SancionResponse> listarActivas() {
        return sancionRepository.findByActivoTrueOrderByFechaInicioDesc()
                .stream().map(this::toResponse).toList();
    }

    /** Las sanciones VIGENTES (en efecto hoy) del alumno logueado — para su propio aviso. */
    @Transactional(readOnly = true)
    public List<SancionResponse> misVigentes(String correo) {
        Usuario u = usuarioRepository.findByCorreoUtec(correo)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "correo", correo));
        return sancionRepository.findByUsuarioIdOrderByActivoDescFechaInicioDesc(u.getId())
                .stream().map(this::toResponse)
                .filter(r -> Boolean.TRUE.equals(r.getVigente()))
                .toList();
    }

    /** Levantar una sanción = marcarla inactiva (conserva el historial). */
    @Transactional
    public SancionResponse levantar(Long id) {
        Sancion s = sancionRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Sancion", "id", id));
        s.setActivo(false);
        return toResponse(sancionRepository.save(s));
    }

    private SancionResponse toResponse(Sancion s) {
        String usuarioNombre = usuarioRepository.findById(s.getUsuarioId())
                .map(Usuario::getNombreCompleto).orElse(null);
        String labCodigo = s.getLaboratorioId() == null ? null
                : laboratorioRepository.findById(s.getLaboratorioId())
                    .map(Laboratorio::getCodigoLab).orElse(null);
        LocalDate hoy = LocalDate.now();
        boolean vigente = Boolean.TRUE.equals(s.getActivo())
                && !s.getFechaInicio().isAfter(hoy)
                && (s.getFechaFin() == null || !s.getFechaFin().isBefore(hoy));
        return SancionResponse.builder()
                .id(s.getId())
                .usuarioId(s.getUsuarioId())
                .usuarioNombre(usuarioNombre)
                .laboratorioId(s.getLaboratorioId())
                .laboratorioCodigo(labCodigo)
                .motivo(s.getMotivo())
                .fechaInicio(s.getFechaInicio())
                .fechaFin(s.getFechaFin())
                .creadoPor(s.getCreadoPor())
                .activo(s.getActivo())
                .vigente(vigente)
                .build();
    }
}

package pe.edu.utec.reservas.modules.iam.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.utec.reservas.modules.iam.dto.CreateUsuarioRequest;
import pe.edu.utec.reservas.modules.iam.dto.UpdateUsuarioRequest;
import pe.edu.utec.reservas.modules.iam.dto.UsuarioResponse;
import pe.edu.utec.reservas.modules.iam.dto.UsuarioPageResponse;
import pe.edu.utec.reservas.modules.iam.model.Role;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.iam.repository.RoleRepository;
import pe.edu.utec.reservas.modules.iam.repository.UsuarioRepository;
import pe.edu.utec.reservas.shared.exceptions.BusinessException;
import pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException;

import java.time.LocalDateTime;
import java.util.List;
import jakarta.persistence.EntityManager;

@Slf4j
@Service
@RequiredArgsConstructor
public class UsuarioService {

    private final UsuarioRepository usuarioRepository;
    private final RoleRepository roleRepository;
    private final EntityManager entityManager;

    @Transactional(readOnly = true)
    public List<UsuarioResponse> listarTodos() {
        return usuarioRepository.findAll().stream()
                .map(this::toResponse)
                .toList();
    }

    /**
     * Administrativos VISIBLES para quien consulta (lista pequeña; no trae los miles de alumnos).
     * Alcance por rol del directorio de Personas: ADMIN ve todos; COORDINADOR solo DIRECTOR y
     * RESPONSABLE_LAB (su gente de labs); DOCENCIA solo a los de DOCENCIA. El filtro vive AQUÍ
     * (no solo en el frontend) para que un rol acotado no liste al resto por API directa.
     */
    @Transactional(readOnly = true)
    public List<UsuarioResponse> listarAdministrativos(String correoCaller) {
        String rolCaller = usuarioRepository.findByCorreoUtec(correoCaller)
                .map(u -> u.getRol().getNombre()).orElse("");
        List<Usuario> lista = switch (rolCaller) {
            case "COORDINADOR" -> usuarioRepository.findByRol_NombreIn(List.of("DIRECTOR", "RESPONSABLE_LAB"));
            case "DOCENCIA" -> usuarioRepository.findByRol_NombreIn(List.of("DOCENCIA", "DOCENTE"));  // el counter ve a sus docentes
            default -> usuarioRepository.findByRol_NombreNot("ESTUDIANTE");   // ADMIN
        };
        return lista.stream()
                .map(this::toResponse)
                .toList();
    }

    /** Búsqueda PAGINADA con filtros (rol/estado/texto). Para listar alumnos sin cargarlos todos. */
    @Transactional(readOnly = true)
    public UsuarioPageResponse buscar(String q, String rol, Boolean activo, int page, int size) {
        String patron = (q == null || q.isBlank()) ? null : "%" + q.trim().toLowerCase() + "%";
        String roln = (rol == null || rol.isBlank()) ? null : rol.trim();
        var pageable = org.springframework.data.domain.PageRequest.of(
                Math.max(0, page), Math.min(Math.max(1, size), 200),
                org.springframework.data.domain.Sort.by("apellidos", "nombres"));
        var pg = usuarioRepository.buscar(patron, roln, activo, pageable);
        return UsuarioPageResponse.builder()
                .content(pg.getContent().stream().map(this::toResponse).toList())
                .total(pg.getTotalElements()).page(pg.getNumber()).size(pg.getSize())
                .totalPages(pg.getTotalPages()).build();
    }

    /** Conteo de usuarios por rol (para los chips del encabezado). → {ROL: cantidad}. */
    @Transactional(readOnly = true)
    public java.util.Map<String, Long> conteoPorRol() {
        java.util.Map<String, Long> m = new java.util.LinkedHashMap<>();
        for (Object[] r : usuarioRepository.contarPorRol()) {
            m.put((String) r[0], ((Number) r[1]).longValue());
        }
        return m;
    }

    @Transactional(readOnly = true)
    public UsuarioResponse obtenerPorId(Long id) {
        Usuario usuario = usuarioRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "id", id));
        return toResponse(usuario);
    }

    @Transactional(readOnly = true)
    public UsuarioResponse obtenerPorCorreo(String correo) {
        Usuario usuario = usuarioRepository.findByCorreoUtec(correo)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "correo", correo));
        return toResponse(usuario);
    }

    @Transactional
    public UsuarioResponse crear(CreateUsuarioRequest request) {
        if (request.getNombres() == null || request.getNombres().isBlank()
                || request.getApellidos() == null || request.getApellidos().isBlank()) {
            throw new BusinessException("Nombres y apellidos son obligatorios", "VALIDATION");
        }
        String correo = request.getCorreoUtec() == null ? "" : request.getCorreoUtec().trim().toLowerCase();
        if (!correo.endsWith("@utec.edu.pe")) {
            throw new BusinessException("El correo debe ser del dominio @utec.edu.pe", "VALIDATION");
        }
        if (usuarioRepository.findByCorreoUtec(correo).isPresent()) {
            throw new BusinessException("Ya existe un usuario con ese correo", "DUPLICATE");
        }
        Role rol = roleRepository.findByNombre(request.getRol())
                .orElseThrow(() -> new ResourceNotFoundException("Rol", "nombre", request.getRol()));

        Usuario usuario = Usuario.builder()
                .correoUtec(correo)
                .nombres(request.getNombres().trim())
                .apellidos(request.getApellidos().trim())
                .rol(rol)
                .cargo(request.getCargo())
                .departamentoId(request.getDepartamentoId())
                .carrera(request.getCarrera() != null && !request.getCarrera().isBlank() ? request.getCarrera().trim() : null)
                .activo(true)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
        usuario = usuarioRepository.save(usuario);
        log.info("Usuario creado manualmente - ID: {} | Correo: {}", usuario.getId(), correo);
        return toResponse(usuario);
    }

    @Transactional
    public UsuarioResponse actualizar(Long id, UpdateUsuarioRequest request) {
        Usuario usuario = usuarioRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "id", id));

        if (request.getNombres() != null) {
            usuario.setNombres(request.getNombres());
        }
        if (request.getApellidos() != null) {
            usuario.setApellidos(request.getApellidos());
        }
        if (request.getCargo() != null) {
            usuario.setCargo(request.getCargo());
        }
        if (request.getActivo() != null) {
            usuario.setActivo(request.getActivo());
        }
        if (request.getRolId() != null) {
            Role nuevoRol = roleRepository.findById(request.getRolId())
                    .orElseThrow(() -> new ResourceNotFoundException("Rol", "id", request.getRolId()));
            usuario.setRol(nuevoRol);
        } else if (request.getRol() != null && !request.getRol().isBlank()) {
            // Alternativa por nombre (la usa el modal de persona de OrganizacionPage).
            Role nuevoRol = roleRepository.findByNombre(request.getRol())
                    .orElseThrow(() -> new ResourceNotFoundException("Rol", "nombre", request.getRol()));
            usuario.setRol(nuevoRol);
        }
        if (request.getDepartamentoId() != null) {
            // 0 = quitar el departamento; >0 = asignarlo
            usuario.setDepartamentoId(request.getDepartamentoId() == 0 ? null : request.getDepartamentoId());
        }
        if (request.getCarrera() != null) {
            // "" limpia la carrera; un nombre la asigna. Solo se usa para alumnos.
            usuario.setCarrera(request.getCarrera().isBlank() ? null : request.getCarrera());
        }

        usuario = usuarioRepository.save(usuario);

        // Propagar nombre/carrera a las COPIAS denormalizadas de las reservas. Tanto
        // reserva_participantes (nombre_completo, carrera) como reservas.carrera son
        // snapshots tomados al reservar; sin esto, editar la persona en Organización no
        // se reflejaba en Gestión de Reservas. Política: sobrescribir SIEMPRE con el
        // valor actual del perfil (incluye reservas históricas).
        if (request.getNombres() != null || request.getApellidos() != null || request.getCarrera() != null) {
            entityManager.flush();
            String nombreCompleto = (usuario.getNombres() + " " + usuario.getApellidos()).trim();
            entityManager.createNativeQuery(
                    "UPDATE reserva_participantes SET nombre_completo = :nom, carrera = CAST(:car AS varchar) WHERE usuario_id = :uid")
                    .setParameter("nom", nombreCompleto)
                    .setParameter("car", usuario.getCarrera())
                    .setParameter("uid", usuario.getId())
                    .executeUpdate();
            entityManager.createNativeQuery(
                    "UPDATE reservas SET carrera = CAST(:car AS varchar) WHERE usuario_id = :uid")
                    .setParameter("car", usuario.getCarrera())
                    .setParameter("uid", usuario.getId())
                    .executeUpdate();
        }

        log.info("Usuario actualizado - ID: {} | Correo: {}", id, usuario.getCorreoUtec());

        return toResponse(usuario);
    }

    @Transactional
    public UsuarioResponse desactivar(Long id) {
        Usuario usuario = usuarioRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "id", id));

        usuario.setActivo(false);
        usuario = usuarioRepository.save(usuario);

        log.info("Usuario desactivado - ID: {} | Correo: {}", id, usuario.getCorreoUtec());

        return toResponse(usuario);
    }

    @Transactional
    public void asignarLaboratorio(Long usuarioId, Long labId) {
        entityManager.createNativeQuery(
                        "INSERT INTO lab_responsables (laboratorio_id, usuario_id) VALUES (:labId, :userId) ON CONFLICT DO NOTHING")
                .setParameter("labId", labId)
                .setParameter("userId", usuarioId)
                .executeUpdate();
        log.info("Lab {} asignado a usuario {}", labId, usuarioId);
    }

    @Transactional
    public void quitarLaboratorio(Long usuarioId, Long labId) {
        entityManager.createNativeQuery(
                        "DELETE FROM lab_responsables WHERE laboratorio_id = :labId AND usuario_id = :userId")
                .setParameter("labId", labId)
                .setParameter("userId", usuarioId)
                .executeUpdate();
        log.info("Lab {} quitado de usuario {}", labId, usuarioId);
    }

    @Transactional(readOnly = true)
    public List<UsuarioResponse> listarPorRol(String rolNombre) {
        return usuarioRepository.findByRol_Nombre(rolNombre).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public void asignarResponsableADirector(Long directorId, Long responsableId) {
        entityManager.createNativeQuery(
                        "INSERT INTO director_responsables (director_id, responsable_id) VALUES (:did, :rid) ON CONFLICT DO NOTHING")
                .setParameter("did", directorId)
                .setParameter("rid", responsableId)
                .executeUpdate();
        log.info("Responsable {} asignado a director {}", responsableId, directorId);
    }

    @Transactional
    public void quitarResponsableDeDirector(Long directorId, Long responsableId) {
        entityManager.createNativeQuery(
                        "DELETE FROM director_responsables WHERE director_id = :did AND responsable_id = :rid")
                .setParameter("did", directorId)
                .setParameter("rid", responsableId)
                .executeUpdate();
        log.info("Responsable {} quitado de director {}", responsableId, directorId);
    }

    @Transactional
    public void asignarLabComoDirector(Long directorId, Long labId) {
        entityManager.createNativeQuery(
                        "UPDATE laboratorios SET director_id = :did WHERE id = :lid")
                .setParameter("did", directorId)
                .setParameter("lid", labId)
                .executeUpdate();
        log.info("Lab {} asignado a director {}", labId, directorId);
    }

    @Transactional
    public void quitarLabComoDirector(Long directorId, Long labId) {
        entityManager.createNativeQuery(
                        "UPDATE laboratorios SET director_id = NULL WHERE id = :lid AND director_id = :did")
                .setParameter("did", directorId)
                .setParameter("lid", labId)
                .executeUpdate();
        log.info("Lab {} quitado de director {}", labId, directorId);
    }

    private UsuarioResponse toResponse(Usuario u) {
        List<String> labsAsignados = null;
        String rolNombre = u.getRol().getNombre();

        if ("RESPONSABLE_LAB".equals(rolNombre)) {
            try {
                @SuppressWarnings("unchecked")
                List<Object[]> labs = entityManager.createNativeQuery(
                                "SELECT l.codigo_lab, l.nombre FROM lab_responsables lr " +
                                        "JOIN laboratorios l ON l.id = lr.laboratorio_id WHERE lr.usuario_id = :uid")
                        .setParameter("uid", u.getId())
                        .getResultList();
                labsAsignados = labs.stream().map(row -> row[0] + " - " + row[1]).toList();
            } catch (Exception ignored) {}
        } else if ("DIRECTOR".equals(rolNombre)) {
            try {
                @SuppressWarnings("unchecked")
                List<Object[]> labs = entityManager.createNativeQuery(
                                "SELECT l.codigo_lab, l.nombre FROM laboratorios l WHERE l.director_id = :uid")
                        .setParameter("uid", u.getId())
                        .getResultList();
                labsAsignados = labs.stream().map(row -> row[0] + " - " + row[1]).toList();
            } catch (Exception ignored) {}
        }

        return UsuarioResponse.builder()
                .id(u.getId())
                .correoUtec(u.getCorreoUtec())
                .nombres(u.getNombres())
                .apellidos(u.getApellidos())
                .nombreCompleto(u.getNombreCompleto())
                .rol(rolNombre)
                .cargo(u.getCargo())
                .carrera(u.getCarrera())
                .departamentoId(u.getDepartamentoId())
                .avatarUrl(u.getAvatarUrl())
                .activo(u.getActivo())
                .lastLogin(u.getLastLogin())
                .createdAt(u.getCreatedAt())
                .laboratoriosAsignados(labsAsignados)
                .build();
    }

    @Transactional(readOnly = true)
    public List<UsuarioResponse> listarPorDirector(Long directorId) {
        List<Long> responsableIds = usuarioRepository.findResponsableIdsByDirectorId(directorId);
        return usuarioRepository.findAllById(responsableIds).stream()
                .map(this::toResponse)
                .toList();
    }

    /** Directores que dirigen un departamento de la facultad dada. */
    @Transactional(readOnly = true)
    public List<UsuarioResponse> listarDirectoresPorFacultad(Long facultadId) {
        return usuarioRepository.findDirectoresByFacultadId(facultadId).stream()
                .map(this::toResponse)
                .toList();
    }

    /** Director de un responsable (cascada inversa). null si no tiene director vinculado. */
    @Transactional(readOnly = true)
    public UsuarioResponse directorDe(Long responsableId) {
        return usuarioRepository.findDirectorIdByResponsableId(responsableId)
                .flatMap(usuarioRepository::findById)
                .map(this::toResponse)
                .orElse(null);
    }

    @Transactional
    public void eliminar(Long id) {
        Usuario usuario = usuarioRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "id", id));
        usuarioRepository.delete(usuario);
        log.info("Usuario eliminado - {}", usuario.getCorreoUtec());
    }

}
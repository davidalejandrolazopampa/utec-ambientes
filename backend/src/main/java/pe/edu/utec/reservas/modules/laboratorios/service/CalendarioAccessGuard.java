package pe.edu.utec.reservas.modules.laboratorios.service;

import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.iam.repository.UsuarioRepository;
import pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException;

import java.util.List;

/**
 * Guarda de acceso al CALENDARIO de un laboratorio (endpoints de lectura
 * {@code /reservas/laboratorio/{id}} y {@code /bloqueos/laboratorio/{id}}).
 *
 * <p>Regla de visibilidad (distinta de {@code asegurarAccesoAlLab}, que es para
 * GESTIÓN): <b>ADMIN, COORDINADOR y ESTUDIANTE ven el calendario de cualquier
 * laboratorio</b> (los alumnos necesitan ver disponibilidad para reservar);
 * <b>DIRECTOR y RESPONSABLE_LAB solo ven los laboratorios que les corresponden</b>
 * (director: los de su dirección/depto; responsable: los asignados). Fuera de eso
 * → 403.
 */
@Component
@RequiredArgsConstructor
public class CalendarioAccessGuard {

    private final UsuarioRepository usuarioRepository;
    private final EntityManager entityManager;

    /** Lanza {@link AccessDeniedException} si el usuario no puede ver el calendario del lab. */
    @Transactional(readOnly = true)
    public void asegurarAccesoCalendario(Long labId, String correoUsuario) {
        Usuario usuario = usuarioRepository.findByCorreoUtec(correoUsuario)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "correo", correoUsuario));
        String rol = usuario.getRol().getNombre();

        // Estos roles ven el calendario de todos los labs.
        if ("ADMIN".equals(rol) || "COORDINADOR".equals(rol) || "ESTUDIANTE".equals(rol)) return;

        if (!labIdsDeUsuario(usuario).contains(labId)) {
            throw new AccessDeniedException("No tienes acceso al calendario de este laboratorio");
        }
    }

    /** IDs de los labs que un DIRECTOR/RESPONSABLE_LAB puede ver (misma lógica que BloqueoService). */
    private List<Long> labIdsDeUsuario(Usuario usuario) {
        String sql = "DIRECTOR".equals(usuario.getRol().getNombre())
                ? "SELECT DISTINCT l.id FROM laboratorios l WHERE l.director_id = :uid "
                    + "UNION SELECT DISTINCT lr.laboratorio_id FROM lab_responsables lr "
                    + "INNER JOIN usuarios u ON u.id = lr.usuario_id "
                    + "INNER JOIN departamentos d ON d.id = u.departamento_id WHERE d.director_id = :uid"
                : "SELECT laboratorio_id FROM lab_responsables WHERE usuario_id = :uid";
        @SuppressWarnings("unchecked")
        List<Number> ids = entityManager.createNativeQuery(sql)
                .setParameter("uid", usuario.getId())
                .getResultList();
        return ids.stream().map(Number::longValue).toList();
    }
}

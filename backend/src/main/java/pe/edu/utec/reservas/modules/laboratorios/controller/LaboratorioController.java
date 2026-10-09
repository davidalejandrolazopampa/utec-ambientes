package pe.edu.utec.reservas.modules.laboratorios.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.persistence.EntityManager;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import pe.edu.utec.reservas.modules.iam.repository.UsuarioRepository;
import pe.edu.utec.reservas.modules.laboratorios.dto.CreateLaboratorioRequest;
import pe.edu.utec.reservas.modules.laboratorios.dto.LaboratorioResponse;
import pe.edu.utec.reservas.modules.laboratorios.dto.RecursoLabResponse;
import pe.edu.utec.reservas.modules.laboratorios.repository.LaboratorioRepository;
import pe.edu.utec.reservas.modules.laboratorios.service.LaboratorioService;
import pe.edu.utec.reservas.shared.dto.ApiResponse;
import pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/laboratorios")
@RequiredArgsConstructor
@Tag(name = "Laboratorios", description = "Gestión de laboratorios y recursos")
public class LaboratorioController {

    private final LaboratorioService laboratorioService;
    private final LaboratorioRepository laboratorioRepository;
    private final UsuarioRepository usuarioRepository;
    private final EntityManager entityManager;

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR')")
    @Operation(summary = "Crear laboratorio", description = "Crea un laboratorio con generación automática de recursos.")
    public ResponseEntity<ApiResponse<LaboratorioResponse>> crear(
            @Valid @RequestBody CreateLaboratorioRequest request) {
        LaboratorioResponse lab = laboratorioService.crear(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(lab, "Laboratorio creado exitosamente"));
    }

    @GetMapping("/admin/todos")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR')")
    @Operation(summary = "Listar todos los laboratorios", description = "Incluye activos e inactivos. Solo admin.")
    public ResponseEntity<ApiResponse<List<LaboratorioResponse>>> listarTodosAdmin() {
        return ResponseEntity.ok(ApiResponse.ok(laboratorioService.listarTodosIncluyendoInactivos()));
    }

    @GetMapping
    @Operation(summary = "Listar laboratorios", description = "Lista todos los laboratorios activos. Permite filtrar por piso o fase.")
    public ResponseEntity<ApiResponse<List<LaboratorioResponse>>> listar(
            @RequestParam(required = false) Integer piso,
            @RequestParam(required = false) String fase) {
        List<LaboratorioResponse> labs;
        if (piso != null) {
            labs = laboratorioService.listarPorPiso(piso);
        } else if (fase != null) {
            labs = laboratorioService.listarPorFase(fase);
        } else {
            labs = laboratorioService.listarTodos();
        }
        return ResponseEntity.ok(ApiResponse.ok(labs));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Detalle laboratorio", description = "Obtiene el detalle completo de un laboratorio por ID.")
    public ResponseEntity<ApiResponse<LaboratorioResponse>> obtenerPorId(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(laboratorioService.obtenerPorId(id)));
    }

    @GetMapping("/codigo/{codigo}")
    @Operation(summary = "Buscar por código", description = "Busca un laboratorio por su código (ej: L108).")
    public ResponseEntity<ApiResponse<LaboratorioResponse>> obtenerPorCodigo(@PathVariable String codigo) {
        return ResponseEntity.ok(ApiResponse.ok(laboratorioService.obtenerPorCodigo(codigo)));
    }

    @GetMapping("/{id}/recursos")
    @Operation(summary = "Recursos del laboratorio", description = "Lista todas las mesas/PCs de un laboratorio.")
    public ResponseEntity<ApiResponse<List<RecursoLabResponse>>> listarRecursos(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(laboratorioService.listarRecursos(id)));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR')")
    @Operation(summary = "Eliminar laboratorio")
    public ResponseEntity<ApiResponse<Void>> eliminar(@PathVariable Long id) {
        laboratorioService.eliminar(id);
        return ResponseEntity.ok(ApiResponse.<Void>ok(null));
    }

    @PutMapping("/{id}/estado")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR')")
    @Operation(summary = "Cambiar estado del laboratorio")
    public ResponseEntity<ApiResponse<LaboratorioResponse>> cambiarEstado(
            @PathVariable Long id, @RequestParam String estado) {
        return ResponseEntity.ok(ApiResponse.ok(laboratorioService.cambiarEstado(id, estado)));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR','RESPONSABLE_LAB')")
    @Operation(summary = "Editar laboratorio")
    public ResponseEntity<ApiResponse<LaboratorioResponse>> editar(
            @PathVariable Long id,
            @Valid @RequestBody CreateLaboratorioRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(laboratorioService.editar(id, request)));
    }

    @PostMapping("/{id}/recursos")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR','RESPONSABLE_LAB')")
    @Operation(summary = "Agregar recurso a laboratorio")
    public ResponseEntity<ApiResponse<RecursoLabResponse>> agregarRecurso(
            @PathVariable Long id,
            @RequestBody Map<String, Object> request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(laboratorioService.agregarRecurso(id, request), "Recurso agregado"));
    }

    @PutMapping("/{labId}/recursos/{recursoId}")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR','RESPONSABLE_LAB')")
    @Operation(summary = "Editar recurso (capacidad/nombre) de laboratorio")
    public ResponseEntity<ApiResponse<RecursoLabResponse>> editarRecurso(
            @PathVariable Long labId, @PathVariable Long recursoId,
            @RequestBody Map<String, Object> request) {
        return ResponseEntity.ok(ApiResponse.ok(laboratorioService.editarRecurso(labId, recursoId, request)));
    }

    @DeleteMapping("/{labId}/recursos/{recursoId}")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR','RESPONSABLE_LAB')")
    @Operation(summary = "Eliminar recurso de laboratorio")
    public ResponseEntity<ApiResponse<Void>> eliminarRecurso(
            @PathVariable Long labId, @PathVariable Long recursoId) {
        laboratorioService.eliminarRecurso(labId, recursoId);
        return ResponseEntity.ok(ApiResponse.<Void>ok(null));
    }
    @Transactional
    @PatchMapping("/{labId}/director/{directorId}")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR')")
    @Operation(summary = "Asignar director a laboratorio")
    public ResponseEntity<ApiResponse<String>> asignarDirector(
            @PathVariable Long labId, @PathVariable Long directorId) {
        laboratorioRepository.findById(labId)
                .orElseThrow(() -> new ResourceNotFoundException("Laboratorio", "id", labId));
        usuarioRepository.findById(directorId)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "id", directorId));
        entityManager.createNativeQuery("UPDATE laboratorios SET director_id = :dirId WHERE id = :labId")
                .setParameter("dirId", directorId)
                .setParameter("labId", labId)
                .executeUpdate();
        return ResponseEntity.ok(ApiResponse.ok("Director asignado"));
    }

    @Transactional
    @PostMapping("/{labId}/responsables/{userId}")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR')")
    @Operation(summary = "Asignar responsable a laboratorio con auto-cascada")
    public ResponseEntity<ApiResponse<String>> asignarResponsable(
            @PathVariable Long labId, @PathVariable Long userId) {
        laboratorioRepository.findById(labId)
                .orElseThrow(() -> new ResourceNotFoundException("Laboratorio", "id", labId));
        usuarioRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "id", userId));

        // 1. Asignar responsable al lab
        entityManager.createNativeQuery(
                        "INSERT INTO lab_responsables (laboratorio_id, usuario_id) VALUES (:labId, :userId) ON CONFLICT DO NOTHING")
                .setParameter("labId", labId)
                .setParameter("userId", userId)
                .executeUpdate();

        // 2. Auto-cascada: buscar director del responsable
        List<?> dirResults = entityManager.createNativeQuery(
                        "SELECT director_id FROM director_responsables WHERE responsable_id = :uid LIMIT 1")
                .setParameter("uid", userId)
                .getResultList();

        if (!dirResults.isEmpty()) {
            Long directorId = ((Number) dirResults.get(0)).longValue();

            // 3. Asignar director al lab
            entityManager.createNativeQuery(
                            "UPDATE laboratorios SET director_id = :dirId WHERE id = :labId AND (director_id IS NULL OR director_id != :dirId)")
                    .setParameter("dirId", directorId)
                    .setParameter("labId", labId)
                    .executeUpdate();

            // 4. Auto-cascada: buscar departamento del director
            List<?> depResults = entityManager.createNativeQuery(
                            "SELECT id FROM departamentos WHERE director_id = :dirId LIMIT 1")
                    .setParameter("dirId", directorId)
                    .getResultList();

            if (!depResults.isEmpty()) {
                Long depId = ((Number) depResults.get(0)).longValue();
                entityManager.createNativeQuery(
                                "UPDATE laboratorios SET departamento_id = :depId WHERE id = :labId")
                        .setParameter("depId", depId)
                        .setParameter("labId", labId)
                        .executeUpdate();
            }
        }

        // 5. Herencia: el responsable pertenece al departamento de su lab, para que se vea
        //    en Organización → Personas (antes usuarios.departamento_id quedaba NULL).
        entityManager.createNativeQuery(
                        "UPDATE usuarios SET departamento_id = l.departamento_id " +
                        "FROM laboratorios l WHERE usuarios.id = :userId AND l.id = :labId AND l.departamento_id IS NOT NULL")
                .setParameter("userId", userId)
                .setParameter("labId", labId)
                .executeUpdate();

        return ResponseEntity.ok(ApiResponse.ok("Responsable asignado (director y departamento auto-vinculados)"));
    }

    @Transactional
    @DeleteMapping("/{labId}/responsables/{userId}")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR')")
    @Operation(summary = "Remover responsable de laboratorio")
    public ResponseEntity<ApiResponse<String>> removerResponsable(
            @PathVariable Long labId, @PathVariable Long userId) {
        entityManager.createNativeQuery(
                        "DELETE FROM lab_responsables WHERE laboratorio_id = :labId AND usuario_id = :userId")
                .setParameter("labId", labId)
                .setParameter("userId", userId)
                .executeUpdate();
        return ResponseEntity.ok(ApiResponse.ok("Responsable removido"));
    }

    @GetMapping("/mis-laboratorios")
    @Operation(summary = "Labs del usuario", description = "Devuelve labs según el rol: admin=todos, director=sus labs, responsable=sus labs asignados")
    public ResponseEntity<ApiResponse<List<LaboratorioResponse>>> misLaboratorios(
            @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(ApiResponse.ok(laboratorioService.listarPorUsuario(userDetails.getUsername())));
    }
}
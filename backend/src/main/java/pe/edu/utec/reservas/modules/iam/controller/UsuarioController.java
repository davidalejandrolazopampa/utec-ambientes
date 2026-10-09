package pe.edu.utec.reservas.modules.iam.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import pe.edu.utec.reservas.modules.iam.dto.CreateUsuarioRequest;
import pe.edu.utec.reservas.modules.iam.dto.UpdateUsuarioRequest;
import pe.edu.utec.reservas.modules.iam.dto.UsuarioResponse;
import pe.edu.utec.reservas.modules.iam.dto.UsuarioPageResponse;
import pe.edu.utec.reservas.modules.iam.service.UsuarioService;
import pe.edu.utec.reservas.shared.dto.ApiResponse;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/usuarios")
@RequiredArgsConstructor
@Tag(name = "Usuarios", description = "Gestión de usuarios del sistema")
public class UsuarioController {

    private final UsuarioService usuarioService;

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR')")
    @Operation(summary = "Listar usuarios", description = "Lista todos los usuarios del sistema.")
    public ResponseEntity<ApiResponse<List<UsuarioResponse>>> listar() {
        return ResponseEntity.ok(ApiResponse.ok(usuarioService.listarTodos()));
    }

    @GetMapping("/administrativos")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR','DOCENCIA')")
    @Operation(summary = "Listar administrativos", description = "Administrativos VISIBLES según quien consulta: ADMIN todos; COORDINADOR solo directores y responsables; DOCENCIA solo docencia.")
    public ResponseEntity<ApiResponse<List<UsuarioResponse>>> listarAdministrativos(
            @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(ApiResponse.ok(usuarioService.listarAdministrativos(userDetails.getUsername())));
    }

    @GetMapping("/buscar")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR')")
    @Operation(summary = "Buscar usuarios (paginado)", description = "Búsqueda paginada con filtros rol/estado/texto (p. ej. alumnos sin cargarlos todos).")
    public ResponseEntity<ApiResponse<UsuarioPageResponse>> buscar(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String rol,
            @RequestParam(required = false) Boolean activo,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return ResponseEntity.ok(ApiResponse.ok(usuarioService.buscar(q, rol, activo, page, size)));
    }

    @GetMapping("/conteo-roles")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR')")
    @Operation(summary = "Conteo por rol", description = "Cantidad de usuarios por rol (para los chips del encabezado).")
    public ResponseEntity<ApiResponse<Map<String, Long>>> conteoRoles() {
        return ResponseEntity.ok(ApiResponse.ok(usuarioService.conteoPorRol()));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR')")
    @Operation(summary = "Crear usuario", description = "Alta manual de un usuario (sin esperar al login con Google).")
    public ResponseEntity<ApiResponse<UsuarioResponse>> crear(@RequestBody CreateUsuarioRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(usuarioService.crear(request)));
    }

    @GetMapping("/me")
    @Operation(summary = "Mi perfil", description = "Retorna los datos del usuario autenticado.")
    public ResponseEntity<ApiResponse<UsuarioResponse>> miPerfil(
            @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(ApiResponse.ok(
                usuarioService.obtenerPorCorreo(userDetails.getUsername())));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR')")
    @Operation(summary = "Obtener usuario", description = "Obtiene un usuario por ID.")
    public ResponseEntity<ApiResponse<UsuarioResponse>> obtener(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(usuarioService.obtenerPorId(id)));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR')")
    @Operation(summary = "Actualizar usuario", description = "Actualiza datos y rol de un usuario.")
    public ResponseEntity<ApiResponse<UsuarioResponse>> actualizar(
            @PathVariable Long id,
            @RequestBody UpdateUsuarioRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(usuarioService.actualizar(id, request)));
    }

    @PatchMapping("/{id}/desactivar")
    @PreAuthorize("hasAnyRole('ADMIN')")
    @Operation(summary = "Desactivar usuario", description = "Desactiva un usuario del sistema.")
    public ResponseEntity<ApiResponse<UsuarioResponse>> desactivar(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(usuarioService.desactivar(id)));
    }

    @GetMapping("/por-director/{directorId}")
    @Operation(summary = "Responsables por director", description = "Lista los responsables asignados a un director.")
    public ResponseEntity<ApiResponse<List<UsuarioResponse>>> porDirector(@PathVariable Long directorId) {
        return ResponseEntity.ok(ApiResponse.ok(usuarioService.listarPorDirector(directorId)));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN')")
    @Operation(summary = "Eliminar usuario", description = "Elimina un usuario del sistema.")
    public ResponseEntity<ApiResponse<Void>> eliminar(@PathVariable Long id) {
        usuarioService.eliminar(id);
        return ResponseEntity.ok(ApiResponse.<Void>ok(null));
    }

    @PostMapping("/{id}/laboratorios/{labId}")
    @PreAuthorize("hasAnyRole('ADMIN')")
    @Operation(summary = "Asignar laboratorio a responsable")
    public ResponseEntity<ApiResponse<Void>> asignarLab(@PathVariable Long id, @PathVariable Long labId) {
        usuarioService.asignarLaboratorio(id, labId);
        return ResponseEntity.ok(ApiResponse.<Void>ok(null));
    }

    @DeleteMapping("/{id}/laboratorios/{labId}")
    @PreAuthorize("hasAnyRole('ADMIN')")
    @Operation(summary = "Quitar laboratorio de responsable")
    public ResponseEntity<ApiResponse<Void>> quitarLab(@PathVariable Long id, @PathVariable Long labId) {
        usuarioService.quitarLaboratorio(id, labId);
        return ResponseEntity.ok(ApiResponse.<Void>ok(null));
    }

    @GetMapping("/responsables")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR')")
    @Operation(summary = "Listar responsables de lab")
    public ResponseEntity<ApiResponse<List<UsuarioResponse>>> listarResponsables() {
        return ResponseEntity.ok(ApiResponse.ok(usuarioService.listarPorRol("RESPONSABLE_LAB")));
    }

    @GetMapping("/directores")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR')")
    @Operation(summary = "Listar directores", description = "Todos, o solo los de una facultad (facultadId).")
    public ResponseEntity<ApiResponse<List<UsuarioResponse>>> listarDirectores(
            @RequestParam(required = false) Long facultadId) {
        List<UsuarioResponse> data = facultadId != null
                ? usuarioService.listarDirectoresPorFacultad(facultadId)
                : usuarioService.listarPorRol("DIRECTOR");
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @GetMapping("/director-de/{responsableId}")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR')")
    @Operation(summary = "Director de un responsable", description = "Cascada inversa responsable → director. Vacío si no tiene.")
    public ResponseEntity<ApiResponse<UsuarioResponse>> directorDe(@PathVariable Long responsableId) {
        return ResponseEntity.ok(ApiResponse.ok(usuarioService.directorDe(responsableId)));
    }

    @PostMapping("/{directorId}/responsables/{responsableId}")
    @PreAuthorize("hasAnyRole('ADMIN')")
    @Operation(summary = "Asignar responsable a director")
    public ResponseEntity<ApiResponse<Void>> asignarResponsable(
            @PathVariable Long directorId, @PathVariable Long responsableId) {
        usuarioService.asignarResponsableADirector(directorId, responsableId);
        return ResponseEntity.ok(ApiResponse.<Void>ok(null));
    }

    @DeleteMapping("/{directorId}/responsables/{responsableId}")
    @PreAuthorize("hasAnyRole('ADMIN')")
    @Operation(summary = "Quitar responsable de director")
    public ResponseEntity<ApiResponse<Void>> quitarResponsable(
            @PathVariable Long directorId, @PathVariable Long responsableId) {
        usuarioService.quitarResponsableDeDirector(directorId, responsableId);
        return ResponseEntity.ok(ApiResponse.<Void>ok(null));
    }

    @PostMapping("/{directorId}/labs-dirige/{labId}")
    @PreAuthorize("hasAnyRole('ADMIN')")
    @Operation(summary = "Asignar laboratorio a director (como director)")
    public ResponseEntity<ApiResponse<Void>> asignarLabDirector(
            @PathVariable Long directorId, @PathVariable Long labId) {
        usuarioService.asignarLabComoDirector(directorId, labId);
        return ResponseEntity.ok(ApiResponse.<Void>ok(null));
    }

    @DeleteMapping("/{directorId}/labs-dirige/{labId}")
    @PreAuthorize("hasAnyRole('ADMIN')")
    @Operation(summary = "Quitar laboratorio de director")
    public ResponseEntity<ApiResponse<Void>> quitarLabDirector(
            @PathVariable Long directorId, @PathVariable Long labId) {
        usuarioService.quitarLabComoDirector(directorId, labId);
        return ResponseEntity.ok(ApiResponse.<Void>ok(null));
    }
}
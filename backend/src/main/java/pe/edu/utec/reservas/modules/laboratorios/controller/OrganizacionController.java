package pe.edu.utec.reservas.modules.laboratorios.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import pe.edu.utec.reservas.modules.iam.repository.UsuarioRepository;
import pe.edu.utec.reservas.modules.laboratorios.model.Carrera;
import pe.edu.utec.reservas.modules.laboratorios.model.Departamento;
import pe.edu.utec.reservas.modules.laboratorios.model.Facultad;
import pe.edu.utec.reservas.modules.laboratorios.repository.CarreraRepository;
import pe.edu.utec.reservas.modules.laboratorios.repository.DepartamentoRepository;
import pe.edu.utec.reservas.modules.laboratorios.repository.FacultadRepository;
import pe.edu.utec.reservas.modules.laboratorios.repository.LaboratorioRepository;
import pe.edu.utec.reservas.shared.dto.ApiResponse;
import pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/v1/organizacion")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('ADMIN')")
@Tag(name = "Organización", description = "CRUD de facultades y departamentos")
public class OrganizacionController {

    private final FacultadRepository facultadRepository;
    private final DepartamentoRepository departamentoRepository;
    private final CarreraRepository carreraRepository;
    private final LaboratorioRepository laboratorioRepository;
    private final UsuarioRepository usuarioRepository;

    // ─── Facultades ───

    @GetMapping("/facultades")
    @Operation(summary = "Listar facultades")
    public ResponseEntity<ApiResponse<List<Facultad>>> listarFacultades() {
        return ResponseEntity.ok(ApiResponse.ok(facultadRepository.findAll()));
    }

    @PostMapping("/facultades")
    @Operation(summary = "Crear facultad")
    public ResponseEntity<ApiResponse<Facultad>> crearFacultad(@RequestBody Map<String, String> body) {
        String tipo = "DIRECCION".equals(body.get("tipo")) ? "DIRECCION" : "FACULTAD";
        Facultad f = Facultad.builder().nombre(body.get("nombre")).tipo(tipo).build();
        return ResponseEntity.ok(ApiResponse.ok(facultadRepository.save(f)));
    }

    @PutMapping("/facultades/{id}")
    @Operation(summary = "Editar facultad")
    public ResponseEntity<ApiResponse<Facultad>> editarFacultad(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        Facultad f = facultadRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Facultad", "id", id));
        if (body.containsKey("nombre")) f.setNombre((String) body.get("nombre"));
        if (body.containsKey("decanoId")) f.setDecanoId(body.get("decanoId") != null ? Long.valueOf(body.get("decanoId").toString()) : null);
        if (body.containsKey("tipo")) f.setTipo("DIRECCION".equals(body.get("tipo")) ? "DIRECCION" : "FACULTAD");
        return ResponseEntity.ok(ApiResponse.ok(facultadRepository.save(f)));
    }

    @DeleteMapping("/facultades/{id}")
    @Operation(summary = "Eliminar facultad")
    public ResponseEntity<ApiResponse<Void>> eliminarFacultad(@PathVariable Long id) {
        facultadRepository.deleteById(id);
        return ResponseEntity.ok(ApiResponse.<Void>ok(null));
    }

    // ─── Departamentos ───

    @GetMapping("/departamentos")
    @Operation(summary = "Listar departamentos")
    public ResponseEntity<ApiResponse<List<Departamento>>> listarDepartamentos(
            @RequestParam(required = false) Long facultadId) {
        List<Departamento> deps = facultadId != null
                ? departamentoRepository.findByFacultadId(facultadId)
                : departamentoRepository.findAll();
        return ResponseEntity.ok(ApiResponse.ok(deps));
    }

    @PostMapping("/departamentos")
    @Operation(summary = "Crear departamento")
    public ResponseEntity<ApiResponse<Departamento>> crearDepartamento(@RequestBody Map<String, Object> body) {
        Departamento d = Departamento.builder()
                .nombre((String) body.get("nombre"))
                .facultadId(body.get("facultadId") != null ? Long.valueOf(body.get("facultadId").toString()) : null)
                .build();
        return ResponseEntity.ok(ApiResponse.ok(departamentoRepository.save(d)));
    }

    @PutMapping("/departamentos/{id}")
    @Operation(summary = "Editar departamento")
    public ResponseEntity<ApiResponse<Departamento>> editarDepartamento(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        Departamento d = departamentoRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Departamento", "id", id));
        if (body.containsKey("nombre")) d.setNombre((String) body.get("nombre"));
        if (body.containsKey("facultadId")) d.setFacultadId(body.get("facultadId") != null ? Long.valueOf(body.get("facultadId").toString()) : null);
        if (body.containsKey("directorId")) d.setDirectorId(body.get("directorId") != null ? Long.valueOf(body.get("directorId").toString()) : null);
        Departamento guardado = departamentoRepository.save(d);
        // Herencia: el director que dirige este departamento pertenece a él (para verlo en Personas).
        if (body.containsKey("directorId") && guardado.getDirectorId() != null) {
            usuarioRepository.findById(guardado.getDirectorId()).ifPresent(u -> {
                u.setDepartamentoId(guardado.getId());
                usuarioRepository.save(u);
            });
        }
        return ResponseEntity.ok(ApiResponse.ok(guardado));
    }

    @DeleteMapping("/departamentos/{id}")
    @Operation(summary = "Eliminar departamento")
    @Transactional
    public ResponseEntity<ApiResponse<Void>> eliminarDepartamento(@PathVariable Long id) {
        if (!departamentoRepository.existsById(id)) {
            throw new ResourceNotFoundException("Departamento", "id", id);
        }
        // Desvincula (departamento_id → null) los labs y usuarios que lo referencian, para no
        // violar las FK RESTRICT (laboratorios/usuarios) al borrar. Las carreras se desvinculan
        // solas por su FK ON DELETE SET NULL. Así el borrado se puede hacer desde la UI.
        int labs = laboratorioRepository.desvincularDepartamento(id);
        int usuarios = usuarioRepository.desvincularDepartamento(id);
        departamentoRepository.deleteById(id);
        log.info("Departamento {} eliminado (desvinculados {} labs, {} usuarios)", id, labs, usuarios);
        return ResponseEntity.ok(ApiResponse.<Void>ok(null));
    }

    // ─── Carreras ───

    @GetMapping("/carreras")
    @Operation(summary = "Listar carreras")
    public ResponseEntity<ApiResponse<List<Carrera>>> listarCarreras(
            @RequestParam(required = false) Long facultadId,
            @RequestParam(required = false) Long departamentoId) {
        List<Carrera> carreras = departamentoId != null
                ? carreraRepository.findByDepartamentoId(departamentoId)
                : facultadId != null
                    ? carreraRepository.findByFacultadId(facultadId)
                    : carreraRepository.findAll();
        return ResponseEntity.ok(ApiResponse.ok(carreras));
    }

    @PostMapping("/carreras")
    @Operation(summary = "Crear carrera")
    public ResponseEntity<ApiResponse<Carrera>> crearCarrera(@RequestBody Map<String, Object> body) {
        Carrera c = Carrera.builder()
                .nombre((String) body.get("nombre"))
                .facultadId(body.get("facultadId") != null ? Long.valueOf(body.get("facultadId").toString()) : null)
                .departamentoId(body.get("departamentoId") != null ? Long.valueOf(body.get("departamentoId").toString()) : null)
                .build();
        return ResponseEntity.ok(ApiResponse.ok(carreraRepository.save(c)));
    }

    @PutMapping("/carreras/{id}")
    @Operation(summary = "Editar carrera")
    public ResponseEntity<ApiResponse<Carrera>> editarCarrera(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        Carrera c = carreraRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Carrera", "id", id));
        if (body.containsKey("nombre")) c.setNombre((String) body.get("nombre"));
        if (body.containsKey("facultadId")) c.setFacultadId(body.get("facultadId") != null ? Long.valueOf(body.get("facultadId").toString()) : null);
        if (body.containsKey("departamentoId")) c.setDepartamentoId(body.get("departamentoId") != null ? Long.valueOf(body.get("departamentoId").toString()) : null);
        return ResponseEntity.ok(ApiResponse.ok(carreraRepository.save(c)));
    }

    @DeleteMapping("/carreras/{id}")
    @Operation(summary = "Eliminar carrera")
    public ResponseEntity<ApiResponse<Void>> eliminarCarrera(@PathVariable Long id) {
        carreraRepository.deleteById(id);
        return ResponseEntity.ok(ApiResponse.<Void>ok(null));
    }
}
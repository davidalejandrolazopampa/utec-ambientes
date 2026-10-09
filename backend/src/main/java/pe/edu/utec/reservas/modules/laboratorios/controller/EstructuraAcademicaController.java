package pe.edu.utec.reservas.modules.laboratorios.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import pe.edu.utec.reservas.modules.laboratorios.model.Carrera;
import pe.edu.utec.reservas.modules.laboratorios.model.Departamento;
import pe.edu.utec.reservas.modules.laboratorios.model.Facultad;
import pe.edu.utec.reservas.modules.laboratorios.repository.CarreraRepository;
import pe.edu.utec.reservas.modules.laboratorios.repository.DepartamentoRepository;
import pe.edu.utec.reservas.modules.laboratorios.repository.FacultadRepository;
import pe.edu.utec.reservas.shared.dto.ApiResponse;

import java.util.List;

@RestController
@RequestMapping("/api/v1/estructura")
@RequiredArgsConstructor
@Tag(name = "Estructura Académica", description = "Facultades, departamentos y carreras")
public class EstructuraAcademicaController {

    private final FacultadRepository facultadRepository;
    private final DepartamentoRepository departamentoRepository;
    private final CarreraRepository carreraRepository;

    @GetMapping("/facultades")
    @Operation(summary = "Listar facultades")
    public ResponseEntity<ApiResponse<List<Facultad>>> facultades() {
        return ResponseEntity.ok(ApiResponse.ok(facultadRepository.findAll()));
    }

    @GetMapping("/departamentos")
    @Operation(summary = "Listar departamentos")
    public ResponseEntity<ApiResponse<List<Departamento>>> departamentos(
            @RequestParam(required = false) Long facultadId) {
        List<Departamento> deps;
        if (facultadId != null) {
            deps = departamentoRepository.findByFacultadId(facultadId);
            // También incluir los que no tienen facultad (ej: Dirección de Proyectos)
            deps.addAll(departamentoRepository.findByFacultadIdIsNull());
        } else {
            deps = departamentoRepository.findAll();
        }
        return ResponseEntity.ok(ApiResponse.ok(deps));
    }

    @GetMapping("/carreras")
    @Operation(summary = "Listar carreras", description = "Todas, o filtrar por departamentoId (precede) o facultadId")
    public ResponseEntity<ApiResponse<List<Carrera>>> carreras(
            @RequestParam(required = false) Long facultadId,
            @RequestParam(required = false) Long departamentoId) {
        List<Carrera> carreras;
        if (departamentoId != null) {
            carreras = carreraRepository.findByDepartamentoId(departamentoId);
        } else if (facultadId != null) {
            carreras = carreraRepository.findByFacultadId(facultadId);
        } else {
            carreras = carreraRepository.findAll();
        }
        return ResponseEntity.ok(ApiResponse.ok(carreras));
    }

    @GetMapping("/departamento-por-director/{directorId}")
    @Operation(summary = "Departamento que dirige un director",
            description = "Cascada director → departamento (y su facultad). Vacío si no dirige ninguno.")
    public ResponseEntity<ApiResponse<Departamento>> departamentoPorDirector(@PathVariable Long directorId) {
        return ResponseEntity.ok(ApiResponse.ok(
                departamentoRepository.findFirstByDirectorId(directorId).orElse(null)));
    }
}
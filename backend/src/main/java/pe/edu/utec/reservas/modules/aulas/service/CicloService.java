package pe.edu.utec.reservas.modules.aulas.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.utec.reservas.modules.aulas.dto.CicloResponse;
import pe.edu.utec.reservas.modules.aulas.dto.UpdateCicloRequest;
import pe.edu.utec.reservas.modules.aulas.model.CicloAcademico;
import pe.edu.utec.reservas.modules.aulas.model.CicloExcepcion;
import pe.edu.utec.reservas.modules.aulas.repository.CicloAcademicoRepository;
import pe.edu.utec.reservas.modules.aulas.repository.CicloExcepcionRepository;
import pe.edu.utec.reservas.shared.exceptions.BusinessException;
import pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

@Service
@RequiredArgsConstructor
public class CicloService {

    private final CicloAcademicoRepository repo;
    private final CicloExcepcionRepository excepcionRepo;
    private final pe.edu.utec.reservas.modules.bloqueos.repository.BloqueoRepository bloqueoRepository;

    @Transactional(readOnly = true)
    public List<CicloResponse> listar() {
        return repo.findAllByOrderByAnioDescCicloAsc().stream().map(this::toResponse).toList();
    }

    /** Agrega un año nuevo → crea los 3 ciclos (0/1/2) con fechas por defecto (patrón UTEC), editables luego. */
    @Transactional
    public List<CicloResponse> crearAnio(int anio) {
        if (anio < 2000 || anio > 2100)
            throw new BusinessException("Año fuera de rango: " + anio, "ANIO_INVALIDO");
        if (repo.existsByAnio(anio))
            throw new BusinessException("El año " + anio + " ya existe", "ANIO_DUPLICADO");

        LocalDate finFeb = YearMonth.of(anio, 2).atEndOfMonth();  // 28/29 según bisiesto
        CicloAcademico c0 = repo.save(ciclo(anio, 0, LocalDate.of(anio, 1, 5), finFeb));                      // verano
        CicloAcademico c1 = repo.save(ciclo(anio, 1, LocalDate.of(anio, 3, 23), LocalDate.of(anio, 7, 4)));   // Mar–Jul
        CicloAcademico c2 = repo.save(ciclo(anio, 2, LocalDate.of(anio, 8, 10), LocalDate.of(anio, 11, 21))); // Ago–Nov

        // Deriva AUTOMÁTICAMENTE las excepciones FERIADO del calendario desde los feriados
        // OPERATIVOS del año (bloqueos motivo=FERIADO, fuente única — misma lógica que V9).
        // Antes esto requería una migración manual por año; ahora sale al crear el año. Si los
        // feriados operativos del año aún no están cargados, no pasa nada: se pueden agregar
        // luego a mano desde la UI (o re-derivar con otra migración).
        derivarFeriados(c0); derivarFeriados(c1); derivarFeriados(c2);
        return listar();
    }

    /** Crea una excepción FERIADO por cada fecha de feriado operativo dentro del rango del ciclo. */
    private void derivarFeriados(CicloAcademico c) {
        for (Object[] f : bloqueoRepository.findFeriadosOperativosEnRango(c.getFechaInicio(), c.getFechaFin())) {
            LocalDate fecha = ((java.sql.Date) f[0]).toLocalDate();
            excepcionRepo.save(CicloExcepcion.builder()
                    .ciclo(c.codigo()).fechaInicio(fecha).fechaFin(fecha)
                    .tipo("FERIADO").descripcion((String) f[1]).build());
        }
    }

    @Transactional
    public CicloResponse actualizar(Long id, UpdateCicloRequest req) {
        if (req.getFechaInicio().isAfter(req.getFechaFin()))
            throw new BusinessException("La fecha de inicio debe ser anterior a la de fin", "FECHAS_INVALIDAS");
        CicloAcademico c = repo.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Ciclo", "id", id));
        c.setFechaInicio(req.getFechaInicio());
        c.setFechaFin(req.getFechaFin());
        return toResponse(repo.save(c));
    }

    private CicloAcademico ciclo(int anio, int ciclo, LocalDate ini, LocalDate fin) {
        return CicloAcademico.builder().anio(anio).ciclo(ciclo).fechaInicio(ini).fechaFin(fin).build();
    }

    /** Agrega una excepción (examen/feriado) a un ciclo. */
    @Transactional
    public CicloResponse agregarExcepcion(String ciclo, LocalDate inicio, LocalDate fin, String tipo, String descripcion) {
        if (inicio == null || fin == null || inicio.isAfter(fin))
            throw new BusinessException("Rango de fechas inválido", "FECHAS_INVALIDAS");
        if (!List.of("EXAMEN", "FERIADO", "OTRO", "CIERRE").contains(tipo))
            throw new BusinessException("Tipo inválido: " + tipo, "TIPO_INVALIDO");
        excepcionRepo.save(CicloExcepcion.builder()
                .ciclo(ciclo).fechaInicio(inicio).fechaFin(fin).tipo(tipo).descripcion(descripcion).build());
        return listar().stream().filter(c -> c.getCodigo().equals(ciclo)).findFirst().orElse(null);
    }

    @Transactional
    public void eliminarExcepcion(Long id) {
        excepcionRepo.deleteById(id);
    }

    private CicloResponse toResponse(CicloAcademico c) {
        List<CicloResponse.Excepcion> exc = excepcionRepo.findByCicloOrderByFechaInicioAsc(c.codigo()).stream()
                .map(e -> CicloResponse.Excepcion.builder()
                        .id(e.getId()).fechaInicio(e.getFechaInicio()).fechaFin(e.getFechaFin())
                        .tipo(e.getTipo()).descripcion(e.getDescripcion()).build())
                .toList();
        return CicloResponse.builder()
                .id(c.getId()).anio(c.getAnio()).ciclo(c.getCiclo()).codigo(c.codigo())
                .fechaInicio(c.getFechaInicio()).fechaFin(c.getFechaFin())
                .excepciones(exc).build();
    }
}

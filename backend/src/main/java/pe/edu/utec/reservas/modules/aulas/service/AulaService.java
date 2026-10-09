package pe.edu.utec.reservas.modules.aulas.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.utec.reservas.modules.aulas.dto.AulaResponse;
import pe.edu.utec.reservas.modules.aulas.dto.ClaseResponse;
import pe.edu.utec.reservas.modules.aulas.dto.CreateAulaRequest;
import pe.edu.utec.reservas.modules.aulas.dto.CursoResponse;
import pe.edu.utec.reservas.modules.aulas.dto.OcupacionAulaResponse;
import pe.edu.utec.reservas.modules.aulas.model.Aula;
import pe.edu.utec.reservas.modules.aulas.repository.AulaRepository;
import pe.edu.utec.reservas.modules.aulas.repository.CicloAcademicoRepository;
import pe.edu.utec.reservas.modules.aulas.repository.CicloExcepcionRepository;
import pe.edu.utec.reservas.modules.bloqueos.model.Bloqueo;
import pe.edu.utec.reservas.modules.bloqueos.repository.BloqueoRepository;
import pe.edu.utec.reservas.shared.exceptions.BusinessException;
import pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AulaService {

    private final AulaRepository aulaRepository;
    private final BloqueoRepository bloqueoRepository;
    private final CicloExcepcionRepository cicloExcepcionRepository;
    private final CicloAcademicoRepository cicloAcademicoRepository;
    private final pe.edu.utec.reservas.modules.laboratorios.repository.LaboratorioRepository laboratorioRepository;
    private final pe.edu.utec.reservas.modules.reservas.repository.ReservaRepository reservaRepository;

    /** Rango REAL de clases del ciclo ("2026-1" → 23mar–4jul) desde ciclos_academicos, o null. */
    private LocalDate[] rangoCiclo(String ciclo) {
        try {
            String[] p = ciclo.split("-");
            return cicloAcademicoRepository.findByAnioAndCiclo(Integer.parseInt(p[0]), Integer.parseInt(p[1]))
                    .map(c -> new LocalDate[]{c.getFechaInicio(), c.getFechaFin()})
                    .orElse(null);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * ¿La clase se dicta ESE día concreto? Debe caer dentro del rango real del ciclo (fuente:
     * ciclos_academicos; si el ciclo no está configurado, el rango del propio bloqueo) y en su
     * semana A/B. Sin esto, la semana posterior al fin de clases seguía mostrando el patrón
     * (clases "fantasma" el 13–15 jul cuando el ciclo terminó el 4 jul).
     */
    private static boolean claseDictadaEn(Bloqueo b, LocalDate[] rangoCiclo, LocalDate fecha) {
        if (!pe.edu.utec.reservas.modules.reservas.service.ReservaService.claseAplicaEnFecha(b.getFrecuencia(), fecha)) return false;
        LocalDate ini = rangoCiclo != null ? rangoCiclo[0] : b.getFechaInicio();
        LocalDate fin = rangoCiclo != null ? rangoCiclo[1] : b.getFechaFin();
        return !fecha.isBefore(ini) && !fecha.isAfter(fin);
    }

    static final java.util.Set<String> TIPOS = java.util.Set.of(
            "AULA", "AULA_MIXTA", "AULA_POSGRADO", "AUDITORIO", "AULA_MAGNA",
            "ESTUDIO_GRABACION", "SALA_ESTUDIO_SUM", "LOSA_DEPORTIVA");

    /** Todas las aulas (activas e inactivas) — para la gestión de Docencia. */
    @Transactional(readOnly = true)
    public List<AulaResponse> listarTodas() {
        return aulaRepository.findAll().stream()
                .sorted((a, b) -> a.getCodigo().compareTo(b.getCodigo()))
                .map(this::toAula).toList();
    }

    @Transactional
    public AulaResponse crear(CreateAulaRequest req) {
        validarTipo(req.getTipo());
        String codigo = req.getCodigo().trim().toUpperCase(java.util.Locale.ROOT);
        if (aulaRepository.existsByCodigo(codigo))
            throw new BusinessException("Ya existe un aula con código " + codigo, "AULA_DUPLICADA");
        Aula a = Aula.builder()
                .codigo(codigo)
                .nombre(req.getNombre() != null && !req.getNombre().isBlank() ? req.getNombre().trim() : codigo)
                .tipo(req.getTipo()).capacidad(req.getCapacidad()).piso(req.getPiso())
                .activo(req.getActivo() == null || req.getActivo())
                .build();
        return toAula(aulaRepository.save(a));
    }

    @Transactional
    public AulaResponse actualizar(Long id, CreateAulaRequest req) {
        validarTipo(req.getTipo());
        Aula a = aulaRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Aula", "id", id));
        a.setNombre(req.getNombre());
        a.setTipo(req.getTipo());
        a.setCapacidad(req.getCapacidad());
        a.setPiso(req.getPiso());
        if (req.getActivo() != null) a.setActivo(req.getActivo());
        return toAula(aulaRepository.save(a));
    }

    /** Desactiva el aula (soft-delete): no borra sus clases; deja de ofrecerse/listarse como activa. */
    @Transactional
    public void desactivar(Long id) {
        Aula a = aulaRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Aula", "id", id));
        a.setActivo(false);
        aulaRepository.save(a);
    }

    private void validarTipo(String tipo) {
        if (tipo == null || !TIPOS.contains(tipo))
            throw new BusinessException("Tipo de aula inválido: " + tipo, "TIPO_INVALIDO");
    }

    @Transactional(readOnly = true)
    public List<AulaResponse> listar(String tipo) {
        List<Aula> aulas = (tipo == null || tipo.isBlank())
                ? aulaRepository.findByActivoTrueOrderByCodigoAsc()
                : aulaRepository.findByTipoAndActivoTrueOrderByCodigoAsc(tipo);
        return aulas.stream().map(this::toAula).toList();
    }

    /** Áreas (carreras/prefijos de curso) con clases en el ciclo — para el filtro del alumno. */
    @Transactional(readOnly = true)
    public List<String> areasConClases(String ciclo) {
        return bloqueoRepository.findAreasConClases(ciclo);
    }

    /** Laboratorios con ocupación (clases o eventos) — para el tipo "Laboratorio" del selector. */
    @Transactional(readOnly = true)
    public List<AulaResponse> laboratoriosConOcupacion(String ciclo) {
        return bloqueoRepository.findLaboratoriosConOcupacion(ciclo).stream()
                // Orden por PISO (los sótanos primero) y luego por código — igual que Laboratorios.
                .sorted(java.util.Comparator
                        .comparing((pe.edu.utec.reservas.modules.laboratorios.model.Laboratorio l) ->
                                l.getPiso() != null ? l.getPiso() : Integer.MAX_VALUE)
                        .thenComparing(pe.edu.utec.reservas.modules.laboratorios.model.Laboratorio::getCodigoLab))
                .map(l -> AulaResponse.builder()
                        .id(l.getId()).codigo(l.getCodigoLab()).nombre(l.getNombre())
                        .tipo("LABORATORIO").piso(l.getPiso()).esLab(true).build())
                .toList();
    }

    /**
     * Clases del calendario. Debe venir al menos un filtro (aula o área o texto) para no volcar
     * todo el ciclo. Si no hay filtro, devuelve vacío.
     */
    @Transactional(readOnly = true)
    public List<ClaseResponse> buscarClases(String ciclo, Long aulaId, Long labId, String area, String q) {
        List<Bloqueo> clases;
        if (aulaId != null) {
            clases = bloqueoRepository.findClasesByAula(aulaId, ciclo);
        } else if (labId != null) {
            clases = bloqueoRepository.findClasesByLaboratorio(labId, ciclo);
        } else if ((area != null && !area.isBlank()) || (q != null && !q.isBlank())) {
            clases = bloqueoRepository.findClasesByCicloAreaQ(ciclo,
                    blankToNull(area), blankToNull(q));
        } else {
            return List.of();
        }
        return clases.stream().map(this::toClase).toList();
    }

    /** Cursos con clases en el ciclo (filtrables por carrera/área y texto) — sección Cursos. */
    @Transactional(readOnly = true)
    public List<CursoResponse> buscarCursos(String ciclo, String area, String q) {
        return bloqueoRepository.findCursosConClases(ciclo, blankToNull(area), blankToNull(q)).stream()
                .map(c -> CursoResponse.builder()
                        .id(c.getId()).codCurso(c.getCodCurso()).nombre(c.getNombre()).area(c.getArea()).build())
                .toList();
    }

    /** Horario (clases) de un curso concreto. */
    @Transactional(readOnly = true)
    public List<ClaseResponse> clasesDeCurso(String ciclo, Long cursoId) {
        return bloqueoRepository.findClasesByCurso(ciclo, cursoId).stream().map(this::toClase).toList();
    }

    /** Aulas libres en un ciclo/día/franja, opcionalmente filtradas por tipo y capacidad mínima. */
    @Transactional(readOnly = true)
    public List<AulaResponse> buscarLibres(String ciclo, String dia, LocalTime horaInicio, LocalTime horaFin,
                                           String tipo, Integer capacidadMin) {
        return buscarLibres(ciclo, dia, horaInicio, horaFin, tipo, capacidadMin, null);
    }

    /**
     * Con {@code fecha} la búsqueda es CONSCIENTE DE FECHA (no un patrón abstracto de día):
     * (a) en un día de excepción (feriado/exámenes) las clases NO se dictan → no ocupan; y
     * (b) los eventos/bloqueos de aula creados por los administrativos SÍ ocupan si cruzan la
     * franja. Así lo que el alumno ve refleja la realidad de ese día concreto.
     */
    public List<AulaResponse> buscarLibres(String ciclo, String dia, LocalTime horaInicio, LocalTime horaFin,
                                           String tipo, Integer capacidadMin, LocalDate fecha) {
        boolean sinClases = fecha != null && cicloExcepcionRepository.esDiaSinClases(ciclo, fecha);
        LocalDate[] rango = fecha != null ? rangoCiclo(ciclo) : null;
        Set<Long> ocupadas;
        if (sinClases) {
            ocupadas = new HashSet<>();
        } else if (fecha == null) {
            ocupadas = new HashSet<>(bloqueoRepository.findAulaIdsOcupadas(ciclo, dia, horaInicio, horaFin));
        } else {
            // Con fecha: solo las clases que DE VERDAD se dictan ese día (rango del ciclo + A/B).
            ocupadas = bloqueoRepository.findClasesAulaByCicloDia(ciclo, dia).stream()
                    .filter(b -> b.getAula() != null)
                    .filter(b -> claseDictadaEn(b, rango, fecha))
                    .filter(b -> b.getHoraInicio().isBefore(horaFin) && b.getHoraFin().isAfter(horaInicio))
                    .map(b -> b.getAula().getId())
                    .collect(Collectors.toCollection(HashSet::new));
        }
        if (fecha != null) {
            bloqueoRepository.findBloqueosAulaEnFecha(fecha).stream()
                    .filter(b -> b.getHoraInicio() == null
                            || (b.getHoraInicio().isBefore(horaFin) && b.getHoraFin().isAfter(horaInicio)))
                    .forEach(b -> ocupadas.add(b.getAula().getId()));
        }
        List<Aula> aulas = (tipo == null || tipo.isBlank())
                ? aulaRepository.findByActivoTrueOrderByCodigoAsc()
                : aulaRepository.findByTipoAndActivoTrueOrderByCodigoAsc(tipo);
        List<AulaResponse> out = new ArrayList<>(aulas.stream()
                .filter(a -> !ocupadas.contains(a.getId()))
                .filter(a -> capacidadMin == null || (a.getCapacidad() != null && a.getCapacidad() >= capacidadMin))
                .map(this::toAula)
                .toList());

        // LABORATORIOS: también son ambientes buscables. Un lab está "libre" si no tiene CLASE
        // ni bloqueo TOTAL en la franja; los bloqueos PARCIALES y las reservas de mesas no lo
        // excluyen (quedan mesas usables) — se ven como ocupación parcial en la grilla.
        if (tipo == null || tipo.isBlank() || "LABORATORIO".equals(tipo)) {
            Map<Long, List<Bloqueo>> clasesLab = sinClases ? Map.of()
                    : bloqueoRepository.findClasesLabByCicloDia(ciclo, dia).stream()
                            .filter(b -> fecha == null || claseDictadaEn(b, rango, fecha))
                            .collect(Collectors.groupingBy(b -> b.getLaboratorio().getId()));
            Map<Long, List<Bloqueo>> eventosLab = fecha == null ? Map.of()
                    : bloqueoRepository.findBloqueosLabEnFecha(fecha).stream()
                            .collect(Collectors.groupingBy(b -> b.getLaboratorio().getId()));
            for (var lab : laboratorioRepository.findByEstado("ACTIVO")) {
                boolean claseEncima = clasesLab.getOrDefault(lab.getId(), List.of()).stream()
                        .anyMatch(b -> b.getHoraInicio().isBefore(horaFin) && b.getHoraFin().isAfter(horaInicio));
                boolean totalEncima = eventosLab.getOrDefault(lab.getId(), List.of()).stream()
                        .filter(b -> "TOTAL".equals(b.getTipo()))
                        .anyMatch(b -> b.getHoraInicio() == null
                                || (b.getHoraInicio().isBefore(horaFin) && b.getHoraFin().isAfter(horaInicio)));
                Integer capacidad = (lab.getAforoCantidad() != null && lab.getAforoCapacidad() != null)
                        ? lab.getAforoCantidad() * lab.getAforoCapacidad() : null;
                if (claseEncima || totalEncima) continue;
                if (capacidadMin != null && (capacidad == null || capacidad < capacidadMin)) continue;
                out.add(AulaResponse.builder()
                        .id(lab.getId()).codigo(lab.getCodigoLab()).nombre(lab.getNombre())
                        .tipo("LABORATORIO").capacidad(capacidad).piso(lab.getPiso())
                        .activo(true).esLab(true).build());
            }
        }
        return out;
    }

    /** Ocupación de todas las aulas (o de un tipo) en un ciclo/día → grilla aulas×horas. */
    @Transactional(readOnly = true)
    public List<OcupacionAulaResponse> ocupacionDia(String ciclo, String dia, String tipo) {
        return ocupacionDia(ciclo, dia, tipo, null);
    }

    /** Con {@code fecha}: sin clases en días de excepción + eventos de esa fecha incluidos.
     *  Incluye también LABORATORIOS (clases + bloqueos TOTAL/PARCIAL + reservas de mesas). */
    @Transactional(readOnly = true)
    public List<OcupacionAulaResponse> ocupacionDia(String ciclo, String dia, String tipo, LocalDate fecha) {
        List<Aula> aulas = (tipo == null || tipo.isBlank())
                ? aulaRepository.findByActivoTrueOrderByCodigoAsc()
                : aulaRepository.findByTipoAndActivoTrueOrderByCodigoAsc(tipo);

        boolean sinClases = fecha != null && cicloExcepcionRepository.esDiaSinClases(ciclo, fecha);
        LocalDate[] rango = fecha != null ? rangoCiclo(ciclo) : null;
        Map<Long, List<Bloqueo>> porAula = sinClases ? Map.of()
                : bloqueoRepository.findClasesAulaByCicloDia(ciclo, dia).stream()
                        .filter(b -> b.getAula() != null)
                        .filter(b -> fecha == null || claseDictadaEn(b, rango, fecha))
                        .collect(Collectors.groupingBy(b -> b.getAula().getId()));
        // Eventos/bloqueos de la fecha (creados por administrativos) → también ocupan.
        Map<Long, List<Bloqueo>> eventosPorAula = fecha == null ? Map.of()
                : bloqueoRepository.findBloqueosAulaEnFecha(fecha).stream()
                        .collect(Collectors.groupingBy(b -> b.getAula().getId()));

        List<OcupacionAulaResponse> out = new ArrayList<>();
        for (Aula a : aulas) {
            List<OcupacionAulaResponse.Franja> franjas = new ArrayList<>(porAula.getOrDefault(a.getId(), List.of()).stream()
                    .map(b -> franjaDe(b, false))
                    .toList());
            eventosPorAula.getOrDefault(a.getId(), List.of()).forEach(b -> franjas.add(franjaDe(b, false)));
            franjas.sort((x, y) -> x.getHoraInicio().compareTo(y.getHoraInicio()));
            out.add(OcupacionAulaResponse.builder()
                    .id(a.getId()).codigo(a.getCodigo()).tipo(a.getTipo()).capacidad(a.getCapacidad())
                    .piso(a.getPiso()).esLab(false).ocupado(franjas).build());
        }

        // LABORATORIOS: clases del horario + bloqueos (TOTAL ocupa todo; PARCIAL = parcial)
        // + reservas de mesas de los alumnos (parcial: el lab sigue teniendo mesas libres).
        if (tipo == null || tipo.isBlank() || "LABORATORIO".equals(tipo)) {
            Map<Long, List<Bloqueo>> clasesLab = sinClases ? Map.of()
                    : bloqueoRepository.findClasesLabByCicloDia(ciclo, dia).stream()
                            .filter(b -> fecha == null || claseDictadaEn(b, rango, fecha))
                            .collect(Collectors.groupingBy(b -> b.getLaboratorio().getId()));
            Map<Long, List<Bloqueo>> eventosLab = fecha == null ? Map.of()
                    : bloqueoRepository.findBloqueosLabEnFecha(fecha).stream()
                            .collect(Collectors.groupingBy(b -> b.getLaboratorio().getId()));
            Map<Long, List<pe.edu.utec.reservas.modules.reservas.model.Reserva>> reservasLab = fecha == null ? Map.of()
                    : reservaRepository.findVigentesEnFecha(fecha).stream()
                            .collect(Collectors.groupingBy(r -> r.getRecurso().getLaboratorio().getId()));

            for (var lab : laboratorioRepository.findByEstado("ACTIVO")) {
                List<OcupacionAulaResponse.Franja> franjas = new ArrayList<>();
                clasesLab.getOrDefault(lab.getId(), List.of()).forEach(b -> franjas.add(franjaDe(b, false)));
                eventosLab.getOrDefault(lab.getId(), List.of()).forEach(b ->
                        franjas.add(franjaDe(b, "PARCIAL".equals(b.getTipo()))));
                reservasLab.getOrDefault(lab.getId(), List.of()).forEach(r -> franjas.add(
                        OcupacionAulaResponse.Franja.builder()
                                .horaInicio(r.getHoraInicio()).horaFin(r.getHoraFin())
                                .etiqueta("Reserva · " + r.getRecurso().getNombre())
                                .parcial(true).build()));
                franjas.sort((x, y) -> x.getHoraInicio().compareTo(y.getHoraInicio()));
                Integer capacidad = (lab.getAforoCantidad() != null && lab.getAforoCapacidad() != null)
                        ? lab.getAforoCantidad() * lab.getAforoCapacidad() : null;
                // Ventana de ATENCIÓN al alumno: fuera de [apertura, cierre] (o en días que no
                // atiende) el lab no acepta reservas — el frontend lo raya como "no atiende".
                boolean atiende = lab.getDiasAtencion() == null || lab.getDiasAtencion().isEmpty()
                        || lab.getDiasAtencion().stream().anyMatch(d -> normalizarDia(d).equals(dia));
                out.add(OcupacionAulaResponse.builder()
                        .id(lab.getId()).codigo(lab.getCodigoLab()).tipo("LABORATORIO").capacidad(capacidad)
                        .piso(lab.getPiso()).esLab(true).ocupado(franjas)
                        .atencionInicio(lab.getHoraApertura()).atencionFin(lab.getHoraCierre())
                        .atiende(atiende).build());
            }
        }
        return out;
    }

    /** "Miércoles" → "MIERCOLES": normaliza los días de atención del lab al formato de la grilla. */
    private static String normalizarDia(String d) {
        return java.text.Normalizer.normalize(d, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").toUpperCase(java.util.Locale.ROOT).trim();
    }

    /** Franja de ocupación a partir de un bloqueo (clase o evento); sin hora = todo el día. */
    private OcupacionAulaResponse.Franja franjaDe(Bloqueo b, boolean parcial) {
        return OcupacionAulaResponse.Franja.builder()
                .horaInicio(b.getHoraInicio() != null ? b.getHoraInicio() : LocalTime.of(7, 0))
                .horaFin(b.getHoraFin() != null ? b.getHoraFin() : LocalTime.of(23, 0))
                .etiqueta(b.getCurso() != null ? b.getCurso().getCodCurso()
                        : (b.getDescripcion() != null && !b.getDescripcion().isBlank() ? b.getDescripcion() : b.getMotivo()))
                .parcial(parcial)
                .build();
    }

    // ── Mappers ──

    private AulaResponse toAula(Aula a) {
        return AulaResponse.builder()
                .id(a.getId()).codigo(a.getCodigo()).nombre(a.getNombre())
                .tipo(a.getTipo()).capacidad(a.getCapacidad()).piso(a.getPiso())
                .activo(a.getActivo())
                .build();
    }

    private ClaseResponse toClase(Bloqueo b) {
        boolean esLab = b.getLaboratorio() != null;
        return ClaseResponse.builder()
                .id(b.getId())
                .espacioCodigo(esLab ? b.getLaboratorio().getCodigoLab()
                        : (b.getAula() != null ? b.getAula().getCodigo() : "—"))
                .espacioTipo(esLab ? "LABORATORIO" : (b.getAula() != null ? b.getAula().getTipo() : "—"))
                .esLab(esLab)
                .diaSemana(b.getDiaSemana())
                .fechaInicio(b.getFechaInicio())
                .fechaFin(b.getFechaFin())
                .horaInicio(b.getHoraInicio())
                .horaFin(b.getHoraFin())
                .cursoCodigo(b.getCurso() != null ? b.getCurso().getCodCurso() : null)
                .cursoNombre(b.getCurso() != null ? b.getCurso().getNombre() : null)
                .area(b.getCurso() != null ? b.getCurso().getArea() : null)
                .seccion(b.getSeccion())
                .tipoSesion(b.getTipoSesion())
                .modalidad(b.getModalidad())
                .frecuencia(b.getFrecuencia())
                .docente(b.getResponsableNombre())
                .build();
    }

    private String blankToNull(String s) { return (s == null || s.isBlank()) ? null : s.trim(); }
}

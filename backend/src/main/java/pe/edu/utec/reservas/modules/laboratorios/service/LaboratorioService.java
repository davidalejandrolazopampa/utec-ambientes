package pe.edu.utec.reservas.modules.laboratorios.service;

import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.iam.repository.UsuarioRepository;
import pe.edu.utec.reservas.modules.laboratorios.dto.CreateLaboratorioRequest;
import pe.edu.utec.reservas.modules.laboratorios.dto.LaboratorioResponse;
import pe.edu.utec.reservas.modules.laboratorios.dto.PersonaResumen;
import pe.edu.utec.reservas.modules.laboratorios.dto.RecursoLabResponse;
import pe.edu.utec.reservas.modules.laboratorios.model.Laboratorio;
import pe.edu.utec.reservas.modules.laboratorios.model.RecursoLab;
import pe.edu.utec.reservas.modules.laboratorios.repository.LaboratorioRepository;
import pe.edu.utec.reservas.modules.laboratorios.repository.RecursoLabRepository;
import pe.edu.utec.reservas.shared.exceptions.BusinessException;
import pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class LaboratorioService {

    private final LaboratorioRepository laboratorioRepository;
    private final RecursoLabRepository recursoLabRepository;
    private final pe.edu.utec.reservas.modules.laboratorios.repository.LaboratorioServicioRepository servicioRepository;
    private final UsuarioRepository usuarioRepository;
    private final EntityManager entityManager;
    private final pe.edu.utec.reservas.modules.reservas.repository.ReservaRepository reservaRepository;
    private final pe.edu.utec.reservas.modules.bloqueos.repository.BloqueoRepository bloqueoRepository;

    @Transactional(readOnly = true)
    public List<LaboratorioResponse> listarTodosIncluyendoInactivos() {
        return laboratorioRepository.findAll().stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<LaboratorioResponse> listarTodos() {
        return laboratorioRepository.findByEstado("ACTIVO").stream()
                .map(this::toResponse)
                .toList();
    }

    /** Orden institucional de ambientes: por PISO ascendente (sótanos primero; sin piso al final)
     *  y luego por código — el mismo criterio que el Calendario, Buscar libres y Laboratorios. */
    private static final java.util.Comparator<LaboratorioResponse> ORDEN_INSTITUCIONAL =
            java.util.Comparator.comparing(LaboratorioResponse::getPiso,
                            java.util.Comparator.nullsLast(java.util.Comparator.naturalOrder()))
                    .thenComparing(LaboratorioResponse::getCodigoLab,
                            java.util.Comparator.nullsLast(String.CASE_INSENSITIVE_ORDER));

    @Transactional(readOnly = true)
    public List<LaboratorioResponse> listarPorUsuario(String correoUsuario) {
        Usuario usuario = usuarioRepository.findByCorreoUtec(correoUsuario)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "correo", correoUsuario));

        String rol = usuario.getRol().getNombre();

        List<LaboratorioResponse> labs = switch (rol) {
            case "ADMIN", "COORDINADOR" -> listarTodos();
            case "DIRECTOR" -> {
                @SuppressWarnings("unchecked")
                List<Long> labIds = entityManager.createNativeQuery(
                                "SELECT DISTINCT l.id FROM laboratorios l " +
                                        "WHERE l.director_id = :uid " +
                                        "UNION " +
                                        "SELECT DISTINCT lr.laboratorio_id FROM lab_responsables lr " +
                                        "INNER JOIN usuarios u ON u.id = lr.usuario_id " +
                                        "INNER JOIN departamentos d ON d.id = u.departamento_id " +
                                        "WHERE d.director_id = :uid")
                        .setParameter("uid", usuario.getId())
                        .getResultList();
                yield laboratorioRepository.findAllById(labIds).stream()
                        .filter(l -> "ACTIVO".equals(l.getEstado()))
                        .map(this::toResponse)
                        .toList();
            }
            case "RESPONSABLE_LAB" -> {
                @SuppressWarnings("unchecked")
                List<Long> labIds = entityManager.createNativeQuery(
                                "SELECT laboratorio_id FROM lab_responsables WHERE usuario_id = :uid")
                        .setParameter("uid", usuario.getId())
                        .getResultList();
                yield laboratorioRepository.findAllById(labIds).stream()
                        .filter(l -> "ACTIVO".equals(l.getEstado()))
                        .map(this::toResponse)
                        .toList();
            }
            default -> listarTodos();
        };
        // Los desplegables (dashboard, gestión de reservas) muestran los labs EN ORDEN.
        return labs.stream().sorted(ORDEN_INSTITUCIONAL).toList();
    }

    @Transactional(readOnly = true)
    public List<LaboratorioResponse> listarPorPiso(Integer piso) {
        return laboratorioRepository.findByPiso(piso).stream()
                .filter(l -> "ACTIVO".equals(l.getEstado()))
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<LaboratorioResponse> listarPorFase(String fase) {
        return laboratorioRepository.findByUbicacionFase(fase).stream()
                .filter(l -> "ACTIVO".equals(l.getEstado()))
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public LaboratorioResponse obtenerPorId(Long id) {
        Laboratorio lab = laboratorioRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Laboratorio", "id", id));
        return toResponse(lab);
    }

    @Transactional(readOnly = true)
    public LaboratorioResponse obtenerPorCodigo(String codigo) {
        Laboratorio lab = laboratorioRepository.findByCodigoLab(codigo)
                .orElseThrow(() -> new ResourceNotFoundException("Laboratorio", "codigo", codigo));
        return toResponse(lab);
    }

    @Transactional(readOnly = true)
    public List<RecursoLabResponse> listarRecursos(Long laboratorioId) {
        if (!laboratorioRepository.existsById(laboratorioId)) {
            throw new ResourceNotFoundException("Laboratorio", "id", laboratorioId);
        }
        return recursoLabRepository.findByLaboratorioIdAndActivoTrue(laboratorioId).stream()
                .map(this::toRecursoResponse)
                .toList();
    }

    @Transactional
    public LaboratorioResponse crear(CreateLaboratorioRequest request) {

        if (laboratorioRepository.existsByCodigoLab(request.getCodigoLab())) {
            throw new BusinessException("Ya existe un laboratorio con código " + request.getCodigoLab(), "DUPLICATE_LAB_CODE");
        }

        if (!request.getHoraApertura().isBefore(request.getHoraCierre())) {
            throw new BusinessException("La hora de apertura debe ser anterior", "INVALID_SCHEDULE");
        }

        Usuario director = request.getDirectorId() != null
                ? usuarioRepository.findById(request.getDirectorId()).orElse(null)
                : null;

        Laboratorio lab = Laboratorio.builder()
                .codigoLab(request.getCodigoLab().toUpperCase())
                .nombre(request.getNombre())
                .departamentoId(request.getDepartamentoId())
                .carreraId(request.getCarreraId())
                .piso(request.getPiso())
                .ubicacionFase(request.getUbicacionFase())
                .resena(request.getResena())
                .diasAtencion(request.getDiasAtencion() != null ? request.getDiasAtencion() : List.of("Lunes", "Martes", "Miércoles", "Jueves", "Viernes"))
                .horaApertura(request.getHoraApertura())
                .horaCierre(request.getHoraCierre())
                .aforoTipo(request.getAforoTipo().toUpperCase())
                .aforoCantidad(request.getAforoCantidad())
                .aforoCapacidad(request.getAforoCapacidad())
                .estado("ACTIVO")
                .director(director)
                .build();

        if (request.getResponsablesIds() != null && !request.getResponsablesIds().isEmpty()) {
            for (Long responsableId : request.getResponsablesIds()) {
                Usuario responsable = usuarioRepository.findById(responsableId)
                        .orElseThrow(() -> new ResourceNotFoundException("Usuario", "id", responsableId));
                lab.getResponsables().add(responsable);
            }
            // 🌟 LÓGICA DE AUTO-VINCULACIÓN: Asignar el depto del primer responsable al laboratorio si está vacío
            if (lab.getDepartamentoId() == null) {
                Long primerRespId = request.getResponsablesIds().get(0);
                autoVincularDepartamento(lab, primerRespId);
            }
        }

        lab = laboratorioRepository.save(lab);

        // GENERACIÓN DE RECURSOS
        List<RecursoLab> recursosNuevos = new ArrayList<>();
        Map<String, Integer> contadorPorTipo = new HashMap<>(); // numeración/QR por tipo (evita choques MESA/PC)

        // Si vienen grupos (mesas + PCs mezclados), se usan esos; si no, el aforo* legacy (un solo tipo).
        if (request.getRecursos() != null && !request.getRecursos().isEmpty()) {
            for (CreateLaboratorioRequest.RecursoGrupoRequest g : request.getRecursos()) {
                generarGrupoRecursos(lab, g.getTipo(), g.getCantidad(), g.getCapacidadPersonas(), recursosNuevos, contadorPorTipo);
            }
        } else {
            generarGrupoRecursos(lab, request.getAforoTipo(), request.getAforoCantidad(), request.getAforoCapacidad(), recursosNuevos, contadorPorTipo);
        }

        if (request.getEquiposEspecializados() != null) {
            int equipoNumero = 1;
            for (CreateLaboratorioRequest.EquipoRequest equipo : request.getEquiposEspecializados()) {
                int cantidad = equipo.getCantidad() != null ? equipo.getCantidad() : 1;
                for (int i = 1; i <= cantidad; i++) {
                    String equipoNombre = cantidad > 1 ? equipo.getNombre() + " " + i : equipo.getNombre();
                    recursosNuevos.add(RecursoLab.builder().laboratorio(lab).tipo("EQUIPO").nombre(equipoNombre).numero(equipoNumero).qrCode(lab.getCodigoLab() + "-EQUIPO-" + String.format("%03d", equipoNumero)).estado("DISPONIBLE").capacidadPersonas(equipo.getCapacidadPersonas() != null ? equipo.getCapacidadPersonas() : 1).activo(true).build());
                    equipoNumero++;
                }
            }
        }

        recursoLabRepository.saveAll(recursosNuevos);
        guardarServicios(lab.getId(), request.getServicios());
        log.info("Laboratorio creado - {} con {} recursos", lab.getCodigoLab(), recursosNuevos.size());
        return toResponse(lab);
    }

    /** Genera 'cantidad' recursos del 'tipo' dado, numerando/QR por tipo (no choca MESA con PC). */
    private void generarGrupoRecursos(Laboratorio lab, String tipo, Integer cantidad, Integer capacidad,
                                      List<RecursoLab> acumulador, Map<String, Integer> contadorPorTipo) {
        if (tipo == null || tipo.isBlank() || cantidad == null || cantidad <= 0) return;
        String t = tipo.toUpperCase();
        int cap = capacidad != null ? capacidad : 1;
        for (int i = 0; i < cantidad; i++) {
            int n = contadorPorTipo.merge(t, 1, Integer::sum);
            acumulador.add(RecursoLab.builder()
                    .laboratorio(lab).tipo(t).nombre(t + " " + n).numero(n)
                    .qrCode(lab.getCodigoLab() + "-" + t + "-" + String.format("%03d", n))
                    .estado("DISPONIBLE").capacidadPersonas(cap).activo(true).build());
        }
    }

    @Transactional
    public LaboratorioResponse editar(Long id, CreateLaboratorioRequest request) {
        asegurarAccesoAlLab(id);
        Laboratorio lab = laboratorioRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Laboratorio", "id", id));

        lab.setNombre(request.getNombre());
        lab.setResena(request.getResena());
        lab.setPiso(request.getPiso());
        lab.setUbicacionFase(request.getUbicacionFase());
        lab.setHoraApertura(request.getHoraApertura());
        lab.setHoraCierre(request.getHoraCierre());
        lab.setDiasAtencion(request.getDiasAtencion());
        lab.setAforoTipo(request.getAforoTipo());
        lab.setAforoCantidad(request.getAforoCantidad());
        lab.setAforoCapacidad(request.getAforoCapacidad());
        lab.setDepartamentoId(request.getDepartamentoId());
        lab.setCarreraId(request.getCarreraId());

        if (request.getDirectorId() != null) {
            Usuario director = usuarioRepository.findById(request.getDirectorId()).orElse(null);
            lab.setDirector(director);
        }

        lab = laboratorioRepository.save(lab);
        guardarServicios(id, request.getServicios());
        return toResponse(lab);
    }

    /** Reemplaza los servicios del lab por la lista del request (borra + reinserta los válidos). */
    private void guardarServicios(Long labId, List<CreateLaboratorioRequest.ServicioRequest> servicios) {
        if (servicios == null) return;   // null = no tocar; lista vacía = borrar todos
        servicioRepository.deleteByLaboratorioId(labId);
        for (CreateLaboratorioRequest.ServicioRequest s : servicios) {
            if (s == null || s.getNombre() == null || s.getNombre().isBlank()) continue;
            servicioRepository.save(pe.edu.utec.reservas.modules.laboratorios.model.LaboratorioServicio.builder()
                    .laboratorioId(labId)
                    .nombre(s.getNombre().trim())
                    .url(s.getUrl() != null && !s.getUrl().isBlank() ? s.getUrl().trim() : null)
                    .descripcion(s.getDescripcion() != null && !s.getDescripcion().isBlank() ? s.getDescripcion().trim() : null)
                    .build());
        }
    }

    @Transactional
    public void eliminar(Long id) {
        Laboratorio lab = laboratorioRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Laboratorio", "id", id));
        servicioRepository.deleteByLaboratorioId(id);
        recursoLabRepository.deleteByLaboratorioId(id);
        laboratorioRepository.delete(lab);
        log.info("Laboratorio eliminado - {} ({})", lab.getNombre(), lab.getCodigoLab());
    }

    @Transactional
    public LaboratorioResponse cambiarEstado(Long id, String estado) {
        Laboratorio lab = laboratorioRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Laboratorio", "id", id));
        lab.setEstado(estado.toUpperCase());
        lab = laboratorioRepository.save(lab);
        return toResponse(lab);
    }

    // ── MÉTODOS DE APOYO DE LA NUEVA LÓGICA ──

    private void autoVincularDepartamento(Laboratorio lab, Long usuarioId) {
        try {
            // Buscamos el departamento_id del usuario nativamente para no requerir editar la entidad Usuario.java
            Number deptoId = (Number) entityManager.createNativeQuery("SELECT departamento_id FROM usuarios WHERE id = :uid AND departamento_id IS NOT NULL")
                    .setParameter("uid", usuarioId)
                    .getSingleResult();
            if (deptoId != null) {
                lab.setDepartamentoId(deptoId.longValue());
                log.info("Auto-asignado departamento {} al lab {}", deptoId.longValue(), lab.getCodigoLab());
            }
        } catch (Exception ignored) {}
    }

    /**
     * Cuenta los recursos del lab con AL MENOS un hueco libre HOY dentro del horario,
     * descontando las reservas activas y los bloqueos (totales o parciales) de hoy.
     * Si el lab no tiene horario válido, cae al conteo de recursos DISPONIBLES (estado actual).
     */
    private int contarDisponiblesHoy(Laboratorio lab) {
        if (!atiendeHoy(lab)) return 0;   // hoy no es día de atención → cerrado
        LocalTime apertura = lab.getHoraApertura(), cierre = lab.getHoraCierre();
        if (apertura == null || cierre == null || !apertura.isBefore(cierre)) {
            Integer d = recursoLabRepository.countDisponiblesByLaboratorioId(lab.getId());
            return d != null ? d : 0;
        }
        LocalDate hoy = LocalDate.now();
        // "Hoy" cuenta solo lo que QUEDA del día: las horas ya transcurridas no son
        // reservables, así que la ventana arranca AHORA (no en la apertura). Sin esto, un
        // evento total por la tarde dejaba el lab como "con cupo" por la mañana ya pasada.
        LocalTime ahora = LocalTime.now();
        if (!ahora.isBefore(cierre)) return 0;                          // ya cerró hoy
        LocalTime desde = ahora.isAfter(apertura) ? ahora : apertura;   // max(apertura, ahora)
        List<RecursoLab> recursos = recursoLabRepository.findByLaboratorioIdAndActivoTrue(lab.getId());
        if (recursos.isEmpty()) return 0;

        Map<Long, List<LocalTime[]>> porRecurso = new HashMap<>();   // ocupación específica por recurso
        List<LocalTime[]> comunes = new ArrayList<>();               // bloqueos TOTAL → afectan a todos

        for (var r : reservaRepository.findActivasPorLabYRango(lab.getId(), hoy, hoy)) {
            if (r.getHoraInicio() != null && r.getHoraFin() != null) {
                porRecurso.computeIfAbsent(r.getRecurso().getId(), k -> new ArrayList<>())
                        .add(new LocalTime[]{ r.getHoraInicio(), r.getHoraFin() });
            }
        }
        Map<Long, LocalTime[]> bloqueoHoras = new HashMap<>();
        for (var b : bloqueoRepository.findActiveByLaboratorioAndFecha(lab.getId(), hoy)) {
            LocalTime hi = b.getHoraInicio() != null ? b.getHoraInicio() : apertura;
            LocalTime hf = b.getHoraFin() != null ? b.getHoraFin() : cierre;
            if ("TOTAL".equals(b.getTipo())) comunes.add(new LocalTime[]{ hi, hf });
            else bloqueoHoras.put(b.getId(), new LocalTime[]{ hi, hf });
        }
        for (Object[] par : bloqueoRepository.findParcialRecursoPairs(lab.getId(), hoy)) {
            LocalTime[] iv = bloqueoHoras.get(((Number) par[0]).longValue());
            if (iv != null) porRecurso.computeIfAbsent(((Number) par[1]).longValue(), k -> new ArrayList<>()).add(iv);
        }

        int libres = 0;
        for (RecursoLab r : recursos) {
            List<LocalTime[]> ocup = new ArrayList<>(comunes);
            List<LocalTime[]> propios = porRecurso.get(r.getId());
            if (propios != null) ocup.addAll(propios);
            if (!cubreTodo(ocup, desde, cierre)) libres++;
        }
        return libres;
    }

    /**
     * Recursos disponibles AHORA mismo: en estado DISPONIBLE (no ocupados por un check-in)
     * Y que no estén bajo un bloqueo activo en este instante. El estado de la mesa no refleja
     * los bloqueos (un bloqueo no pone la mesa en OCUPADO), por eso aquí se descuentan aparte.
     */
    private int contarDisponiblesAhora(Laboratorio lab) {
        if (!atiendeHoy(lab)) return 0;   // hoy no es día de atención → cerrado
        LocalDate hoy = LocalDate.now();
        LocalTime ahora = LocalTime.now();
        // Fuera del horario de atención (antes de abrir o ya cerró) → 0 disponibles ahora.
        if (lab.getHoraApertura() != null && lab.getHoraCierre() != null
                && (ahora.isBefore(lab.getHoraApertura()) || !ahora.isBefore(lab.getHoraCierre()))) {
            return 0;
        }
        List<RecursoLab> recursos = recursoLabRepository.findByLaboratorioIdAndActivoTrue(lab.getId());
        if (recursos.isEmpty()) return 0;

        Set<Long> parcialActivoAhora = new HashSet<>();   // ids de bloqueos PARCIAL vigentes ahora
        for (var b : bloqueoRepository.findActiveByLaboratorioAndFecha(lab.getId(), hoy)) {
            LocalTime hi = b.getHoraInicio() != null ? b.getHoraInicio() : LocalTime.MIN;
            LocalTime hf = b.getHoraFin() != null ? b.getHoraFin() : LocalTime.MAX;
            boolean vigenteAhora = !ahora.isBefore(hi) && ahora.isBefore(hf);
            if (!vigenteAhora) continue;
            if ("TOTAL".equals(b.getTipo())) return 0;     // el lab entero está cerrado ahora
            parcialActivoAhora.add(b.getId());
        }
        Set<Long> recursosBloqueadosAhora = new HashSet<>();
        if (!parcialActivoAhora.isEmpty()) {
            for (Object[] par : bloqueoRepository.findParcialRecursoPairs(lab.getId(), hoy)) {
                if (parcialActivoAhora.contains(((Number) par[0]).longValue())) {
                    recursosBloqueadosAhora.add(((Number) par[1]).longValue());
                }
            }
        }

        int libres = 0;
        for (RecursoLab r : recursos) {
            if (!"DISPONIBLE".equals(r.getEstado())) continue;          // ocupada por check-in
            if (recursosBloqueadosAhora.contains(r.getId())) continue;  // bloqueada en este instante
            libres++;
        }
        return libres;
    }

    /** ¿El laboratorio atiende HOY? Sin diasAtencion configurado → atiende todos los días. */
    private boolean atiendeHoy(Laboratorio lab) {
        if (lab.getDiasAtencion() == null || lab.getDiasAtencion().isEmpty()) return true;
        String dia = switch (LocalDate.now().getDayOfWeek()) {
            case MONDAY -> "Lunes";
            case TUESDAY -> "Martes";
            case WEDNESDAY -> "Miércoles";
            case THURSDAY -> "Jueves";
            case FRIDAY -> "Viernes";
            case SATURDAY -> "Sábado";
            case SUNDAY -> "Domingo";
        };
        return lab.getDiasAtencion().contains(dia);
    }

    /** ¿Los intervalos cubren por completo [apertura, cierre]? Si no, queda algún hueco libre. */
    private boolean cubreTodo(List<LocalTime[]> intervalos, LocalTime apertura, LocalTime cierre) {
        intervalos.sort(Comparator.comparing(iv -> iv[0]));
        LocalTime cursor = apertura;
        for (LocalTime[] iv : intervalos) {
            LocalTime ini = iv[0].isBefore(apertura) ? apertura : iv[0];
            LocalTime fin = iv[1].isAfter(cierre) ? cierre : iv[1];
            if (ini.isAfter(cursor)) return false;   // hueco entre el cursor y el inicio
            if (fin.isAfter(cursor)) cursor = fin;
        }
        return !cursor.isBefore(cierre);
    }

    private LaboratorioResponse toResponse(Laboratorio lab) {
        Integer totalRecursos = recursoLabRepository.countByLaboratorioId(lab.getId());
        // "Disponibles ahora": estado DISPONIBLE menos los recursos bajo un bloqueo vigente en este instante.
        int disponibles = contarDisponiblesAhora(lab);

        Usuario director = lab.getDirector();
        String directorNombre = director != null ? director.getNombreCompleto() : null;
        Long directorId = director != null ? director.getId() : null;
        String directorCorreo = director != null ? director.getCorreoUtec() : null;
        String directorCargo = director != null ? director.getCargo() : null;

        List<String> responsablesNombres = lab.getResponsables().stream()
                .map(Usuario::getNombreCompleto)
                .toList();
        List<PersonaResumen> responsablesInfo = lab.getResponsables().stream()
                .map(u -> PersonaResumen.builder()
                        .id(u.getId())
                        .nombreCompleto(u.getNombreCompleto())
                        .correoUtec(u.getCorreoUtec())
                        .cargo(u.getCargo())
                        .build())
                .toList();

        List<LaboratorioResponse.ServicioResumen> servicios = servicioRepository.findByLaboratorioIdOrderById(lab.getId())
                .stream()
                .map(s -> LaboratorioResponse.ServicioResumen.builder()
                        .nombre(s.getNombre()).url(s.getUrl()).descripcion(s.getDescripcion()).build())
                .toList();

        String departamentoNombre = null;
        String facultadNombre = null;
        String carreraNombre = null;

        if (lab.getDepartamentoId() != null) {
            try {
                Object[] deptResult = (Object[]) entityManager.createNativeQuery(
                                "SELECT d.nombre, f.nombre FROM departamentos d LEFT JOIN facultades f ON f.id = d.facultad_id WHERE d.id = :id")
                        .setParameter("id", lab.getDepartamentoId())
                        .getSingleResult();
                departamentoNombre = (String) deptResult[0];
                facultadNombre = (String) deptResult[1];
            } catch (Exception ignored) {}
        }

        if (lab.getCarreraId() != null) {
            try {
                carreraNombre = (String) entityManager.createNativeQuery("SELECT nombre FROM carreras WHERE id = :id")
                        .setParameter("id", lab.getCarreraId())
                        .getSingleResult();
            } catch (Exception ignored) {}
        }

        return LaboratorioResponse.builder()
                .id(lab.getId())
                .codigoLab(lab.getCodigoLab())
                .nombre(lab.getNombre())
                .piso(lab.getPiso())
                .ubicacionFase(lab.getUbicacionFase())
                .resena(lab.getResena())
                .diasAtencion(lab.getDiasAtencion())
                .horaApertura(lab.getHoraApertura())
                .horaCierre(lab.getHoraCierre())
                .aforoTipo(lab.getAforoTipo())
                .aforoCantidad(lab.getAforoCantidad())
                .aforoCapacidad(lab.getAforoCapacidad())
                .estado(lab.getEstado())
                .directorNombre(directorNombre)
                .directorId(directorId)
                .directorCorreo(directorCorreo)
                .directorCargo(directorCargo)
                .responsables(responsablesNombres)
                .responsablesInfo(responsablesInfo)
                .totalRecursos(totalRecursos)
                .recursosDisponibles(disponibles)
                .recursosDisponiblesHoy(contarDisponiblesHoy(lab))
                .departamentoId(lab.getDepartamentoId())
                .carreraId(lab.getCarreraId())
                .departamentoNombre(departamentoNombre)
                .facultadNombre(facultadNombre)
                .carreraNombre(carreraNombre)
                .servicios(servicios)
                .build();
    }

    private RecursoLabResponse toRecursoResponse(RecursoLab r) {
        return RecursoLabResponse.builder()
                .id(r.getId())
                .tipo(r.getTipo())
                .nombre(r.getNombre())
                .numero(r.getNumero())
                .qrCode(r.getQrCode())
                .estado(r.getEstado())
                .capacidadPersonas(r.getCapacidadPersonas())
                .build();
    }

    @Transactional
    public RecursoLabResponse agregarRecurso(Long labId, Map<String, Object> request) {
        asegurarAccesoAlLab(labId);
        Laboratorio lab = laboratorioRepository.findById(labId)
                .orElseThrow(() -> new ResourceNotFoundException("Laboratorio", "id", labId));

        String tipo = (String) request.getOrDefault("tipo", "MESA");
        String nombre = (String) request.get("nombre");
        int capacidad = (int) request.getOrDefault("capacidadPersonas", 1);

        int maxNumero = recursoLabRepository.findByLaboratorioIdAndActivoTrue(labId).stream()
                .filter(r -> r.getTipo().equals(tipo))
                .mapToInt(RecursoLab::getNumero)
                .max().orElse(0);

        int nuevoNumero = maxNumero + 1;
        String qrCode = lab.getCodigoLab() + "-" + tipo + "-" + String.format("%03d", nuevoNumero);

        if (nombre == null || nombre.isBlank()) { nombre = tipo + " " + nuevoNumero; }

        RecursoLab recurso = RecursoLab.builder().laboratorio(lab).tipo(tipo.toUpperCase()).nombre(nombre).numero(nuevoNumero).qrCode(qrCode).estado("DISPONIBLE").capacidadPersonas(capacidad).activo(true).build();
        return toRecursoResponse(recursoLabRepository.save(recurso));
    }

    @Transactional
    public RecursoLabResponse editarRecurso(Long labId, Long recursoId, Map<String, Object> request) {
        asegurarAccesoAlLab(labId);
        RecursoLab recurso = recursoLabRepository.findById(recursoId)
                .orElseThrow(() -> new ResourceNotFoundException("Recurso", "id", recursoId));
        if (!recurso.getLaboratorio().getId().equals(labId)) {
            throw new BusinessException("El recurso no pertenece a este laboratorio", "INVALID_RESOURCE");
        }
        if (request.get("capacidadPersonas") instanceof Number n) {
            recurso.setCapacidadPersonas(n.intValue());
        }
        if (request.get("nombre") instanceof String s && !s.isBlank()) {
            recurso.setNombre(s);
        }
        return toRecursoResponse(recursoLabRepository.save(recurso));
    }

    @Transactional
    public void eliminarRecurso(Long labId, Long recursoId) {
        asegurarAccesoAlLab(labId);
        RecursoLab recurso = recursoLabRepository.findById(recursoId)
                .orElseThrow(() -> new ResourceNotFoundException("Recurso", "id", recursoId));
        if (!recurso.getLaboratorio().getId().equals(labId)) { throw new BusinessException("El recurso no pertenece", "INVALID_RESOURCE"); }
        recursoLabRepository.delete(recurso);
    }

    /**
     * Verifica que el usuario actual pueda gestionar este laboratorio:
     * ADMIN/COORDINADOR pueden cualquiera; RESPONSABLE_LAB solo los que tiene asignados.
     * Lanza AccessDeniedException (403) si no tiene acceso.
     */
    private void asegurarAccesoAlLab(Long labId) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            throw new AccessDeniedException("No autenticado");
        }
        boolean esAdmin = auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch(a -> a.equals("ROLE_ADMIN") || a.equals("ROLE_COORDINADOR"));
        if (esAdmin) return;

        Number asignado = (Number) entityManager.createNativeQuery(
                "SELECT COUNT(*) FROM lab_responsables lr JOIN usuarios u ON u.id = lr.usuario_id " +
                "WHERE lr.laboratorio_id = :labId AND u.correo_utec = :email")
                .setParameter("labId", labId)
                .setParameter("email", auth.getName())
                .getSingleResult();
        if (asignado == null || asignado.longValue() == 0) {
            throw new AccessDeniedException("No tienes asignado este laboratorio");
        }
    }
}
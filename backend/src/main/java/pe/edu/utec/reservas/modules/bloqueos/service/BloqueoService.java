package pe.edu.utec.reservas.modules.bloqueos.service;

import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.utec.reservas.modules.bloqueos.dto.BloqueoResponse;
import pe.edu.utec.reservas.modules.bloqueos.dto.CreateBloqueoRequest;
import pe.edu.utec.reservas.modules.bloqueos.dto.GenerarAlmuerzosRequest;
import pe.edu.utec.reservas.modules.bloqueos.dto.GenerarAlmuerzosResponse;
import pe.edu.utec.reservas.modules.bloqueos.model.Bloqueo;
import pe.edu.utec.reservas.modules.bloqueos.repository.BloqueoRepository;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.iam.repository.UsuarioRepository;
import pe.edu.utec.reservas.modules.aulas.model.Aula;
import pe.edu.utec.reservas.modules.aulas.repository.AulaRepository;
import pe.edu.utec.reservas.modules.laboratorios.model.Laboratorio;
import pe.edu.utec.reservas.modules.laboratorios.repository.LaboratorioRepository;
import pe.edu.utec.reservas.modules.notificaciones.EmailService;
import pe.edu.utec.reservas.modules.reservas.model.Reserva;
import pe.edu.utec.reservas.modules.reservas.repository.ReservaRepository;
import pe.edu.utec.reservas.shared.exceptions.BusinessException;
import pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class BloqueoService {

    private final BloqueoRepository bloqueoRepository;
    private final LaboratorioRepository laboratorioRepository;
    private final AulaRepository aulaRepository;
    private final UsuarioRepository usuarioRepository;
    private final ReservaRepository reservaRepository;
    private final EntityManager entityManager;
    private final EmailService emailService;
    private final org.springframework.context.ApplicationEventPublisher eventPublisher;

    /** Publica un cambio de bloqueo para el empuje SSE (se emite tras el commit). */
    private void emitirCambio(Long labId) {
        if (labId != null) eventPublisher.publishEvent(
                new pe.edu.utec.reservas.modules.realtime.LabActivityEvent("BLOQUEO", labId));
    }

    // Ventana institucional de acceso para bloqueos/eventos (acceso ampliado al lab,
    // más amplia que el horario de atención del lab usado por las reservas de alumnos).
    private static final LocalTime ACCESO_INICIO = LocalTime.of(7, 0);
    private static final LocalTime ACCESO_FIN = LocalTime.of(23, 0);

    @Transactional
    public BloqueoResponse crear(CreateBloqueoRequest request, String correoUsuario) {
        return crear(request, correoUsuario, true);
    }

    /**
     * Igual que {@link #crear(CreateBloqueoRequest, String)} pero permite silenciar el correo
     * al responsable (lo usa la importación masiva, que decide si notificar según el flag del
     * request de importación). El envío sigue sujeto a {@link #esNotificable(String)}.
     */
    @Transactional
    public BloqueoResponse crear(CreateBloqueoRequest request, String correoUsuario, boolean enviarCorreo) {

        // El bloqueo recae en un LABORATORIO o en un AULA (exactamente uno).
        if (request.getAulaId() != null) {
            return crearAula(request, correoUsuario, enviarCorreo);
        }
        if (request.getLaboratorioId() == null) {
            throw new BusinessException("Debes indicar un laboratorio o un aula", "MISSING_ESPACIO");
        }

        Laboratorio lab = laboratorioRepository.findById(request.getLaboratorioId())
                .orElseThrow(() -> new ResourceNotFoundException("Laboratorio", "id", request.getLaboratorioId()));

        Usuario usuario = usuarioRepository.findByCorreoUtec(correoUsuario)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "correo", correoUsuario));

        asegurarAccesoAlLab(lab.getId(), usuario);
        validarRequest(request);
        validarReservasActivas(request, null);
        liberarAlmuerzosSolapados(request); // un TOTAL reemplaza al almuerzo (prioridad más baja)
        validarBloqueosSolapados(request, null);

        Bloqueo bloqueo = Bloqueo.builder()
                .laboratorio(lab)
                .tipo(request.getTipo())
                .motivo(request.getMotivo())
                .descripcion(request.getDescripcion())
                .responsableNombre(request.getResponsableNombre())
                .responsableCorreo(request.getResponsableCorreo())
                .fechaInicio(request.getFechaInicio())
                .fechaFin(request.getFechaFin())
                .horaInicio(request.getHoraInicio())
                .horaFin(request.getHoraFin())
                .activo(true)
                .creadoPor(usuario)
                .build();

        bloqueo = bloqueoRepository.save(bloqueo);

        if ("PARCIAL".equals(request.getTipo())) {
            guardarRecursosBloqueo(bloqueo.getId(), request.getRecursosIds());
        }

        log.info("Bloqueo creado - ID: {} | Lab: {} | Tipo: {} | Motivo: {} | {} al {}",
                bloqueo.getId(), lab.getCodigoLab(), request.getTipo(),
                request.getMotivo(), request.getFechaInicio(), request.getFechaFin());

        if (enviarCorreo && esNotificable(request.getMotivo())
                && request.getResponsableCorreo() != null && !request.getResponsableCorreo().isBlank()) {
            emailService.enviarBloqueoCreado(
                    request.getResponsableCorreo(),
                    request.getResponsableNombre() != null ? request.getResponsableNombre() : "responsable",
                    lab.getNombre(),
                    request.getTipo(),
                    request.getMotivo(),
                    request.getFechaInicio().toString(),
                    request.getHoraInicio() != null ? request.getHoraInicio().toString() : null,
                    request.getHoraFin() != null ? request.getHoraFin().toString() : null,
                    request.getDescripcion(),
                    nombresRecursosDeBloqueo(bloqueo.getId()),
                    false);
        }

        emitirCambio(lab.getId());
        return toResponse(bloqueo);
    }

    /**
     * Crea un bloqueo sobre un AULA (aula/aula mixta/auditorio/sala…). Las aulas se reservan en su
     * TOTALIDAD (no tienen recursos como las mesas de un lab), así que siempre es TOTAL y no valida
     * reservas (las aulas no se reservan por alumnos). Solo ADMIN y DOCENCIA (Counter Docentes)
     * gestionan aulas — el COORDINADOR administra laboratorios, no los demás espacios.
     */
    private BloqueoResponse crearAula(CreateBloqueoRequest request, String correoUsuario, boolean enviarCorreo) {
        Aula aula = aulaRepository.findById(request.getAulaId())
                .orElseThrow(() -> new ResourceNotFoundException("Aula", "id", request.getAulaId()));
        Usuario usuario = usuarioRepository.findByCorreoUtec(correoUsuario)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "correo", correoUsuario));
        asegurarAccesoAlAula(usuario);

        request.setTipo("TOTAL");              // un aula se bloquea completa
        request.setRecursosIds(null);
        validarRequest(request);
        validarBloqueosSolapadosAula(request, null);

        Bloqueo bloqueo = Bloqueo.builder()
                .aula(aula).tipo("TOTAL").motivo(request.getMotivo())
                .descripcion(request.getDescripcion())
                .responsableNombre(request.getResponsableNombre())
                .responsableCorreo(request.getResponsableCorreo())
                .fechaInicio(request.getFechaInicio()).fechaFin(request.getFechaFin())
                .horaInicio(request.getHoraInicio()).horaFin(request.getHoraFin())
                .activo(true).creadoPor(usuario).build();
        bloqueo = bloqueoRepository.save(bloqueo);
        log.info("Bloqueo de AULA creado - ID: {} | Aula: {} | Motivo: {} | {} al {}",
                bloqueo.getId(), aula.getCodigo(), request.getMotivo(), request.getFechaInicio(), request.getFechaFin());

        if (enviarCorreo && esNotificable(request.getMotivo())
                && request.getResponsableCorreo() != null && !request.getResponsableCorreo().isBlank()) {
            emailService.enviarBloqueoCreado(request.getResponsableCorreo(),
                    request.getResponsableNombre() != null ? request.getResponsableNombre() : "responsable",
                    aula.getNombre() != null ? aula.getNombre() : aula.getCodigo(),
                    "TOTAL", request.getMotivo(), request.getFechaInicio().toString(),
                    request.getHoraInicio() != null ? request.getHoraInicio().toString() : null,
                    request.getHoraFin() != null ? request.getHoraFin().toString() : null,
                    request.getDescripcion(), List.of(), false);
        }
        return toResponse(bloqueo);
    }

    /** Solape de bloqueos activos sobre la MISMA aula (misma fecha y franja). */
    private void validarBloqueosSolapadosAula(CreateBloqueoRequest request, Long bloqueoIdExcluir) {
        for (Bloqueo b : bloqueoRepository.findByAulaIdAndActivoTrue(request.getAulaId())) {
            if (bloqueoIdExcluir != null && b.getId().equals(bloqueoIdExcluir)) continue;
            if (b.getFechaInicio().isAfter(request.getFechaFin()) || b.getFechaFin().isBefore(request.getFechaInicio())) continue;
            if (!horasSolapan(b.getHoraInicio(), b.getHoraFin(), request.getHoraInicio(), request.getHoraFin())) continue;
            throw new BusinessException(
                    "Ya existe un bloqueo en esa aula que se cruza con esa fecha y horario.", "BLOQUEO_SOLAPADO");
        }
    }

    /** Solo ADMIN y DOCENCIA (Counter Docentes) gestionan bloqueos de aulas. El COORDINADOR,
     *  DIRECTOR y RESPONSABLE_LAB administran laboratorios (con su alcance), no otros espacios. */
    private void asegurarAccesoAlAula(Usuario usuario) {
        String rol = usuario.getRol().getNombre();
        if (!"ADMIN".equals(rol) && !"DOCENCIA".equals(rol)) {
            throw new AccessDeniedException("Solo Admin o el Counter de Docencia pueden bloquear aulas");
        }
    }

    @Transactional(readOnly = true)
    public List<BloqueoResponse> listarPorAula(Long aulaId) {
        return bloqueoRepository.findByAulaIdAndActivoTrue(aulaId).stream().map(this::toResponse).toList();
    }

    @Transactional
    public BloqueoResponse editar(Long bloqueoId, CreateBloqueoRequest request, String correoUsuario) {

        Bloqueo bloqueo = bloqueoRepository.findById(bloqueoId)
                .orElseThrow(() -> new ResourceNotFoundException("Bloqueo", "id", bloqueoId));

        if (!bloqueo.getActivo()) {
            throw new BusinessException("No se puede editar un bloqueo desactivado", "BLOQUEO_INACTIVO");
        }
        // La edición de bloqueos de AULA no está soportada (se gestionan borrando y recreando),
        // así evitamos NPE al leer el laboratorio destino de un bloqueo sin lab.
        if (bloqueo.getAula() != null) {
            throw new BusinessException("Los bloqueos de aula se gestionan eliminándolos y creándolos de nuevo.", "AULA_NO_EDITABLE");
        }
        // Un RETIRO de mesas es un parcial de TODO EL DÍA sobre un RANGO de fechas (p. ej. para
        // ACORTARLO si las mesas regresan antes). Solo se puede editar SIGUIENDO ese formato:
        // motivo RETIRO y sin horas. El editor genérico de bloqueos (una sola fecha + horas)
        // lo corrompería, por eso se rechaza ese tipo de edición.
        if ("RETIRO".equalsIgnoreCase(bloqueo.getMotivo())) {
            boolean editComoRetiro = "RETIRO".equalsIgnoreCase(request.getMotivo())
                    && request.getHoraInicio() == null && request.getHoraFin() == null;
            if (!editComoRetiro) {
                throw new BusinessException("Un retiro de mesas solo se edita como retiro (rango de fechas, todo el día) desde el laboratorio.", "RETIRO_NO_EDITABLE");
            }
        }

        Laboratorio lab = laboratorioRepository.findById(request.getLaboratorioId())
                .orElseThrow(() -> new ResourceNotFoundException("Laboratorio", "id", request.getLaboratorioId()));

        Usuario editor = usuarioRepository.findByCorreoUtec(correoUsuario)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "correo", correoUsuario));
        // Debe poder gestionar tanto el lab actual del bloqueo como el lab destino (si lo cambia).
        if (bloqueo.getLaboratorio() != null) asegurarAccesoAlLab(bloqueo.getLaboratorio().getId(), editor);
        asegurarAccesoAlLab(lab.getId(), editor);

        validarRequest(request);
        validarReservasActivas(request, bloqueoId);
        liberarAlmuerzosSolapados(request); // un TOTAL reemplaza al almuerzo (prioridad más baja)
        validarBloqueosSolapados(request, bloqueoId);

        bloqueo.setLaboratorio(lab);
        bloqueo.setTipo(request.getTipo());
        bloqueo.setMotivo(request.getMotivo());
        bloqueo.setDescripcion(request.getDescripcion());
        bloqueo.setFechaInicio(request.getFechaInicio());
        bloqueo.setFechaFin(request.getFechaFin());
        bloqueo.setHoraInicio(request.getHoraInicio());
        bloqueo.setHoraFin(request.getHoraFin());

        bloqueo = bloqueoRepository.save(bloqueo);

        // Recursos afectados (bloqueos PARCIAL):
        //  - TOTAL  → se limpian (un bloqueo total no tiene recursos puntuales).
        //  - PARCIAL con recursosIds en el request → reemplaza la selección.
        //  - PARCIAL sin recursosIds (p. ej. el modal de edición que solo cambia hora/fecha)
        //    → se CONSERVAN los recursos existentes (no se borran), para no dejar el bloqueo "vacío".
        boolean traeRecursos = request.getRecursosIds() != null && !request.getRecursosIds().isEmpty();
        if ("TOTAL".equals(request.getTipo()) || traeRecursos) {
            entityManager.createNativeQuery("DELETE FROM bloqueo_recursos WHERE bloqueo_id = :b")
                    .setParameter("b", bloqueoId).executeUpdate();
            if ("PARCIAL".equals(request.getTipo()) && traeRecursos) {
                guardarRecursosBloqueo(bloqueoId, request.getRecursosIds());
            }
        }

        log.info("Bloqueo editado - ID: {} | Lab: {} | Por: {}", bloqueoId, lab.getCodigoLab(), correoUsuario);

        // Reenvía el correo actualizado al responsable (datos tomados del bloqueo, no del editor).
        String correoResp = bloqueo.getResponsableCorreo();
        if (esNotificable(request.getMotivo()) && correoResp != null && !correoResp.isBlank()) {
            emailService.enviarBloqueoCreado(
                    correoResp,
                    bloqueo.getResponsableNombre() != null ? bloqueo.getResponsableNombre() : "responsable",
                    lab.getNombre(),
                    request.getTipo(),
                    request.getMotivo(),
                    request.getFechaInicio().toString(),
                    request.getHoraInicio() != null ? request.getHoraInicio().toString() : null,
                    request.getHoraFin() != null ? request.getHoraFin().toString() : null,
                    request.getDescripcion(),
                    nombresRecursosDeBloqueo(bloqueoId),
                    true);
        }

        emitirCambio(lab.getId());
        return toResponse(bloqueo);
    }

    @Transactional(readOnly = true)
    public List<BloqueoResponse> listarPorLaboratorio(Long laboratorioId) {
        return bloqueoRepository.findByLaboratorioIdAndActivoTrue(laboratorioId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<BloqueoResponse> listarActivosHoy() {
        return bloqueoRepository.findAllActiveByFecha(LocalDate.now()).stream()
                .map(this::toResponse)
                .toList();
    }

    /**
     * Programa el ALMUERZO recurrente de un lab (una fila por día) sobre sus DÍAS DE ATENCIÓN en el
     * rango. El almuerzo es la prioridad más baja: omite los días con evento/clase/reserva y los
     * reporta. Con forzar=true cancela (y notifica) las reservas de alumno en conflicto y crea igual.
     */
    @Transactional
    public GenerarAlmuerzosResponse generarAlmuerzos(Long labId, GenerarAlmuerzosRequest req, String correoUsuario) {
        Laboratorio lab = laboratorioRepository.findById(labId)
                .orElseThrow(() -> new ResourceNotFoundException("Laboratorio", "id", labId));
        Usuario usuario = usuarioRepository.findByCorreoUtec(correoUsuario)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "correo", correoUsuario));
        asegurarAccesoAlLab(labId, usuario);

        if (req.getFechaInicio().isAfter(req.getFechaFin()))
            throw new BusinessException("El rango de fechas es inválido", "INVALID_RANGE");
        if (!req.getHoraInicio().isBefore(req.getHoraFin()))
            throw new BusinessException("La hora de inicio debe ser anterior a la de fin", "INVALID_HOURS");
        if (req.getHoraInicio().isBefore(ACCESO_INICIO) || req.getHoraFin().isAfter(ACCESO_FIN))
            throw new BusinessException("El almuerzo debe estar dentro de 07:00–23:00", "OUT_OF_WINDOW");

        // Días de atención del lab → set de DayOfWeek (si no define, se asume L–V).
        Set<DayOfWeek> diasAtiende = new HashSet<>();
        if (lab.getDiasAtencion() == null || lab.getDiasAtencion().isEmpty()) {
            diasAtiende.addAll(List.of(DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY));
        } else {
            lab.getDiasAtencion().forEach(s -> { DayOfWeek d = diaDeString(s); if (d != null) diasAtiende.add(d); });
        }

        int creados = 0, canceladas = 0;
        List<GenerarAlmuerzosResponse.Omitido> omitidos = new ArrayList<>();

        for (LocalDate d = req.getFechaInicio(); !d.isAfter(req.getFechaFin()); d = d.plusDays(1)) {
            if (!diasAtiende.contains(d.getDayOfWeek())) continue; // no atiende ese día → no aplica

            List<Bloqueo> bloqueosDia = bloqueoRepository.findActiveByLaboratorioAndFecha(labId, d).stream()
                    .filter(b -> horasSolapan(b.getHoraInicio(), b.getHoraFin(), req.getHoraInicio(), req.getHoraFin()))
                    .toList();
            if (bloqueosDia.stream().anyMatch(b -> "ALMUERZO".equalsIgnoreCase(b.getMotivo()))) {
                omitidos.add(omitido(d, "ya existe")); continue;
            }
            if (bloqueosDia.stream().anyMatch(b -> !"RETIRO".equalsIgnoreCase(b.getMotivo()))) {
                omitidos.add(omitido(d, "evento")); continue; // otro bloqueo (evento/mantenimiento) manda
            }
            if (!bloqueoRepository.findClasesEnLabParaFechaHora(labId, diaEnum(d), d, req.getHoraInicio(), req.getHoraFin()).isEmpty()) {
                omitidos.add(omitido(d, "clase")); continue;
            }

            List<Reserva> reservas = reservaRepository.findActivasPorLabYRango(labId, d, d).stream()
                    .filter(r -> horasSolapan(r.getHoraInicio(), r.getHoraFin(), req.getHoraInicio(), req.getHoraFin()))
                    .toList();
            if (!reservas.isEmpty()) {
                if (!Boolean.TRUE.equals(req.getForzar())) { omitidos.add(omitido(d, "reserva")); continue; }
                for (Reserva r : reservas) {
                    r.setEstado("CANCELADA");
                    reservaRepository.save(r);
                    canceladas++;
                    try {
                        emailService.enviarReservaCancelada(r.getUsuario().getCorreoUtec(), r.getUsuario().getNombreCompleto(),
                                lab.getNombre(), r.getRecurso().getNombre(), r.getFecha().toString(),
                                r.getHoraInicio().toString(), r.getHoraFin().toString());
                    } catch (Exception ignore) { /* best-effort: el correo no rompe la operación */ }
                }
            }

            bloqueoRepository.save(Bloqueo.builder()
                    .laboratorio(lab).tipo("TOTAL").motivo("ALMUERZO").descripcion("Almuerzo")
                    .fechaInicio(d).fechaFin(d).horaInicio(req.getHoraInicio()).horaFin(req.getHoraFin())
                    .activo(true).creadoPor(usuario).build());
            creados++;
        }

        log.info("Almuerzos generados en lab {}: creados={} omitidos={} reservasCanceladas={}",
                labId, creados, omitidos.size(), canceladas);
        emitirCambio(labId);
        return GenerarAlmuerzosResponse.builder()
                .creados(creados).reservasCanceladas(canceladas).omitidos(omitidos).build();
    }

    private static GenerarAlmuerzosResponse.Omitido omitido(LocalDate f, String motivo) {
        return GenerarAlmuerzosResponse.Omitido.builder().fecha(f).motivo(motivo).build();
    }

    /** "Lunes"/"Miércoles"/… (con o sin tilde) → DayOfWeek; null si no matchea. */
    private static DayOfWeek diaDeString(String s) {
        String n = java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").toUpperCase().trim();
        return switch (n) {
            case "LUNES" -> DayOfWeek.MONDAY; case "MARTES" -> DayOfWeek.TUESDAY;
            case "MIERCOLES" -> DayOfWeek.WEDNESDAY; case "JUEVES" -> DayOfWeek.THURSDAY;
            case "VIERNES" -> DayOfWeek.FRIDAY; case "SABADO" -> DayOfWeek.SATURDAY;
            case "DOMINGO" -> DayOfWeek.SUNDAY; default -> null;
        };
    }

    /** LocalDate → "LUNES"/"MARTES"/… (como se guarda dia_semana en las clases). */
    private static String diaEnum(LocalDate f) {
        return switch (f.getDayOfWeek()) {
            case MONDAY -> "LUNES"; case TUESDAY -> "MARTES"; case WEDNESDAY -> "MIERCOLES";
            case THURSDAY -> "JUEVES"; case FRIDAY -> "VIERNES"; case SATURDAY -> "SABADO"; case SUNDAY -> "DOMINGO";
        };
    }

    /**
     * Feriados operativos del año (fechas distintas de bloqueos motivo=FERIADO) con su nombre.
     * El calendario los pinta como marca "Feriado" INDEPENDIENTE del ciclo, para que también
     * aparezcan los de receso (fuera del rango de cualquier ciclo, p. ej. 6-ago), que la
     * derivación académica (por ciclo) no cubre.
     */
    @Transactional(readOnly = true)
    public List<pe.edu.utec.reservas.modules.bloqueos.dto.FeriadoResponse> listarFeriadosDelAnio(int anio) {
        return bloqueoRepository.findFeriadosOperativosEnRango(
                        LocalDate.of(anio, 1, 1), LocalDate.of(anio, 12, 31)).stream()
                .map(r -> pe.edu.utec.reservas.modules.bloqueos.dto.FeriadoResponse.builder()
                        .fecha(((java.sql.Date) r[0]).toLocalDate())
                        .descripcion((String) r[1])
                        .build())
                .toList();
    }

    @Transactional(readOnly = true)
    public List<BloqueoResponse> listarTodosActivos(String correoUsuario) {
        return listarTodosActivos(correoUsuario, false);
    }

    /**
     * @param incluirClases si true, incluye también las clases del horario (es_clase=true) —
     *   el toggle "Mostrar clases" de la página de Bloqueos. Por defecto se excluyen (hay ~1.600
     *   y ahogarían el listado). El alcance por rol se aplica igual.
     */
    @Transactional(readOnly = true)
    public List<BloqueoResponse> listarTodosActivos(String correoUsuario, boolean incluirClases) {
        Usuario usuario = usuarioRepository.findByCorreoUtec(correoUsuario)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "correo", correoUsuario));
        String rol = usuario.getRol().getNombre();

        List<Bloqueo> bloqueos = incluirClases
                ? bloqueoRepository.findByActivoTrueIncluyendoClases()
                : bloqueoRepository.findByActivoTrue();
        // ADMIN/COORDINADOR ven todo; DOCENCIA solo los bloqueos de AULA (los que gestiona);
        // DIRECTOR/RESPONSABLE_LAB solo los bloqueos de SUS labs.
        if (!"ADMIN".equals(rol) && !"COORDINADOR".equals(rol)) {
            if ("DOCENCIA".equals(rol)) {
                bloqueos = bloqueos.stream().filter(b -> b.getAula() != null).toList();
            } else {
                Set<Long> misLabs = labIdsDeUsuario(usuario);
                bloqueos = bloqueos.stream()
                        .filter(b -> b.getLaboratorio() != null && misLabs.contains(b.getLaboratorio().getId()))
                        .toList();
            }
        }
        return bloqueos.stream().map(this::toResponse).toList();
    }

    /**
     * Alcance de gestión: ADMIN/COORDINADOR gestionan bloqueos de cualquier lab; DIRECTOR y
     * RESPONSABLE_LAB SOLO de sus labs (mismos que ven en la lista, vía {@link #labIdsDeUsuario}).
     * Sin esto, un rol elevado-pero-acotado podía crear/editar/borrar bloqueos de labs ajenos por
     * API directa (el frontend solo oculta los labs, no es control de seguridad) → IDOR.
     */
    private void asegurarAccesoAlLab(Long labId, Usuario usuario) {
        String rol = usuario.getRol().getNombre();
        if ("ADMIN".equals(rol) || "COORDINADOR".equals(rol)) return;
        if (!labIdsDeUsuario(usuario).contains(labId)) {
            throw new AccessDeniedException("No tienes asignado este laboratorio");
        }
    }

    /** IDs de los labs que el usuario puede ver/gestionar (DIRECTOR: su depto/direct; RESPONSABLE_LAB: asignados). */
    private Set<Long> labIdsDeUsuario(Usuario usuario) {
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
        return ids.stream().map(Number::longValue).collect(Collectors.toSet());
    }

    /** Borrado real (no soft-delete). Los recursos del bloqueo se eliminan en cascada (FK ON DELETE CASCADE). */
    @Transactional
    public void eliminar(Long bloqueoId, String correoUsuario) {
        Bloqueo bloqueo = bloqueoRepository.findById(bloqueoId)
                .orElseThrow(() -> new ResourceNotFoundException("Bloqueo", "id", bloqueoId));

        if (bloqueo.getLaboratorio() != null) {
            Usuario usuario = usuarioRepository.findByCorreoUtec(correoUsuario)
                    .orElseThrow(() -> new ResourceNotFoundException("Usuario", "correo", correoUsuario));
            asegurarAccesoAlLab(bloqueo.getLaboratorio().getId(), usuario);
        } else if (bloqueo.getAula() != null) {
            Usuario usuario = usuarioRepository.findByCorreoUtec(correoUsuario)
                    .orElseThrow(() -> new ResourceNotFoundException("Usuario", "correo", correoUsuario));
            asegurarAccesoAlAula(usuario);
        }

        // Capturamos los datos ANTES de borrar para el correo de cancelación (el envío es @Async).
        String correoResp = bloqueo.getResponsableCorreo();
        String nombreResp = bloqueo.getResponsableNombre();
        String labNombre = bloqueo.getLaboratorio() != null ? bloqueo.getLaboratorio().getNombre()
                : (bloqueo.getAula() != null ? bloqueo.getAula().getNombre() : "—");
        String tipo = bloqueo.getTipo();
        String motivo = bloqueo.getMotivo();
        String fecha = bloqueo.getFechaInicio() != null ? bloqueo.getFechaInicio().toString() : "—";
        String hi = bloqueo.getHoraInicio() != null ? bloqueo.getHoraInicio().toString() : null;
        String hf = bloqueo.getHoraFin() != null ? bloqueo.getHoraFin().toString() : null;
        Long labId = bloqueo.getLaboratorio() != null ? bloqueo.getLaboratorio().getId() : null;

        bloqueoRepository.delete(bloqueo);
        log.info("Bloqueo ELIMINADO - ID: {} | Por: {}", bloqueoId, correoUsuario);
        emitirCambio(labId);

        if (esNotificable(motivo) && correoResp != null && !correoResp.isBlank()) {
            emailService.enviarBloqueoCancelado(correoResp,
                    nombreResp != null ? nombreResp : "responsable",
                    labNombre, tipo, motivo, fecha, hi, hf);
        }
    }

    // ── Validaciones ──

    private void validarRequest(CreateBloqueoRequest request) {
        if (request.getFechaInicio().isAfter(request.getFechaFin())) {
            throw new BusinessException("La fecha de inicio debe ser anterior a la fecha de fin", "INVALID_DATES");
        }

        // Un RETIRO (mesas fuera por un periodo) es un parcial de TODO EL DÍA: no exige horas
        // (null = toda la ventana del lab). El resto de parciales sí requieren franja.
        boolean esRetiro = "RETIRO".equalsIgnoreCase(request.getMotivo());
        if ("PARCIAL".equals(request.getTipo()) && !esRetiro
                && (request.getHoraInicio() == null || request.getHoraFin() == null)) {
            throw new BusinessException("Los bloqueos parciales requieren hora de inicio y fin", "MISSING_HOURS");
        }
        if (request.getHoraInicio() != null && request.getHoraFin() != null
                && !request.getHoraInicio().isBefore(request.getHoraFin())) {
            throw new BusinessException("La hora de inicio debe ser anterior a la hora de fin", "INVALID_HOURS");
        }

        // Ventana institucional: los bloqueos/eventos solo dentro de 07:00–23:00
        if (request.getHoraInicio() != null && request.getHoraInicio().isBefore(ACCESO_INICIO)) {
            throw new BusinessException("Los bloqueos solo pueden iniciar desde las 07:00", "OUT_OF_WINDOW");
        }
        if (request.getHoraFin() != null && request.getHoraFin().isAfter(ACCESO_FIN)) {
            throw new BusinessException("Los bloqueos solo pueden terminar hasta las 23:00", "OUT_OF_WINDOW");
        }
    }

    private void validarReservasActivas(CreateBloqueoRequest request, Long bloqueoIdExcluir) {
        LocalDate fechaInicio = request.getFechaInicio();
        LocalDate fechaFin = request.getFechaFin();
        LocalTime horaInicio = request.getHoraInicio();
        LocalTime horaFin = request.getHoraFin();

        // Escalable: solo trae las reservas ACTIVAS del lab en el rango de fechas (no toda la tabla).
        List<Reserva> reservasEnConflicto = reservaRepository
                .findActivasPorLabYRango(request.getLaboratorioId(), fechaInicio, fechaFin).stream()
                .filter(r -> {
                    // En bloqueos PARCIALES solo cuentan los recursos seleccionados
                    if ("PARCIAL".equals(request.getTipo())
                            && request.getRecursosIds() != null && !request.getRecursosIds().isEmpty()
                            && !request.getRecursosIds().contains(r.getRecurso().getId())) {
                        return false;
                    }
                    if (horaInicio != null && horaFin != null) {
                        return r.getHoraInicio().isBefore(horaFin) && r.getHoraFin().isAfter(horaInicio);
                    }
                    return true;
                })
                .collect(Collectors.toList());

        if (!reservasEnConflicto.isEmpty()) {
            StringBuilder msg = new StringBuilder();
            msg.append("No se puede crear el bloqueo. Existen ").append(reservasEnConflicto.size())
               .append(" reserva(s) activa(s) en ese horario:\n");

            for (Reserva r : reservasEnConflicto) {
                msg.append("• ").append(r.getRecurso().getNombre())
                   .append(" — ").append(r.getUsuario().getNombreCompleto())
                   .append(" (").append(r.getFecha())
                   .append(" ").append(r.getHoraInicio().toString().substring(0, 5))
                   .append("-").append(r.getHoraFin().toString().substring(0, 5))
                   .append(", ").append(r.getEstado()).append(")\n");
            }

            msg.append("Cancela las reservas primero o elige otro horario.");
            throw new BusinessException(msg.toString(), "RESERVAS_ACTIVAS");
        }
    }

    /**
     * PRIORIDAD del almuerzo (el más débil): un bloqueo TOTAL nuevo (evento/mantenimiento/…, salvo
     * el propio ALMUERZO) que cae sobre un ALMUERZO existente lo REEMPLAZA → se elimina el almuerzo
     * en lugar de rechazar el nuevo bloqueo (evita el "doble trabajo" de borrarlo a mano). Solo se
     * borran los almuerzos cuyo rango queda CONTENIDO en el del nuevo bloqueo (un almuerzo de un día
     * cede ante un evento de ese día; un almuerzo de rango amplio NO se borra por un evento puntual).
     * Un bloqueo PARCIAL NO borra el almuerzo (cierra solo su mesa; el almuerzo cierra el resto).
     */
    private void liberarAlmuerzosSolapados(CreateBloqueoRequest request) {
        if (!"TOTAL".equals(request.getTipo()) || "ALMUERZO".equalsIgnoreCase(request.getMotivo())) return;
        List<Bloqueo> aBorrar = bloqueoRepository.findByLaboratorioIdAndActivoTrue(request.getLaboratorioId()).stream()
                .filter(b -> "ALMUERZO".equalsIgnoreCase(b.getMotivo()))
                // Rango del almuerzo contenido en el del nuevo bloqueo (protege almuerzos de rango amplio).
                .filter(b -> !b.getFechaInicio().isBefore(request.getFechaInicio()) && !b.getFechaFin().isAfter(request.getFechaFin()))
                .filter(b -> horasSolapan(b.getHoraInicio(), b.getHoraFin(), request.getHoraInicio(), request.getHoraFin()))
                .toList();
        for (Bloqueo b : aBorrar) {
            bloqueoRepository.delete(b);
            log.info("Almuerzo {} eliminado: reemplazado por bloqueo TOTAL en lab {} ({} {}-{})",
                    b.getId(), request.getLaboratorioId(), b.getFechaInicio(), b.getHoraInicio(), b.getHoraFin());
        }
        if (!aBorrar.isEmpty()) bloqueoRepository.flush(); // para que validarBloqueosSolapados ya no los vea
    }

    /**
     * Impide crear/editar un bloqueo que se solape con OTRO bloqueo activo del mismo lab
     * en la misma fecha y franja, sobre los mismos recursos. Un bloqueo TOTAL cubre todo el lab.
     * Regla de borde: si una mesa se libera a las 11:00, un nuevo bloqueo puede empezar a las 11:00
     * (el solape de horas es estricto: fin > inicioNuevo y inicio < finNuevo).
     */
    private void validarBloqueosSolapados(CreateBloqueoRequest request, Long bloqueoIdExcluir) {
        // Un RETIRO de mesas NO es un ocupante que reserva horario: es una reducción de
        // CAPACIDAD (las mesas dejan de existir ese periodo). Por eso no participa del cruce de
        // bloqueos — no choca con eventos ni ellos con él (eso evita el "doble flujo": tener que
        // desbloquear el retiro para poder poner un evento total/parcial). Sí valida reservas
        // activas (validarReservasActivas) para no dejar reservas huérfanas sobre mesas retiradas.
        if ("RETIRO".equalsIgnoreCase(request.getMotivo())) return;

        LocalDate fi = request.getFechaInicio();
        LocalDate ff = request.getFechaFin();
        LocalTime hi = request.getHoraInicio();
        LocalTime hf = request.getHoraFin();
        boolean nuevoEsTotal = "TOTAL".equals(request.getTipo());
        Set<Long> nuevoRecursos = (nuevoEsTotal || request.getRecursosIds() == null)
                ? Set.of() : new HashSet<>(request.getRecursosIds());

        for (Bloqueo b : bloqueoRepository.findByLaboratorioIdAndActivoTrue(request.getLaboratorioId())) {
            if (bloqueoIdExcluir != null && b.getId().equals(bloqueoIdExcluir)) continue;
            // Un RETIRO existente no bloquea a un evento nuevo (es capacidad, no un ocupante).
            if ("RETIRO".equalsIgnoreCase(b.getMotivo())) continue;
            // Solape de fechas
            if (b.getFechaInicio().isAfter(ff) || b.getFechaFin().isBefore(fi)) continue;
            // Solape de horas (un bloqueo sin horas = todo el día)
            if (!horasSolapan(b.getHoraInicio(), b.getHoraFin(), hi, hf)) continue;
            // Solape de recursos: un TOTAL (nuevo o existente) cubre todo el laboratorio
            boolean existenteEsTotal = "TOTAL".equals(b.getTipo());
            boolean recursosSolapan = nuevoEsTotal || existenteEsTotal
                    || recursosDeBloqueo(b.getId()).stream().anyMatch(nuevoRecursos::contains);
            if (recursosSolapan) {
                throw new BusinessException(
                        "Ya existe un bloqueo " + b.getTipo().toLowerCase()
                                + " en ese laboratorio que se cruza con esa fecha y horario"
                                + (existenteEsTotal ? " (bloqueo total del lab)" : "")
                                + ". El recurso queda libre recién al terminar ese bloqueo; elige otro horario o edita el existente.",
                        "BLOQUEO_SOLAPADO");
            }
        }
    }

    /** ¿Se solapan dos franjas horarias? null = todo el día (siempre solapa). Borde estricto. */
    private boolean horasSolapan(LocalTime aIni, LocalTime aFin, LocalTime bIni, LocalTime bFin) {
        if (aIni == null || aFin == null || bIni == null || bFin == null) return true;
        return aIni.isBefore(bFin) && aFin.isAfter(bIni);
    }

    /** Persiste los recursos afectados por un bloqueo parcial en bloqueo_recursos. */
    private void guardarRecursosBloqueo(Long bloqueoId, List<Long> recursosIds) {
        if (recursosIds == null || recursosIds.isEmpty()) return;
        for (Long recursoId : recursosIds) {
            entityManager.createNativeQuery(
                    "INSERT INTO bloqueo_recursos (bloqueo_id, recurso_id) VALUES (:b, :r) " +
                    "ON CONFLICT (bloqueo_id, recurso_id) DO NOTHING")
                    .setParameter("b", bloqueoId)
                    .setParameter("r", recursoId)
                    .executeUpdate();
        }
    }

    // ── Mapper ──

    private BloqueoResponse toResponse(Bloqueo b) {
        // Los recursos afectados solo aplican a bloqueos PARCIAL; el frontend los usa
        // para pintar como "Bloqueada" cada mesa/PC en la cuadrícula de horarios.
        List<Long> recursosAfectados = "PARCIAL".equals(b.getTipo())
                ? recursosDeBloqueo(b.getId())
                : List.of();

        boolean esLab = b.getLaboratorio() != null;
        String espCodigo = esLab ? b.getLaboratorio().getCodigoLab()
                : (b.getAula() != null ? b.getAula().getCodigo() : "—");
        String espNombre = esLab ? b.getLaboratorio().getNombre()
                : (b.getAula() != null ? b.getAula().getNombre() : "—");
        String espTipo = esLab ? "LABORATORIO" : (b.getAula() != null ? b.getAula().getTipo() : "—");

        return BloqueoResponse.builder()
                .id(b.getId())
                .laboratorioCodigo(esLab ? b.getLaboratorio().getCodigoLab() : null)
                .laboratorioNombre(esLab ? b.getLaboratorio().getNombre() : null)
                .aulaId(b.getAula() != null ? b.getAula().getId() : null)
                .espacioCodigo(espCodigo).espacioNombre(espNombre).espacioTipo(espTipo)
                .tipo(b.getTipo())
                .motivo(b.getMotivo())
                .descripcion(b.getDescripcion())
                .responsableNombre(b.getResponsableNombre())
                .responsableCorreo(b.getResponsableCorreo())
                .fechaInicio(b.getFechaInicio())
                .fechaFin(b.getFechaFin())
                .horaInicio(b.getHoraInicio())
                .horaFin(b.getHoraFin())
                .activo(b.getActivo())
                .creadoPorNombre(b.getCreadoPor().getNombreCompleto())
                .createdAt(b.getCreatedAt())
                .recursosAfectados(recursosAfectados)
                .esClase(Boolean.TRUE.equals(b.getEsClase()))
                .diaSemana(b.getDiaSemana())
                .frecuencia(b.getFrecuencia())
                .ciclo(b.getCiclo())
                .seccion(b.getSeccion())
                .cursoCodigo(b.getCurso() != null ? b.getCurso().getCodCurso() : null)
                .cursoNombre(b.getCurso() != null ? b.getCurso().getNombre() : null)
                .build();
    }

    /** IDs de los recursos persistidos en bloqueo_recursos para un bloqueo parcial. */
    private List<Long> recursosDeBloqueo(Long bloqueoId) {
        List<?> rows = entityManager.createNativeQuery(
                        "SELECT recurso_id FROM bloqueo_recursos WHERE bloqueo_id = :b")
                .setParameter("b", bloqueoId)
                .getResultList();
        return rows.stream()
                .map(x -> ((Number) x).longValue())
                .collect(Collectors.toList());
    }

    /** ALMUERZO, MANTENIMIENTO, FERIADO y RETIRO son bloqueos OPERATIVOS internos: no se notifican por correo. */
    private boolean esNotificable(String motivo) {
        return !"ALMUERZO".equalsIgnoreCase(motivo) && !"MANTENIMIENTO".equalsIgnoreCase(motivo)
                && !"FERIADO".equalsIgnoreCase(motivo) && !"RETIRO".equalsIgnoreCase(motivo);
    }

    /** Nombres de los recursos de un bloqueo parcial (para listarlos en el correo). */
    private List<String> nombresRecursosDeBloqueo(Long bloqueoId) {
        List<?> rows = entityManager.createNativeQuery(
                        "SELECT rl.nombre FROM bloqueo_recursos br " +
                        "JOIN recursos_lab rl ON rl.id = br.recurso_id " +
                        "WHERE br.bloqueo_id = :b ORDER BY rl.nombre")
                .setParameter("b", bloqueoId)
                .getResultList();
        return rows.stream().map(String::valueOf).collect(Collectors.toList());
    }
}

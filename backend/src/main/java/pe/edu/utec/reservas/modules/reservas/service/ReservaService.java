package pe.edu.utec.reservas.modules.reservas.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.utec.reservas.modules.bloqueos.model.Bloqueo;
import pe.edu.utec.reservas.modules.bloqueos.repository.BloqueoRepository;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.iam.repository.UsuarioRepository;
import pe.edu.utec.reservas.modules.laboratorios.model.Laboratorio;
import pe.edu.utec.reservas.modules.laboratorios.model.RecursoLab;
import pe.edu.utec.reservas.modules.laboratorios.repository.RecursoLabRepository;
import pe.edu.utec.reservas.modules.notificaciones.EmailService;
import pe.edu.utec.reservas.modules.reservas.dto.CreateReservaRequest;
import pe.edu.utec.reservas.modules.reservas.dto.ParticipanteResumen;
import pe.edu.utec.reservas.modules.reservas.dto.ReservaResponse;
import pe.edu.utec.reservas.modules.reservas.model.Reserva;
import pe.edu.utec.reservas.modules.reservas.model.ReservaParticipante;
import pe.edu.utec.reservas.modules.reservas.repository.ReservaParticipanteRepository;
import pe.edu.utec.reservas.modules.reservas.repository.ReservaRepository;
import pe.edu.utec.reservas.shared.exceptions.BusinessException;
import pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ReservaService {

    private final ReservaRepository reservaRepository;
    private final ReservaParticipanteRepository participanteRepository;
    private final RecursoLabRepository recursoLabRepository;
    private final UsuarioRepository usuarioRepository;
    private final BloqueoRepository bloqueoRepository;
    private final pe.edu.utec.reservas.modules.aulas.repository.CicloExcepcionRepository cicloExcepcionRepository;
    private final pe.edu.utec.reservas.modules.sanciones.repository.SancionRepository sancionRepository;
    private final EmailService emailService;
    private final org.springframework.context.ApplicationEventPublisher eventPublisher;

    /** Publica un cambio de reserva para el empuje SSE (RealtimeService lo emite tras el commit). */
    private void emitirCambio(Long labId) {
        if (labId != null) eventPublisher.publishEvent(
                new pe.edu.utec.reservas.modules.realtime.LabActivityEvent("RESERVA", labId));
    }

    private static final String DOMINIO_UTEC = "@utec.edu.pe";

    @Value("${app.reservas.dias-anticipacion-max:1}")
    private int diasAnticipacionMax;

    @Transactional
    public ReservaResponse crear(CreateReservaRequest request, String correoUsuario) {

        Usuario usuario = usuarioRepository.findByCorreoUtec(correoUsuario)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "correo", correoUsuario));

        // Los DOCENTES son solo-consulta: ven calendarios y disponibilidad pero NO reservan.
        if ("DOCENTE".equals(usuario.getRol().getNombre())) {
            throw new BusinessException(
                    "Los docentes pueden consultar los calendarios pero no reservar laboratorios.",
                    "FORBIDDEN");
        }

        RecursoLab recurso = recursoLabRepository.findById(request.getRecursoId())
                .orElseThrow(() -> new ResourceNotFoundException("Recurso", "id", request.getRecursoId()));

        Laboratorio lab = recurso.getLaboratorio();

        if ("BLOQUEADO".equals(recurso.getEstado()) || "MANTENIMIENTO".equals(recurso.getEstado())) {
            throw new BusinessException(
                    "El recurso " + recurso.getNombre() + " no está disponible (estado: " + recurso.getEstado() + ")",
                    "RESOURCE_NOT_AVAILABLE"
            );
        }

        validarHorario(request, lab);
        validarFecha(request.getFecha());
        validarParticipantes(request.getParticipantes(), recurso.getCapacidadPersonas());
        validarDiaAtencion(request.getFecha(), lab);

        // Sanción/castigo: el alumno sancionado no puede reservar ese lab en esa fecha.
        validarSinSancion(usuario, lab, request.getFecha());

        // Resolver acompañantes (todos menos el titular) ANTES de crear la reserva:
        // si algún correo es inválido o no está registrado, fallamos sin dejar reserva huérfana.
        List<Usuario> acompanantes = resolverAcompanantes(
                request.getParticipantesEmails(), request.getParticipantes(), usuario);

        // Verificar bloqueos TOTALES
        List<Bloqueo> bloqueosTotales = bloqueoRepository.findBloqueosTotalesEnHorario(
                lab.getId(), request.getFecha(), request.getHoraInicio(), request.getHoraFin());
        if (!bloqueosTotales.isEmpty()) {
            Bloqueo b = bloqueosTotales.get(0);
            throw new BusinessException(
                    "El laboratorio " + lab.getNombre() + " está bloqueado por " +
                            b.getMotivo().toLowerCase() + " en ese horario",
                    "LAB_BLOCKED"
            );
        }

        // Verificar bloqueos PARCIALES del recurso
        List<Bloqueo> bloqueosParciales = bloqueoRepository.findBloqueosParcialesToRecurso(
                lab.getId(), recurso.getId(), request.getFecha(),
                request.getHoraInicio(), request.getHoraFin());
        if (!bloqueosParciales.isEmpty()) {
            throw new BusinessException(
                    "El recurso " + recurso.getNombre() + " está bloqueado en ese horario",
                    "RESOURCE_BLOCKED"
            );
        }

        // Cierre institucional (feriado que cierra todo UTEC): nadie puede reservar ese día.
        validarSinCierreInstitucional(request.getFecha());

        // Verificar clases programadas en el lab (horario académico): no se puede reservar encima.
        validarSinClaseProgramada(lab, request.getFecha(), request.getHoraInicio(), request.getHoraFin());

        // Verificar reservas simultáneas del alumno
        List<Reserva> reservasSimultaneas = reservaRepository.findReservasSimultaneasDelUsuario(
                usuario.getId(), request.getFecha(), request.getHoraInicio(), request.getHoraFin());
        if (!reservasSimultaneas.isEmpty()) {
            Reserva existente = reservasSimultaneas.get(0);
            throw new BusinessException(
                    "Ya tienes una reserva de " + existente.getHoraInicio() + " a " +
                            existente.getHoraFin() + " en " + existente.getRecurso().getNombre() +
                            ". No puedes tener dos reservas simultáneas.",
                    "SIMULTANEOUS_RESERVATION"
            );
        }

        // Double booking con row locking
        List<Reserva> conflictos = reservaRepository.findConflictingReservationsWithLock(
                request.getRecursoId(), request.getFecha(),
                request.getHoraInicio(), request.getHoraFin());
        if (!conflictos.isEmpty()) {
            throw new BusinessException(
                    "El recurso " + recurso.getNombre() + " ya está reservado de " +
                            conflictos.get(0).getHoraInicio() + " a " + conflictos.get(0).getHoraFin(),
                    "RESOURCE_NOT_AVAILABLE"
            );
        }

        // Carrera del alumno: la del request o, si no viene, la de su perfil.
        boolean indicaCarrera = request.getCarrera() != null && !request.getCarrera().isBlank();
        String carreraReserva = indicaCarrera ? request.getCarrera().trim() : usuario.getCarrera();
        // Si el alumno indicó/cambió su carrera, la recordamos en su perfil.
        if (indicaCarrera && !request.getCarrera().trim().equals(usuario.getCarrera())) {
            usuario.setCarrera(request.getCarrera().trim());
            usuarioRepository.save(usuario);
        }

        // Crear reserva
        Reserva reserva = Reserva.builder()
                .recurso(recurso)
                .usuario(usuario)
                .fecha(request.getFecha())
                .horaInicio(request.getHoraInicio())
                .horaFin(request.getHoraFin())
                .estado("PENDIENTE")
                .tipoReserva("ALUMNO")
                .participantes(request.getParticipantes())
                .motivo(request.getMotivo())
                .carrera(carreraReserva)
                .creadoPor(usuario)
                .build();

        // saveAndFlush para que el constraint de exclusión (excl_reserva_solape) se evalúe
        // ahora y podamos traducir un solape por concurrencia en un mensaje claro (no un 500).
        try {
            reserva = reservaRepository.saveAndFlush(reserva);
        } catch (DataIntegrityViolationException ex) {
            throw new BusinessException(
                    "El recurso " + recurso.getNombre() + " ya está reservado en ese horario",
                    "RESOURCE_NOT_AVAILABLE");
        }

        // Registrar los participantes: titular (el alumno logueado) + acompañantes.
        guardarParticipantes(reserva, usuario, carreraReserva, acompanantes);

        log.info("Reserva creada - ID: {} | Recurso: {} | Usuario: {} | Fecha: {} | Hora: {}-{}",
                reserva.getId(), recurso.getQrCode(), correoUsuario,
                request.getFecha(), request.getHoraInicio(), request.getHoraFin());

        // Enviar email de confirmación
        emailService.enviarReservaConfirmada(
                usuario.getCorreoUtec(),
                usuario.getNombreCompleto(),
                lab.getNombre() + " (" + lab.getCodigoLab() + ")",
                recurso.getNombre(),
                request.getFecha().toString(),
                request.getHoraInicio().toString(),
                request.getHoraFin().toString()
        );

        emitirCambio(lab.getId());
        return toResponse(reserva);
    }

    @Transactional(readOnly = true)
    public List<ReservaResponse> listarMisReservas(String correoUsuario) {
        Usuario usuario = usuarioRepository.findByCorreoUtec(correoUsuario)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "correo", correoUsuario));

        String rol = usuario.getRol().getNombre();
        List<Reserva> reservas;

        switch (rol) {
            case "ADMIN", "COORDINADOR" -> {
                reservas = reservaRepository.findAllReservasActivas();
            }
            case "DIRECTOR" -> {
                reservas = reservaRepository.findReservasActivasPorDirector(usuario.getId());
            }
            case "RESPONSABLE_LAB" -> {
                reservas = reservaRepository.findReservasActivasPorResponsable(usuario.getId());
            }
            default -> {
                reservas = reservaRepository.findReservasActivasDelUsuario(usuario.getId());
            }
        }

        return enriquecer(reservas, usuario.getId());
    }

    /**
     * Gestión de Reservas PAGINADA (Gestión de Reservas). Reemplaza a listarMisReservas
     * para el frontend: el servidor pagina/filtra en vez de bajar las 8k+ de golpe.
     * Respeta el mismo alcance por rol y enriquece SOLO la página (≈20 filas) con
     * participantes + esMia, así el coste no crece con el total de reservas.
     */
    @Transactional(readOnly = true)
    public pe.edu.utec.reservas.modules.reservas.dto.ReservaPageResponse buscarMisReservas(
            String correoUsuario, String q, Long labId, int page, int size) {
        Usuario usuario = usuarioRepository.findByCorreoUtec(correoUsuario)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "correo", correoUsuario));
        String rol = usuario.getRol().getNombre();
        String patron = (q == null || q.isBlank()) ? null : "%" + q.trim().toLowerCase(Locale.ROOT) + "%";
        var pageable = org.springframework.data.domain.PageRequest.of(
                Math.max(0, page), Math.min(Math.max(1, size), 100),
                org.springframework.data.domain.Sort.by(
                        org.springframework.data.domain.Sort.Order.desc("fecha"),
                        org.springframework.data.domain.Sort.Order.desc("horaInicio")));

        org.springframework.data.domain.Page<Reserva> pg = switch (rol) {
            case "ADMIN", "COORDINADOR" -> reservaRepository.buscarTodas(patron, labId, pageable);
            case "DIRECTOR" -> reservaRepository.buscarPorDirector(usuario.getId(), patron, labId, pageable);
            case "RESPONSABLE_LAB" -> reservaRepository.buscarPorResponsable(usuario.getId(), patron, labId, pageable);
            default -> reservaRepository.buscarDelUsuario(usuario.getId(), patron, labId, pageable);
        };

        return pe.edu.utec.reservas.modules.reservas.dto.ReservaPageResponse.builder()
                .content(enriquecer(pg.getContent(), usuario.getId()))
                .total(pg.getTotalElements()).page(pg.getNumber()).size(pg.getSize())
                .totalPages(pg.getTotalPages()).build();
    }

    /**
     * Adjunta a cada reserva su lista de participantes (una sola query batch, evita N+1)
     * y el flag esMia (el que consulta es el titular). Compartido por la versión lista y
     * la paginada. Participantes/esMia solo se exponen en Gestión de Reservas, no en el
     * calendario.
     */
    private List<ReservaResponse> enriquecer(List<Reserva> reservas, Long usuarioId) {
        List<Long> ids = reservas.stream().map(Reserva::getId).toList();
        Map<Long, List<ParticipanteResumen>> porReserva = ids.isEmpty() ? Map.of()
                : participanteRepository.findByReservaIdInOrderByEsTitularDescNombreCompletoAsc(ids).stream()
                        .collect(Collectors.groupingBy(
                                p -> p.getReserva().getId(),
                                Collectors.mapping(
                                        p -> new ParticipanteResumen(p.getNombreCompleto(), p.getCorreo(),
                                                p.getCarrera(), Boolean.TRUE.equals(p.getEsTitular())),
                                        Collectors.toList())));

        return reservas.stream()
                .map(r -> {
                    ReservaResponse resp = toResponse(r);
                    resp.setParticipantesLista(porReserva.getOrDefault(r.getId(), List.of()));
                    // esMia = el que consulta es el titular. Un acompañante la ve de solo
                    // lectura (el frontend le oculta Cancelar/Editar/Check-in).
                    resp.setEsMia(r.getUsuario().getId().equals(usuarioId));
                    return resp;
                })
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ReservaResponse> listarPorRecursoYFecha(Long recursoId, LocalDate fecha) {
        return reservaRepository.findByRecursoIdAndFecha(recursoId, fecha).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ReservaResponse> listarPorLaboratorio(Long labId) {
        return reservaRepository.findByLaboratorioId(labId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public ReservaResponse cancelar(Long reservaId, String correoUsuario) {
        Reserva reserva = reservaRepository.findById(reservaId)
                .orElseThrow(() -> new ResourceNotFoundException("Reserva", "id", reservaId));

        // Autorización: el dueño de la reserva o un rol elevado (ADMIN/COORDINADOR/DIRECTOR/
        // RESPONSABLE_LAB). Sin el bypass de rol, un admin no podía cancelar reservas de otros
        // alumnos (daba FORBIDDEN). Mantiene la protección anti-IDOR para estudiantes.
        Usuario actor = usuarioRepository.findByCorreoUtec(correoUsuario)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "correo", correoUsuario));
        boolean esPropietario = reserva.getUsuario().getCorreoUtec().equals(correoUsuario);
        boolean esRolElevado = switch (actor.getRol().getNombre()) {
            case "ADMIN", "COORDINADOR", "DIRECTOR", "RESPONSABLE_LAB" -> true;
            default -> false;
        };
        if (!esPropietario && !esRolElevado) {
            throw new BusinessException("No tienes permiso para cancelar esta reserva", "FORBIDDEN");
        }

        if (!"PENDIENTE".equals(reserva.getEstado()) && !"CONFIRMADA".equals(reserva.getEstado()) && !"EN_CURSO".equals(reserva.getEstado())) {
            throw new BusinessException("Solo se pueden cancelar reservas pendientes, confirmadas o en curso", "INVALID_STATE");
        }

        reserva.setEstado("CANCELADA");
        reserva = reservaRepository.save(reserva);

        log.info("Reserva cancelada - ID: {} | Usuario: {}", reservaId, correoUsuario);

        // Enviar email de cancelación
        emailService.enviarReservaCancelada(
                reserva.getUsuario().getCorreoUtec(),
                reserva.getUsuario().getNombreCompleto(),
                reserva.getRecurso().getLaboratorio().getNombre(),
                reserva.getRecurso().getNombre(),
                reserva.getFecha().toString(),
                reserva.getHoraInicio().toString(),
                reserva.getHoraFin().toString()
        );

        emitirCambio(reserva.getRecurso().getLaboratorio().getId());
        return toResponse(reserva);
    }

    /**
     * Revierte una cancelación: deja la reserva nuevamente CONFIRMADA (activa).
     * Reglas: lo puede hacer cualquier rol elevado (NO el estudiante) y SOLO si la
     * reserva es del día de HOY; si el día ya pasó (o es futura) no se permite.
     */
    @Transactional
    public ReservaResponse reactivar(Long reservaId, String correoEditor) {
        Reserva reserva = reservaRepository.findById(reservaId)
                .orElseThrow(() -> new ResourceNotFoundException("Reserva", "id", reservaId));

        // Autorización por rol (no por propiedad): todos menos ESTUDIANTE.
        Usuario editor = usuarioRepository.findByCorreoUtec(correoEditor)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "correo", correoEditor));
        boolean esRolElevado = switch (editor.getRol().getNombre()) {
            case "ADMIN", "COORDINADOR", "DIRECTOR", "RESPONSABLE_LAB" -> true;
            default -> false;
        };
        if (!esRolElevado) {
            throw new BusinessException("No tienes permiso para reactivar reservas", "FORBIDDEN");
        }

        if (!"CANCELADA".equals(reserva.getEstado())) {
            throw new BusinessException("Solo se puede reactivar una reserva cancelada", "INVALID_STATE");
        }

        // Solo el mismo día de la reserva: si ya pasó (o es otra fecha) no se permite.
        if (!reserva.getFecha().equals(LocalDate.now())) {
            throw new BusinessException("Solo se puede revertir una cancelación el mismo día de la reserva", "EXPIRED");
        }

        // Verificar que la franja no haya sido tomada por otra reserva tras la cancelación.
        List<Reserva> conflictos = reservaRepository.findConflictingReservationsWithLock(
                        reserva.getRecurso().getId(), reserva.getFecha(),
                        reserva.getHoraInicio(), reserva.getHoraFin())
                .stream().filter(r -> !r.getId().equals(reservaId)).toList();
        if (!conflictos.isEmpty()) {
            throw new BusinessException(
                    "La franja ya fue tomada por otra reserva; no se puede reactivar",
                    "RESOURCE_NOT_AVAILABLE"
            );
        }

        reserva.setEstado("CONFIRMADA");
        reserva = reservaRepository.save(reserva);

        log.info("Reserva reactivada - ID: {} | Editor: {}", reservaId, correoEditor);

        emitirCambio(reserva.getRecurso().getLaboratorio().getId());
        return toResponse(reserva);
    }

    /**
     * Confirma una reserva PENDIENTE → CONFIRMADA. Es una acción de GESTIÓN (rol
     * elevado, no estudiante) que NO marca asistencia ni ocupa la mesa: el check-in
     * (que pone EN_CURSO + recurso OCUPADO) es un paso distinto y posterior. Antes la
     * UI "confirmaba" haciendo un check-in manual, lo que dejaba la reserva EN_CURSO.
     */
    @Transactional
    public ReservaResponse confirmar(Long reservaId, String correoEditor) {
        Reserva reserva = reservaRepository.findById(reservaId)
                .orElseThrow(() -> new ResourceNotFoundException("Reserva", "id", reservaId));

        Usuario editor = usuarioRepository.findByCorreoUtec(correoEditor)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "correo", correoEditor));
        boolean esRolElevado = switch (editor.getRol().getNombre()) {
            case "ADMIN", "COORDINADOR", "DIRECTOR", "RESPONSABLE_LAB" -> true;
            default -> false;
        };
        if (!esRolElevado) {
            throw new BusinessException("No tienes permiso para confirmar reservas", "FORBIDDEN");
        }

        if (!"PENDIENTE".equals(reserva.getEstado())) {
            throw new BusinessException("Solo se puede confirmar una reserva pendiente", "INVALID_STATE");
        }

        reserva.setEstado("CONFIRMADA");
        reserva = reservaRepository.save(reserva);

        log.info("Reserva confirmada - ID: {} | Editor: {}", reservaId, correoEditor);

        emitirCambio(reserva.getRecurso().getLaboratorio().getId());
        return toResponse(reserva);
    }

    /**
     * Marca una reserva ACTIVA como COMPLETADA o NO_SHOW (acción de GESTIÓN, rol elevado).
     * Resuelve reservas que quedaron "colgadas" (p. ej. una CONFIRMADA sin check-in, que el
     * scheduler no toca: el de completar solo mira EN_CURSO y el de no-show solo PENDIENTE).
     * Libera la mesa si estaba OCUPADA por un check-in previo.
     */
    @Transactional
    public ReservaResponse marcarEstado(Long reservaId, String nuevoEstado, String correoEditor) {
        if (!"COMPLETADA".equals(nuevoEstado) && !"NO_SHOW".equals(nuevoEstado)) {
            throw new BusinessException("Estado no permitido: solo COMPLETADA o NO_SHOW", "INVALID_STATE");
        }
        Reserva reserva = reservaRepository.findById(reservaId)
                .orElseThrow(() -> new ResourceNotFoundException("Reserva", "id", reservaId));

        Usuario editor = usuarioRepository.findByCorreoUtec(correoEditor)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "correo", correoEditor));
        boolean esRolElevado = switch (editor.getRol().getNombre()) {
            case "ADMIN", "COORDINADOR", "DIRECTOR", "RESPONSABLE_LAB" -> true;
            default -> false;
        };
        if (!esRolElevado) {
            throw new BusinessException("No tienes permiso para cambiar el estado de la reserva", "FORBIDDEN");
        }

        if (!"PENDIENTE".equals(reserva.getEstado()) && !"CONFIRMADA".equals(reserva.getEstado()) && !"EN_CURSO".equals(reserva.getEstado())) {
            throw new BusinessException("Solo se puede completar / marcar no-show una reserva activa (pendiente, confirmada o en curso)", "INVALID_STATE");
        }

        reserva.setEstado(nuevoEstado);
        reserva = reservaRepository.save(reserva);
        // Si la mesa quedó OCUPADA por un check-in previo, liberarla (igual que hace el scheduler).
        if ("OCUPADO".equals(reserva.getRecurso().getEstado())) {
            reserva.getRecurso().setEstado("DISPONIBLE");
        }

        log.info("Reserva {} marcada {} - Editor: {}", reservaId, nuevoEstado, correoEditor);
        emitirCambio(reserva.getRecurso().getLaboratorio().getId());
        return toResponse(reserva);
    }

    @Transactional
    public ReservaResponse editar(Long reservaId, CreateReservaRequest request, String correoEditor) {
        Reserva reserva = reservaRepository.findById(reservaId)
                .orElseThrow(() -> new ResourceNotFoundException("Reserva", "id", reservaId));

        // Autorización: solo el dueño de la reserva o un rol elevado (ADMIN/COORDINADOR/
        // RESPONSABLE_LAB) puede editarla. Sin esto, cualquier autenticado podía modificar
        // la reserva de otro vía PUT /reservas/{id} (IDOR / broken access control).
        Usuario editor = usuarioRepository.findByCorreoUtec(correoEditor)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "correo", correoEditor));
        boolean esPropietario = reserva.getUsuario().getCorreoUtec().equals(correoEditor);
        boolean esRolElevado = switch (editor.getRol().getNombre()) {
            case "ADMIN", "COORDINADOR", "DIRECTOR", "RESPONSABLE_LAB" -> true;
            default -> false;
        };
        if (!esPropietario && !esRolElevado) {
            throw new BusinessException("No tienes permiso para editar esta reserva", "FORBIDDEN");
        }

        // ✅ Permite editar PENDIENTE, CONFIRMADA y EN_CURSO
        if (!"PENDIENTE".equals(reserva.getEstado()) && !"CONFIRMADA".equals(reserva.getEstado()) && !"EN_CURSO".equals(reserva.getEstado())) {
            throw new BusinessException("Solo se pueden editar reservas pendientes, confirmadas o en curso", "INVALID_STATE");
        }

        // Obtener nuevo recurso si cambió
        RecursoLab nuevoRecurso = recursoLabRepository.findById(request.getRecursoId())
                .orElseThrow(() -> new ResourceNotFoundException("Recurso", "id", request.getRecursoId()));
        Laboratorio lab = nuevoRecurso.getLaboratorio();

        // Validar
        validarHorario(request, lab);
        validarFecha(request.getFecha());
        validarParticipantes(request.getParticipantes(), nuevoRecurso.getCapacidadPersonas());
        validarDiaAtencion(request.getFecha(), lab);
        // El titular sancionado no puede tener/mover una reserva en ese lab y fecha.
        validarSinSancion(reserva.getUsuario(), lab, request.getFecha());
        validarSinCierreInstitucional(request.getFecha());
        validarSinClaseProgramada(lab, request.getFecha(), request.getHoraInicio(), request.getHoraFin());

        // Si el editor reenvía los correos de participantes, los resolvemos ahora para
        // fallar antes de guardar; el titular sigue siendo el dueño de la reserva.
        List<Usuario> acompanantesEditar = request.getParticipantesEmails() == null ? null
                : resolverAcompanantes(request.getParticipantesEmails(), request.getParticipantes(), reserva.getUsuario());

        // Verificar double booking (excluyendo esta reserva)
        List<Reserva> conflictos = reservaRepository.findConflictingReservationsWithLock(
                request.getRecursoId(), request.getFecha(),
                request.getHoraInicio(), request.getHoraFin());
        conflictos = conflictos.stream().filter(r -> !r.getId().equals(reservaId)).toList();

        if (!conflictos.isEmpty()) {
            throw new BusinessException(
                    "El recurso " + nuevoRecurso.getNombre() + " ya está reservado de " +
                            conflictos.get(0).getHoraInicio() + " a " + conflictos.get(0).getHoraFin(),
                    "RESOURCE_NOT_AVAILABLE"
            );
        }

        // Recurso anterior: si la reserva se mueve a otra mesa, hay que mover también el
        // estado de ocupación "del momento". Si no, la mesa vieja se quedaba marcada como
        // OCUPADO (tras un check-in) y la nueva como DISPONIBLE → la tarjeta del lab seguía
        // mostrando ocupada la mesa equivocada.
        RecursoLab recursoAnterior = reserva.getRecurso();
        boolean cambioDeRecurso = !recursoAnterior.getId().equals(nuevoRecurso.getId());

        // Actualizar
        reserva.setRecurso(nuevoRecurso);
        reserva.setFecha(request.getFecha());
        reserva.setHoraInicio(request.getHoraInicio());
        reserva.setHoraFin(request.getHoraFin());
        reserva.setParticipantes(request.getParticipantes());
        reserva.setMotivo(request.getMotivo());

        reserva = reservaRepository.save(reserva);

        // Reemplazar participantes solo si el editor los reenvió.
        if (acompanantesEditar != null) {
            participanteRepository.deleteByReservaId(reserva.getId());
            participanteRepository.flush(); // que el DELETE corra antes de los nuevos INSERT (constraint único)
            guardarParticipantes(reserva, reserva.getUsuario(), reserva.getCarrera(), acompanantesEditar);
        }

        if (cambioDeRecurso) {
            // Liberar la mesa anterior si estaba ocupada por esta reserva (check-in previo).
            if ("OCUPADO".equals(recursoAnterior.getEstado())) {
                recursoAnterior.setEstado("DISPONIBLE");
                recursoLabRepository.save(recursoAnterior);
            }
            // Ocupar la nueva mesa solo si la reserva está en curso (check-in ya hecho).
            if ("EN_CURSO".equals(reserva.getEstado())) {
                nuevoRecurso.setEstado("OCUPADO");
                recursoLabRepository.save(nuevoRecurso);
            }
        }

        log.info("Reserva editada - ID: {} | Editor: {}", reservaId, correoEditor);

        emitirCambio(lab.getId());
        return toResponse(reserva);
    }

    // ── Validaciones ──

    private void validarHorario(CreateReservaRequest req, Laboratorio lab) {
        if (!req.getHoraInicio().isBefore(req.getHoraFin())) {
            throw new BusinessException("La hora de inicio debe ser anterior a la hora de fin", "INVALID_SCHEDULE");
        }
        if (req.getHoraInicio().isBefore(lab.getHoraApertura())) {
            throw new BusinessException("El laboratorio abre a las " + lab.getHoraApertura(), "LAB_CLOSED");
        }
        if (req.getHoraFin().isAfter(lab.getHoraCierre())) {
            throw new BusinessException("El laboratorio cierra a las " + lab.getHoraCierre(), "LAB_CLOSED");
        }
    }

    private void validarFecha(LocalDate fecha) {
        LocalDate hoy = LocalDate.now();
        if (fecha.isBefore(hoy)) {
            throw new BusinessException("No puedes reservar en una fecha pasada", "INVALID_DATE");
        }
        LocalDate maxFecha = hoy.plusDays(diasAnticipacionMax);
        if (fecha.isAfter(maxFecha)) {
            throw new BusinessException(
                    "Solo puedes reservar con " + diasAnticipacionMax + " día(s) de anticipación",
                    "DATE_TOO_FAR"
            );
        }
    }

    private void validarDiaAtencion(LocalDate fecha, Laboratorio lab) {
        if (lab.getDiasAtencion() == null || lab.getDiasAtencion().isEmpty()) return;
        String diaSemana = switch (fecha.getDayOfWeek()) {
            case MONDAY -> "Lunes";
            case TUESDAY -> "Martes";
            case WEDNESDAY -> "Miércoles";
            case THURSDAY -> "Jueves";
            case FRIDAY -> "Viernes";
            case SATURDAY -> "Sábado";
            case SUNDAY -> "Domingo";
        };
        if (!lab.getDiasAtencion().contains(diaSemana)) {
            throw new BusinessException("El laboratorio no atiende los " + diaSemana.toLowerCase(), "LAB_CLOSED_DAY");
        }
    }

    /**
     * ¿Una clase con esa frecuencia se dicta en la semana de esa fecha? SEMANA_GENERAL siempre;
     * SEMANA_A en semanas ISO impares, SEMANA_B en pares (convención A=impar; si UTEC la usa al
     * revés, se invierte aquí y en el frontend).
     */
    public static boolean claseAplicaEnFecha(String frecuencia, LocalDate fecha) {
        if (frecuencia == null || "SEMANA_GENERAL".equals(frecuencia)) return true;
        int semanaImpar = fecha.get(java.time.temporal.WeekFields.ISO.weekOfWeekBasedYear()) % 2;
        return "SEMANA_A".equals(frecuencia) ? semanaImpar == 1 : semanaImpar == 0;
    }

    /**
     * Impide reservar cualquier lab en un día de CIERRE institucional (feriado institucional que
     * cierra todo UTEC). Es general: no importa el ciclo ni el lab, nadie viene ese día.
     */
    private void validarSinCierreInstitucional(LocalDate fecha) {
        if (cicloExcepcionRepository.esCierreInstitucional(fecha)) {
            throw new BusinessException(
                    "No se puede reservar: UTEC está cerrada por feriado institucional ese día.",
                    "INSTITUTIONAL_CLOSURE");
        }
    }

    /**
     * Impide reservar a un alumno SANCIONADO (castigo) sobre ese lab y fecha. La sanción puede
     * ser global (todos los labs) o de un lab específico, y estar vigente por rango o indefinida.
     * No afecta el login: el alumno sigue consultando calendarios/disponibilidad.
     */
    private void validarSinSancion(Usuario usuario, Laboratorio lab, LocalDate fecha) {
        var vigentes = sancionRepository.findVigentes(usuario.getId(), lab.getId(), fecha);
        if (vigentes.isEmpty()) return;
        var s = vigentes.get(0); // global (laboratorio_id NULL) primero por el ORDER BY
        String alcance = s.getLaboratorioId() == null
                ? "en ningún laboratorio"
                : "en el laboratorio " + lab.getNombre();
        String hasta = s.getFechaFin() == null ? "" : " (hasta el " + s.getFechaFin() + ")";
        throw new BusinessException(
                "No puedes reservar " + alcance + hasta + ". Motivo: " + s.getMotivo() +
                        ". Comunícate con el coordinador.",
                "USUARIO_SANCIONADO");
    }

    /** Impide reservar un lab en una franja donde tiene una CLASE del horario académico programada. */
    private void validarSinClaseProgramada(Laboratorio lab, LocalDate fecha, LocalTime horaInicio, LocalTime horaFin) {
        String dia = switch (fecha.getDayOfWeek()) {
            case MONDAY -> "LUNES";  case TUESDAY -> "MARTES"; case WEDNESDAY -> "MIERCOLES";
            case THURSDAY -> "JUEVES"; case FRIDAY -> "VIERNES"; case SATURDAY -> "SABADO"; case SUNDAY -> "DOMINGO";
        };
        List<Bloqueo> clases = bloqueoRepository.findClasesEnLabParaFechaHora(lab.getId(), dia, fecha, horaInicio, horaFin)
                .stream()
                .filter(c -> claseAplicaEnFecha(c.getFrecuencia(), fecha))
                // En días de examen o feriado no hay clases regulares → no bloquean el lab.
                .filter(c -> !cicloExcepcionRepository.esDiaSinClases(c.getCiclo(), fecha))
                .toList();
        if (!clases.isEmpty()) {
            Bloqueo c = clases.get(0);
            String curso = c.getCurso() != null ? c.getCurso().getNombre()
                    : (c.getDescripcion() != null ? c.getDescripcion() : "una clase");
            throw new BusinessException(
                    "El laboratorio " + lab.getNombre() + " tiene una clase programada (" + curso + ") en ese horario.",
                    "LAB_CLASS_SCHEDULED");
        }
    }

    private void validarParticipantes(Integer participantes, Integer capacidad) {
        if (participantes > capacidad) {
            throw new BusinessException("El recurso tiene capacidad para " + capacidad + " personas", "EXCEEDS_CAPACITY");
        }
    }

    // ── Participantes (titular + acompañantes) ──

    /**
     * Valida los correos de los acompañantes (todos los participantes menos el titular) y los
     * resuelve a usuarios registrados. Debe haber exactamente (participantes - 1) correos: cada
     * uno @utec.edu.pe, único, distinto del titular y registrado como alumno en la BD.
     */
    private List<Usuario> resolverAcompanantes(List<String> emails, int participantes, Usuario titular) {
        int esperados = participantes - 1;

        List<String> limpios = emails == null ? List.of()
                : emails.stream()
                        .filter(e -> e != null && !e.isBlank())
                        .map(e -> e.trim().toLowerCase(Locale.ROOT))
                        .toList();

        if (limpios.size() != esperados) {
            throw new BusinessException(
                    "Debes ingresar el correo de los " + esperados + " participante(s) adicional(es)",
                    "PARTICIPANTS_MISMATCH");
        }

        String correoTitular = titular.getCorreoUtec().toLowerCase(Locale.ROOT);
        Set<String> vistos = new LinkedHashSet<>();
        List<Usuario> resueltos = new ArrayList<>();

        for (String correo : limpios) {
            if (!correo.endsWith(DOMINIO_UTEC)) {
                throw new BusinessException("El correo " + correo + " no es @utec.edu.pe", "INVALID_EMAIL");
            }
            if (correo.equals(correoTitular)) {
                throw new BusinessException("Tu correo ya cuenta como titular; no lo repitas en los participantes", "DUPLICATE_PARTICIPANT");
            }
            if (!vistos.add(correo)) {
                throw new BusinessException("El correo " + correo + " está repetido", "DUPLICATE_PARTICIPANT");
            }
            Usuario u = usuarioRepository.findByCorreoUtec(correo)
                    .orElseThrow(() -> new BusinessException(
                            "El correo " + correo + " no está registrado como alumno", "PARTICIPANT_NOT_FOUND"));
            resueltos.add(u);
        }
        return resueltos;
    }

    private void guardarParticipantes(Reserva reserva, Usuario titular, String carreraTitular, List<Usuario> acompanantes) {
        List<ReservaParticipante> filas = new ArrayList<>();
        filas.add(ReservaParticipante.builder()
                .reserva(reserva).usuario(titular).correo(titular.getCorreoUtec())
                .nombreCompleto(titular.getNombreCompleto()).carrera(carreraTitular).esTitular(true).build());
        for (Usuario a : acompanantes) {
            filas.add(ReservaParticipante.builder()
                    .reserva(reserva).usuario(a).correo(a.getCorreoUtec())
                    .nombreCompleto(a.getNombreCompleto()).carrera(a.getCarrera()).esTitular(false).build());
        }
        participanteRepository.saveAll(filas);
    }

    // ── Mapper ──

    private ReservaResponse toResponse(Reserva r) {
        RecursoLab recurso = r.getRecurso();
        Laboratorio lab = recurso.getLaboratorio();
        return ReservaResponse.builder()
                .id(r.getId())
                .recursoId(recurso.getId())
                .recursoNombre(recurso.getNombre())
                .recursoQrCode(recurso.getQrCode())
                .laboratorioNombre(lab.getNombre())
                .laboratorioCodigo(lab.getCodigoLab())
                .fecha(r.getFecha())
                .horaInicio(r.getHoraInicio())
                .horaFin(r.getHoraFin())
                .estado(r.getEstado())
                .tipoReserva(r.getTipoReserva())
                .participantes(r.getParticipantes())
                .motivo(r.getMotivo())
                .usuarioNombre(r.getUsuario().getNombreCompleto())
                .createdAt(r.getCreatedAt())
                .build();
    }
}
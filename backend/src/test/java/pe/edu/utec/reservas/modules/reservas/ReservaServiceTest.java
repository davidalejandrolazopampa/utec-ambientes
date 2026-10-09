package pe.edu.utec.reservas.modules.reservas;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.utec.reservas.modules.iam.model.Role;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.iam.repository.RoleRepository;
import pe.edu.utec.reservas.modules.iam.repository.UsuarioRepository;
import pe.edu.utec.reservas.modules.laboratorios.model.Laboratorio;
import pe.edu.utec.reservas.modules.laboratorios.model.RecursoLab;
import pe.edu.utec.reservas.modules.laboratorios.repository.LaboratorioRepository;
import pe.edu.utec.reservas.modules.laboratorios.repository.RecursoLabRepository;
import pe.edu.utec.reservas.modules.reservas.dto.CreateReservaRequest;
import pe.edu.utec.reservas.modules.reservas.dto.ReservaResponse;
import pe.edu.utec.reservas.modules.reservas.model.Reserva;
import pe.edu.utec.reservas.modules.reservas.model.ReservaParticipante;
import pe.edu.utec.reservas.modules.reservas.repository.ReservaParticipanteRepository;
import pe.edu.utec.reservas.modules.reservas.repository.ReservaRepository;
import pe.edu.utec.reservas.modules.reservas.service.ReservaService;
import pe.edu.utec.reservas.shared.exceptions.BusinessException;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class ReservaServiceTest {

    @Autowired private ReservaService reservaService;
    @Autowired private UsuarioRepository usuarioRepository;
    @Autowired private RoleRepository roleRepository;
    @Autowired private LaboratorioRepository laboratorioRepository;
    @Autowired private RecursoLabRepository recursoLabRepository;
    @Autowired private ReservaRepository reservaRepository;
    @Autowired private ReservaParticipanteRepository participanteRepository;
    @Autowired private pe.edu.utec.reservas.modules.bloqueos.repository.BloqueoRepository bloqueoRepository;
    @Autowired private pe.edu.utec.reservas.modules.aulas.repository.CicloExcepcionRepository excepcionRepository;
    @Autowired private pe.edu.utec.reservas.modules.sanciones.repository.SancionRepository sancionRepository;

    private Usuario alumno1;
    private Usuario alumno2;
    private RecursoLab mesa1;
    private RecursoLab mesa2;
    private Laboratorio lab;
    private LocalDate manana;

    @BeforeEach
    void setUp() {
        // Buscar rol existente (ya insertado por Flyway V2__seed_data.sql)
        Role rolEstudiante = roleRepository.findByNombre("ESTUDIANTE")
                .orElseThrow(() -> new RuntimeException("Rol ESTUDIANTE no encontrado en seed data"));

        // Crear usuarios de test
        alumno1 = usuarioRepository.save(Usuario.builder()
                .correoUtec("alumno1@utec.edu.pe")
                .nombres("Juan")
                .apellidos("Perez")
                .rol(rolEstudiante)
                .activo(true)
                .build());

        alumno2 = usuarioRepository.save(Usuario.builder()
                .correoUtec("alumno2@utec.edu.pe")
                .nombres("Maria")
                .apellidos("Garcia")
                .rol(rolEstudiante)
                .carrera("Ciencia de la Computación")
                .activo(true)
                .build());

        // Crear laboratorio de test
        lab = laboratorioRepository.save(Laboratorio.builder()
                .codigoLab("LTEST")
                .nombre("Lab Test")
                .piso(1)
                .ubicacionFase("Fase 1")
                .horaApertura(LocalTime.of(8, 0))
                .horaCierre(LocalTime.of(18, 0))
                .aforoTipo("MESA")
                .aforoCantidad(2)
                .aforoCapacidad(4)
                
                .estado("ACTIVO")
                .diasAtencion(List.of("Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"))
                .build());

        // Crear recursos de test
        mesa1 = recursoLabRepository.save(RecursoLab.builder()
                .laboratorio(lab)
                .tipo("MESA")
                .nombre("MESA 1")
                .numero(1)
                .qrCode("LTEST-MESA-001")
                .estado("DISPONIBLE")
                .capacidadPersonas(4)
                .activo(true)
                .build());

        mesa2 = recursoLabRepository.save(RecursoLab.builder()
                .laboratorio(lab)
                .tipo("MESA")
                .nombre("MESA 2")
                .numero(2)
                .qrCode("LTEST-MESA-002")
                .estado("DISPONIBLE")
                .capacidadPersonas(4)
                .activo(true)
                .build());

        // Mañana. El lab de test atiende todos los días, así que NO se salta el fin de
        // semana: con dias-anticipacion-max=1, reservar a más de 1 día (p. ej. saltar de
        // sábado a lunes) sería rechazado con DATE_TOO_FAR y rompería los tests los viernes.
        manana = LocalDate.now().plusDays(1);
    }

    @Test
    @DisplayName("No se puede reservar un lab en la franja de una CLASE programada; sí en otra franja")
    void reserva_bloqueadaPorClaseProgramada() {
        // Clase (bloqueo es_clase) en el lab, el mismo día de semana que 'manana', 10:00–12:00.
        String dia = switch (manana.getDayOfWeek()) {
            case MONDAY -> "LUNES"; case TUESDAY -> "MARTES"; case WEDNESDAY -> "MIERCOLES";
            case THURSDAY -> "JUEVES"; case FRIDAY -> "VIERNES"; case SATURDAY -> "SABADO"; case SUNDAY -> "DOMINGO";
        };
        // Ciclo ficticio (sin excepciones sembradas): evita que el test dependa del calendario
        // real — si 'manana' cayera en una semana de exámenes/feriado de 2026-1, la clase no
        // bloquearía y el test fallaría por fecha. La ruta de excepciones se prueba aparte
        // (reserva_permitidaEnDiaDeExcepcion).
        bloqueoRepository.save(pe.edu.utec.reservas.modules.bloqueos.model.Bloqueo.builder()
                .laboratorio(lab).tipo("TOTAL").motivo("CLASE").descripcion("Programación I")
                .esClase(true).diaSemana(dia).ciclo("2099-1")
                .fechaInicio(manana.minusDays(1)).fechaFin(manana.plusDays(60))
                .horaInicio(LocalTime.of(10, 0)).horaFin(LocalTime.of(12, 0))
                .activo(true).creadoPor(alumno1).build());

        // Reservar 10:30–11:00 (cruza la clase) → rechazado.
        CreateReservaRequest choca = new CreateReservaRequest();
        choca.setRecursoId(mesa1.getId()); choca.setFecha(manana);
        choca.setHoraInicio(LocalTime.of(10, 30)); choca.setHoraFin(LocalTime.of(11, 0)); choca.setParticipantes(1);
        BusinessException ex = assertThrows(BusinessException.class, () -> reservaService.crear(choca, "alumno1@utec.edu.pe"));
        assertEquals("LAB_CLASS_SCHEDULED", ex.getErrorCode());

        // Reservar 15:00–16:00 (fuera de la clase) → OK.
        CreateReservaRequest libre = new CreateReservaRequest();
        libre.setRecursoId(mesa1.getId()); libre.setFecha(manana);
        libre.setHoraInicio(LocalTime.of(15, 0)); libre.setHoraFin(LocalTime.of(16, 0)); libre.setParticipantes(1);
        assertNotNull(reservaService.crear(libre, "alumno1@utec.edu.pe").getId());
    }

    @Test
    @DisplayName("En día de excepción (feriado/examen) la clase NO bloquea → sí se puede reservar")
    void reserva_permitidaEnDiaDeExcepcion() {
        String dia = switch (manana.getDayOfWeek()) {
            case MONDAY -> "LUNES"; case TUESDAY -> "MARTES"; case WEDNESDAY -> "MIERCOLES";
            case THURSDAY -> "JUEVES"; case FRIDAY -> "VIERNES"; case SATURDAY -> "SABADO"; case SUNDAY -> "DOMINGO";
        };
        // Clase en el lab 10-12 el día de 'manana', ciclo TESTX.
        bloqueoRepository.save(pe.edu.utec.reservas.modules.bloqueos.model.Bloqueo.builder()
                .laboratorio(lab).tipo("TOTAL").motivo("CLASE").descripcion("Clase X")
                .esClase(true).diaSemana(dia).ciclo("TESTX")
                .fechaInicio(manana.minusDays(1)).fechaFin(manana.plusDays(60))
                .horaInicio(LocalTime.of(10, 0)).horaFin(LocalTime.of(12, 0))
                .activo(true).creadoPor(alumno1).build());
        // 'manana' es feriado en TESTX → la clase no aplica.
        excepcionRepository.save(pe.edu.utec.reservas.modules.aulas.model.CicloExcepcion.builder()
                .ciclo("TESTX").fechaInicio(manana).fechaFin(manana).tipo("FERIADO").descripcion("Feriado test").build());

        CreateReservaRequest r = new CreateReservaRequest();
        r.setRecursoId(mesa1.getId()); r.setFecha(manana);
        r.setHoraInicio(LocalTime.of(10, 30)); r.setHoraFin(LocalTime.of(11, 0)); r.setParticipantes(1);
        assertNotNull(reservaService.crear(r, "alumno1@utec.edu.pe").getId()); // permitido (feriado)
    }

    @Test
    @DisplayName("En un CIERRE institucional (todo UTEC) NO se puede reservar ningún lab")
    void reserva_bloqueadaPorCierreInstitucional() {
        // CIERRE que cubre 'manana' (agnóstico al ciclo: cierra todo UTEC).
        excepcionRepository.save(pe.edu.utec.reservas.modules.aulas.model.CicloExcepcion.builder()
                .ciclo("TESTX").fechaInicio(manana).fechaFin(manana).tipo("CIERRE").descripcion("Aniversario UTEC").build());

        CreateReservaRequest r = new CreateReservaRequest();
        r.setRecursoId(mesa1.getId()); r.setFecha(manana);
        r.setHoraInicio(LocalTime.of(10, 0)); r.setHoraFin(LocalTime.of(11, 0)); r.setParticipantes(1);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> reservaService.crear(r, "alumno1@utec.edu.pe"));
        assertEquals("INSTITUTIONAL_CLOSURE", ex.getErrorCode());
    }

    @Test
    @DisplayName("Un alumno SANCIONADO no puede reservar; al levantar la sanción, sí puede")
    void reserva_bloqueadaPorSancion() {
        // Sanción vigente del alumno1 en ESTE lab (fecha fin indefinida).
        var sancion = sancionRepository.save(pe.edu.utec.reservas.modules.sanciones.model.Sancion.builder()
                .usuarioId(alumno1.getId()).laboratorioId(lab.getId())
                .motivo("Incumplimiento del reglamento").fechaInicio(LocalDate.now()).fechaFin(null)
                .creadoPor("admin@utec.edu.pe").activo(true).build());

        CreateReservaRequest r = new CreateReservaRequest();
        r.setRecursoId(mesa1.getId()); r.setFecha(manana);
        r.setHoraInicio(LocalTime.of(10, 0)); r.setHoraFin(LocalTime.of(11, 0)); r.setParticipantes(1);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> reservaService.crear(r, "alumno1@utec.edu.pe"));
        assertEquals("USUARIO_SANCIONADO", ex.getErrorCode());

        // Un alumno NO sancionado sí puede reservar el mismo lab.
        CreateReservaRequest ok = new CreateReservaRequest();
        ok.setRecursoId(mesa2.getId()); ok.setFecha(manana);
        ok.setHoraInicio(LocalTime.of(10, 0)); ok.setHoraFin(LocalTime.of(11, 0)); ok.setParticipantes(1);
        assertNotNull(reservaService.crear(ok, "alumno2@utec.edu.pe").getId());

        // Al levantar la sanción (inactiva), el alumno1 ya puede reservar.
        sancion.setActivo(false);
        sancionRepository.save(sancion);
        CreateReservaRequest r2 = new CreateReservaRequest();
        r2.setRecursoId(mesa1.getId()); r2.setFecha(manana);
        r2.setHoraInicio(LocalTime.of(14, 0)); r2.setHoraFin(LocalTime.of(15, 0)); r2.setParticipantes(1);
        assertNotNull(reservaService.crear(r2, "alumno1@utec.edu.pe").getId());
    }

    @Test
    @DisplayName("Crear reserva exitosamente")
    void crearReserva_exito() {
        CreateReservaRequest request = new CreateReservaRequest();
        request.setRecursoId(mesa1.getId());
        request.setFecha(manana);
        request.setHoraInicio(LocalTime.of(10, 0));
        request.setHoraFin(LocalTime.of(11, 0));
        request.setParticipantes(2);
        request.setParticipantesEmails(List.of("alumno2@utec.edu.pe"));

        ReservaResponse response = reservaService.crear(request, "alumno1@utec.edu.pe");

        assertNotNull(response.getId());
        assertEquals("PENDIENTE", response.getEstado());
        assertEquals("MESA 1", response.getRecursoNombre());

        // Se registran 2 participantes: el titular + el acompañante, cada uno con su carrera.
        List<ReservaParticipante> parts = participanteRepository.findByReservaId(response.getId());
        assertEquals(2, parts.size());
        assertTrue(parts.stream().anyMatch(p -> p.getEsTitular() && p.getCorreo().equals("alumno1@utec.edu.pe")));
        assertTrue(parts.stream().anyMatch(p -> !p.getEsTitular()
                && p.getCorreo().equals("alumno2@utec.edu.pe")
                && "Ciencia de la Computación".equals(p.getCarrera())));
    }

    @Test
    @DisplayName("Un DOCENTE no puede reservar (solo-consulta): FORBIDDEN")
    void crearReserva_docente_rechazado() {
        var rolDocente = roleRepository.findByNombre("DOCENTE").orElseThrow();
        var docente = usuarioRepository.save(pe.edu.utec.reservas.modules.iam.model.Usuario.builder()
                .correoUtec("prof-test@utec.edu.pe").nombres("Profe").apellidos("Test")
                .rol(rolDocente).activo(true).build());

        CreateReservaRequest request = new CreateReservaRequest();
        request.setRecursoId(mesa1.getId());
        request.setFecha(manana);
        request.setHoraInicio(LocalTime.of(10, 0));
        request.setHoraFin(LocalTime.of(11, 0));
        request.setParticipantes(1);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> reservaService.crear(request, docente.getCorreoUtec()));
        assertEquals("FORBIDDEN", ex.getErrorCode());
    }

    @Test
    @DisplayName("El acompañante ve la reserva en Mis Reservas, con esMia=false (solo lectura)")
    void acompananteVeLaReservaConEsMiaFalse() {
        CreateReservaRequest request = new CreateReservaRequest();
        request.setRecursoId(mesa1.getId());
        request.setFecha(manana);
        request.setHoraInicio(LocalTime.of(12, 0));
        request.setHoraFin(LocalTime.of(13, 0));
        request.setParticipantes(2);
        request.setParticipantesEmails(List.of("alumno2@utec.edu.pe"));
        ReservaResponse creada = reservaService.crear(request, "alumno1@utec.edu.pe");

        // El TITULAR la ve como suya
        assertTrue(reservaService.listarMisReservas("alumno1@utec.edu.pe").stream()
                .anyMatch(r -> r.getId().equals(creada.getId()) && Boolean.TRUE.equals(r.getEsMia())));

        // El ACOMPAÑANTE también la ve (antes no la veía), pero con esMia=false → solo lectura
        var vista = reservaService.listarMisReservas("alumno2@utec.edu.pe").stream()
                .filter(r -> r.getId().equals(creada.getId())).findFirst();
        assertTrue(vista.isPresent(), "el acompañante debe ver la reserva en su lista");
        assertEquals(Boolean.FALSE, vista.get().getEsMia());
    }

    @Test
    @DisplayName("buscarMisReservas: pagina, filtra y enriquece (queries reales)")
    void buscarMisReservas_paginadoYFiltro() {
        CreateReservaRequest req = new CreateReservaRequest();
        req.setRecursoId(mesa1.getId());
        req.setFecha(manana);
        req.setHoraInicio(LocalTime.of(9, 0));
        req.setHoraFin(LocalTime.of(10, 0));
        req.setParticipantes(2);
        req.setParticipantesEmails(List.of("alumno2@utec.edu.pe"));
        ReservaResponse creada = reservaService.crear(req, "alumno1@utec.edu.pe");

        // Titular: la ve paginada, con esMia=true y su participante enriquecido.
        var pag = reservaService.buscarMisReservas("alumno1@utec.edu.pe", null, null, 0, 20);
        assertEquals(1, pag.getTotal());
        assertEquals(0, pag.getPage());
        assertEquals(1, pag.getContent().size());
        assertTrue(Boolean.TRUE.equals(pag.getContent().get(0).getEsMia()));
        assertEquals(2, pag.getContent().get(0).getParticipantesLista().size());

        // Filtro por código de lab (LTEST) → la encuentra; por texto ausente → 0.
        assertEquals(1, reservaService.buscarMisReservas("alumno1@utec.edu.pe", "ltest", null, 0, 20).getTotal());
        assertEquals(0, reservaService.buscarMisReservas("alumno1@utec.edu.pe", "zzz-no-existe", null, 0, 20).getTotal());

        // Filtro por labId: su lab → la encuentra; otro lab inexistente → 0.
        assertEquals(1, reservaService.buscarMisReservas("alumno1@utec.edu.pe", null, lab.getId(), 0, 20).getTotal());
        assertEquals(0, reservaService.buscarMisReservas("alumno1@utec.edu.pe", null, 9_999_999L, 0, 20).getTotal());

        // El acompañante también la ve paginada, con esMia=false.
        var pagAcomp = reservaService.buscarMisReservas("alumno2@utec.edu.pe", null, null, 0, 20);
        assertTrue(pagAcomp.getContent().stream()
                .anyMatch(r -> r.getId().equals(creada.getId()) && Boolean.FALSE.equals(r.getEsMia())));
    }

    @Test
    @DisplayName("Crear reserva con participantes pero sin los correos suficientes falla")
    void crearReserva_participantesSinCorreos_falla() {
        CreateReservaRequest request = new CreateReservaRequest();
        request.setRecursoId(mesa1.getId());
        request.setFecha(manana);
        request.setHoraInicio(LocalTime.of(10, 0));
        request.setHoraFin(LocalTime.of(11, 0));
        request.setParticipantes(3); // faltan 2 correos adicionales

        BusinessException ex = assertThrows(BusinessException.class,
                () -> reservaService.crear(request, "alumno1@utec.edu.pe"));
        assertEquals("PARTICIPANTS_MISMATCH", ex.getErrorCode());
    }

    @Test
    @DisplayName("Crear reserva con un acompañante no registrado falla")
    void crearReserva_acompananteNoRegistrado_falla() {
        CreateReservaRequest request = new CreateReservaRequest();
        request.setRecursoId(mesa1.getId());
        request.setFecha(manana);
        request.setHoraInicio(LocalTime.of(10, 0));
        request.setHoraFin(LocalTime.of(11, 0));
        request.setParticipantes(2);
        request.setParticipantesEmails(List.of("desconocido@utec.edu.pe"));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> reservaService.crear(request, "alumno1@utec.edu.pe"));
        assertEquals("PARTICIPANT_NOT_FOUND", ex.getErrorCode());
    }

    @Test
    @DisplayName("Crear reserva con un correo de participante no @utec falla")
    void crearReserva_correoNoUtec_falla() {
        CreateReservaRequest request = new CreateReservaRequest();
        request.setRecursoId(mesa1.getId());
        request.setFecha(manana);
        request.setHoraInicio(LocalTime.of(10, 0));
        request.setHoraFin(LocalTime.of(11, 0));
        request.setParticipantes(2);
        request.setParticipantesEmails(List.of("amigo@gmail.com"));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> reservaService.crear(request, "alumno1@utec.edu.pe"));
        assertEquals("INVALID_EMAIL", ex.getErrorCode());
    }

    @Test
    @DisplayName("Crear reserva con el titular repetido como participante falla")
    void crearReserva_titularRepetido_falla() {
        CreateReservaRequest request = new CreateReservaRequest();
        request.setRecursoId(mesa1.getId());
        request.setFecha(manana);
        request.setHoraInicio(LocalTime.of(10, 0));
        request.setHoraFin(LocalTime.of(11, 0));
        request.setParticipantes(2);
        request.setParticipantesEmails(List.of("alumno1@utec.edu.pe"));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> reservaService.crear(request, "alumno1@utec.edu.pe"));
        assertEquals("DUPLICATE_PARTICIPANT", ex.getErrorCode());
    }

    @Test
    @DisplayName("Editar reserva con nuevos participantes reemplaza las filas")
    void editarReserva_reemplazaParticipantes() {
        CreateReservaRequest crear = new CreateReservaRequest();
        crear.setRecursoId(mesa1.getId());
        crear.setFecha(manana);
        crear.setHoraInicio(LocalTime.of(10, 0));
        crear.setHoraFin(LocalTime.of(11, 0));
        crear.setParticipantes(1);
        ReservaResponse creada = reservaService.crear(crear, "alumno1@utec.edu.pe");
        assertEquals(1, participanteRepository.findByReservaId(creada.getId()).size());

        CreateReservaRequest editar = new CreateReservaRequest();
        editar.setRecursoId(mesa1.getId());
        editar.setFecha(manana);
        editar.setHoraInicio(LocalTime.of(10, 0));
        editar.setHoraFin(LocalTime.of(11, 0));
        editar.setParticipantes(2);
        editar.setParticipantesEmails(List.of("alumno2@utec.edu.pe"));
        reservaService.editar(creada.getId(), editar, "alumno1@utec.edu.pe");

        List<ReservaParticipante> parts = participanteRepository.findByReservaId(creada.getId());
        assertEquals(2, parts.size());
        assertTrue(parts.stream().anyMatch(p -> p.getCorreo().equals("alumno2@utec.edu.pe")));
    }

    @Test
    @DisplayName("Crear reserva individual registra solo al titular")
    void crearReserva_individual_soloTitular() {
        CreateReservaRequest request = new CreateReservaRequest();
        request.setRecursoId(mesa1.getId());
        request.setFecha(manana);
        request.setHoraInicio(LocalTime.of(10, 0));
        request.setHoraFin(LocalTime.of(11, 0));
        request.setParticipantes(1);

        ReservaResponse response = reservaService.crear(request, "alumno1@utec.edu.pe");

        List<ReservaParticipante> parts = participanteRepository.findByReservaId(response.getId());
        assertEquals(1, parts.size());
        assertTrue(parts.get(0).getEsTitular());
    }

    @Test
    @DisplayName("Double booking: mismo recurso, mismo horario")
    void doubleBooking_falla() {
        // Primera reserva
        CreateReservaRequest req1 = new CreateReservaRequest();
        req1.setRecursoId(mesa1.getId());
        req1.setFecha(manana);
        req1.setHoraInicio(LocalTime.of(10, 0));
        req1.setHoraFin(LocalTime.of(11, 0));
        req1.setParticipantes(1);
        reservaService.crear(req1, "alumno1@utec.edu.pe");

        // Segunda reserva mismo recurso, horario solapado
        CreateReservaRequest req2 = new CreateReservaRequest();
        req2.setRecursoId(mesa1.getId());
        req2.setFecha(manana);
        req2.setHoraInicio(LocalTime.of(10, 30));
        req2.setHoraFin(LocalTime.of(11, 30));
        req2.setParticipantes(1);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> reservaService.crear(req2, "alumno2@utec.edu.pe"));
        assertTrue(ex.getMessage().contains("ya está reservado"));
    }

    @Test
    @DisplayName("Reservas simultáneas: mismo alumno, diferente recurso, mismo horario")
    void reservaSimultanea_falla() {
        // Primera reserva en mesa1
        CreateReservaRequest req1 = new CreateReservaRequest();
        req1.setRecursoId(mesa1.getId());
        req1.setFecha(manana);
        req1.setHoraInicio(LocalTime.of(14, 0));
        req1.setHoraFin(LocalTime.of(15, 0));
        req1.setParticipantes(1);
        reservaService.crear(req1, "alumno1@utec.edu.pe");

        // Segunda reserva en mesa2, mismo horario, mismo alumno
        CreateReservaRequest req2 = new CreateReservaRequest();
        req2.setRecursoId(mesa2.getId());
        req2.setFecha(manana);
        req2.setHoraInicio(LocalTime.of(14, 0));
        req2.setHoraFin(LocalTime.of(15, 0));
        req2.setParticipantes(1);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> reservaService.crear(req2, "alumno1@utec.edu.pe"));
        assertTrue(ex.getMessage().contains("Ya tienes una reserva"));
    }

    @Test
    @DisplayName("Horario fuera del laboratorio")
    void horarioFueraLab_falla() {
        CreateReservaRequest request = new CreateReservaRequest();
        request.setRecursoId(mesa1.getId());
        request.setFecha(manana);
        request.setHoraInicio(LocalTime.of(6, 0));
        request.setHoraFin(LocalTime.of(7, 0));
        request.setParticipantes(1);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> reservaService.crear(request, "alumno1@utec.edu.pe"));
        assertTrue(ex.getMessage().contains("abre a las"));
    }

    @Test
    @DisplayName("Participantes exceden capacidad")
    void participantesExceden_falla() {
        CreateReservaRequest request = new CreateReservaRequest();
        request.setRecursoId(mesa1.getId());
        request.setFecha(manana);
        request.setHoraInicio(LocalTime.of(10, 0));
        request.setHoraFin(LocalTime.of(11, 0));
        request.setParticipantes(10);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> reservaService.crear(request, "alumno1@utec.edu.pe"));
        assertTrue(ex.getMessage().contains("capacidad para"));
    }

    @Test
    @DisplayName("Cancelar reserva exitosamente")
    void cancelarReserva_exito() {
        CreateReservaRequest request = new CreateReservaRequest();
        request.setRecursoId(mesa1.getId());
        request.setFecha(manana);
        request.setHoraInicio(LocalTime.of(16, 0));
        request.setHoraFin(LocalTime.of(17, 0));
        request.setParticipantes(1);

        ReservaResponse reserva = reservaService.crear(request, "alumno1@utec.edu.pe");
        ReservaResponse cancelada = reservaService.cancelar(reserva.getId(), "alumno1@utec.edu.pe");

        assertEquals("CANCELADA", cancelada.getEstado());
    }

    @Test
    @DisplayName("No puede cancelar reserva ajena")
    void cancelarReservaAjena_falla() {
        CreateReservaRequest request = new CreateReservaRequest();
        request.setRecursoId(mesa1.getId());
        request.setFecha(manana);
        request.setHoraInicio(LocalTime.of(16, 0));
        request.setHoraFin(LocalTime.of(17, 0));
        request.setParticipantes(1);

        ReservaResponse reserva = reservaService.crear(request, "alumno1@utec.edu.pe");

        BusinessException ex = assertThrows(BusinessException.class,
                () -> reservaService.cancelar(reserva.getId(), "alumno2@utec.edu.pe"));
        assertTrue(ex.getMessage().contains("No tienes permiso"));
    }

    @Test
    @DisplayName("Rol elevado sí puede cancelar la reserva de otro alumno")
    void cancelarReservaAjena_rolElevado_exito() {
        Usuario resp = nuevoConRol("resp-cancel@utec.edu.pe", "RESPONSABLE_LAB");
        CreateReservaRequest request = new CreateReservaRequest();
        request.setRecursoId(mesa1.getId());
        request.setFecha(manana);
        request.setHoraInicio(LocalTime.of(16, 0));
        request.setHoraFin(LocalTime.of(17, 0));
        request.setParticipantes(1);
        ReservaResponse reserva = reservaService.crear(request, "alumno1@utec.edu.pe");

        ReservaResponse cancelada = reservaService.cancelar(reserva.getId(), resp.getCorreoUtec());
        assertEquals("CANCELADA", cancelada.getEstado());
    }

    private ReservaResponse crearReservaAlumno1() {
        CreateReservaRequest request = new CreateReservaRequest();
        request.setRecursoId(mesa1.getId());
        request.setFecha(manana);
        request.setHoraInicio(LocalTime.of(16, 0));
        request.setHoraFin(LocalTime.of(17, 0));
        request.setParticipantes(1);
        return reservaService.crear(request, "alumno1@utec.edu.pe");
    }

    @Test
    @DisplayName("marcarEstado: rol elevado cierra una reserva activa como COMPLETADA")
    void marcarEstado_completar_rolElevado_exito() {
        Usuario resp = nuevoConRol("resp-mark@utec.edu.pe", "RESPONSABLE_LAB");
        ReservaResponse reserva = crearReservaAlumno1();
        ReservaResponse r = reservaService.marcarEstado(reserva.getId(), "COMPLETADA", resp.getCorreoUtec());
        assertEquals("COMPLETADA", r.getEstado());
    }

    @Test
    @DisplayName("marcarEstado: NO_SHOW por rol elevado")
    void marcarEstado_noShow_exito() {
        Usuario resp = nuevoConRol("resp-ns@utec.edu.pe", "RESPONSABLE_LAB");
        ReservaResponse reserva = crearReservaAlumno1();
        assertEquals("NO_SHOW", reservaService.marcarEstado(reserva.getId(), "NO_SHOW", resp.getCorreoUtec()).getEstado());
    }

    @Test
    @DisplayName("marcarEstado: un estudiante NO puede (FORBIDDEN)")
    void marcarEstado_estudiante_falla() {
        ReservaResponse reserva = crearReservaAlumno1();
        BusinessException ex = assertThrows(BusinessException.class,
                () -> reservaService.marcarEstado(reserva.getId(), "COMPLETADA", "alumno1@utec.edu.pe"));
        assertEquals("FORBIDDEN", ex.getErrorCode());
    }

    @Test
    @DisplayName("marcarEstado: solo admite COMPLETADA o NO_SHOW")
    void marcarEstado_estadoNoPermitido_falla() {
        Usuario resp = nuevoConRol("resp-inv@utec.edu.pe", "RESPONSABLE_LAB");
        ReservaResponse reserva = crearReservaAlumno1();
        BusinessException ex = assertThrows(BusinessException.class,
                () -> reservaService.marcarEstado(reserva.getId(), "CANCELADA", resp.getCorreoUtec()));
        assertEquals("INVALID_STATE", ex.getErrorCode());
    }

    private CreateReservaRequest req(RecursoLab recurso, int hIni, int hFin) {
        CreateReservaRequest r = new CreateReservaRequest();
        r.setRecursoId(recurso.getId());
        r.setFecha(manana);
        r.setHoraInicio(LocalTime.of(hIni, 0));
        r.setHoraFin(LocalTime.of(hFin, 0));
        r.setParticipantes(1);
        return r;
    }

    @Test
    @DisplayName("listarMisReservas devuelve las del alumno")
    void listarMisReservas() {
        reservaService.crear(req(mesa1, 10, 11), "alumno1@utec.edu.pe");
        assertFalse(reservaService.listarMisReservas("alumno1@utec.edu.pe").isEmpty());
    }

    @Test
    @DisplayName("listarPorRecursoYFecha devuelve las del recurso en la fecha")
    void listarPorRecursoYFecha() {
        reservaService.crear(req(mesa1, 12, 13), "alumno1@utec.edu.pe");
        assertFalse(reservaService.listarPorRecursoYFecha(mesa1.getId(), manana).isEmpty());
    }

    @Test
    @DisplayName("listarPorLaboratorio devuelve las del lab")
    void listarPorLaboratorio() {
        reservaService.crear(req(mesa1, 9, 10), "alumno1@utec.edu.pe");
        assertFalse(reservaService.listarPorLaboratorio(lab.getId()).isEmpty());
    }

    @Test
    @DisplayName("editar cambia el horario de la reserva")
    void editarReserva() {
        ReservaResponse creada = reservaService.crear(req(mesa1, 10, 11), "alumno1@utec.edu.pe");
        ReservaResponse editada = reservaService.editar(creada.getId(), req(mesa1, 15, 16), "alumno1@utec.edu.pe");
        assertEquals(LocalTime.of(15, 0), editada.getHoraInicio());
    }

    @Test
    @DisplayName("crear con carrera la guarda en el perfil del alumno")
    void crearConCarrera_actualizaPerfil() {
        CreateReservaRequest r = req(mesa1, 10, 11);
        r.setCarrera("Ingeniería Mecánica");
        reservaService.crear(r, "alumno1@utec.edu.pe");
        Usuario actualizado = usuarioRepository.findById(alumno1.getId()).orElseThrow();
        assertEquals("Ingeniería Mecánica", actualizado.getCarrera());
    }

    @Test
    @DisplayName("No puede editar reserva ajena sin rol elevado (IDOR)")
    void editarReservaAjena_falla() {
        ReservaResponse creada = reservaService.crear(req(mesa1, 10, 11), "alumno1@utec.edu.pe");
        // alumno2 es ESTUDIANTE y no es dueño → debe rechazarse (broken access control)
        BusinessException ex = assertThrows(BusinessException.class,
                () -> reservaService.editar(creada.getId(), req(mesa1, 15, 16), "alumno2@utec.edu.pe"));
        assertTrue(ex.getMessage().contains("No tienes permiso"));
    }

    private Usuario nuevoConRol(String correo, String rolNombre) {
        Role rol = roleRepository.findByNombre(rolNombre).orElseThrow();
        return usuarioRepository.save(Usuario.builder()
                .correoUtec(correo).nombres("N").apellidos("A").rol(rol).activo(true).build());
    }

    @Test
    @DisplayName("crear: usuario o recurso inexistente → 404")
    void crear_noEncontrados() {
        assertThrows(pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException.class,
                () -> reservaService.crear(req(mesa1, 10, 11), "nadie@utec.edu.pe"));
        CreateReservaRequest r = req(mesa1, 10, 11);
        r.setRecursoId(9_999_999L);
        assertThrows(pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException.class,
                () -> reservaService.crear(r, "alumno1@utec.edu.pe"));
    }

    @Test
    @DisplayName("crear: recurso en estado BLOQUEADO → RESOURCE_NOT_AVAILABLE")
    void crear_recursoBloqueado() {
        mesa1.setEstado("BLOQUEADO");
        recursoLabRepository.saveAndFlush(mesa1);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> reservaService.crear(req(mesa1, 10, 11), "alumno1@utec.edu.pe"));
        assertEquals("RESOURCE_NOT_AVAILABLE", ex.getErrorCode());
    }

    @Test
    @DisplayName("listarMisReservas: usuario inexistente → 404")
    void listarMisReservas_noEncontrado() {
        assertThrows(pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException.class,
                () -> reservaService.listarMisReservas("nadie@utec.edu.pe"));
    }

    @Test
    @DisplayName("listarMisReservas: ADMIN y RESPONSABLE_LAB usan sus ramas")
    void listarMisReservas_porRol() {
        Usuario admin = nuevoConRol("admin-rs@utec.edu.pe", "ADMIN");
        Usuario resp = nuevoConRol("resp-rs@utec.edu.pe", "RESPONSABLE_LAB");
        assertNotNull(reservaService.listarMisReservas(admin.getCorreoUtec()));
        assertNotNull(reservaService.listarMisReservas(resp.getCorreoUtec()));
    }

    @Test
    @DisplayName("cancelar: inexistente → 404 y doble cancelación → INVALID_STATE")
    void cancelar_errores() {
        assertThrows(pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException.class,
                () -> reservaService.cancelar(9_999_999L, "alumno1@utec.edu.pe"));
        ReservaResponse creada = reservaService.crear(req(mesa1, 10, 11), "alumno1@utec.edu.pe");
        reservaService.cancelar(creada.getId(), "alumno1@utec.edu.pe");
        BusinessException ex = assertThrows(BusinessException.class,
                () -> reservaService.cancelar(creada.getId(), "alumno1@utec.edu.pe"));
        assertEquals("INVALID_STATE", ex.getErrorCode());
    }

    @Test
    @DisplayName("editar: reserva o recurso inexistente → 404")
    void editar_noEncontrados() {
        assertThrows(pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException.class,
                () -> reservaService.editar(9_999_999L, req(mesa1, 10, 11), "alumno1@utec.edu.pe"));
        ReservaResponse creada = reservaService.crear(req(mesa1, 10, 11), "alumno1@utec.edu.pe");
        CreateReservaRequest r = req(mesa1, 15, 16);
        r.setRecursoId(9_999_999L);
        assertThrows(pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException.class,
                () -> reservaService.editar(creada.getId(), r, "alumno1@utec.edu.pe"));
    }

    @Test
    @DisplayName("El constraint de exclusión impide doble-reserva activa a nivel de BD (V6)")
    void exclusionConstraint_impideDobleReserva() {
        Reserva r1 = Reserva.builder().recurso(mesa1).usuario(alumno1).fecha(manana)
                .horaInicio(LocalTime.of(9, 0)).horaFin(LocalTime.of(10, 0))
                .estado("PENDIENTE").tipoReserva("ALUMNO").participantes(1).creadoPor(alumno1).build();
        reservaRepository.saveAndFlush(r1);

        // Otra reserva ACTIVA solapada en la misma mesa → la BD la rechaza (no depende del servicio).
        Reserva r2 = Reserva.builder().recurso(mesa1).usuario(alumno2).fecha(manana)
                .horaInicio(LocalTime.of(9, 30)).horaFin(LocalTime.of(10, 30))
                .estado("PENDIENTE").tipoReserva("ALUMNO").participantes(1).creadoPor(alumno2).build();
        assertThrows(DataIntegrityViolationException.class, () -> reservaRepository.saveAndFlush(r2));
    }

    // ── Reactivar (revertir cancelación): solo rol elevado y solo el mismo día ──

    private Reserva reservaCancelada(RecursoLab recurso, LocalDate fecha, int hIni, int hFin) {
        return reservaRepository.saveAndFlush(Reserva.builder()
                .recurso(recurso).usuario(alumno1).fecha(fecha)
                .horaInicio(LocalTime.of(hIni, 0)).horaFin(LocalTime.of(hFin, 0))
                .estado("CANCELADA").tipoReserva("ALUMNO").participantes(1).creadoPor(alumno1).build());
    }

    @Test
    @DisplayName("reactivar: CANCELADA de hoy + rol elevado → CONFIRMADA")
    void reactivar_exito() {
        Usuario resp = nuevoConRol("resp-react@utec.edu.pe", "RESPONSABLE_LAB");
        Reserva r = reservaCancelada(mesa1, LocalDate.now(), 16, 17);
        ReservaResponse out = reservaService.reactivar(r.getId(), resp.getCorreoUtec());
        assertEquals("CONFIRMADA", out.getEstado());
    }

    @Test
    @DisplayName("reactivar: estudiante → FORBIDDEN")
    void reactivar_estudiante_forbidden() {
        Reserva r = reservaCancelada(mesa1, LocalDate.now(), 16, 17);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> reservaService.reactivar(r.getId(), "alumno1@utec.edu.pe"));
        assertEquals("FORBIDDEN", ex.getErrorCode());
    }

    @Test
    @DisplayName("reactivar: reserva no cancelada → INVALID_STATE")
    void reactivar_noCancelada_invalidState() {
        Usuario resp = nuevoConRol("resp-react2@utec.edu.pe", "RESPONSABLE_LAB");
        Reserva r = reservaRepository.saveAndFlush(Reserva.builder()
                .recurso(mesa1).usuario(alumno1).fecha(LocalDate.now())
                .horaInicio(LocalTime.of(16, 0)).horaFin(LocalTime.of(17, 0))
                .estado("PENDIENTE").tipoReserva("ALUMNO").participantes(1).creadoPor(alumno1).build());
        BusinessException ex = assertThrows(BusinessException.class,
                () -> reservaService.reactivar(r.getId(), resp.getCorreoUtec()));
        assertEquals("INVALID_STATE", ex.getErrorCode());
    }

    @Test
    @DisplayName("reactivar: CANCELADA de un día pasado → EXPIRED")
    void reactivar_diaPasado_expired() {
        Usuario resp = nuevoConRol("resp-react3@utec.edu.pe", "RESPONSABLE_LAB");
        Reserva r = reservaCancelada(mesa1, LocalDate.now().minusDays(1), 16, 17);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> reservaService.reactivar(r.getId(), resp.getCorreoUtec()));
        assertEquals("EXPIRED", ex.getErrorCode());
    }

    @Test
    @DisplayName("reactivar: la franja ya fue tomada → RESOURCE_NOT_AVAILABLE")
    void reactivar_solape_resourceNotAvailable() {
        Usuario resp = nuevoConRol("resp-react4@utec.edu.pe", "RESPONSABLE_LAB");
        Reserva cancelada = reservaCancelada(mesa1, LocalDate.now(), 16, 17);
        // otra reserva ACTIVA ocupa la misma mesa/franja hoy
        reservaRepository.saveAndFlush(Reserva.builder()
                .recurso(mesa1).usuario(alumno2).fecha(LocalDate.now())
                .horaInicio(LocalTime.of(16, 0)).horaFin(LocalTime.of(17, 0))
                .estado("PENDIENTE").tipoReserva("ALUMNO").participantes(1).creadoPor(alumno2).build());
        BusinessException ex = assertThrows(BusinessException.class,
                () -> reservaService.reactivar(cancelada.getId(), resp.getCorreoUtec()));
        assertEquals("RESOURCE_NOT_AVAILABLE", ex.getErrorCode());
    }

    @Test
    @DisplayName("reactivar: reserva inexistente → 404")
    void reactivar_noEncontrada() {
        Usuario resp = nuevoConRol("resp-react5@utec.edu.pe", "RESPONSABLE_LAB");
        assertThrows(pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException.class,
                () -> reservaService.reactivar(9_999_999L, resp.getCorreoUtec()));
    }

    @Test
    @DisplayName("confirmar: PENDIENTE + rol elevado → CONFIRMADA (sin check-in)")
    void confirmar_exito() {
        Usuario resp = nuevoConRol("resp-conf@utec.edu.pe", "RESPONSABLE_LAB");
        Reserva r = reservaRepository.saveAndFlush(Reserva.builder()
                .recurso(mesa1).usuario(alumno1).fecha(LocalDate.now())
                .horaInicio(LocalTime.of(16, 0)).horaFin(LocalTime.of(17, 0))
                .estado("PENDIENTE").tipoReserva("ALUMNO").participantes(1).creadoPor(alumno1).build());
        ReservaResponse out = reservaService.confirmar(r.getId(), resp.getCorreoUtec());
        assertEquals("CONFIRMADA", out.getEstado());
        // No debe ocupar la mesa (eso es del check-in, no de confirmar).
        assertEquals("DISPONIBLE", mesa1.getEstado());
    }

    @Test
    @DisplayName("confirmar: estudiante → FORBIDDEN")
    void confirmar_estudiante_forbidden() {
        Reserva r = reservaRepository.saveAndFlush(Reserva.builder()
                .recurso(mesa1).usuario(alumno1).fecha(LocalDate.now())
                .horaInicio(LocalTime.of(16, 0)).horaFin(LocalTime.of(17, 0))
                .estado("PENDIENTE").tipoReserva("ALUMNO").participantes(1).creadoPor(alumno1).build());
        BusinessException ex = assertThrows(BusinessException.class,
                () -> reservaService.confirmar(r.getId(), "alumno1@utec.edu.pe"));
        assertEquals("FORBIDDEN", ex.getErrorCode());
    }

    @Test
    @DisplayName("confirmar: reserva no pendiente → INVALID_STATE")
    void confirmar_noPendiente_invalidState() {
        Usuario resp = nuevoConRol("resp-conf2@utec.edu.pe", "RESPONSABLE_LAB");
        Reserva r = reservaRepository.saveAndFlush(Reserva.builder()
                .recurso(mesa1).usuario(alumno1).fecha(LocalDate.now())
                .horaInicio(LocalTime.of(16, 0)).horaFin(LocalTime.of(17, 0))
                .estado("CONFIRMADA").tipoReserva("ALUMNO").participantes(1).creadoPor(alumno1).build());
        BusinessException ex = assertThrows(BusinessException.class,
                () -> reservaService.confirmar(r.getId(), resp.getCorreoUtec()));
        assertEquals("INVALID_STATE", ex.getErrorCode());
    }

    @Test
    @DisplayName("editar: mover una reserva EN_CURSO de mesa libera la anterior y ocupa la nueva")
    void editar_moverRecurso_actualizaEstados() {
        ReservaResponse creada = reservaService.crear(req(mesa1, 10, 11), "alumno1@utec.edu.pe");
        // Simular check-in: la reserva pasa a EN_CURSO y su mesa a OCUPADO.
        Reserva r = reservaRepository.findById(creada.getId()).orElseThrow();
        r.setEstado("EN_CURSO");
        reservaRepository.saveAndFlush(r);
        mesa1.setEstado("OCUPADO");
        recursoLabRepository.saveAndFlush(mesa1);

        // Mover la reserva de mesa1 a mesa2 (mismo día/horario).
        reservaService.editar(creada.getId(), req(mesa2, 10, 11), "alumno1@utec.edu.pe");

        assertEquals("DISPONIBLE", recursoLabRepository.findById(mesa1.getId()).orElseThrow().getEstado());
        assertEquals("OCUPADO", recursoLabRepository.findById(mesa2.getId()).orElseThrow().getEstado());
    }
}
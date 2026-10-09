package pe.edu.utec.reservas.modules.bloqueos;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.utec.reservas.modules.notificaciones.EmailService;
import pe.edu.utec.reservas.modules.bloqueos.dto.BloqueoResponse;
import pe.edu.utec.reservas.modules.bloqueos.dto.CreateBloqueoRequest;
import pe.edu.utec.reservas.modules.bloqueos.dto.GenerarAlmuerzosRequest;
import pe.edu.utec.reservas.modules.bloqueos.service.BloqueoService;
import pe.edu.utec.reservas.modules.iam.model.Role;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.iam.repository.RoleRepository;
import pe.edu.utec.reservas.modules.iam.repository.UsuarioRepository;
import pe.edu.utec.reservas.modules.laboratorios.model.Laboratorio;
import pe.edu.utec.reservas.modules.laboratorios.model.RecursoLab;
import pe.edu.utec.reservas.modules.laboratorios.repository.LaboratorioRepository;
import pe.edu.utec.reservas.modules.laboratorios.repository.RecursoLabRepository;
import pe.edu.utec.reservas.modules.bloqueos.repository.BloqueoRepository;
import pe.edu.utec.reservas.modules.aulas.model.Aula;
import pe.edu.utec.reservas.modules.aulas.repository.AulaRepository;
import pe.edu.utec.reservas.modules.reservas.dto.CreateReservaRequest;
import pe.edu.utec.reservas.modules.reservas.service.ReservaService;
import pe.edu.utec.reservas.shared.exceptions.BusinessException;
import pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class BloqueoServiceTest {

    @Autowired private BloqueoService bloqueoService;
    @Autowired private ReservaService reservaService;
    @Autowired private UsuarioRepository usuarioRepository;
    @Autowired private RoleRepository roleRepository;
    @Autowired private LaboratorioRepository laboratorioRepository;
    @Autowired private RecursoLabRepository recursoLabRepository;
    @Autowired private BloqueoRepository bloqueoRepository;
    @Autowired private AulaRepository aulaRepository;
    // Mock: evita la conexión SMTP real (async, best-effort) y permite verificar qué se notifica.
    @MockBean private EmailService emailService;

    private Usuario alumno;
    private Usuario gestor;
    private Laboratorio lab;
    private RecursoLab mesaConReserva;
    private RecursoLab mesaLimpia;
    private LocalDate fecha;

    @BeforeEach
    void setUp() {
        Role rolEstudiante = roleRepository.findByNombre("ESTUDIANTE").orElseThrow();

        alumno = usuarioRepository.save(Usuario.builder()
                .correoUtec("alumno-bloq@utec.edu.pe").nombres("Ana").apellidos("Lopez")
                .rol(rolEstudiante).activo(true).build());

        // Gestor ADMIN: crea/edita/elimina bloqueos de cualquier lab (asegurarAccesoAlLab lo deja pasar).
        Role rolAdmin = roleRepository.findByNombre("ADMIN").orElseThrow();
        gestor = usuarioRepository.save(Usuario.builder()
                .correoUtec("gestor-bloq@utec.edu.pe").nombres("Gaby").apellidos("Admin")
                .rol(rolAdmin).activo(true).build());

        lab = laboratorioRepository.save(Laboratorio.builder()
                .codigoLab("LBLOQ").nombre("Lab Bloqueo").piso(1).ubicacionFase("Fase 1")
                .horaApertura(LocalTime.of(8, 0)).horaCierre(LocalTime.of(18, 0))
                .aforoTipo("MESA").aforoCantidad(2).aforoCapacidad(4).estado("ACTIVO")
                .diasAtencion(List.of("Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"))
                .build());

        mesaConReserva = recursoLabRepository.save(RecursoLab.builder()
                .laboratorio(lab).tipo("MESA").nombre("MESA 1").numero(1).qrCode("LBLOQ-MESA-001")
                .estado("DISPONIBLE").capacidadPersonas(4).activo(true).build());

        mesaLimpia = recursoLabRepository.save(RecursoLab.builder()
                .laboratorio(lab).tipo("MESA").nombre("MESA 2").numero(2).qrCode("LBLOQ-MESA-002")
                .estado("DISPONIBLE").capacidadPersonas(4).activo(true).build());

        // Mañana. El lab atiende todos los días; no se salta el fin de semana porque la
        // reserva del setUp respeta dias-anticipacion-max=1 (saltar a lunes daría DATE_TOO_FAR).
        fecha = LocalDate.now().plusDays(1);

        // Reserva existente en mesaConReserva 10:00–11:00
        CreateReservaRequest r = new CreateReservaRequest();
        r.setRecursoId(mesaConReserva.getId());
        r.setFecha(fecha);
        r.setHoraInicio(LocalTime.of(10, 0));
        r.setHoraFin(LocalTime.of(11, 0));
        r.setParticipantes(1);
        reservaService.crear(r, alumno.getCorreoUtec());
    }

    private CreateBloqueoRequest bloqueoParcial(Long recursoId) {
        CreateBloqueoRequest req = new CreateBloqueoRequest();
        req.setLaboratorioId(lab.getId());
        req.setTipo("PARCIAL");
        req.setMotivo("CLASE");
        req.setFechaInicio(fecha);
        req.setFechaFin(fecha);
        req.setHoraInicio(LocalTime.of(10, 0));
        req.setHoraFin(LocalTime.of(11, 0));
        req.setRecursosIds(List.of(recursoId));
        return req;
    }

    // Bloqueo TOTAL con responsable, en una franja libre (el servicio rechaza TOTAL solapados,
    // así que cada uno usa su propia hora; ninguna choca con la reserva 10:00–11:00).
    private CreateBloqueoRequest bloqueoTotal(String motivo, int horaIni, int horaFin) {
        CreateBloqueoRequest req = new CreateBloqueoRequest();
        req.setLaboratorioId(lab.getId());
        req.setTipo("TOTAL");
        req.setMotivo(motivo);
        req.setDescripcion(motivo);
        req.setFechaInicio(fecha);
        req.setFechaFin(fecha);
        req.setHoraInicio(LocalTime.of(horaIni, 0));
        req.setHoraFin(LocalTime.of(horaFin, 0));
        req.setResponsableNombre("Resp");
        req.setResponsableCorreo("resp@utec.edu.pe");
        return req;
    }

    @Test
    @DisplayName("FERIADO es OPERATIVO: se crea (motivo FERIADO) pero NO envía correo; EVENTO sí notifica")
    void feriado_operativo_noNotifica() {
        // FERIADO (operativo, 08–09) → se persiste pero esNotificable=false → no manda correo.
        BloqueoResponse fer = bloqueoService.crear(bloqueoTotal("FERIADO", 8, 9), gestor.getCorreoUtec());
        assertEquals("FERIADO", fer.getMotivo());
        verify(emailService, never()).enviarBloqueoCreado(
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean());

        // EVENTO (no operativo, 09–10) con responsable → sí notifica una vez.
        bloqueoService.crear(bloqueoTotal("EVENTO", 9, 10), gestor.getCorreoUtec());
        verify(emailService, times(1)).enviarBloqueoCreado(
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean());
    }

    @Test
    @DisplayName("Un bloqueo TOTAL REEMPLAZA (borra) un ALMUERZO en la misma franja (opción A)")
    void totalReemplazaAlmuerzo() {
        BloqueoResponse alm = bloqueoService.crear(bloqueoTotal("ALMUERZO", 13, 14), gestor.getCorreoUtec());
        assertTrue(bloqueoRepository.findById(alm.getId()).isPresent());
        // Evento TOTAL en la misma franja: NO falla y borra el almuerzo (el evento gana).
        BloqueoResponse ev = bloqueoService.crear(bloqueoTotal("EVENTO", 13, 14), gestor.getCorreoUtec());
        assertEquals("EVENTO", ev.getMotivo());
        assertTrue(bloqueoRepository.findById(alm.getId()).isEmpty(), "el almuerzo debe haberse eliminado");
    }

    @Test
    @DisplayName("Un bloqueo PARCIAL NO borra el almuerzo (opción A): se conserva")
    void parcialNoBorraAlmuerzo() {
        BloqueoResponse alm = bloqueoService.crear(bloqueoTotal("ALMUERZO", 13, 14), gestor.getCorreoUtec());
        CreateBloqueoRequest parcial = bloqueoParcial(mesaLimpia.getId());
        parcial.setHoraInicio(LocalTime.of(13, 0));
        parcial.setHoraFin(LocalTime.of(14, 0));
        // Choca con el almuerzo TOTAL → se rechaza, PERO no lo borra (el almuerzo se conserva).
        assertThrows(BusinessException.class, () -> bloqueoService.crear(parcial, gestor.getCorreoUtec()));
        assertTrue(bloqueoRepository.findById(alm.getId()).isPresent(), "el parcial NO debe borrar el almuerzo");
    }

    private GenerarAlmuerzosRequest almReq(LocalDate ini, LocalDate fin) {
        GenerarAlmuerzosRequest req = new GenerarAlmuerzosRequest();
        req.setHoraInicio(LocalTime.of(13, 0));
        req.setHoraFin(LocalTime.of(14, 0));
        req.setFechaInicio(ini);
        req.setFechaFin(fin);
        req.setForzar(false);
        return req;
    }

    @Test
    @DisplayName("generarAlmuerzos: crea un almuerzo por día de atención y es idempotente")
    void generarAlmuerzos_creaYEsIdempotente() {
        var resp = bloqueoService.generarAlmuerzos(lab.getId(), almReq(fecha, fecha.plusDays(2)), gestor.getCorreoUtec());
        assertEquals(3, resp.getCreados()); // lab atiende los 7 días → 3 días del rango
        // Re-correr no duplica: los 3 salen "ya existe".
        var resp2 = bloqueoService.generarAlmuerzos(lab.getId(), almReq(fecha, fecha.plusDays(2)), gestor.getCorreoUtec());
        assertEquals(0, resp2.getCreados());
        assertEquals(3, resp2.getOmitidos().size());
        assertTrue(resp2.getOmitidos().stream().allMatch(o -> "ya existe".equals(o.getMotivo())));
    }

    @Test
    @DisplayName("generarAlmuerzos: omite el día con una reserva de alumno (sin forzar)")
    void generarAlmuerzos_omiteReserva() {
        CreateReservaRequest rr = new CreateReservaRequest();
        rr.setRecursoId(mesaLimpia.getId());
        rr.setFecha(fecha);
        rr.setHoraInicio(LocalTime.of(13, 0));
        rr.setHoraFin(LocalTime.of(14, 0));
        rr.setParticipantes(1);
        reservaService.crear(rr, alumno.getCorreoUtec());

        var resp = bloqueoService.generarAlmuerzos(lab.getId(), almReq(fecha, fecha), gestor.getCorreoUtec());
        assertEquals(0, resp.getCreados());
        assertTrue(resp.getOmitidos().stream().anyMatch(o -> "reserva".equals(o.getMotivo())));
    }

    @Test
    @DisplayName("Bloqueo parcial sobre una mesa LIMPIA se crea aunque otra mesa tenga reserva")
    void parcialMesaLimpia_exito() {
        BloqueoResponse resp = bloqueoService.crear(bloqueoParcial(mesaLimpia.getId()), gestor.getCorreoUtec());
        assertNotNull(resp.getId());
        assertEquals("PARCIAL", resp.getTipo());
    }

    @Test
    @DisplayName("Bloqueo parcial sobre una mesa CON reserva en el horario es rechazado")
    void parcialMesaConReserva_falla() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> bloqueoService.crear(bloqueoParcial(mesaConReserva.getId()), gestor.getCorreoUtec()));
        assertEquals("RESERVAS_ACTIVAS", ex.getErrorCode());
    }

    @Test
    @DisplayName("Bloqueo fuera de la ventana institucional (07:00–23:00) es rechazado")
    void bloqueoFueraDeVentana_falla() {
        CreateBloqueoRequest req = bloqueoParcial(mesaLimpia.getId());
        req.setHoraInicio(LocalTime.of(6, 0));
        req.setHoraFin(LocalTime.of(8, 0));
        BusinessException ex = assertThrows(BusinessException.class,
                () -> bloqueoService.crear(req, gestor.getCorreoUtec()));
        assertEquals("OUT_OF_WINDOW", ex.getErrorCode());
    }

    @Test
    @DisplayName("listar bloqueos por laboratorio / activos / hoy")
    void listar() {
        bloqueoService.crear(bloqueoParcial(mesaLimpia.getId()), gestor.getCorreoUtec());
        assertFalse(bloqueoService.listarPorLaboratorio(lab.getId()).isEmpty());
        assertNotNull(bloqueoService.listarTodosActivos(gestor.getCorreoUtec()));
        assertNotNull(bloqueoService.listarActivosHoy());
    }

    @Test
    @DisplayName("listarFeriadosDelAnio devuelve las fechas de feriado operativo del año (para el calendario)")
    void listarFeriadosDelAnio_incluyeElFeriadoCreado() {
        bloqueoService.crear(bloqueoTotal("FERIADO", 8, 9), gestor.getCorreoUtec());
        var feriados = bloqueoService.listarFeriadosDelAnio(fecha.getYear());
        assertTrue(feriados.stream().anyMatch(f -> f.getFecha().equals(fecha)),
                "el feriado creado debe aparecer en la lista del año");
        // De otro año no aparece (acota por rango anual).
        assertFalse(bloqueoService.listarFeriadosDelAnio(fecha.getYear() + 5).stream()
                .anyMatch(f -> f.getFecha().equals(fecha)));
    }

    @Test
    @DisplayName("listarTodosActivos excluye las clases salvo con incluirClases=true")
    void listarTodosIncluirClases() {
        // Una clase del horario (es_clase=true) sobre el lab.
        pe.edu.utec.reservas.modules.bloqueos.model.Bloqueo clase = bloqueoRepository.save(
                pe.edu.utec.reservas.modules.bloqueos.model.Bloqueo.builder()
                        .laboratorio(lab).tipo("TOTAL").motivo("CLASE")
                        .fechaInicio(fecha).fechaFin(fecha)
                        .horaInicio(LocalTime.of(9, 0)).horaFin(LocalTime.of(11, 0))
                        .esClase(true).diaSemana("LUNES").ciclo("2026-1")
                        .activo(true).creadoPor(gestor).build());

        // Por defecto (toggle apagado) NO aparece
        boolean sinToggle = bloqueoService.listarTodosActivos(gestor.getCorreoUtec(), false)
                .stream().anyMatch(b -> b.getId().equals(clase.getId()));
        assertFalse(sinToggle, "la clase NO debe salir sin incluirClases");

        // Con incluirClases=true SÍ aparece
        boolean conToggle = bloqueoService.listarTodosActivos(gestor.getCorreoUtec(), true)
                .stream().anyMatch(b -> b.getId().equals(clase.getId()));
        assertTrue(conToggle, "la clase debe salir con incluirClases=true");
    }

    @Test
    @DisplayName("eliminar borra el bloqueo de la BD")
    void eliminarBloqueo() {
        BloqueoResponse b = bloqueoService.crear(bloqueoParcial(mesaLimpia.getId()), gestor.getCorreoUtec());
        assertFalse(bloqueoService.listarPorLaboratorio(lab.getId()).isEmpty());
        bloqueoService.eliminar(b.getId(), gestor.getCorreoUtec());
        assertTrue(bloqueoService.listarPorLaboratorio(lab.getId()).isEmpty());
    }

    @Test
    @DisplayName("editar un bloqueo cambia el motivo")
    void editarBloqueo() {
        BloqueoResponse b = bloqueoService.crear(bloqueoParcial(mesaLimpia.getId()), gestor.getCorreoUtec());
        CreateBloqueoRequest edit = bloqueoParcial(mesaLimpia.getId());
        edit.setMotivo("MANTENIMIENTO");
        assertNotNull(bloqueoService.editar(b.getId(), edit, gestor.getCorreoUtec()));
    }

    @Test
    @DisplayName("Bloqueo parcial expone los recursos afectados en la respuesta (item1)")
    void parcial_exponeRecursosAfectados() {
        BloqueoResponse b = bloqueoService.crear(bloqueoParcial(mesaLimpia.getId()), gestor.getCorreoUtec());
        assertNotNull(b.getRecursosAfectados());
        assertTrue(b.getRecursosAfectados().contains(mesaLimpia.getId()),
                "la respuesta debe incluir el recurso bloqueado para pintarlo en la cuadrícula");
        // Al listar también debe venir poblado.
        BloqueoResponse listado = bloqueoService.listarPorLaboratorio(lab.getId()).get(0);
        assertTrue(listado.getRecursosAfectados().contains(mesaLimpia.getId()));
    }

    @Test
    @DisplayName("No permite dos bloqueos solapados en la misma mesa/horario (item7)")
    void bloqueosSolapados_falla() {
        bloqueoService.crear(bloqueoParcial(mesaLimpia.getId()), gestor.getCorreoUtec()); // 10:00–11:00
        BusinessException ex = assertThrows(BusinessException.class,
                () -> bloqueoService.crear(bloqueoParcial(mesaLimpia.getId()), gestor.getCorreoUtec()));
        assertEquals("BLOQUEO_SOLAPADO", ex.getErrorCode());
    }

    @Test
    @DisplayName("Permite bloquear la misma mesa una vez liberada (11:00–12:00 tras 10:00–11:00)")
    void bloqueosAdyacentes_ok() {
        bloqueoService.crear(bloqueoParcial(mesaLimpia.getId()), gestor.getCorreoUtec()); // 10:00–11:00
        CreateBloqueoRequest siguiente = bloqueoParcial(mesaLimpia.getId());
        siguiente.setHoraInicio(LocalTime.of(11, 0));
        siguiente.setHoraFin(LocalTime.of(12, 0));
        assertNotNull(bloqueoService.crear(siguiente, gestor.getCorreoUtec()).getId());
    }

    @Test
    @DisplayName("Un bloqueo TOTAL impide un parcial solapado (cubre todo el lab)")
    void totalBloqueaParcialSolapado_falla() {
        // Franja 14:00–15:00 (libre de la reserva del setUp en mesaConReserva 10:00–11:00).
        CreateBloqueoRequest total = bloqueoParcial(mesaLimpia.getId());
        total.setTipo("TOTAL");
        total.setMotivo("EVENTO");
        total.setRecursosIds(null);
        total.setHoraInicio(LocalTime.of(14, 0));
        total.setHoraFin(LocalTime.of(15, 0));
        bloqueoService.crear(total, gestor.getCorreoUtec()); // TOTAL 14:00–15:00

        CreateBloqueoRequest parcial = bloqueoParcial(mesaLimpia.getId());
        parcial.setHoraInicio(LocalTime.of(14, 0));
        parcial.setHoraFin(LocalTime.of(15, 0));
        BusinessException ex = assertThrows(BusinessException.class,
                () -> bloqueoService.crear(parcial, gestor.getCorreoUtec()));
        assertEquals("BLOQUEO_SOLAPADO", ex.getErrorCode());
    }

    @Test
    @DisplayName("Editar sin recursosIds (modal que solo cambia hora) CONSERVA los recursos del parcial (item3)")
    void editarSinRecursosIds_conservaRecursos() {
        BloqueoResponse b = bloqueoService.crear(bloqueoParcial(mesaLimpia.getId()), gestor.getCorreoUtec());
        CreateBloqueoRequest edit = bloqueoParcial(mesaLimpia.getId());
        edit.setRecursosIds(null);                  // como el modal de edición de BloqueosPage
        edit.setHoraInicio(LocalTime.of(14, 0));
        edit.setHoraFin(LocalTime.of(15, 0));
        bloqueoService.editar(b.getId(), edit, gestor.getCorreoUtec());

        BloqueoResponse actualizado = bloqueoService.listarPorLaboratorio(lab.getId()).get(0);
        assertTrue(actualizado.getRecursosAfectados().contains(mesaLimpia.getId()),
                "el bloqueo parcial no debe quedar sin recursos al editar solo la hora");
    }

    @Test
    @DisplayName("crear: fecha de inicio posterior a la de fin → INVALID_DATES")
    void crear_fechasInvalidas() {
        CreateBloqueoRequest req = bloqueoParcial(mesaLimpia.getId());
        req.setFechaInicio(fecha.plusDays(1));
        req.setFechaFin(fecha);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> bloqueoService.crear(req, gestor.getCorreoUtec()));
        assertEquals("INVALID_DATES", ex.getErrorCode());
    }

    @Test
    @DisplayName("crear: parcial sin horas → MISSING_HOURS")
    void crear_parcialSinHoras() {
        CreateBloqueoRequest req = bloqueoParcial(mesaLimpia.getId());
        req.setHoraInicio(null);
        req.setHoraFin(null);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> bloqueoService.crear(req, gestor.getCorreoUtec()));
        assertEquals("MISSING_HOURS", ex.getErrorCode());
    }

    @Test
    @DisplayName("crear: hora de inicio no anterior a la de fin → INVALID_HOURS")
    void crear_horasInvalidas() {
        CreateBloqueoRequest req = bloqueoParcial(mesaLimpia.getId());
        req.setHoraInicio(LocalTime.of(11, 0));
        req.setHoraFin(LocalTime.of(10, 0));
        BusinessException ex = assertThrows(BusinessException.class,
                () -> bloqueoService.crear(req, gestor.getCorreoUtec()));
        assertEquals("INVALID_HOURS", ex.getErrorCode());
    }

    @Test
    @DisplayName("crear: hora de fin después de las 23:00 → OUT_OF_WINDOW")
    void crear_finFueraDeVentana() {
        CreateBloqueoRequest req = bloqueoParcial(mesaLimpia.getId());
        req.setHoraInicio(LocalTime.of(22, 0));
        req.setHoraFin(LocalTime.of(23, 30));
        BusinessException ex = assertThrows(BusinessException.class,
                () -> bloqueoService.crear(req, gestor.getCorreoUtec()));
        assertEquals("OUT_OF_WINDOW", ex.getErrorCode());
    }

    @Test
    @DisplayName("eliminar bloqueo inexistente → 404")
    void eliminar_noEncontrado() {
        assertThrows(ResourceNotFoundException.class,
                () -> bloqueoService.eliminar(9_999_999L, gestor.getCorreoUtec()));
    }

    @Test
    @DisplayName("editar un bloqueo inactivo (legacy) → BLOQUEO_INACTIVO")
    void editar_bloqueoInactivo() {
        BloqueoResponse b = bloqueoService.crear(bloqueoParcial(mesaLimpia.getId()), gestor.getCorreoUtec());
        // Ya no hay acción de "desactivar"; marcamos inactivo en BD para probar la guarda defensiva.
        bloqueoRepository.findById(b.getId()).ifPresent(x -> { x.setActivo(false); bloqueoRepository.save(x); });
        CreateBloqueoRequest edit = bloqueoParcial(mesaLimpia.getId());
        BusinessException ex = assertThrows(BusinessException.class,
                () -> bloqueoService.editar(b.getId(), edit, gestor.getCorreoUtec()));
        assertEquals("BLOQUEO_INACTIVO", ex.getErrorCode());
    }

    @Test
    @DisplayName("IDOR: un RESPONSABLE_LAB NO asignado al lab no puede crear/editar/eliminar su bloqueo → 403")
    void responsableAjeno_noPuedeGestionar() {
        Role rolResp = roleRepository.findByNombre("RESPONSABLE_LAB").orElseThrow();
        Usuario ajeno = usuarioRepository.save(Usuario.builder()
                .correoUtec("ajeno-bloq@utec.edu.pe").nombres("Otro").apellidos("Resp")
                .rol(rolResp).activo(true).build());  // NO está en lab_responsables de 'lab'

        // Crear en un lab que no es suyo → AccessDenied
        assertThrows(org.springframework.security.access.AccessDeniedException.class,
                () -> bloqueoService.crear(bloqueoParcial(mesaLimpia.getId()), ajeno.getCorreoUtec()));

        // Editar/eliminar un bloqueo (creado por el admin) de un lab ajeno → AccessDenied
        BloqueoResponse b = bloqueoService.crear(bloqueoParcial(mesaLimpia.getId()), gestor.getCorreoUtec());
        assertThrows(org.springframework.security.access.AccessDeniedException.class,
                () -> bloqueoService.editar(b.getId(), bloqueoParcial(mesaLimpia.getId()), ajeno.getCorreoUtec()));
        assertThrows(org.springframework.security.access.AccessDeniedException.class,
                () -> bloqueoService.eliminar(b.getId(), ajeno.getCorreoUtec()));
    }

    private CreateBloqueoRequest bloqueoAula(Long aulaId, int hi, int hf) {
        CreateBloqueoRequest req = new CreateBloqueoRequest();
        req.setAulaId(aulaId);
        req.setMotivo("EVENTO");
        req.setDescripcion("Evento en aula");
        req.setFechaInicio(fecha);
        req.setFechaFin(fecha);
        req.setHoraInicio(LocalTime.of(hi, 0));
        req.setHoraFin(LocalTime.of(hf, 0));
        req.setResponsableNombre("Resp");
        req.setResponsableCorreo("resp@utec.edu.pe");
        return req;
    }

    @Test
    @DisplayName("Bloqueo de AULA: Admin lo crea TOTAL; un estudiante es rechazado; el solape en la misma aula falla")
    void bloqueoAula() {
        Aula aula = aulaRepository.save(Aula.builder()
                .codigo("A999").nombre("Aula Test").tipo("AULA").capacidad(30).activo(true).build());

        // ADMIN crea el bloqueo del aula → siempre TOTAL, con espacio genérico poblado.
        BloqueoResponse r = bloqueoService.crear(bloqueoAula(aula.getId(), 9, 11), gestor.getCorreoUtec());
        assertNotNull(r.getId());
        assertEquals("TOTAL", r.getTipo());
        assertEquals("AULA", r.getEspacioTipo());
        assertEquals("A999", r.getEspacioCodigo());
        assertNull(r.getLaboratorioCodigo());   // no es un lab
        assertEquals(aula.getId(), r.getAulaId());

        // Un ESTUDIANTE (sin permiso sobre aulas) es rechazado con AccessDenied.
        assertThrows(org.springframework.security.access.AccessDeniedException.class,
                () -> bloqueoService.crear(bloqueoAula(aula.getId(), 12, 13), alumno.getCorreoUtec()));

        // Un COORDINADOR tampoco: administra laboratorios, no los demás espacios (solo
        // ADMIN y el Counter de Docencia bloquean aulas).
        Usuario coordinador = usuarioRepository.save(Usuario.builder()
                .correoUtec("coord-aula@utec.edu.pe").nombres("Co").apellidos("Ord")
                .rol(roleRepository.findByNombre("COORDINADOR").orElseThrow()).activo(true).build());
        assertThrows(org.springframework.security.access.AccessDeniedException.class,
                () -> bloqueoService.crear(bloqueoAula(aula.getId(), 13, 14), coordinador.getCorreoUtec()));

        // Otro bloqueo que se cruza en la MISMA aula → BLOQUEO_SOLAPADO.
        BusinessException ex = assertThrows(BusinessException.class,
                () -> bloqueoService.crear(bloqueoAula(aula.getId(), 10, 12), gestor.getCorreoUtec()));
        assertEquals("BLOQUEO_SOLAPADO", ex.getErrorCode());
    }

    // ── Retiro de mesas (motivo RETIRO): reducción de capacidad, no un evento ──

    /** RETIRO = parcial de TODO EL DÍA (horas null) sobre las mesas retiradas, por un rango. */
    private CreateBloqueoRequest retiroDe(Long recursoId) {
        CreateBloqueoRequest req = new CreateBloqueoRequest();
        req.setLaboratorioId(lab.getId());
        req.setTipo("PARCIAL");
        req.setMotivo("RETIRO");
        req.setFechaInicio(fecha);
        req.setFechaFin(fecha);
        req.setHoraInicio(null);   // todo el día
        req.setHoraFin(null);
        req.setRecursosIds(List.of(recursoId));
        return req;
    }

    @Test
    @DisplayName("RETIRO es parcial de TODO EL DÍA (sin horas) y operativo: se crea y NO envía correo")
    void retiro_todoElDia_operativo_seCrea() {
        BloqueoResponse r = bloqueoService.crear(retiroDe(mesaLimpia.getId()), gestor.getCorreoUtec());
        assertEquals("RETIRO", r.getMotivo());
        assertNull(r.getHoraInicio());   // sin horas = todo el día (no exige MISSING_HOURS)
        verify(emailService, never()).enviarBloqueoCreado(
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean());
    }

    @Test
    @DisplayName("Un RETIRO se EDITA como retiro (acortar rango) pero NO con el editor genérico de hora/día suelto")
    void retiro_edicion() {
        BloqueoResponse r = bloqueoService.crear(retiroDe(mesaLimpia.getId()), gestor.getCorreoUtec());

        // (a) Editar como retiro (rango + todo el día): p. ej. acortar/extender el periodo → OK.
        CreateBloqueoRequest editOk = retiroDe(mesaLimpia.getId());
        editOk.setFechaFin(fecha.plusDays(1));
        BloqueoResponse actualizado = bloqueoService.editar(r.getId(), editOk, gestor.getCorreoUtec());
        assertEquals("RETIRO", actualizado.getMotivo());
        assertNull(actualizado.getHoraInicio());   // sigue siendo todo el día

        // (b) Editar con horas (editor genérico) lo corrompería → se rechaza.
        CreateBloqueoRequest editMal = retiroDe(mesaLimpia.getId());
        editMal.setHoraInicio(LocalTime.of(9, 0));
        editMal.setHoraFin(LocalTime.of(18, 0));
        BusinessException ex = assertThrows(BusinessException.class,
                () -> bloqueoService.editar(r.getId(), editMal, gestor.getCorreoUtec()));
        assertEquals("RETIRO_NO_EDITABLE", ex.getErrorCode());
    }

    @Test
    @DisplayName("Un RETIRO no bloquea un evento TOTAL (sin doble flujo): la capacidad no compite con eventos")
    void retiro_noBloqueaEventoTotal() {
        // Mesa retirada todo el día.
        bloqueoService.crear(retiroDe(mesaLimpia.getId()), gestor.getCorreoUtec());
        // Un evento TOTAL (cubre todo el lab) en una franja libre 12–13 se crea SIN chocar con el retiro.
        BloqueoResponse ev = bloqueoService.crear(bloqueoTotal("EVENTO", 12, 13), gestor.getCorreoUtec());
        assertNotNull(ev.getId());
        assertEquals("TOTAL", ev.getTipo());
    }

    @Test
    @DisplayName("Retirar una mesa que YA tiene una reserva activa se bloquea y la lista (RESERVAS_ACTIVAS)")
    void retiro_conReservaActiva_falla() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> bloqueoService.crear(retiroDe(mesaConReserva.getId()), gestor.getCorreoUtec()));
        assertEquals("RESERVAS_ACTIVAS", ex.getErrorCode());
    }
}

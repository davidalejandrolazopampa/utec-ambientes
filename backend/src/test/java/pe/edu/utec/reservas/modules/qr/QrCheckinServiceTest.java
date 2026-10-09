package pe.edu.utec.reservas.modules.qr;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
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
import pe.edu.utec.reservas.modules.qr.dto.CheckinRequest;
import pe.edu.utec.reservas.modules.qr.dto.CheckinResponse;
import pe.edu.utec.reservas.modules.qr.service.QrCheckinService;
import pe.edu.utec.reservas.modules.reservas.model.Reserva;
import pe.edu.utec.reservas.modules.reservas.repository.ReservaRepository;
import pe.edu.utec.reservas.shared.exceptions.BusinessException;
import pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class QrCheckinServiceTest {

    @Autowired private QrCheckinService qrCheckinService;
    @Autowired private UsuarioRepository usuarioRepository;
    @Autowired private RoleRepository roleRepository;
    @Autowired private LaboratorioRepository laboratorioRepository;
    @Autowired private RecursoLabRepository recursoLabRepository;
    @Autowired private ReservaRepository reservaRepository;

    private Usuario alumno;
    private Usuario otroAlumno;
    private RecursoLab mesa;
    private RecursoLab otraMesa;
    private Reserva reserva;

    @BeforeEach
    void setUp() {
        Role rol = roleRepository.findByNombre("ESTUDIANTE").orElseThrow();
        alumno = usuarioRepository.save(Usuario.builder()
                .correoUtec("alumno-qr@utec.edu.pe").nombres("Leo").apellidos("Diaz")
                .rol(rol).activo(true).build());
        otroAlumno = usuarioRepository.save(Usuario.builder()
                .correoUtec("otro-qr@utec.edu.pe").nombres("Ana").apellidos("Ruiz")
                .rol(rol).activo(true).build());

        Laboratorio lab = laboratorioRepository.save(Laboratorio.builder()
                .codigoLab("LQR").nombre("Lab QR").piso(1).ubicacionFase("Fase 1")
                .horaApertura(LocalTime.of(0, 0)).horaCierre(LocalTime.of(23, 59))
                .aforoTipo("MESA").aforoCantidad(2).aforoCapacidad(4).estado("ACTIVO")
                .diasAtencion(List.of("Lunes")).build());

        mesa = recursoLabRepository.save(RecursoLab.builder()
                .laboratorio(lab).tipo("MESA").nombre("MESA 1").numero(1).qrCode("LQR-MESA-001")
                .estado("DISPONIBLE").capacidadPersonas(4).activo(true).build());
        otraMesa = recursoLabRepository.save(RecursoLab.builder()
                .laboratorio(lab).tipo("MESA").nombre("MESA 2").numero(2).qrCode("LQR-MESA-002")
                .estado("DISPONIBLE").capacidadPersonas(4).activo(true).build());

        // Reserva de HOY con hora de inicio en el futuro (> 10 min) → aún no se puede check-in.
        // Ventana acotada al día (cap 23:58–23:59) para NO cruzar medianoche al final del día,
        // que violaría chk_reserva_horario (hora_inicio < hora_fin). Los tests sensibles a la
        // hora ya se saltan con assumeTrue(lejosDeMedianoche()).
        int nowMin = LocalTime.now().getHour() * 60 + LocalTime.now().getMinute();
        int iniMin = Math.min(nowMin + 120, 23 * 60 + 58);
        int finMin = Math.min(iniMin + 60, 23 * 60 + 59);
        reserva = reservaRepository.save(Reserva.builder()
                .recurso(mesa).usuario(alumno).creadoPor(alumno)
                .fecha(LocalDate.now())
                .horaInicio(LocalTime.of(iniMin / 60, iniMin % 60))
                .horaFin(LocalTime.of(finMin / 60, finMin % 60))
                .estado("PENDIENTE").tipoReserva("ALUMNO").participantes(1)
                .build());
    }

    /** Mueve la reserva a una ventana donde el check-in YA está habilitado (ahora). */
    private void hacerReservaElegibleAhora() {
        reserva.setHoraInicio(LocalTime.now().withSecond(0).withNano(0));
        reserva.setHoraFin(LocalTime.now().plusHours(1).withSecond(0).withNano(0));
        reservaRepository.save(reserva);
    }

    private boolean lejosDeMedianoche() {
        return LocalTime.now().isBefore(LocalTime.of(22, 0)) && LocalTime.now().isAfter(LocalTime.of(0, 30));
    }

    // ───────────────────────── checkin(request) por QR del recurso ─────────────────────────

    @Test
    @DisplayName("checkin: QR no reconocido → INVALIDO")
    void checkin_qrNoReconocido() {
        CheckinResponse r = qrCheckinService.checkin(req(reserva.getId(), "QR-INEXISTENTE"), alumno.getCorreoUtec());
        assertEquals("INVALIDO", r.getResultado());
        assertTrue(r.getMensaje().contains("no reconocido"));
    }

    @Test
    @DisplayName("checkin: QR de otro recurso → RECURSO_NO_COINCIDE")
    void checkin_recursoNoCoincide() {
        CheckinResponse r = qrCheckinService.checkin(req(reserva.getId(), otraMesa.getQrCode()), alumno.getCorreoUtec());
        assertEquals("RECURSO_NO_COINCIDE", r.getResultado());
    }

    @Test
    @DisplayName("checkin: reserva no es de hoy → INVALIDO")
    void checkin_noEsHoy() {
        reserva.setFecha(LocalDate.now().plusDays(1));
        reservaRepository.save(reserva);
        CheckinResponse r = qrCheckinService.checkin(req(reserva.getId(), mesa.getQrCode()), alumno.getCorreoUtec());
        assertEquals("INVALIDO", r.getResultado());
        assertTrue(r.getMensaje().contains("no es para hoy"));
    }

    @Test
    @DisplayName("checkin: estado no válido (CANCELADA) → INVALIDO")
    void checkin_estadoInvalido() {
        reserva.setEstado("CANCELADA");
        reservaRepository.save(reserva);
        CheckinResponse r = qrCheckinService.checkin(req(reserva.getId(), mesa.getQrCode()), alumno.getCorreoUtec());
        assertEquals("INVALIDO", r.getResultado());
        assertTrue(r.getMensaje().contains("estado válido"));
    }

    @Test
    @DisplayName("checkin: reserva de otro usuario → INVALIDO")
    void checkin_noPertenece() {
        Assumptions.assumeTrue(lejosDeMedianoche());
        hacerReservaElegibleAhora();
        CheckinResponse r = qrCheckinService.checkin(req(reserva.getId(), mesa.getQrCode()), otroAlumno.getCorreoUtec());
        assertEquals("INVALIDO", r.getResultado());
        assertTrue(r.getMensaje().contains("no te pertenece"));
    }

    @Test
    @DisplayName("checkin: aún muy temprano (>10 min antes) → INVALIDO")
    void checkin_muyTemprano() {
        Assumptions.assumeTrue(lejosDeMedianoche());
        CheckinResponse r = qrCheckinService.checkin(req(reserva.getId(), mesa.getQrCode()), alumno.getCorreoUtec());
        assertEquals("INVALIDO", r.getResultado());
        assertTrue(r.getMensaje().contains("temprano"));
    }

    @Test
    @DisplayName("checkin: válido dentro de ventana → VALIDO, reserva EN_CURSO, recurso OCUPADO")
    void checkin_exito() {
        Assumptions.assumeTrue(lejosDeMedianoche());
        hacerReservaElegibleAhora();
        CheckinResponse r = qrCheckinService.checkin(req(reserva.getId(), mesa.getQrCode()), alumno.getCorreoUtec());
        assertEquals("VALIDO", r.getResultado());
        assertEquals("EN_CURSO", reservaRepository.findById(reserva.getId()).orElseThrow().getEstado());
        assertEquals("OCUPADO", recursoLabRepository.findById(mesa.getId()).orElseThrow().getEstado());
    }

    @Test
    @DisplayName("checkin: reserva inexistente → ResourceNotFoundException")
    void checkin_reservaInexistente() {
        assertThrows(ResourceNotFoundException.class,
                () -> qrCheckinService.checkin(req(999999L, mesa.getQrCode()), alumno.getCorreoUtec()));
    }

    @Test
    @DisplayName("checkin: usuario inexistente → ResourceNotFoundException")
    void checkin_usuarioInexistente() {
        assertThrows(ResourceNotFoundException.class,
                () -> qrCheckinService.checkin(req(reserva.getId(), mesa.getQrCode()), "nadie@utec.edu.pe"));
    }

    // ───────────────────────── checkinPorQr (automático) ─────────────────────────

    @Test
    @DisplayName("checkinPorQr: éxito busca la reserva activa y la pone EN_CURSO")
    void checkinPorQr_exito() {
        Assumptions.assumeTrue(lejosDeMedianoche());
        hacerReservaElegibleAhora();
        CheckinResponse r = qrCheckinService.checkinPorQr(mesa.getQrCode(), alumno.getCorreoUtec());
        assertEquals("VALIDO", r.getResultado());
        assertEquals("EN_CURSO", reservaRepository.findById(reserva.getId()).orElseThrow().getEstado());
    }

    @Test
    @DisplayName("checkinPorQr: QR no reconocido → QR_INVALIDO")
    void checkinPorQr_qrInvalido() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> qrCheckinService.checkinPorQr("QR-INEXISTENTE", alumno.getCorreoUtec()));
        assertEquals("QR_INVALIDO", ex.getErrorCode());
    }

    @Test
    @DisplayName("checkinPorQr: sin reserva activa → NO_RESERVA_ACTIVA")
    void checkinPorQr_sinReservaActiva() {
        // reserva sigue a +2h → no entra en la ventana
        BusinessException ex = assertThrows(BusinessException.class,
                () -> qrCheckinService.checkinPorQr(mesa.getQrCode(), alumno.getCorreoUtec()));
        assertEquals("NO_RESERVA_ACTIVA", ex.getErrorCode());
    }

    @Test
    @DisplayName("checkinPorQr: usuario inexistente → ResourceNotFoundException")
    void checkinPorQr_usuarioInexistente() {
        assertThrows(ResourceNotFoundException.class,
                () -> qrCheckinService.checkinPorQr(mesa.getQrCode(), "nadie@utec.edu.pe"));
    }

    // ───────────────────────── checkinManual (responsable) ─────────────────────────

    @Test
    @DisplayName("checkinManual: éxito → VALIDO_MANUAL")
    void checkinManual_exito() {
        Assumptions.assumeTrue(lejosDeMedianoche());
        hacerReservaElegibleAhora();
        CheckinResponse r = qrCheckinService.checkinManual(reserva.getId(), alumno.getCorreoUtec());
        assertEquals("VALIDO", r.getResultado());
        assertEquals("EN_CURSO", reservaRepository.findById(reserva.getId()).orElseThrow().getEstado());
    }

    @Test
    @DisplayName("checkinManual: antes de la ventana → TOO_EARLY")
    void checkinManual_muyTemprano() {
        Assumptions.assumeTrue(lejosDeMedianoche());
        BusinessException ex = assertThrows(BusinessException.class,
                () -> qrCheckinService.checkinManual(reserva.getId(), alumno.getCorreoUtec()));
        assertEquals("TOO_EARLY", ex.getErrorCode());
    }

    @Test
    @DisplayName("checkinManual: estado inválido → INVALID_STATE")
    void checkinManual_estadoInvalido() {
        reserva.setEstado("EN_CURSO");
        reservaRepository.save(reserva);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> qrCheckinService.checkinManual(reserva.getId(), alumno.getCorreoUtec()));
        assertEquals("INVALID_STATE", ex.getErrorCode());
    }

    @Test
    @DisplayName("checkinManual: reserva de otro día → NOT_TODAY")
    void checkinManual_noEsHoy() {
        reserva.setFecha(LocalDate.now().plusDays(1));
        reservaRepository.save(reserva);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> qrCheckinService.checkinManual(reserva.getId(), alumno.getCorreoUtec()));
        assertEquals("NOT_TODAY", ex.getErrorCode());
    }

    @Test
    @DisplayName("checkinManual: reserva inexistente → ResourceNotFoundException")
    void checkinManual_reservaInexistente() {
        assertThrows(ResourceNotFoundException.class,
                () -> qrCheckinService.checkinManual(999999L, alumno.getCorreoUtec()));
    }

    @Test
    @DisplayName("checkinManual: responsable inexistente (reserva elegible) → ResourceNotFoundException")
    void checkinManual_responsableInexistente() {
        Assumptions.assumeTrue(lejosDeMedianoche());
        hacerReservaElegibleAhora();
        assertThrows(ResourceNotFoundException.class,
                () -> qrCheckinService.checkinManual(reserva.getId(), "nadie@utec.edu.pe"));
    }

    private CheckinRequest req(Long reservaId, String qrCode) {
        CheckinRequest r = new CheckinRequest();
        r.setReservaId(reservaId);
        r.setQrCode(qrCode);
        return r;
    }
}

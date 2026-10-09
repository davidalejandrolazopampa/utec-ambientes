package pe.edu.utec.reservas.modules.laboratorios;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.utec.reservas.modules.iam.model.Role;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.iam.repository.RoleRepository;
import pe.edu.utec.reservas.modules.iam.repository.UsuarioRepository;
import pe.edu.utec.reservas.modules.laboratorios.dto.CreateLaboratorioRequest;
import pe.edu.utec.reservas.modules.laboratorios.dto.LaboratorioResponse;
import pe.edu.utec.reservas.modules.laboratorios.dto.RecursoLabResponse;
import pe.edu.utec.reservas.modules.laboratorios.model.Laboratorio;
import pe.edu.utec.reservas.modules.laboratorios.model.RecursoLab;
import pe.edu.utec.reservas.modules.laboratorios.repository.LaboratorioRepository;
import pe.edu.utec.reservas.modules.laboratorios.repository.RecursoLabRepository;
import pe.edu.utec.reservas.modules.laboratorios.service.LaboratorioService;
import pe.edu.utec.reservas.modules.bloqueos.model.Bloqueo;
import pe.edu.utec.reservas.modules.bloqueos.repository.BloqueoRepository;
import pe.edu.utec.reservas.shared.exceptions.BusinessException;
import pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException;

import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class LaboratorioServiceTest {

    @Autowired private LaboratorioService laboratorioService;
    @Autowired private UsuarioRepository usuarioRepository;
    @Autowired private RoleRepository roleRepository;
    @Autowired private LaboratorioRepository laboratorioRepository;
    @Autowired private RecursoLabRepository recursoLabRepository;
    @Autowired private BloqueoRepository bloqueoRepository;
    @Autowired private EntityManager em;

    private Laboratorio lab;
    private RecursoLab mesa;
    private Usuario responsable;

    @BeforeEach
    void setUp() {
        Role rol = roleRepository.findByNombre("RESPONSABLE_LAB").orElseThrow();
        responsable = usuarioRepository.save(Usuario.builder()
                .correoUtec("resp-lab@utec.edu.pe").nombres("Resp").apellidos("Lab")
                .rol(rol).activo(true).build());

        lab = laboratorioRepository.save(Laboratorio.builder()
                .codigoLab("LCAP").nombre("Lab Cap").piso(1).ubicacionFase("Fase 1")
                .horaApertura(LocalTime.of(8, 0)).horaCierre(LocalTime.of(18, 0))
                .aforoTipo("MESA").aforoCantidad(1).aforoCapacidad(4).estado("ACTIVO")
                .diasAtencion(List.of("Lunes")).build());

        mesa = recursoLabRepository.save(RecursoLab.builder()
                .laboratorio(lab).tipo("MESA").nombre("MESA 1").numero(1).qrCode("LCAP-MESA-001")
                .estado("DISPONIBLE").capacidadPersonas(4).activo(true).build());
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private void autenticar(String email, String rol) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(email, null,
                        List.of(new SimpleGrantedAuthority("ROLE_" + rol))));
    }

    @Test
    @DisplayName("ADMIN puede editar la capacidad de cualquier recurso")
    void adminEditaRecurso_exito() {
        autenticar("admin@utec.edu.pe", "ADMIN");
        RecursoLabResponse resp = laboratorioService.editarRecurso(lab.getId(), mesa.getId(), Map.of("capacidadPersonas", 7));
        assertEquals(7, resp.getCapacidadPersonas());
    }

    @Test
    @DisplayName("RESPONSABLE_LAB no asignado al lab recibe 403 al editar recurso")
    void responsableNoAsignado_denegado() {
        autenticar("otro-resp@utec.edu.pe", "RESPONSABLE_LAB");
        assertThrows(AccessDeniedException.class,
                () -> laboratorioService.editarRecurso(lab.getId(), mesa.getId(), Map.of("capacidadPersonas", 7)));
    }

    @Test
    @DisplayName("RESPONSABLE_LAB asignado al lab sí puede editar recurso")
    void responsableAsignado_exito() {
        lab.getResponsables().add(responsable);
        laboratorioRepository.saveAndFlush(lab);
        autenticar(responsable.getCorreoUtec(), "RESPONSABLE_LAB");
        RecursoLabResponse resp = laboratorioService.editarRecurso(lab.getId(), mesa.getId(), Map.of("capacidadPersonas", 9));
        assertEquals(9, resp.getCapacidadPersonas());
    }

    @Test
    @DisplayName("recursosDisponibles (ahora) descuenta una mesa bajo bloqueo PARCIAL vigente")
    void disponiblesAhora_descuentaMesaBloqueadaAhora() {
        // El lab debe atender HOY y a esta hora; si no, el conteo "ahora" sería 0 por estar cerrado.
        lab.setDiasAtencion(List.of("Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"));
        lab.setHoraApertura(LocalTime.MIDNIGHT);
        lab.setHoraCierre(LocalTime.of(23, 59));
        laboratorioRepository.saveAndFlush(lab);

        // Segunda mesa libre, para distinguir del conteo total.
        RecursoLab mesa2 = recursoLabRepository.save(RecursoLab.builder()
                .laboratorio(lab).tipo("MESA").nombre("MESA 2").numero(2).qrCode("LCAP-MESA-002")
                .estado("DISPONIBLE").capacidadPersonas(4).activo(true).build());

        // Antes del bloqueo: 2 mesas DISPONIBLE → 2 disponibles ahora.
        assertEquals(2, laboratorioService.obtenerPorId(lab.getId()).getRecursosDisponibles());

        // Bloqueo PARCIAL de la mesa 1, vigente TODO el día de hoy (cubre la hora actual).
        Bloqueo bloqueo = bloqueoRepository.saveAndFlush(Bloqueo.builder()
                .laboratorio(lab).tipo("PARCIAL").motivo("MANTENIMIENTO")
                .fechaInicio(LocalDate.now()).fechaFin(LocalDate.now())
                .horaInicio(LocalTime.of(0, 0)).horaFin(LocalTime.of(23, 59))
                .activo(true).creadoPor(responsable).build());
        em.createNativeQuery("INSERT INTO bloqueo_recursos (bloqueo_id, recurso_id) VALUES (:b, :r)")
                .setParameter("b", bloqueo.getId()).setParameter("r", mesa.getId())
                .executeUpdate();
        em.flush();

        // Ahora la mesa 1 está bloqueada en este instante → solo queda 1 disponible ahora.
        assertEquals(1, laboratorioService.obtenerPorId(lab.getId()).getRecursosDisponibles());
    }

    @Test
    @DisplayName("disponibles = 0 (ahora y hoy) cuando el lab NO atiende hoy")
    void disponibles_ceroSiNoAtiendeHoy() {
        // Configurar el lab para que atienda solo MAÑANA (un día que no es hoy).
        String[] dias = { "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo" };
        String manana = dias[LocalDate.now().plusDays(1).getDayOfWeek().getValue() - 1];
        lab.setDiasAtencion(List.of(manana));
        laboratorioRepository.saveAndFlush(lab);

        var resp = laboratorioService.obtenerPorId(lab.getId());
        assertEquals(0, resp.getRecursosDisponibles());      // "ahora" → cerrado
        assertEquals(0, resp.getRecursosDisponiblesHoy());   // "hoy" → cerrado
    }

    @Test
    @DisplayName("mis-laboratorios sale en ORDEN institucional: piso asc y luego código")
    void misLaboratorios_ordenInstitucional() {
        var labs = laboratorioService.listarPorUsuario("conceptlab@utec.edu.pe"); // ADMIN → todos
        assertFalse(labs.isEmpty());
        for (int i = 1; i < labs.size(); i++) {
            var a = labs.get(i - 1);
            var b = labs.get(i);
            Integer pa = a.getPiso(), pb = b.getPiso();
            if (pa == null) { assertEquals(null, pb); }               // nulls al final
            else if (pb != null && pa.equals(pb)) {
                assertTrue(a.getCodigoLab().compareToIgnoreCase(b.getCodigoLab()) <= 0);
            } else if (pb != null) {
                assertTrue(pa <= pb);
            }
        }
    }

    @Test
    @DisplayName("listar/obtener laboratorios y recursos")
    void listarYObtener() {
        assertFalse(laboratorioService.listarTodosIncluyendoInactivos().isEmpty());
        assertFalse(laboratorioService.listarTodos().isEmpty());
        assertEquals("LCAP", laboratorioService.obtenerPorId(lab.getId()).getCodigoLab());
        assertEquals("LCAP", laboratorioService.obtenerPorCodigo("LCAP").getCodigoLab());
        assertTrue(laboratorioService.listarRecursos(lab.getId()).stream().anyMatch(r -> "MESA 1".equals(r.getNombre())));
    }

    @Test
    @DisplayName("listar por piso y por fase")
    void listarPorPisoYFase() {
        assertTrue(laboratorioService.listarPorPiso(1).stream().anyMatch(l -> "LCAP".equals(l.getCodigoLab())));
        assertTrue(laboratorioService.listarPorFase("Fase 1").stream().anyMatch(l -> "LCAP".equals(l.getCodigoLab())));
    }

    @Test
    @DisplayName("cambiar estado del laboratorio")
    void cambiarEstado() {
        assertEquals("INACTIVO", laboratorioService.cambiarEstado(lab.getId(), "INACTIVO").getEstado());
    }

    @Test
    @DisplayName("agregar y eliminar recurso (ADMIN)")
    void agregarYEliminarRecurso() {
        autenticar("admin@utec.edu.pe", "ADMIN");
        RecursoLabResponse nuevo = laboratorioService.agregarRecurso(lab.getId(),
                Map.<String, Object>of("tipo", "MESA", "nombre", "MESA 2", "capacidadPersonas", 4));
        assertNotNull(nuevo.getId());
        laboratorioService.eliminarRecurso(lab.getId(), nuevo.getId());
    }

    @Test
    @DisplayName("crear laboratorio nuevo")
    void crearLaboratorio() {
        CreateLaboratorioRequest req = new CreateLaboratorioRequest();
        req.setCodigoLab("LNEW");
        req.setNombre("Lab Nuevo");
        req.setPiso(2);
        req.setUbicacionFase("Fase 2");
        req.setHoraApertura(LocalTime.of(9, 0));
        req.setHoraCierre(LocalTime.of(17, 0));
        req.setAforoTipo("MESA");
        req.setAforoCantidad(3);
        req.setAforoCapacidad(4);
        LaboratorioResponse r = laboratorioService.crear(req);
        assertEquals("LNEW", r.getCodigoLab());
        assertEquals("LNEW", laboratorioService.obtenerPorCodigo("LNEW").getCodigoLab());
    }

    @Test
    @DisplayName("crear lab con recursos mezclados (mesas + PCs) genera ambos tipos")
    void crearLaboratorio_recursosMezclados() {
        CreateLaboratorioRequest req = new CreateLaboratorioRequest();
        req.setCodigoLab("LMIX");
        req.setNombre("Lab Mix");
        req.setPiso(1);
        req.setUbicacionFase("Fase 2");
        req.setHoraApertura(LocalTime.of(9, 0));
        req.setHoraCierre(LocalTime.of(17, 0));
        req.setAforoTipo("MESA"); req.setAforoCantidad(10); req.setAforoCapacidad(5); // aforo principal (tarjeta)

        var mesas = new CreateLaboratorioRequest.RecursoGrupoRequest();
        mesas.setTipo("MESA"); mesas.setCantidad(10); mesas.setCapacidadPersonas(5);
        var pcs = new CreateLaboratorioRequest.RecursoGrupoRequest();
        pcs.setTipo("PC"); pcs.setCantidad(1); pcs.setCapacidadPersonas(1);
        req.setRecursos(List.of(mesas, pcs));

        LaboratorioResponse r = laboratorioService.crear(req);
        var recursos = recursoLabRepository.findByLaboratorioIdAndActivoTrue(r.getId());
        assertEquals(11, recursos.size());
        assertEquals(10, recursos.stream().filter(x -> "MESA".equals(x.getTipo())).count());
        assertEquals(1, recursos.stream().filter(x -> "PC".equals(x.getTipo())).count());
    }

    @Test
    @DisplayName("editar laboratorio cambia el nombre")
    void editarLaboratorio() {
        autenticar("admin@utec.edu.pe", "ADMIN");
        CreateLaboratorioRequest req = new CreateLaboratorioRequest();
        req.setCodigoLab("LCAP");
        req.setNombre("Lab Cap Editado");
        req.setPiso(1);
        req.setUbicacionFase("Fase 1");
        req.setDiasAtencion(List.of("Lunes"));
        req.setHoraApertura(LocalTime.of(8, 0));
        req.setHoraCierre(LocalTime.of(18, 0));
        req.setAforoTipo("MESA");
        req.setAforoCantidad(1);
        req.setAforoCapacidad(4);
        assertEquals("Lab Cap Editado", laboratorioService.editar(lab.getId(), req).getNombre());
    }

    @Test
    @DisplayName("editar laboratorio guarda y reemplaza sus servicios (nombre + enlace)")
    void editarLaboratorio_servicios() {
        autenticar("admin@utec.edu.pe", "ADMIN");
        CreateLaboratorioRequest req = new CreateLaboratorioRequest();
        req.setCodigoLab("LSVC"); req.setNombre("Lab Servicios"); req.setPiso(1); req.setUbicacionFase("Fase 1");
        req.setDiasAtencion(List.of("Lunes")); req.setHoraApertura(LocalTime.of(8, 0)); req.setHoraCierre(LocalTime.of(18, 0));
        req.setAforoTipo("MESA"); req.setAforoCantidad(1); req.setAforoCapacidad(4);

        var s1 = new CreateLaboratorioRequest.ServicioRequest();
        s1.setNombre("Impresiones 3D"); s1.setUrl("https://fablab.utec.edu.pe/3d"); s1.setDescripcion("Solicita tu impresión");
        var vacio = new CreateLaboratorioRequest.ServicioRequest();  // sin nombre → se ignora
        req.setServicios(List.of(s1, vacio));

        LaboratorioResponse r = laboratorioService.editar(lab.getId(), req);
        assertEquals(1, r.getServicios().size());
        assertEquals("Impresiones 3D", r.getServicios().get(0).getNombre());
        assertEquals("https://fablab.utec.edu.pe/3d", r.getServicios().get(0).getUrl());

        // Reeditar con lista vacía BORRA los servicios (reemplazo en bloque).
        req.setServicios(List.of());
        assertEquals(0, laboratorioService.editar(lab.getId(), req).getServicios().size());
    }

    @Test
    @DisplayName("eliminar laboratorio")
    void eliminarLaboratorio() {
        Laboratorio otro = laboratorioRepository.save(Laboratorio.builder()
                .codigoLab("LDEL").nombre("Lab Del").piso(1).ubicacionFase("F1")
                .horaApertura(LocalTime.of(8, 0)).horaCierre(LocalTime.of(18, 0))
                .aforoTipo("MESA").aforoCantidad(1).aforoCapacidad(4).estado("ACTIVO")
                .diasAtencion(List.of("Lunes")).build());
        Long id = otro.getId();
        laboratorioService.eliminar(id);
        assertThrows(RuntimeException.class, () -> laboratorioService.obtenerPorId(id));
    }

    @Test
    @DisplayName("listarPorUsuario devuelve los labs del responsable")
    void listarPorUsuario() {
        lab.getResponsables().add(responsable);
        laboratorioRepository.saveAndFlush(lab);
        assertTrue(laboratorioService.listarPorUsuario(responsable.getCorreoUtec()).stream()
                .anyMatch(l -> "LCAP".equals(l.getCodigoLab())));
    }

    private Usuario nuevoUsuario(String correo, String rolNombre) {
        Role rol = roleRepository.findByNombre(rolNombre).orElseThrow();
        return usuarioRepository.save(Usuario.builder()
                .correoUtec(correo).nombres("N").apellidos("A").rol(rol).activo(true).build());
    }

    @Test
    @DisplayName("listarPorUsuario: ADMIN ve todos")
    void listarPorUsuario_admin() {
        Usuario admin = nuevoUsuario("admin-ls@utec.edu.pe", "ADMIN");
        assertFalse(laboratorioService.listarPorUsuario(admin.getCorreoUtec()).isEmpty());
    }

    @Test
    @DisplayName("listarPorUsuario: ESTUDIANTE cae en el default (todos los activos)")
    void listarPorUsuario_estudiante() {
        Usuario est = nuevoUsuario("est-ls@utec.edu.pe", "ESTUDIANTE");
        assertNotNull(laboratorioService.listarPorUsuario(est.getCorreoUtec()));
    }

    @Test
    @DisplayName("listarPorUsuario: DIRECTOR ve los labs que dirige")
    void listarPorUsuario_director() {
        Usuario director = nuevoUsuario("dir-ls@utec.edu.pe", "DIRECTOR");
        lab.setDirector(director);
        laboratorioRepository.saveAndFlush(lab);
        assertTrue(laboratorioService.listarPorUsuario(director.getCorreoUtec()).stream()
                .anyMatch(l -> "LCAP".equals(l.getCodigoLab())));
    }

    @Test
    @DisplayName("listarPorUsuario: usuario inexistente → 404")
    void listarPorUsuario_noEncontrado() {
        assertThrows(ResourceNotFoundException.class,
                () -> laboratorioService.listarPorUsuario("nadie@utec.edu.pe"));
    }

    @Test
    @DisplayName("obtenerPorCodigo / listarRecursos / eliminar inexistentes → 404")
    void recursosInexistentes() {
        assertThrows(ResourceNotFoundException.class, () -> laboratorioService.obtenerPorCodigo("NOPE"));
        assertThrows(ResourceNotFoundException.class, () -> laboratorioService.listarRecursos(999999L));
        assertThrows(ResourceNotFoundException.class, () -> laboratorioService.cambiarEstado(999999L, "ACTIVO"));
    }

    @Test
    @DisplayName("crear: código duplicado → DUPLICATE_LAB_CODE")
    void crear_codigoDuplicado() {
        CreateLaboratorioRequest req = new CreateLaboratorioRequest();
        req.setCodigoLab("LCAP"); // ya existe
        req.setNombre("Dup"); req.setPiso(1); req.setUbicacionFase("F1");
        req.setHoraApertura(LocalTime.of(9, 0)); req.setHoraCierre(LocalTime.of(17, 0));
        req.setAforoTipo("MESA"); req.setAforoCantidad(1); req.setAforoCapacidad(4);
        BusinessException ex = assertThrows(BusinessException.class, () -> laboratorioService.crear(req));
        assertEquals("DUPLICATE_LAB_CODE", ex.getErrorCode());
    }

    @Test
    @DisplayName("crear: horario inválido (apertura ≥ cierre) → INVALID_SCHEDULE")
    void crear_horarioInvalido() {
        CreateLaboratorioRequest req = new CreateLaboratorioRequest();
        req.setCodigoLab("LSCHED"); req.setNombre("X"); req.setPiso(1); req.setUbicacionFase("F1");
        req.setHoraApertura(LocalTime.of(18, 0)); req.setHoraCierre(LocalTime.of(9, 0));
        req.setAforoTipo("MESA"); req.setAforoCantidad(1); req.setAforoCapacidad(4);
        BusinessException ex = assertThrows(BusinessException.class, () -> laboratorioService.crear(req));
        assertEquals("INVALID_SCHEDULE", ex.getErrorCode());
    }

    @Test
    @DisplayName("editar: lab inexistente → 404 (con ADMIN)")
    void editar_noEncontrado() {
        autenticar("admin@utec.edu.pe", "ADMIN");
        CreateLaboratorioRequest req = new CreateLaboratorioRequest();
        req.setNombre("X"); req.setHoraApertura(LocalTime.of(8, 0)); req.setHoraCierre(LocalTime.of(18, 0));
        assertThrows(ResourceNotFoundException.class, () -> laboratorioService.editar(999999L, req));
    }

    @Test
    @DisplayName("editarRecurso: recurso inexistente y de otro lab")
    void editarRecurso_errores() {
        autenticar("admin@utec.edu.pe", "ADMIN");
        assertThrows(ResourceNotFoundException.class,
                () -> laboratorioService.editarRecurso(lab.getId(), 999999L, Map.of("capacidadPersonas", 3)));

        Laboratorio otro = laboratorioRepository.save(Laboratorio.builder()
                .codigoLab("LOTRO").nombre("Otro").piso(1).ubicacionFase("F1")
                .horaApertura(LocalTime.of(8, 0)).horaCierre(LocalTime.of(18, 0))
                .aforoTipo("MESA").aforoCantidad(1).aforoCapacidad(4).estado("ACTIVO")
                .diasAtencion(List.of("Lunes")).build());
        RecursoLab recOtro = recursoLabRepository.save(RecursoLab.builder()
                .laboratorio(otro).tipo("MESA").nombre("M").numero(1).qrCode("LOTRO-MESA-001")
                .estado("DISPONIBLE").capacidadPersonas(4).activo(true).build());
        BusinessException ex = assertThrows(BusinessException.class,
                () -> laboratorioService.editarRecurso(lab.getId(), recOtro.getId(), Map.of("capacidadPersonas", 3)));
        assertEquals("INVALID_RESOURCE", ex.getErrorCode());
    }

    @Test
    @DisplayName("editarRecurso: cambia el nombre")
    void editarRecurso_cambiaNombre() {
        autenticar("admin@utec.edu.pe", "ADMIN");
        RecursoLabResponse r = laboratorioService.editarRecurso(lab.getId(), mesa.getId(), Map.of("nombre", "MESA RENOMBRADA"));
        assertEquals("MESA RENOMBRADA", r.getNombre());
    }

    @Test
    @DisplayName("eliminarRecurso: recurso inexistente → 404 (ADMIN)")
    void eliminarRecurso_noEncontrado() {
        autenticar("admin@utec.edu.pe", "ADMIN");
        assertThrows(ResourceNotFoundException.class,
                () -> laboratorioService.eliminarRecurso(lab.getId(), 999999L));
    }

    @Test
    @DisplayName("asegurarAccesoAlLab: sin autenticación → 403")
    void editarRecurso_sinAuth() {
        assertThrows(AccessDeniedException.class,
                () -> laboratorioService.editarRecurso(lab.getId(), mesa.getId(), Map.of("capacidadPersonas", 3)));
    }

    @Autowired private pe.edu.utec.reservas.modules.laboratorios.repository.DepartamentoRepository departamentoRepository;
    @Autowired private pe.edu.utec.reservas.modules.laboratorios.repository.CarreraRepository carreraRepository;

    @Test
    @DisplayName("toResponse: con departamento y carrera asignados (resuelve nombres por query nativa)")
    void toResponse_conDeptoYCarrera() {
        var deps = departamentoRepository.findAll();
        var carreras = carreraRepository.findAll();
        org.junit.jupiter.api.Assumptions.assumeFalse(deps.isEmpty() || carreras.isEmpty(),
                "requiere departamentos/carreras en el seed");
        lab.setDepartamentoId(deps.get(0).getId());
        lab.setCarreraId(carreras.get(0).getId());
        laboratorioRepository.saveAndFlush(lab);
        LaboratorioResponse r = laboratorioService.obtenerPorId(lab.getId());
        assertNotNull(r.getDepartamentoNombre());
        assertNotNull(r.getCarreraNombre());
    }

    @Test
    @DisplayName("crear completo: director + responsables (auto-vincula depto) + equipos + defaults")
    void crear_completoConCascada() {
        var deps = departamentoRepository.findAll();
        org.junit.jupiter.api.Assumptions.assumeFalse(deps.isEmpty(), "requiere departamentos en el seed");
        Long depId = deps.get(0).getId();

        Usuario dir = nuevoUsuario("dir-crear@utec.edu.pe", "DIRECTOR");
        Usuario resp = usuarioRepository.save(Usuario.builder()
                .correoUtec("resp-crear@utec.edu.pe").nombres("R").apellidos("L")
                .rol(roleRepository.findByNombre("RESPONSABLE_LAB").orElseThrow())
                .activo(true).departamentoId(depId).build());

        CreateLaboratorioRequest req = new CreateLaboratorioRequest();
        req.setCodigoLab("LFULL"); req.setNombre("Full"); req.setPiso(3); req.setUbicacionFase("F3");
        req.setHoraApertura(LocalTime.of(8, 0)); req.setHoraCierre(LocalTime.of(20, 0));
        req.setAforoTipo("mesa"); req.setAforoCantidad(2); req.setAforoCapacidad(4);
        req.setDiasAtencion(null);   // rama default de días
        req.setDirectorId(dir.getId());
        req.setResponsablesIds(List.of(resp.getId()));
        // Equipos especializados → recursos con tipo "EQUIPO" (requiere V5__add_equipo_to_tipo_aforo).
        CreateLaboratorioRequest.EquipoRequest eq = new CreateLaboratorioRequest.EquipoRequest();
        eq.setNombre("Microscopio"); eq.setCantidad(2); eq.setCapacidadPersonas(1);
        req.setEquiposEspecializados(List.of(eq));

        LaboratorioResponse r = laboratorioService.crear(req);
        assertEquals("LFULL", r.getCodigoLab());
        assertEquals(dir.getId(), r.getDirectorId());
        assertEquals(depId, r.getDepartamentoId(), "auto-vinculó el depto del responsable");
        // 2 mesas + 2 equipos = 4 recursos generados
        assertEquals(4, laboratorioService.listarRecursos(r.getId()).size());
    }

    @Test
    @DisplayName("crear: responsable inexistente en la lista → 404")
    void crear_responsableInexistente() {
        CreateLaboratorioRequest req = new CreateLaboratorioRequest();
        req.setCodigoLab("LRESP"); req.setNombre("X"); req.setPiso(1); req.setUbicacionFase("F1");
        req.setHoraApertura(LocalTime.of(8, 0)); req.setHoraCierre(LocalTime.of(18, 0));
        req.setAforoTipo("MESA"); req.setAforoCantidad(1); req.setAforoCapacidad(4);
        req.setResponsablesIds(List.of(9_999_999L));
        assertThrows(ResourceNotFoundException.class, () -> laboratorioService.crear(req));
    }
}

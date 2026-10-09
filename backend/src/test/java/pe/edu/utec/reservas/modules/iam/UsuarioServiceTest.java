package pe.edu.utec.reservas.modules.iam;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.utec.reservas.modules.iam.dto.CreateUsuarioRequest;
import pe.edu.utec.reservas.modules.iam.dto.UpdateUsuarioRequest;
import pe.edu.utec.reservas.modules.iam.dto.UsuarioResponse;
import pe.edu.utec.reservas.modules.iam.model.Role;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.iam.repository.RoleRepository;
import pe.edu.utec.reservas.modules.iam.repository.UsuarioRepository;
import pe.edu.utec.reservas.modules.iam.service.UsuarioService;
import pe.edu.utec.reservas.modules.laboratorios.model.Departamento;
import pe.edu.utec.reservas.modules.laboratorios.model.Laboratorio;
import pe.edu.utec.reservas.modules.laboratorios.repository.DepartamentoRepository;
import pe.edu.utec.reservas.modules.laboratorios.repository.LaboratorioRepository;
import pe.edu.utec.reservas.shared.exceptions.BusinessException;
import pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException;

import java.time.LocalTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class UsuarioServiceTest {

    @Autowired private UsuarioService usuarioService;
    @Autowired private UsuarioRepository usuarioRepository;
    @Autowired private RoleRepository roleRepository;
    @Autowired private LaboratorioRepository laboratorioRepository;
    @Autowired private DepartamentoRepository departamentoRepository;

    private Usuario responsable;
    private Usuario director;
    private Laboratorio lab;

    @BeforeEach
    void setUp() {
        Role rResp = roleRepository.findByNombre("RESPONSABLE_LAB").orElseThrow();
        Role rDir = roleRepository.findByNombre("DIRECTOR").orElseThrow();
        responsable = usuarioRepository.save(Usuario.builder()
                .correoUtec("us-test-resp@utec.edu.pe").nombres("Test").apellidos("Resp")
                .rol(rResp).activo(true).build());
        director = usuarioRepository.save(Usuario.builder()
                .correoUtec("us-test-dir@utec.edu.pe").nombres("Test").apellidos("Dir")
                .rol(rDir).activo(true).build());
        lab = laboratorioRepository.save(Laboratorio.builder()
                .codigoLab("LUST").nombre("Lab US").piso(1).ubicacionFase("F1")
                .horaApertura(LocalTime.of(8, 0)).horaCierre(LocalTime.of(18, 0))
                .aforoTipo("MESA").aforoCantidad(1).aforoCapacidad(4).estado("ACTIVO")
                .diasAtencion(List.of("Lunes")).build());
    }

    @Test
    @DisplayName("listarTodos / obtenerPorId / obtenerPorCorreo")
    void listarYObtener() {
        assertFalse(usuarioService.listarTodos().isEmpty());
        assertEquals("us-test-resp@utec.edu.pe", usuarioService.obtenerPorId(responsable.getId()).getCorreoUtec());
        assertEquals(responsable.getId(), usuarioService.obtenerPorCorreo("us-test-resp@utec.edu.pe").getId());
    }

    @Test
    @DisplayName("obtenerPorId inexistente lanza 404")
    void obtenerPorIdInexistente() {
        assertThrows(ResourceNotFoundException.class, () -> usuarioService.obtenerPorId(9_999_999L));
    }

    @Test
    @DisplayName("actualizar cambia nombres, cargo y rol")
    void actualizarCamposYRol() {
        UpdateUsuarioRequest req = new UpdateUsuarioRequest();
        req.setNombres("Nuevo");
        req.setCargo("Coordinador X");
        req.setRolId(roleRepository.findByNombre("ADMIN").orElseThrow().getId());
        UsuarioResponse r = usuarioService.actualizar(responsable.getId(), req);
        assertEquals("Nuevo", r.getNombres());
        assertEquals("Coordinador X", r.getCargo());
        assertEquals("ADMIN", r.getRol());
    }

    @Test
    @DisplayName("actualizar asigna y quita el departamento (0 = quitar)")
    void actualizarDepartamento() {
        Departamento dep = departamentoRepository.save(Departamento.builder().nombre("DPTO TEST").build());
        UpdateUsuarioRequest asignar = new UpdateUsuarioRequest();
        asignar.setDepartamentoId(dep.getId());
        assertEquals(dep.getId(), usuarioService.actualizar(responsable.getId(), asignar).getDepartamentoId());

        UpdateUsuarioRequest quitar = new UpdateUsuarioRequest();
        quitar.setDepartamentoId(0L);
        assertNull(usuarioService.actualizar(responsable.getId(), quitar).getDepartamentoId());
    }

    @Test
    @DisplayName("desactivar pone activo=false")
    void desactivar() {
        assertFalse(usuarioService.desactivar(responsable.getId()).getActivo());
    }

    @Test
    @DisplayName("listarPorRol incluye al responsable creado")
    void listarPorRol() {
        assertTrue(usuarioService.listarPorRol("RESPONSABLE_LAB").stream()
                .anyMatch(u -> u.getId().equals(responsable.getId())));
    }

    @Test
    @DisplayName("asignar y quitar laboratorio al responsable")
    void asignarYQuitarLaboratorio() {
        usuarioService.asignarLaboratorio(responsable.getId(), lab.getId());
        UsuarioResponse conLab = usuarioService.obtenerPorId(responsable.getId());
        assertNotNull(conLab.getLaboratoriosAsignados());
        assertTrue(conLab.getLaboratoriosAsignados().stream().anyMatch(s -> s.contains("LUST")));

        usuarioService.quitarLaboratorio(responsable.getId(), lab.getId());
        UsuarioResponse sinLab = usuarioService.obtenerPorId(responsable.getId());
        assertTrue(sinLab.getLaboratoriosAsignados() == null || sinLab.getLaboratoriosAsignados().isEmpty());
    }

    @Test
    @DisplayName("asignar/quitar responsable a director y listarPorDirector")
    void responsableADirector() {
        usuarioService.asignarResponsableADirector(director.getId(), responsable.getId());
        assertTrue(usuarioService.listarPorDirector(director.getId()).stream()
                .anyMatch(u -> u.getId().equals(responsable.getId())));

        usuarioService.quitarResponsableDeDirector(director.getId(), responsable.getId());
        assertTrue(usuarioService.listarPorDirector(director.getId()).isEmpty());
    }

    @Test
    @DisplayName("directorDe devuelve el director de un responsable (cascada inversa)")
    void directorDe() {
        assertNull(usuarioService.directorDe(responsable.getId()));   // sin vínculo aún
        usuarioService.asignarResponsableADirector(director.getId(), responsable.getId());
        assertEquals(director.getId(), usuarioService.directorDe(responsable.getId()).getId());
    }

    @Test
    @DisplayName("asignar y quitar lab como director no falla")
    void labComoDirector() {
        assertDoesNotThrow(() -> usuarioService.asignarLabComoDirector(director.getId(), lab.getId()));
        assertDoesNotThrow(() -> usuarioService.quitarLabComoDirector(director.getId(), lab.getId()));
    }

    @Test
    @DisplayName("eliminar borra el usuario")
    void eliminar() {
        Long id = responsable.getId();
        usuarioService.eliminar(id);
        assertThrows(ResourceNotFoundException.class, () -> usuarioService.obtenerPorId(id));
    }

    private CreateUsuarioRequest crearReq(String correo) {
        CreateUsuarioRequest r = new CreateUsuarioRequest();
        r.setNombres("Nuevo");
        r.setApellidos("Usuario");
        r.setCorreoUtec(correo);
        r.setRol("ESTUDIANTE");
        return r;
    }

    @Test
    @DisplayName("crear da de alta un usuario @utec")
    void crear_exito() {
        UsuarioResponse u = usuarioService.crear(crearReq("alta-test@utec.edu.pe"));
        assertNotNull(u.getId());
        assertEquals("alta-test@utec.edu.pe", u.getCorreoUtec());
        assertTrue(usuarioRepository.findByCorreoUtec("alta-test@utec.edu.pe").isPresent());
    }

    @Test
    @DisplayName("crear rechaza correo fuera de @utec.edu.pe")
    void crear_correoInvalido_falla() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> usuarioService.crear(crearReq("alguien@gmail.com")));
        assertTrue(ex.getMessage().contains("@utec.edu.pe"));
    }

    @Test
    @DisplayName("crear rechaza correo duplicado")
    void crear_duplicado_falla() {
        usuarioService.crear(crearReq("dup-test@utec.edu.pe"));
        BusinessException ex = assertThrows(BusinessException.class,
                () -> usuarioService.crear(crearReq("dup-test@utec.edu.pe")));
        assertTrue(ex.getMessage().contains("Ya existe"));
    }

    @Test
    @DisplayName("obtenerPorCorreo inexistente → 404")
    void obtenerPorCorreo_noEncontrado() {
        assertThrows(ResourceNotFoundException.class,
                () -> usuarioService.obtenerPorCorreo("nadie@utec.edu.pe"));
    }

    @Test
    @DisplayName("crear: nombres/apellidos en blanco → VALIDATION")
    void crear_nombresEnBlanco_falla() {
        CreateUsuarioRequest req = crearReq("blank-test@utec.edu.pe");
        req.setNombres("  ");
        BusinessException ex = assertThrows(BusinessException.class, () -> usuarioService.crear(req));
        assertEquals("VALIDATION", ex.getErrorCode());
    }

    @Test
    @DisplayName("crear: rol inexistente → 404")
    void crear_rolInexistente_falla() {
        CreateUsuarioRequest req = crearReq("rol-test@utec.edu.pe");
        req.setRol("ROL_QUE_NO_EXISTE");
        assertThrows(ResourceNotFoundException.class, () -> usuarioService.crear(req));
    }

    @Test
    @DisplayName("actualizar: usuario inexistente → 404")
    void actualizar_noEncontrado() {
        assertThrows(ResourceNotFoundException.class,
                () -> usuarioService.actualizar(9_999_999L, new UpdateUsuarioRequest()));
    }

    @Test
    @DisplayName("actualizar: apellidos + activo + rol por nombre")
    void actualizar_apellidosActivoRolPorNombre() {
        UpdateUsuarioRequest req = new UpdateUsuarioRequest();
        req.setApellidos("Apellido Nuevo");
        req.setActivo(false);
        req.setRol("COORDINADOR");
        UsuarioResponse r = usuarioService.actualizar(responsable.getId(), req);
        assertEquals("Apellido Nuevo", r.getApellidos());
        assertFalse(r.getActivo());
        assertEquals("COORDINADOR", r.getRol());
    }

    @Test
    @DisplayName("desactivar: usuario inexistente → 404")
    void desactivar_noEncontrado() {
        assertThrows(ResourceNotFoundException.class, () -> usuarioService.desactivar(9_999_999L));
    }

    @Test
    @DisplayName("toResponse del DIRECTOR incluye los labs que dirige")
    void toResponse_director_conLabs() {
        usuarioService.asignarLabComoDirector(director.getId(), lab.getId());
        UsuarioResponse r = usuarioService.obtenerPorId(director.getId());
        assertNotNull(r.getLaboratoriosAsignados());
        assertTrue(r.getLaboratoriosAsignados().stream().anyMatch(s -> s.contains("LUST")));
    }

    @Test
    @DisplayName("listarAdministrativos: ADMIN ve todos (sin ESTUDIANTE); COORDINADOR solo director/responsable; DOCENCIA solo docencia")
    void listarAdministrativos_alcancePorRol() {
        Role rCoord = roleRepository.findByNombre("COORDINADOR").orElseThrow();
        Role rDoc = roleRepository.findByNombre("DOCENCIA").orElseThrow();
        Usuario coord = usuarioRepository.save(Usuario.builder()
                .correoUtec("us-test-coord@utec.edu.pe").nombres("Test").apellidos("Coord")
                .rol(rCoord).activo(true).build());
        Usuario counter = usuarioRepository.save(Usuario.builder()
                .correoUtec("us-test-docencia@utec.edu.pe").nombres("Test").apellidos("Docencia")
                .rol(rDoc).activo(true).build());

        // ADMIN → todos los administrativos (nunca alumnos).
        var deAdmin = usuarioService.listarAdministrativos("conceptlab@utec.edu.pe");
        assertNotNull(deAdmin);
        assertTrue(deAdmin.stream().noneMatch(u -> "ESTUDIANTE".equals(u.getRol())));
        assertTrue(deAdmin.stream().anyMatch(u -> "DOCENCIA".equals(u.getRol())));

        // COORDINADOR → SOLO directores y responsables de lab.
        var deCoord = usuarioService.listarAdministrativos(coord.getCorreoUtec());
        assertFalse(deCoord.isEmpty());
        assertTrue(deCoord.stream().allMatch(u ->
                "DIRECTOR".equals(u.getRol()) || "RESPONSABLE_LAB".equals(u.getRol())));

        // DOCENCIA → SOLO los de docencia y sus DOCENTES (el counter gestiona lo académico).
        var deDocencia = usuarioService.listarAdministrativos(counter.getCorreoUtec());
        assertFalse(deDocencia.isEmpty());
        assertTrue(deDocencia.stream().allMatch(u ->
                "DOCENCIA".equals(u.getRol()) || "DOCENTE".equals(u.getRol())));
    }

    @Test
    @DisplayName("buscar paginado filtra por rol y respeta el tamaño de página")
    void buscar_paginado() {
        var pg = usuarioService.buscar(null, "ESTUDIANTE", null, 0, 10);
        assertNotNull(pg);
        assertTrue(pg.getSize() <= 10);
        assertTrue(pg.getContent().size() <= 10);
        assertTrue(pg.getTotal() >= pg.getContent().size());
        assertTrue(pg.getContent().stream().allMatch(u -> "ESTUDIANTE".equals(u.getRol())));
    }

    @Test
    @DisplayName("buscar por texto encuentra por correo o nombre")
    void buscar_porTexto() {
        var pg = usuarioService.buscar("utec.edu.pe", null, null, 0, 5);
        assertNotNull(pg);
        assertTrue(pg.getContent().stream().allMatch(u -> u.getCorreoUtec().contains("utec.edu.pe")));
    }

    @Test
    @DisplayName("conteoPorRol devuelve cantidades por rol")
    void conteoPorRol_ok() {
        var m = usuarioService.conteoPorRol();
        assertNotNull(m);
        assertTrue(m.values().stream().allMatch(v -> v >= 0));
    }
}

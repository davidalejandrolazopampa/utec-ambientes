package pe.edu.utec.reservas.modules.aulas;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.utec.reservas.modules.aulas.dto.AulaResponse;
import pe.edu.utec.reservas.modules.aulas.dto.ClaseResponse;
import pe.edu.utec.reservas.modules.aulas.dto.OcupacionAulaResponse;
import pe.edu.utec.reservas.modules.aulas.model.Aula;
import pe.edu.utec.reservas.modules.aulas.model.Curso;
import pe.edu.utec.reservas.modules.aulas.repository.AulaRepository;
import pe.edu.utec.reservas.modules.aulas.repository.CursoRepository;
import pe.edu.utec.reservas.modules.aulas.service.AulaService;
import pe.edu.utec.reservas.modules.bloqueos.model.Bloqueo;
import pe.edu.utec.reservas.modules.bloqueos.repository.BloqueoRepository;
import pe.edu.utec.reservas.modules.iam.model.Role;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.iam.repository.RoleRepository;
import pe.edu.utec.reservas.modules.iam.repository.UsuarioRepository;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class AulaServiceTest {

    @Autowired private AulaService aulaService;
    @Autowired private AulaRepository aulaRepository;
    @Autowired private CursoRepository cursoRepository;
    @Autowired private BloqueoRepository bloqueoRepository;
    @Autowired private UsuarioRepository usuarioRepository;
    @Autowired private RoleRepository roleRepository;
    @Autowired private pe.edu.utec.reservas.modules.aulas.repository.CicloExcepcionRepository cicloExcepcionRepository;
    @Autowired private pe.edu.utec.reservas.modules.laboratorios.repository.LaboratorioRepository laboratorioRepository;
    @Autowired private pe.edu.utec.reservas.modules.laboratorios.repository.RecursoLabRepository recursoLabRepository;
    @Autowired private pe.edu.utec.reservas.modules.reservas.repository.ReservaRepository reservaRepository;

    private static final String CICLO = "2026-9"; // ciclo de prueba, no choca con la data cargada
    private Aula aulaOcupada;
    private Aula aulaLibre;

    @BeforeEach
    void setUp() {
        Role admin = roleRepository.findByNombre("ADMIN").orElseThrow();
        Usuario u = usuarioRepository.save(Usuario.builder()
                .correoUtec("aula-svc-test@utec.edu.pe").nombres("A").apellidos("B").rol(admin).activo(true).build());

        aulaOcupada = aulaRepository.save(Aula.builder().codigo("AX100").nombre("AX100").tipo("AULA").capacidad(30).piso(1).activo(true).build());
        aulaLibre = aulaRepository.save(Aula.builder().codigo("MX200").nombre("MX200").tipo("AULA_MIXTA").capacidad(45).piso(2).activo(true).build());

        Curso curso = cursoRepository.save(Curso.builder().codCurso("ZZ100").nombre("Curso Prueba").area("ZZ").build());

        // Clase LUNES 09:00-11:00 en AX100.
        bloqueoRepository.save(Bloqueo.builder()
                .aula(aulaOcupada).tipo("TOTAL").motivo("CLASE").descripcion("ZZ100 - Curso Prueba")
                .esClase(true).diaSemana("LUNES").ciclo(CICLO).curso(curso).tipoSesion("TEORICO")
                .fechaInicio(LocalDate.of(2026, 3, 1)).fechaFin(LocalDate.of(2026, 7, 31))
                .horaInicio(LocalTime.of(9, 0)).horaFin(LocalTime.of(11, 0))
                .activo(true).creadoPor(u).build());
    }

    @Test
    @DisplayName("Áreas con clases y calendario por área/aula")
    void areasYClases() {
        assertTrue(aulaService.areasConClases(CICLO).contains("ZZ"));

        // Por aula
        List<ClaseResponse> porAula = aulaService.buscarClases(CICLO, aulaOcupada.getId(), null, null, null);
        assertEquals(1, porAula.size());
        assertEquals("AX100", porAula.get(0).getEspacioCodigo());
        assertEquals("LUNES", porAula.get(0).getDiaSemana());

        // Por área
        assertEquals(1, aulaService.buscarClases(CICLO, null, null, "ZZ", null).size());
        // Sin filtro → vacío (no vuelca el ciclo)
        assertTrue(aulaService.buscarClases(CICLO, null, null, null, null).isEmpty());
    }

    @Test
    @DisplayName("Buscar libres: excluye el aula con clase en la franja, incluye la libre")
    void buscarLibres() {
        // LUNES 09-11 → AX100 ocupada, MX200 libre.
        List<String> libres = aulaService.buscarLibres(CICLO, "LUNES", LocalTime.of(9, 0), LocalTime.of(11, 0), null, null)
                .stream().map(AulaResponse::getCodigo).toList();
        assertTrue(libres.contains("MX200"));
        assertFalse(libres.contains("AX100"));

        // LUNES 12-13 → ambas libres.
        List<String> libres2 = aulaService.buscarLibres(CICLO, "LUNES", LocalTime.of(12, 0), LocalTime.of(13, 0), null, null)
                .stream().map(AulaResponse::getCodigo).toList();
        assertTrue(libres2.contains("AX100") && libres2.contains("MX200"));

        // Filtro por capacidad mínima 40 → solo MX200 (cap 45).
        List<String> grandes = aulaService.buscarLibres(CICLO, "LUNES", LocalTime.of(12, 0), LocalTime.of(13, 0), null, 40)
                .stream().map(AulaResponse::getCodigo).toList();
        assertTrue(grandes.contains("MX200"));
        assertFalse(grandes.contains("AX100"));
    }

    @Test
    @DisplayName("CRUD de aula: crear (valida tipo/único), editar y desactivar (soft)")
    void crudAula() {
        var req = new pe.edu.utec.reservas.modules.aulas.dto.CreateAulaRequest();
        req.setCodigo("nueva1"); req.setTipo("AUDITORIO"); req.setCapacidad(120);
        var creada = aulaService.crear(req);
        assertEquals("NUEVA1", creada.getCodigo());          // se normaliza a mayúsculas
        assertEquals("AUDITORIO", creada.getTipo());
        assertTrue(creada.getActivo());

        // Código duplicado → error
        assertThrows(pe.edu.utec.reservas.shared.exceptions.BusinessException.class, () -> aulaService.crear(req));
        // Tipo inválido → error
        var mala = new pe.edu.utec.reservas.modules.aulas.dto.CreateAulaRequest();
        mala.setCodigo("XZ1"); mala.setTipo("INVENTADO");
        assertThrows(pe.edu.utec.reservas.shared.exceptions.BusinessException.class, () -> aulaService.crear(mala));

        // Editar
        var edit = new pe.edu.utec.reservas.modules.aulas.dto.CreateAulaRequest();
        edit.setCodigo("NUEVA1"); edit.setTipo("AULA_MAGNA"); edit.setCapacidad(300);
        var editada = aulaService.actualizar(creada.getId(), edit);
        assertEquals("AULA_MAGNA", editada.getTipo());
        assertEquals(300, editada.getCapacidad());

        // Desactivar (soft)
        aulaService.desactivar(creada.getId());
        assertFalse(aulaRepository.findById(creada.getId()).orElseThrow().getActivo());
    }

    @Test
    @DisplayName("Grilla de ocupación del día marca la franja del aula ocupada")
    void ocupacionDia() {
        List<OcupacionAulaResponse> grilla = aulaService.ocupacionDia(CICLO, "LUNES", null);
        var ax = grilla.stream().filter(o -> o.getCodigo().equals("AX100")).findFirst().orElseThrow();
        assertEquals(1, ax.getOcupado().size());
        assertEquals(LocalTime.of(9, 0), ax.getOcupado().get(0).getHoraInicio());
        var mx = grilla.stream().filter(o -> o.getCodigo().equals("MX200")).findFirst().orElseThrow();
        assertTrue(mx.getOcupado().isEmpty());
        // Las aulas no llevan ventana de atención (solo los labs).
        assertNull(ax.getAtencionInicio());
        assertNull(ax.getAtiende());
        // Los LABS traen su ventana de atención (fuera de ella el alumno no reserva) y si
        // atienden ese día de la semana (diasAtencion normalizado: "Miércoles" ≡ MIERCOLES).
        var labFila = grilla.stream().filter(o -> Boolean.TRUE.equals(o.getEsLab())).findFirst().orElseThrow();
        assertNotNull(labFila.getAtencionInicio());
        assertNotNull(labFila.getAtencionFin());
        assertNotNull(labFila.getAtiende());
    }

    @Test
    @DisplayName("Listados y consultas de cursos/clases del calendario")
    void listadosYCursos() {
        // listarTodas (activas + inactivas) y listar por tipo
        assertFalse(aulaService.listarTodas().isEmpty());
        assertTrue(aulaService.listar("AULA").stream().anyMatch(a -> a.getCodigo().equals("AX100")));
        assertTrue(aulaService.listar("AULA_MIXTA").stream().anyMatch(a -> a.getCodigo().equals("MX200")));

        // cursos del ciclo (sin filtro, por área y por texto)
        assertFalse(aulaService.buscarCursos(CICLO, null, null).isEmpty());
        var cursos = aulaService.buscarCursos(CICLO, "ZZ", "curso");
        assertFalse(cursos.isEmpty());

        // clases de un curso concreto
        assertFalse(aulaService.clasesDeCurso(CICLO, cursos.get(0).getId()).isEmpty());

        // buscarClases: por aula, y por área + texto
        List<ClaseResponse> porAula = aulaService.buscarClases(CICLO, aulaOcupada.getId(), null, null, null);
        assertFalse(porAula.isEmpty());
        assertNotNull(aulaService.buscarClases(CICLO, null, null, "ZZ", "curso"));

        // labs con ocupación (no falla aunque el ciclo de prueba no tenga labs con clase)
        assertNotNull(aulaService.laboratoriosConOcupacion(CICLO));
    }

    @Test
    @DisplayName("Editar/desactivar un aula inexistente lanza ResourceNotFound; libres filtra por capacidad")
    void erroresYFiltros() {
        var req = new pe.edu.utec.reservas.modules.aulas.dto.CreateAulaRequest();
        req.setCodigo("ZZZ9"); req.setTipo("AULA"); req.setCapacidad(10); req.setPiso(1);
        assertThrows(pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException.class,
                () -> aulaService.actualizar(9_999_999L, req));
        assertThrows(pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException.class,
                () -> aulaService.desactivar(9_999_999L));

        // buscarLibres con filtro de tipo y capacidad mínima (MX200 tiene cap 45)
        var libresCap = aulaService.buscarLibres(CICLO, "LUNES", LocalTime.of(9, 0), LocalTime.of(11, 0), "AULA_MIXTA", 40);
        assertTrue(libresCap.stream().anyMatch(a -> a.getCodigo().equals("MX200")));
        // capacidad mínima alta descarta todas
        assertTrue(aulaService.buscarLibres(CICLO, "LUNES", LocalTime.of(9, 0), LocalTime.of(11, 0), null, 999).isEmpty());
    }

    @Test
    @DisplayName("Búsqueda CONSCIENTE DE FECHA: eventos de aula ocupan; en día de excepción la clase no cuenta")
    void libresConFecha() {
        Role admin = roleRepository.findByNombre("ADMIN").orElseThrow();
        Usuario gestor = usuarioRepository.save(Usuario.builder()
                .correoUtec("aula-fecha-test@utec.edu.pe").nombres("G").apellidos("F").rol(admin).activo(true).build());
        LocalDate lunesNormal = LocalDate.of(2026, 4, 6);   // lunes dentro del ciclo
        LocalDate lunesExamen = LocalDate.of(2026, 4, 13);  // lunes marcado como excepción

        // Evento de administrativo sobre MX200 el lunesNormal 09–11.
        bloqueoRepository.save(Bloqueo.builder()
                .aula(aulaLibre).tipo("TOTAL").motivo("EVENTO").descripcion("Charla de bienvenida")
                .fechaInicio(lunesNormal).fechaFin(lunesNormal)
                .horaInicio(LocalTime.of(9, 0)).horaFin(LocalTime.of(11, 0))
                .activo(true).esClase(false).creadoPor(gestor).build());
        // Excepción (exámenes) el lunesExamen para el ciclo de prueba.
        cicloExcepcionRepository.save(pe.edu.utec.reservas.modules.aulas.model.CicloExcepcion.builder()
                .ciclo(CICLO).fechaInicio(lunesExamen).fechaFin(lunesExamen).tipo("EXAMEN").descripcion("Parciales").build());

        // (1) lunesNormal 09–11: AX100 ocupada por su clase Y MX200 ocupada por el EVENTO.
        var libres1 = aulaService.buscarLibres(CICLO, "LUNES", LocalTime.of(9, 0), LocalTime.of(11, 0), null, null, lunesNormal);
        assertFalse(libres1.stream().anyMatch(a -> a.getCodigo().equals("AX100")));
        assertFalse(libres1.stream().anyMatch(a -> a.getCodigo().equals("MX200")));

        // (2) lunesExamen 09–11: la clase NO se dicta (excepción) → AX100 queda libre.
        var libres2 = aulaService.buscarLibres(CICLO, "LUNES", LocalTime.of(9, 0), LocalTime.of(11, 0), null, null, lunesExamen);
        assertTrue(libres2.stream().anyMatch(a -> a.getCodigo().equals("AX100")));

        // (2b) FUERA del rango de clases (lunes posterior al fin del ciclo): la clase tampoco se
        // dicta → AX100 libre y su fila de la grilla SIN franjas (no clases "fantasma").
        LocalDate lunesPostCiclo = LocalDate.of(2026, 8, 3);
        var libresPost = aulaService.buscarLibres(CICLO, "LUNES", LocalTime.of(9, 0), LocalTime.of(11, 0), null, null, lunesPostCiclo);
        assertTrue(libresPost.stream().anyMatch(a -> a.getCodigo().equals("AX100")));
        var grillaPost = aulaService.ocupacionDia(CICLO, "LUNES", "AULA", lunesPostCiclo);
        assertTrue(grillaPost.stream().filter(o -> o.getCodigo().equals("AX100")).findFirst().orElseThrow().getOcupado().isEmpty());

        // (3) La grilla de ocupación con fecha incluye el evento del administrativo en MX200.
        var grilla = aulaService.ocupacionDia(CICLO, "LUNES", null, lunesNormal);
        var mx = grilla.stream().filter(o -> o.getCodigo().equals("MX200")).findFirst().orElseThrow();
        assertTrue(mx.getOcupado().stream().anyMatch(f -> "Charla de bienvenida".equals(f.getEtiqueta())));
        // Y en el día de excepción, AX100 no muestra su clase.
        var grillaExamen = aulaService.ocupacionDia(CICLO, "LUNES", null, lunesExamen);
        var ax = grillaExamen.stream().filter(o -> o.getCodigo().equals("AX100")).findFirst().orElseThrow();
        assertTrue(ax.getOcupado().isEmpty());
    }

    @Test
    @DisplayName("Los LABORATORIOS aparecen en Buscar libres: TOTAL excluye; PARCIAL y reservas de mesa = ocupación parcial")
    void labsEnBuscarLibres() {
        Role admin = roleRepository.findByNombre("ADMIN").orElseThrow();
        Usuario gestor = usuarioRepository.save(Usuario.builder()
                .correoUtec("lab-libres-test@utec.edu.pe").nombres("L").apellidos("T").rol(admin).activo(true).build());
        LocalDate lunes = LocalDate.of(2026, 4, 6);

        var lab = laboratorioRepository.save(pe.edu.utec.reservas.modules.laboratorios.model.Laboratorio.builder()
                .codigoLab("LLIB").nombre("Lab Libres").piso(1).ubicacionFase("Fase 1")
                .horaApertura(LocalTime.of(8, 0)).horaCierre(LocalTime.of(18, 0))
                .aforoTipo("MESA").aforoCantidad(2).aforoCapacidad(4).estado("ACTIVO")
                .diasAtencion(java.util.List.of("Lunes", "Martes", "Miércoles", "Jueves", "Viernes")).build());
        var mesa = recursoLabRepository.save(pe.edu.utec.reservas.modules.laboratorios.model.RecursoLab.builder()
                .laboratorio(lab).tipo("MESA").nombre("MESA 1").numero(1).qrCode("LLIB-M1")
                .estado("DISPONIBLE").capacidadPersonas(4).activo(true).build());

        // Bloqueo PARCIAL 09–11 + reserva de mesa 14–16 → el lab SIGUE libre (tiene mesas).
        bloqueoRepository.save(Bloqueo.builder()
                .laboratorio(lab).tipo("PARCIAL").motivo("MANTENIMIENTO").descripcion("Mesa en revisión")
                .fechaInicio(lunes).fechaFin(lunes)
                .horaInicio(LocalTime.of(9, 0)).horaFin(LocalTime.of(11, 0))
                .activo(true).esClase(false).creadoPor(gestor).build());
        reservaRepository.save(pe.edu.utec.reservas.modules.reservas.model.Reserva.builder()
                .recurso(mesa).usuario(gestor).fecha(lunes)
                .horaInicio(LocalTime.of(14, 0)).horaFin(LocalTime.of(16, 0))
                .estado("CONFIRMADA").tipoReserva("ALUMNO").participantes(1).creadoPor(gestor).build());

        var libres = aulaService.buscarLibres(CICLO, "LUNES", LocalTime.of(9, 0), LocalTime.of(11, 0), null, null, lunes);
        assertTrue(libres.stream().anyMatch(a -> a.getCodigo().equals("LLIB") && Boolean.TRUE.equals(a.getEsLab())));

        // Con bloqueo TOTAL encima, el lab deja de estar libre en esa franja.
        bloqueoRepository.save(Bloqueo.builder()
                .laboratorio(lab).tipo("TOTAL").motivo("EVENTO").descripcion("Demo Day")
                .fechaInicio(lunes).fechaFin(lunes)
                .horaInicio(LocalTime.of(10, 0)).horaFin(LocalTime.of(12, 0))
                .activo(true).esClase(false).creadoPor(gestor).build());
        var libres2 = aulaService.buscarLibres(CICLO, "LUNES", LocalTime.of(10, 0), LocalTime.of(12, 0), null, null, lunes);
        assertFalse(libres2.stream().anyMatch(a -> a.getCodigo().equals("LLIB")));

        // La grilla muestra el lab con sus 3 tipos de franja: parcial (bloqueo), parcial (reserva) y total.
        var grilla = aulaService.ocupacionDia(CICLO, "LUNES", "LABORATORIO", lunes);
        var fila = grilla.stream().filter(o -> o.getCodigo().equals("LLIB")).findFirst().orElseThrow();
        assertTrue(Boolean.TRUE.equals(fila.getEsLab()));
        assertTrue(fila.getOcupado().stream().anyMatch(f -> "Mesa en revisión".equals(f.getEtiqueta()) && Boolean.TRUE.equals(f.getParcial())));
        assertTrue(fila.getOcupado().stream().anyMatch(f -> f.getEtiqueta().startsWith("Reserva ·") && Boolean.TRUE.equals(f.getParcial())));
        assertTrue(fila.getOcupado().stream().anyMatch(f -> "Demo Day".equals(f.getEtiqueta()) && !Boolean.TRUE.equals(f.getParcial())));
    }
}

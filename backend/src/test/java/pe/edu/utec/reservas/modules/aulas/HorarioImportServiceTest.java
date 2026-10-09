package pe.edu.utec.reservas.modules.aulas;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.utec.reservas.modules.aulas.dto.ImportHorariosResponse;
import pe.edu.utec.reservas.modules.aulas.repository.AulaRepository;
import pe.edu.utec.reservas.modules.aulas.service.HorarioImportService;
import pe.edu.utec.reservas.modules.bloqueos.model.Bloqueo;
import pe.edu.utec.reservas.modules.bloqueos.repository.BloqueoRepository;
import pe.edu.utec.reservas.modules.iam.model.Role;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.iam.repository.RoleRepository;
import pe.edu.utec.reservas.modules.iam.repository.UsuarioRepository;
import pe.edu.utec.reservas.modules.laboratorios.model.Laboratorio;
import pe.edu.utec.reservas.modules.laboratorios.repository.LaboratorioRepository;

import java.nio.charset.StandardCharsets;
import java.time.LocalTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class HorarioImportServiceTest {

    @Autowired private HorarioImportService importService;
    @Autowired private AulaRepository aulaRepository;
    @Autowired private BloqueoRepository bloqueoRepository;
    @Autowired private LaboratorioRepository laboratorioRepository;
    @Autowired private UsuarioRepository usuarioRepository;
    @Autowired private RoleRepository roleRepository;

    private Usuario docencia;
    private Laboratorio lab;

    @BeforeEach
    void setUp() {
        Role admin = roleRepository.findByNombre("ADMIN").orElseThrow();
        docencia = usuarioRepository.save(Usuario.builder()
                .correoUtec("docencia-test@utec.edu.pe").nombres("Doc").apellidos("Encia")
                .rol(admin).activo(true).build());
        lab = laboratorioRepository.save(Laboratorio.builder()
                .codigoLab("L999").nombre("Lab Horario").piso(9).ubicacionFase("Fase 1")
                .horaApertura(LocalTime.of(7, 0)).horaCierre(LocalTime.of(23, 0))
                .aforoTipo("MESA").aforoCantidad(2).aforoCapacidad(4).estado("ACTIVO")
                .diasAtencion(List.of("Lunes", "Martes", "Miércoles", "Jueves", "Viernes")).build());
    }

    private MockMultipartFile csv(String contenido) {
        return new MockMultipartFile("archivo", "horario.csv", "text/csv",
                contenido.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    @DisplayName("Importa horarios: crea aulas/cursos, enlaza labs, descarta virtual/ficticio y omite solapes")
    void importaHorarios() {
        String c = "Periodo;Cod_Curso;Curso;Seccion;Sesion;Cod_Aula;Capacidad_Aula;Modalidad;Dia_Semana;Hora_Inicio;Hora_Fin;Docente;Email_Institucional\n"
                + "2026 - 1;CS101;Algoritmos;Sección 1;Teórico 1;A501;30;PRESENCIAL;MARTES;09:00;11:00;Juan Perez;jperez@utec.edu.pe\n"
                + "2026 - 1;CS101;Algoritmos;Sección 2;Teórico 1;A501;30;PRESENCIAL;MARTES;10:00;12:00;Ana Diaz;adiaz@utec.edu.pe\n"     // solapa a la anterior en A501/MARTES
                + "2026 - 1;CS102;Redes;Sección 1;Laboratorio 1;L999;;PRESENCIAL;MIERCOLES;14:00;17:00;Luis Gomez;lgomez@utec.edu.pe\n"  // en un LAB existente
                + "2026 - 1;CS103;IA;Sección 1;Teórico 1;VIRTUAL;500;;SABADO;15:00;17:00;Roy;roy@utec.edu.pe\n"                          // virtual → descartada
                + "2026 - 1;CS104;X;Sección 1;Teórico 1;FICTICIO;;;LUNES;08:00;09:00;Foo;foo@utec.edu.pe\n"                            // ficticio → descartada
                + "2026 - 1;RESV01;Reunión general;Sección 3;Teórico 1;A501;30;PRESENCIAL;JUEVES;07:00;07:15;X;x@utec.edu.pe\n";        // reserva del ambiente → descartada

        ImportHorariosResponse r = importService.importar(csv(c), docencia.getCorreoUtec());

        assertEquals("2026-1", r.getCiclo());
        assertEquals(6, r.getFilasLeidas());
        assertEquals(1, r.getVirtualesDescartadas());
        assertEquals(1, r.getFicticiasDescartadas());
        assertEquals(1, r.getReservasDescartadas());   // RESV01 no es clase
        assertEquals(1, r.getAulasCreadas());     // A501 (L999 es lab, no aula)
        assertEquals(2, r.getClasesCreadas());     // A501 + L999
        assertEquals(1, r.getClasesOmitidas());    // el solape en A501/MARTES
        assertEquals(0, r.getErrores());

        // El aula A501 se creó con tipo AULA y capacidad 30.
        var a501 = aulaRepository.findByCodigo("A501").orElseThrow();
        assertEquals("AULA", a501.getTipo());
        assertEquals(30, a501.getCapacidad());

        // Los DOCENTES de las filas importadas se dan de alta con rol DOCENTE (solo-consulta).
        // Las filas descartadas (virtual/ficticio/RESV) no registran; las SOLAPADAS sí — el
        // docente es real aunque su franja choque.
        assertEquals(3, r.getDocentesCreados());   // jperez + adiaz (solapada) + lgomez
        var docente = usuarioRepository.findByCorreoUtec("jperez@utec.edu.pe").orElseThrow();
        assertEquals("DOCENTE", docente.getRol().getNombre());
        assertTrue(docente.getActivo());

        // La clase del lab quedó enlazada al laboratorio (no a un aula), recurrente MIERCOLES.
        List<Bloqueo> clasesLab = bloqueoRepository.findClasesByLaboratorio(lab.getId(), "2026-1");
        assertEquals(1, clasesLab.size());
        Bloqueo clase = clasesLab.get(0);
        assertTrue(clase.getEsClase());
        assertEquals("CLASE", clase.getMotivo());
        assertEquals("MIERCOLES", clase.getDiaSemana());
        assertNull(clase.getAula());
        assertEquals(LocalTime.of(14, 0), clase.getHoraInicio());
    }

    @Test
    @DisplayName("Re-importar NO duplica; un archivo parcial agrega solo lo nuevo; sincronizar elimina lo retirado")
    void reimportar_dedupe_y_sincronizar() {
        String cab = "Periodo;Cod_Curso;Curso;Seccion;Cod_Aula;Dia_Semana;Hora_Inicio;Hora_Fin;Docente;Email_Institucional\n";
        String f1 = "2026 - 1;CS201;Compiladores;Sección 1;A601;LUNES;09:00;11:00;Juan Perez;jperez@utec.edu.pe\n";
        String f2 = "2026 - 1;CS202;SO;Sección 1;A601;MARTES;09:00;11:00;Ana Diaz;adiaz@utec.edu.pe\n";
        String f3 = "2026 - 1;CS203;BD;Sección 1;A601;JUEVES;09:00;11:00;Luis Gomez;lgomez@utec.edu.pe\n";

        // 1) Import inicial: 2 clases.
        var r1 = importService.importar(csv(cab + f1 + f2), docencia.getCorreoUtec());
        assertEquals(2, r1.getClasesCreadas());

        // 2) Re-subir el MISMO archivo → nada se duplica (las 2 ya existían).
        var r2 = importService.importar(csv(cab + f1 + f2), docencia.getCorreoUtec());
        assertEquals(0, r2.getClasesCreadas());
        assertEquals(2, r2.getClasesExistentes());
        assertEquals(0, r2.getClasesEliminadas());
        long enA601 = bloqueoRepository.findClasesByCiclo("2026-1").stream()
                .filter(b -> b.getAula() != null && "A601".equals(b.getAula().getCodigo())).count();
        assertEquals(2, enA601);

        // 3) Archivo PARCIAL con solo un curso nuevo → agrega SOLO ese (sin tocar el resto).
        var r3 = importService.importar(csv(cab + f3), docencia.getCorreoUtec());
        assertEquals(1, r3.getClasesCreadas());
        assertEquals(0, r3.getClasesEliminadas());
        enA601 = bloqueoRepository.findClasesByCiclo("2026-1").stream()
                .filter(b -> b.getAula() != null && "A601".equals(b.getAula().getCodigo())).count();
        assertEquals(3, enA601);

        // 4) SINCRONIZAR con un archivo que ya no trae CS202 → la elimina; el resto se conserva.
        var r4 = importService.importar(csv(cab + f1 + f3), docencia.getCorreoUtec(), true);
        assertEquals(0, r4.getClasesCreadas());
        assertEquals(2, r4.getClasesExistentes());
        assertEquals(1, r4.getClasesEliminadas());
        var restantes = bloqueoRepository.findClasesByCiclo("2026-1").stream()
                .filter(b -> b.getAula() != null && "A601".equals(b.getAula().getCodigo())).toList();
        assertEquals(2, restantes.size());
        assertTrue(restantes.stream().noneMatch(b -> b.getDescripcion().contains("CS202")));

        // 5) El refresco en sitio: si cambia el docente de una clase existente, se actualiza sin duplicar.
        String f1v2 = "2026 - 1;CS201;Compiladores;Sección 1;A601;LUNES;09:00;11:00;Maria Nueva;mnueva@utec.edu.pe\n";
        var r5 = importService.importar(csv(cab + f1v2), docencia.getCorreoUtec());
        assertEquals(0, r5.getClasesCreadas());
        assertEquals(1, r5.getClasesExistentes());
        assertTrue(bloqueoRepository.findClasesByCiclo("2026-1").stream()
                .anyMatch(b -> "Maria Nueva".equals(b.getResponsableNombre())));
    }

    @Test
    @DisplayName("Un código L… no catalogado se crea como LABORATORIO mínimo (no como aula)")
    void codigoLabNoCatalogado_creaLab() {
        String c = "Periodo;Cod_Curso;Curso;Cod_Aula;Dia_Semana;Hora_Inicio;Hora_Fin\n"
                + "2026 - 1;CS300;Redes;L777;VIERNES;08:00;10:00\n";
        ImportHorariosResponse r = importService.importar(csv(c), docencia.getCorreoUtec());
        assertEquals(1, r.getClasesCreadas());
        assertEquals(1, r.getLaboratoriosCreados());
        assertEquals(0, r.getAulasCreadas());
        Laboratorio l = laboratorioRepository.findByCodigoLab("L777").orElseThrow();
        assertEquals("INACTIVO", l.getEstado());
        assertFalse(bloqueoRepository.findClasesByLaboratorio(l.getId(), "2026-1").isEmpty());
    }

    @Test
    @DisplayName("Las clases NO aparecen en el listado normal de bloqueos (es_clase se excluye)")
    void clasesExcluidasDeBloqueosNormales() {
        String c = "Periodo;Cod_Curso;Curso;Cod_Aula;Dia_Semana;Hora_Inicio;Hora_Fin\n"
                + "2026 - 1;CS200;Curso X;A601;LUNES;08:00;10:00\n";
        importService.importar(csv(c), docencia.getCorreoUtec());

        // findByActivoTrue excluye clases → ninguna de las devueltas es clase.
        boolean hayClaseEnListadoNormal = bloqueoRepository.findByActivoTrue().stream()
                .anyMatch(Bloqueo::getEsClase);
        assertFalse(hayClaseEnListadoNormal);
    }

    @Test
    @DisplayName("Importa desde XLSX (parseo con Apache POI), no solo CSV")
    void importaXlsx() throws Exception {
        try (var wb = new org.apache.poi.xssf.usermodel.XSSFWorkbook()) {
            var sh = wb.createSheet("Horario");
            String[] hdr = {"Periodo", "Cod_Curso", "Curso", "Cod_Aula", "Dia_Semana", "Hora_Inicio", "Hora_Fin"};
            var h = sh.createRow(0);
            for (int i = 0; i < hdr.length; i++) h.createCell(i).setCellValue(hdr[i]);
            String[] v = {"2026 - 1", "CS900", "Curso XLSX", "A701", "MARTES", "08:00", "10:00"};
            var r1 = sh.createRow(1);
            for (int i = 0; i < v.length; i++) r1.createCell(i).setCellValue(v[i]);
            var bos = new java.io.ByteArrayOutputStream();
            wb.write(bos);
            var file = new MockMultipartFile("archivo", "horario.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bos.toByteArray());
            ImportHorariosResponse r = importService.importar(file, docencia.getCorreoUtec());
            assertEquals(1, r.getClasesCreadas());
            assertTrue(aulaRepository.findByCodigo("A701").isPresent());
        }
    }

    @Test
    @DisplayName("Deriva el tipo de aula por prefijo y la capacidad del sufijo; tolera filas con error")
    void derivaTiposYTolera() {
        String c = "Periodo;Cod_Curso;Curso;Cod_Aula;Dia_Semana;Hora_Inicio;Hora_Fin\n"
                + "2026 - 1;CS401;A;AUDITORIO1;LUNES;08:00;10:00\n"       // → AUDITORIO
                + "2026 - 1;CS402;B;M604(30);MARTES;08:00;10:00\n"        // → AULA_MIXTA, cap 30 (sufijo)
                + "2026 - 1;CS403;C;S101;MIERCOLES;08:00;10:00\n"         // → SALA_ESTUDIO_SUM
                + "2026 - 1;CS404;D;A999;JUEVES;25:99;10:00\n";           // hora inválida → fila con error
        ImportHorariosResponse r = importService.importar(csv(c), docencia.getCorreoUtec());

        assertEquals("AUDITORIO", aulaRepository.findByCodigo("AUDITORIO1").orElseThrow().getTipo());
        var m604 = aulaRepository.findByCodigo("M604").orElseThrow();
        assertEquals("AULA_MIXTA", m604.getTipo());
        assertEquals(30, m604.getCapacidad());
        assertEquals("SALA_ESTUDIO_SUM", aulaRepository.findByCodigo("S101").orElseThrow().getTipo());
        assertNotNull(r);   // la fila con hora inválida no rompe el lote (se cuenta como error/omitida)
    }
}

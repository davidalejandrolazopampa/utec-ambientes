package pe.edu.utec.reservas.modules.bloqueos;

import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.utec.reservas.modules.bloqueos.dto.ImportBloqueosResponse;
import pe.edu.utec.reservas.modules.bloqueos.dto.ImportBloqueosResponse.Estado;
import pe.edu.utec.reservas.modules.bloqueos.service.BloqueoImportService;
import pe.edu.utec.reservas.modules.iam.model.Role;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.iam.repository.RoleRepository;
import pe.edu.utec.reservas.modules.iam.repository.UsuarioRepository;
import pe.edu.utec.reservas.modules.laboratorios.model.Laboratorio;
import pe.edu.utec.reservas.modules.laboratorios.repository.LaboratorioRepository;
import pe.edu.utec.reservas.modules.notificaciones.EmailService;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
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
class BloqueoImportServiceTest {

    @Autowired private BloqueoImportService importService;
    @Autowired private UsuarioRepository usuarioRepository;
    @Autowired private RoleRepository roleRepository;
    @Autowired private LaboratorioRepository laboratorioRepository;
    @MockBean private EmailService emailService;

    private Usuario gestor;
    private Laboratorio lab;

    @BeforeEach
    void setUp() {
        Role rolAdmin = roleRepository.findByNombre("ADMIN").orElseThrow();
        gestor = usuarioRepository.save(Usuario.builder()
                .correoUtec("gestor-import@utec.edu.pe").nombres("Gaby").apellidos("Admin")
                .rol(rolAdmin).activo(true).build());

        lab = laboratorioRepository.save(Laboratorio.builder()
                .codigoLab("LIMP").nombre("Lab Import").piso(1).ubicacionFase("Fase 1")
                .horaApertura(LocalTime.of(7, 0)).horaCierre(LocalTime.of(23, 0))
                .aforoTipo("MESA").aforoCantidad(2).aforoCapacidad(4).estado("ACTIVO")
                .diasAtencion(List.of("Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"))
                .build());
    }

    private MockMultipartFile csv(String contenido, String nombre) {
        return new MockMultipartFile("archivo", nombre, "text/csv", contenido.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    @DisplayName("CSV: crea las filas válidas, OMITE el solape y marca ERROR la fecha inválida (reporte por fila)")
    void importaCsv_reportaPorFila() {
        // Fila 1 válida (09-12). Fila 2 solapa a la 1 (10-11) → OMITIDO. Fila 3 fecha basura → ERROR.
        String contenido = "Codigo Lab;Titulo;Fecha;Hora inicio;Hora fin;Tipo;Responsable;Correo;Motivo\n"
                + "LIMP;Charla A;2026-11-10;09:00;12:00;TOTAL;Ana;ana@utec.edu.pe;EVENTO\n"
                + "LIMP;Charla B;2026-11-10;10:00;11:00;TOTAL;Beto;beto@utec.edu.pe;EVENTO\n"
                + "LIMP;Charla C;fecha-mala;10:00;11:00;TOTAL;Cid;cid@utec.edu.pe;EVENTO\n";

        ImportBloqueosResponse r = importService.importar(csv(contenido, "eventos.csv"), null, false, gestor.getCorreoUtec());

        assertEquals(3, r.getTotal());
        assertEquals(1, r.getCreados());
        assertEquals(1, r.getOmitidos());
        assertEquals(1, r.getErrores());
        assertEquals(Estado.CREADO, r.getDetalle().get(0).getEstado());
        assertEquals(Estado.OMITIDO, r.getDetalle().get(1).getEstado());
        assertEquals(Estado.ERROR, r.getDetalle().get(2).getEstado());
        assertNotNull(r.getDetalle().get(0).getBloqueoId());
    }

    @Test
    @DisplayName("Usa el laboratorio por defecto y los alias de cabecera del export (Nombres/Correos/Bloquep, fecha dd/m/yy)")
    void importaCsv_labPorDefectoYAlias() {
        // Sin columna de lab; cabeceras tal cual el export de Concept Lab.
        String contenido = "Titulo;Fecha de inicio;Hora inicio;Hora fin;Nombres;Correos;ID Calendario;Bloquep\n"
                + "Reunión;13/7/26;7:30;11:00;Silvana Toranzo;storanzo@utec.edu.pe;conceptlab@utec.edu.pe;TOTAL\n";

        ImportBloqueosResponse r = importService.importar(csv(contenido, "concept.csv"), lab.getId(), false, gestor.getCorreoUtec());

        assertEquals(1, r.getCreados());
        assertEquals("LIMP", r.getDetalle().get(0).getMensaje()); // código del lab resuelto por defecto
    }

    @Test
    @DisplayName("enviarCorreos gatea el correo al responsable (EVENTO es notificable)")
    void enviarCorreos_gateaElEmail() {
        String base = "Codigo Lab;Titulo;Fecha;Hora inicio;Hora fin;Tipo;Responsable;Correo;Motivo\n"
                + "LIMP;Charla;2026-11-11;09:00;12:00;TOTAL;Ana;ana@utec.edu.pe;EVENTO\n";

        importService.importar(csv(base, "e.csv"), null, false, gestor.getCorreoUtec());
        verify(emailService, never()).enviarBloqueoCreado(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean());

        importService.importar(csv(base.replace("2026-11-11", "2026-11-12"), "e2.csv"), null, true, gestor.getCorreoUtec());
        verify(emailService, times(1)).enviarBloqueoCreado(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean());
    }

    @Test
    @DisplayName("Excel (.xlsx): lee celdas de fecha/hora nativas y crea el bloqueo")
    void importaXlsx() throws Exception {
        byte[] xlsx = construirXlsx();
        MockMultipartFile file = new MockMultipartFile("archivo", "eventos.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsx);

        ImportBloqueosResponse r = importService.importar(file, lab.getId(), false, gestor.getCorreoUtec());

        assertEquals(1, r.getTotal());
        assertEquals(1, r.getCreados(), () -> "detalle=" + r.getDetalle());
    }

    @Test
    @DisplayName("Las plantillas se generan y contienen las columnas esperadas")
    void plantillas() {
        String csv = new String(importService.plantillaCsv(), StandardCharsets.UTF_8);
        assertTrue(csv.contains("Codigo Lab"));
        assertTrue(csv.contains("Titulo"));
        assertTrue(importService.plantillaXlsx().length > 0);
    }

    /** Construye un .xlsx con cabecera + una fila con celdas de fecha/hora nativas de Excel. */
    private byte[] construirXlsx() throws Exception {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            var hoja = wb.createSheet("Bloqueos");
            var head = hoja.createRow(0);
            String[] cols = {"Codigo Lab", "Titulo", "Fecha", "Hora inicio", "Hora fin", "Tipo", "Responsable", "Correo", "Motivo"};
            for (int c = 0; c < cols.length; c++) head.createCell(c).setCellValue(cols[c]);

            var fecha = wb.createCellStyle();
            fecha.setDataFormat(wb.createDataFormat().getFormat("yyyy-mm-dd"));
            var hora = wb.createCellStyle();
            hora.setDataFormat(wb.createDataFormat().getFormat("hh:mm"));

            var row = hoja.createRow(1);
            row.createCell(0).setCellValue("LIMP");
            row.createCell(1).setCellValue("Evento Excel");
            var cf = row.createCell(2); cf.setCellValue(java.time.LocalDate.of(2026, 11, 20)); cf.setCellStyle(fecha);
            var ci = row.createCell(3); ci.setCellValue(java.time.LocalDateTime.of(1899, 12, 31, 9, 0)); ci.setCellStyle(hora);
            var cff = row.createCell(4); cff.setCellValue(java.time.LocalDateTime.of(1899, 12, 31, 12, 0)); cff.setCellStyle(hora);
            row.createCell(5).setCellValue("TOTAL");
            row.createCell(6).setCellValue("Ana");
            row.createCell(7).setCellValue("ana@utec.edu.pe");
            row.createCell(8).setCellValue("EVENTO");

            wb.write(out);
            return out.toByteArray();
        }
    }
}

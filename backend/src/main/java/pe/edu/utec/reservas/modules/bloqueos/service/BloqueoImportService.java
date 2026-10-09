package pe.edu.utec.reservas.modules.bloqueos.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import pe.edu.utec.reservas.modules.bloqueos.dto.CreateBloqueoRequest;
import pe.edu.utec.reservas.modules.bloqueos.dto.ImportBloqueosResponse;
import pe.edu.utec.reservas.modules.laboratorios.model.Laboratorio;
import pe.edu.utec.reservas.modules.laboratorios.repository.LaboratorioRepository;
import pe.edu.utec.reservas.shared.exceptions.BusinessException;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Importación masiva de bloqueos desde un archivo Excel (.xlsx) o CSV.
 *
 * <p>Cada fila del archivo se convierte en un {@link CreateBloqueoRequest} y se crea con
 * {@link BloqueoService#crear(CreateBloqueoRequest, String, boolean)} en su PROPIA transacción,
 * de modo que una fila con conflicto (p. ej. un solape de eventos) se reporta como <em>omitida</em>
 * sin abortar el resto del lote. Por eso este método NO es {@code @Transactional}.
 *
 * <p>Cabeceras aceptadas (tolerantes a acentos/mayúsculas/sinónimos): Codigo Lab, Titulo, Fecha,
 * Hora inicio, Hora fin, Tipo (TOTAL/PARCIAL), Responsable, Correo, Motivo. El código del lab es
 * opcional si se pasa un laboratorio por defecto (selector del modal).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BloqueoImportService {

    private final BloqueoService bloqueoService;
    private final LaboratorioRepository laboratorioRepository;

    /** Cabeceras de la plantilla, en orden. */
    static final String[] COLUMNAS = {
            "Codigo Lab", "Titulo", "Fecha", "Hora inicio", "Hora fin", "Tipo", "Responsable", "Correo", "Motivo"
    };

    /** Códigos de negocio que significan "fila válida pero choca con algo existente" → se OMITE (no es error del archivo). */
    private static final java.util.Set<String> CONFLICTO = java.util.Set.of(
            "BLOQUEO_SOLAPADO", "RESERVAS_ACTIVAS", "RESOURCE_NOT_AVAILABLE");

    public ImportBloqueosResponse importar(MultipartFile archivo, Long laboratorioIdDefault,
                                           boolean enviarCorreos, String correoUsuario) {
        List<Map<String, String>> filas = parsear(archivo);

        ImportBloqueosResponse resp = ImportBloqueosResponse.builder().build();
        int nfila = 0;
        for (Map<String, String> fila : filas) {
            nfila++;
            if (esFilaVacia(fila)) continue; // filas en blanco no cuentan
            resp.setTotal(resp.getTotal() + 1);
            String titulo = fila.getOrDefault("titulo", "");
            try {
                CreateBloqueoRequest req = aRequest(fila, laboratorioIdDefault);
                var creado = bloqueoService.crear(req, correoUsuario, enviarCorreos);
                resp.setCreados(resp.getCreados() + 1);
                resp.getDetalle().add(ImportBloqueosResponse.Fila.builder()
                        .fila(nfila).titulo(titulo)
                        .estado(ImportBloqueosResponse.Estado.CREADO)
                        .mensaje(creado.getLaboratorioCodigo())
                        .bloqueoId(creado.getId())
                        .build());
            } catch (BusinessException e) {
                // OMITIDO = la fila es válida pero choca con datos existentes (solape/reserva).
                // ERROR   = la fila en sí está mal escrita (fecha/lab/tipo/ventana horaria).
                boolean conflicto = CONFLICTO.contains(e.getErrorCode());
                if (conflicto) resp.setOmitidos(resp.getOmitidos() + 1);
                else resp.setErrores(resp.getErrores() + 1);
                resp.getDetalle().add(ImportBloqueosResponse.Fila.builder()
                        .fila(nfila).titulo(titulo)
                        .estado(conflicto ? ImportBloqueosResponse.Estado.OMITIDO
                                          : ImportBloqueosResponse.Estado.ERROR)
                        .mensaje(primeraLinea(e.getMessage()))
                        .build());
            } catch (Exception e) {
                // Sin permiso sobre el lab, archivo corrupto, etc.: ERROR.
                resp.setErrores(resp.getErrores() + 1);
                resp.getDetalle().add(ImportBloqueosResponse.Fila.builder()
                        .fila(nfila).titulo(titulo)
                        .estado(ImportBloqueosResponse.Estado.ERROR)
                        .mensaje(primeraLinea(e.getMessage()))
                        .build());
            }
        }
        log.info("Importación de bloqueos por {} → {} creados, {} omitidos, {} errores (de {})",
                correoUsuario, resp.getCreados(), resp.getOmitidos(), resp.getErrores(), resp.getTotal());
        return resp;
    }

    // ── Construcción del request a partir de una fila ──

    private CreateBloqueoRequest aRequest(Map<String, String> fila, Long laboratorioIdDefault) {
        CreateBloqueoRequest req = new CreateBloqueoRequest();

        String codigo = fila.getOrDefault("codigo", "").trim();
        if (!codigo.isBlank()) {
            Laboratorio lab = laboratorioRepository.findByCodigoLab(codigo)
                    .orElseThrow(() -> new BusinessException(
                            "No existe un laboratorio con código " + codigo, "LAB_NOT_FOUND"));
            req.setLaboratorioId(lab.getId());
        } else if (laboratorioIdDefault != null) {
            req.setLaboratorioId(laboratorioIdDefault);
        } else {
            throw new BusinessException(
                    "Falta el laboratorio (columna 'Codigo Lab' o selecciona uno en el formulario)", "MISSING_LAB");
        }

        String tipo = fila.getOrDefault("tipo", "").trim().toUpperCase(Locale.ROOT);
        if (tipo.isBlank()) tipo = "TOTAL";
        if (!tipo.equals("TOTAL") && !tipo.equals("PARCIAL")) {
            throw new BusinessException("Tipo inválido '" + tipo + "' (usa TOTAL o PARCIAL)", "INVALID_TYPE");
        }
        req.setTipo(tipo);

        String motivo = fila.getOrDefault("motivo", "").trim().toUpperCase(Locale.ROOT);
        req.setMotivo(motivo.isBlank() ? "EVENTO" : motivo);

        req.setDescripcion(fila.getOrDefault("titulo", "").trim());
        req.setResponsableNombre(vacioANull(fila.get("responsable")));
        req.setResponsableCorreo(vacioANull(fila.get("correo")));

        LocalDate fecha = parseFecha(fila.get("fecha"));
        if (fecha == null) {
            throw new BusinessException("Fecha inválida o vacía: '" + fila.get("fecha") + "'", "INVALID_DATE");
        }
        req.setFechaInicio(fecha);
        req.setFechaFin(fecha); // eventos de un solo día

        req.setHoraInicio(parseHora(fila.get("horainicio")));
        req.setHoraFin(parseHora(fila.get("horafin")));
        return req;
    }

    // ── Parseo del archivo ──

    List<Map<String, String>> parsear(MultipartFile archivo) {
        String nombre = archivo.getOriginalFilename() != null
                ? archivo.getOriginalFilename().toLowerCase(Locale.ROOT) : "";
        try (InputStream in = archivo.getInputStream()) {
            if (nombre.endsWith(".csv")) {
                return parsearCsv(in);
            }
            return parsearExcel(in);
        } catch (IOException e) {
            throw new BusinessException("No se pudo leer el archivo: " + e.getMessage(), "FILE_UNREADABLE");
        }
    }

    private List<Map<String, String>> parsearExcel(InputStream in) throws IOException {
        List<Map<String, String>> filas = new ArrayList<>();
        try (Workbook wb = WorkbookFactory.create(in)) {
            Sheet hoja = wb.getSheetAt(0);
            Row cabecera = hoja.getRow(hoja.getFirstRowNum());
            if (cabecera == null) return filas;
            List<String> keys = new ArrayList<>();
            for (int c = 0; c < cabecera.getLastCellNum(); c++) {
                keys.add(normalizarHeader(celdaTexto(cabecera.getCell(c))));
            }
            for (int r = cabecera.getRowNum() + 1; r <= hoja.getLastRowNum(); r++) {
                Row row = hoja.getRow(r);
                if (row == null) continue;
                Map<String, String> fila = new LinkedHashMap<>();
                for (int c = 0; c < keys.size(); c++) {
                    fila.put(keys.get(c), celdaTexto(row.getCell(c)));
                }
                filas.add(fila);
            }
        }
        return filas;
    }

    private List<Map<String, String>> parsearCsv(InputStream in) throws IOException {
        String contenido = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        if (contenido.startsWith("﻿")) contenido = contenido.substring(1); // BOM
        String[] lineas = contenido.split("\r?\n");
        List<Map<String, String>> filas = new ArrayList<>();
        if (lineas.length == 0) return filas;

        char delim = lineas[0].contains(";") ? ';' : ',';
        List<String> keys = new ArrayList<>();
        for (String h : dividir(lineas[0], delim)) keys.add(normalizarHeader(h));

        for (int i = 1; i < lineas.length; i++) {
            if (lineas[i].isBlank()) continue;
            List<String> vals = dividir(lineas[i], delim);
            Map<String, String> fila = new LinkedHashMap<>();
            for (int c = 0; c < keys.size(); c++) {
                fila.put(keys.get(c), c < vals.size() ? vals.get(c).trim() : "");
            }
            filas.add(fila);
        }
        return filas;
    }

    /** Divide una línea CSV respetando comillas dobles. */
    private List<String> dividir(String linea, char delim) {
        List<String> out = new ArrayList<>();
        StringBuilder sb = new StringBuilder();
        boolean enComillas = false;
        for (int i = 0; i < linea.length(); i++) {
            char ch = linea.charAt(i);
            if (ch == '"') {
                if (enComillas && i + 1 < linea.length() && linea.charAt(i + 1) == '"') {
                    sb.append('"'); i++; // comilla escapada ""
                } else {
                    enComillas = !enComillas;
                }
            } else if (ch == delim && !enComillas) {
                out.add(sb.toString()); sb.setLength(0);
            } else {
                sb.append(ch);
            }
        }
        out.add(sb.toString());
        return out;
    }

    /** Texto de una celda; las fechas/horas se devuelven en ISO para que parseFecha/parseHora las lean. */
    private String celdaTexto(Cell cell) {
        if (cell == null) return "";
        return switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue().trim();
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            case NUMERIC -> DateUtil.isCellDateFormatted(cell)
                    ? cell.getLocalDateTimeCellValue().format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm"))
                    : limpiarNumero(cell.getNumericCellValue());
            case FORMULA -> {
                try { yield cell.getStringCellValue().trim(); }
                catch (Exception e) { yield limpiarNumero(cell.getNumericCellValue()); }
            }
            default -> "";
        };
    }

    private String limpiarNumero(double d) {
        return d == Math.floor(d) ? String.valueOf((long) d) : String.valueOf(d);
    }

    // ── Normalización de cabeceras (acentos, mayúsculas, sinónimos) ──

    private String normalizarHeader(String raw) {
        String s = java.text.Normalizer.normalize(raw == null ? "" : raw, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT).trim().replaceAll("\\s+", " ");
        return switch (s) {
            case "codigo lab", "codigo", "lab", "laboratorio", "codigo laboratorio" -> "codigo";
            case "titulo", "nombre", "evento", "asunto", "actividad" -> "titulo";
            case "fecha", "fecha de inicio", "fecha inicio", "dia", "fecha fin" -> "fecha";
            case "hora inicio", "hora de inicio", "inicio", "hora ini" -> "horainicio";
            case "hora fin", "hora de fin", "fin", "hora final" -> "horafin";
            case "tipo", "bloquep", "bloqueo", "alcance" -> "tipo";
            case "responsable", "nombres", "nombre responsable", "solicitante" -> "responsable";
            case "correo", "correos", "correo responsable", "email", "e-mail", "mail" -> "correo";
            case "motivo", "razon" -> "motivo";
            case "descripcion", "detalle", "observacion", "observaciones" -> "descripcion";
            default -> s; // columnas desconocidas (p. ej. "id calendario") se ignoran luego
        };
    }

    // ── Parseo de fecha y hora ──

    private static final DateTimeFormatter[] FECHAS = {
            DateTimeFormatter.ofPattern("yyyy-MM-dd"),
            DateTimeFormatter.ofPattern("d/M/uuuu"),
            DateTimeFormatter.ofPattern("d/M/uu"),
            DateTimeFormatter.ofPattern("d-M-uuuu"),
            DateTimeFormatter.ofPattern("dd/MM/uuuu"),
    };

    LocalDate parseFecha(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String s = raw.trim();
        if (s.contains("T")) s = s.substring(0, s.indexOf('T')); // ISO datetime → parte de fecha
        for (DateTimeFormatter f : FECHAS) {
            try { return LocalDate.parse(s, f); } catch (Exception ignored) { }
        }
        return null;
    }

    LocalTime parseHora(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String s = raw.trim();
        if (s.contains("T")) s = s.substring(s.indexOf('T') + 1); // ISO datetime → parte de hora
        for (String p : new String[]{"H:mm", "HH:mm", "H:mm:ss", "HH:mm:ss"}) {
            try { return LocalTime.parse(s, DateTimeFormatter.ofPattern(p)); } catch (Exception ignored) { }
        }
        return null;
    }

    // ── Utilidades ──

    private boolean esFilaVacia(Map<String, String> fila) {
        return fila.values().stream().allMatch(v -> v == null || v.isBlank());
    }

    private String vacioANull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }

    private String primeraLinea(String msg) {
        if (msg == null) return "Error";
        int nl = msg.indexOf('\n');
        return nl >= 0 ? msg.substring(0, nl) : msg;
    }

    // ── Plantilla descargable ──

    /** Genera la plantilla CSV (cabecera + una fila de ejemplo). */
    public byte[] plantillaCsv() {
        StringBuilder sb = new StringBuilder("﻿"); // BOM para que Excel abra en UTF-8
        sb.append(String.join(";", COLUMNAS)).append('\n');
        sb.append(String.join(";", List.of(
                "L108", "Charla de Innovación", "2026-08-15", "09:00", "12:00",
                "TOTAL", "Ana Torres", "atorres@utec.edu.pe", "EVENTO"))).append('\n');
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    /** Genera la plantilla Excel (.xlsx) con cabecera, una fila de ejemplo y una hoja de ayuda. */
    public byte[] plantillaXlsx() {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet hoja = wb.createSheet("Bloqueos");
            Row head = hoja.createRow(0);
            for (int c = 0; c < COLUMNAS.length; c++) head.createCell(c).setCellValue(COLUMNAS[c]);
            String[] ejemplo = {
                    "L108", "Charla de Innovación", "2026-08-15", "09:00", "12:00",
                    "TOTAL", "Ana Torres", "atorres@utec.edu.pe", "EVENTO"};
            Row fila = hoja.createRow(1);
            for (int c = 0; c < ejemplo.length; c++) fila.createCell(c).setCellValue(ejemplo[c]);
            for (int c = 0; c < COLUMNAS.length; c++) hoja.autoSizeColumn(c);

            Sheet ayuda = wb.createSheet("Instrucciones");
            String[] lineas = {
                    "Cómo llenar la plantilla de bloqueos:",
                    "",
                    "Codigo Lab   Código del laboratorio (ej. L108). Opcional si eliges el lab en el formulario.",
                    "Titulo       Nombre del evento/actividad.",
                    "Fecha        Día del evento. Formatos: 2026-08-15 o 15/08/2026 o 15/8/26.",
                    "Hora inicio  Formato 24h HH:MM (ej. 09:00). Entre 07:00 y 23:00.",
                    "Hora fin     Formato 24h HH:MM (ej. 12:00). Entre 07:00 y 23:00.",
                    "Tipo         TOTAL (todo el lab) o PARCIAL. Si se deja vacío = TOTAL.",
                    "Responsable  Nombre de la persona a cargo (recibe el correo).",
                    "Correo       Correo @utec.edu.pe del responsable.",
                    "Motivo       EVENTO (por defecto), CLASE, EXAMEN, MANTENIMIENTO, ALMUERZO o FERIADO.",
                    "",
                    "Nota: los motivos MANTENIMIENTO, ALMUERZO y FERIADO no envían correo (son operativos).",
                    "Cada fila = un evento de un solo día. Los solapes con otros bloqueos se omiten y se reportan.",
            };
            for (int r = 0; r < lineas.length; r++) ayuda.createRow(r).createCell(0).setCellValue(lineas[r]);
            ayuda.setColumnWidth(0, 100 * 256);

            wb.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new BusinessException("No se pudo generar la plantilla: " + e.getMessage(), "TEMPLATE_ERROR");
        }
    }
}

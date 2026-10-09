package pe.edu.utec.reservas.modules.aulas.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import pe.edu.utec.reservas.modules.aulas.dto.ImportHorariosResponse;
import pe.edu.utec.reservas.modules.aulas.model.Aula;
import pe.edu.utec.reservas.modules.aulas.model.Curso;
import pe.edu.utec.reservas.modules.aulas.repository.AulaRepository;
import pe.edu.utec.reservas.modules.aulas.repository.CursoRepository;
import pe.edu.utec.reservas.modules.bloqueos.model.Bloqueo;
import pe.edu.utec.reservas.modules.bloqueos.repository.BloqueoRepository;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.iam.repository.UsuarioRepository;
import pe.edu.utec.reservas.modules.laboratorios.model.Laboratorio;
import pe.edu.utec.reservas.modules.laboratorios.repository.LaboratorioRepository;
import pe.edu.utec.reservas.shared.exceptions.BusinessException;
import pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Importa el horario académico (Excel/CSV de UTEC) al sistema:
 *  - da de alta las AULAS que falten (clasificadas por su código),
 *  - da de alta los CURSOS que falten,
 *  - crea cada sesión como una CLASE = bloqueo recurrente (motivo CLASE) sobre el aula o el lab.
 *
 * Descarta las filas Virtuales/Ficticias. Las clases en labs se enlazan al `laboratorios`
 * existente (para que el calendario del lab las muestre). Anti-solape en memoria por
 * (espacio, día, franja) para no duplicar ni cruzar clases.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HorarioImportService {

    private final AulaRepository aulaRepository;
    private final CursoRepository cursoRepository;
    private final BloqueoRepository bloqueoRepository;
    private final LaboratorioRepository laboratorioRepository;
    private final UsuarioRepository usuarioRepository;
    private final pe.edu.utec.reservas.modules.iam.repository.RoleRepository roleRepository;

    private static final Pattern CAP_SUFFIX = Pattern.compile("\\((\\d+)\\)");

    @Transactional
    public ImportHorariosResponse importar(MultipartFile archivo, String correoUsuario) {
        return importar(archivo, correoUsuario, false);
    }

    /**
     * Importa el horario. El import es IDEMPOTENTE contra la BD: las clases del ciclo que ya
     * existen (misma firma espacio+día+franja+frecuencia+curso+sección) NO se duplican — se
     * conservan y se refrescan sus datos visibles (docente/etiqueta). Con {@code sincronizar}
     * además ELIMINA las clases del ciclo que ya no están en el archivo (el Excel pasa a ser
     * la fuente de verdad del ciclo: agrega lo nuevo, conserva lo igual, borra lo retirado).
     */
    @Transactional
    public ImportHorariosResponse importar(MultipartFile archivo, String correoUsuario, boolean sincronizar) {
        Usuario usuario = usuarioRepository.findByCorreoUtec(correoUsuario)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "correo", correoUsuario));

        List<Map<String, String>> filas = parsear(archivo);
        ImportHorariosResponse resp = ImportHorariosResponse.builder().build();
        resp.setFilasLeidas(filas.size());

        // Cachés para no golpear la BD por fila.
        Map<String, Aula> aulasPorCodigo = new HashMap<>();
        aulaRepository.findAll().forEach(a -> aulasPorCodigo.put(a.getCodigo().toUpperCase(Locale.ROOT), a));
        Map<String, Laboratorio> labsPorCodigo = new HashMap<>();
        laboratorioRepository.findAll().forEach(l -> labsPorCodigo.put(l.getCodigoLab().toUpperCase(Locale.ROOT), l));
        Map<String, Curso> cursosPorCodigo = new HashMap<>();
        cursoRepository.findAll().forEach(c -> cursosPorCodigo.put(c.getCodCurso().toUpperCase(Locale.ROOT), c));

        // ── Dedupe/sync contra la BD: clases YA registradas del ciclo del archivo ──
        String cicloArchivo = filas.stream()
                .map(f -> normalizarCiclo(val(f, "periodo")))
                .filter(c -> c != null)
                .findFirst().orElse(null);
        Map<String, Bloqueo> existentesPorFirma = new HashMap<>();
        if (cicloArchivo != null) {
            bloqueoRepository.findClasesByCiclo(cicloArchivo).forEach(b -> existentesPorFirma.put(firmaDe(b), b));
            if (sincronizar) {
                // Firmas presentes en el archivo (pre-scan sin efectos): lo que no esté, se elimina.
                var firmasArchivo = new java.util.HashSet<String>();
                for (Map<String, String> f : filas) {
                    String fa = firmaDeFila(f, aulasPorCodigo, labsPorCodigo);
                    if (fa != null) firmasArchivo.add(fa);
                }
                List<Bloqueo> retiradas = existentesPorFirma.entrySet().stream()
                        .filter(e -> !firmasArchivo.contains(e.getKey()))
                        .map(Map.Entry::getValue).toList();
                retiradas.forEach(b -> existentesPorFirma.remove(firmaDe(b)));
                bloqueoRepository.deleteAll(retiradas);
                resp.setClasesEliminadas(retiradas.size());
            }
        }

        // Anti-solape en memoria: clave espacio+dia → lista de [inicioMin, finMin, frecCode].
        // Se PRE-CARGA con las clases que siguen en BD, así una fila nueva que cruce con una
        // clase existente (de otra firma) se detecta como solape real y no se inserta encima.
        Map<String, List<int[]>> ocupacion = new HashMap<>();
        existentesPorFirma.values().forEach(b -> agregarFranja(ocupacion, b));
        // Docentes ya vistos en ESTE archivo (evita re-consultar la BD por cada fila del mismo profe).
        Map<String, Boolean> docentesVistos = new HashMap<>();

        for (int i = 0; i < filas.size(); i++) {
            Map<String, String> f = filas.get(i);
            try {
                procesarFila(f, i + 1, usuario, resp, aulasPorCodigo, labsPorCodigo, cursosPorCodigo,
                        ocupacion, docentesVistos, existentesPorFirma);
            } catch (Exception e) {
                resp.setErrores(resp.getErrores() + 1);
                if (resp.getProblemas().size() < 50)
                    resp.getProblemas().add("Fila " + (i + 1) + ": " + e.getMessage());
            }
        }
        log.info("Import horarios {} por {} (sync={}) → aulas +{}, cursos +{}, clases +{}, existentes {}, eliminadas {}, omitidas {}, errores {} (de {})",
                resp.getCiclo(), correoUsuario, sincronizar, resp.getAulasCreadas(), resp.getCursosCreados(),
                resp.getClasesCreadas(), resp.getClasesExistentes(), resp.getClasesEliminadas(),
                resp.getClasesOmitidas(), resp.getErrores(), resp.getFilasLeidas());
        return resp;
    }

    private void procesarFila(Map<String, String> f, int nfila, Usuario usuario, ImportHorariosResponse resp,
                              Map<String, Aula> aulasPorCodigo, Map<String, Laboratorio> labsPorCodigo,
                              Map<String, Curso> cursosPorCodigo, Map<String, List<int[]>> ocupacion,
                              Map<String, Boolean> docentesVistos, Map<String, Bloqueo> existentesPorFirma) {
        String codAulaRaw = val(f, "cod_aula");
        if (codAulaRaw.isBlank()) return; // fila sin espacio: se ignora

        String codAula = codAulaRaw.trim().toUpperCase(Locale.ROOT);
        String codNorm = CAP_SUFFIX.matcher(codAula).replaceAll("").trim(); // sin sufijo "(45)"

        if (codNorm.contains("VIRTUAL")) { resp.setVirtualesDescartadas(resp.getVirtualesDescartadas() + 1); return; }
        if (codNorm.equals("FICTICIO")) { resp.setFicticiasDescartadas(resp.getFicticiasDescartadas() + 1); return; }

        // Filas RESV* = reservas del ambiente (p. ej. "RESV01 - Sala UTEC Reserva"), NO clases:
        // vienen en bloques de 15 min y ensucian el calendario. Se descartan.
        String codCurso = val(f, "cod_curso").trim().toUpperCase(Locale.ROOT);
        if (codCurso.startsWith("RESV")) { resp.setReservasDescartadas(resp.getReservasDescartadas() + 1); return; }

        // Ciclo (de la fila; el archivo trae un solo periodo pero por robustez lo leemos por fila)
        String ciclo = normalizarCiclo(val(f, "periodo"));
        if (ciclo == null) throw new BusinessException("Periodo/ciclo inválido: '" + val(f, "periodo") + "'", "BAD_CICLO");
        if (resp.getCiclo() == null) resp.setCiclo(ciclo);

        String dia = normalizarDia(val(f, "dia_semana"));
        if (dia == null) throw new BusinessException("Día inválido: '" + val(f, "dia_semana") + "'", "BAD_DAY");

        LocalTime hi = parseHora(val(f, "hora_inicio"));
        LocalTime hf = parseHora(val(f, "hora_fin"));
        if (hi == null || hf == null || !hi.isBefore(hf))
            throw new BusinessException("Horario inválido: '" + val(f, "hora_inicio") + "'-'" + val(f, "hora_fin") + "'", "BAD_TIME");

        // Resolver el espacio: lab (si el código existe en laboratorios) o aula.
        Laboratorio lab = null;
        Aula aula = null;
        if (codNorm.matches("L\\d.*")) {
            // Un código L… es un LABORATORIO: si no está en el catálogo, se crea uno mínimo
            // (INACTIVO) en vez de un aula, para que no ensucie el listado de Aulas.
            lab = labsPorCodigo.get(codNorm);
            if (lab == null) lab = crearLabMinimo(codNorm, labsPorCodigo, resp);
        } else {
            aula = resolverAula(codNorm, f, aulasPorCodigo, resp);
        }

        // Frecuencia: SEMANA_GENERAL (todas) / SEMANA_A / SEMANA_B (quincenal).
        String frecuencia = normalizarFrecuencia(val(f, "frecuencia"));
        int frecCode = "SEMANA_A".equals(frecuencia) ? 1 : "SEMANA_B".equals(frecuencia) ? 2 : 0;

        // Curso (upsert)
        Curso curso = resolverCurso(f, cursosPorCodigo, resp);

        String docente = tituloCase(val(f, "docente"));
        // Alta del DOCENTE como usuario (rol DOCENTE, solo-consulta) si su correo aún no existe.
        registrarDocente(vacioNull(val(f, "email_institucional")), docente, docentesVistos, resp);
        String seccion = val(f, "seccion");
        String tipoSesion = normalizarTipoSesion(val(f, "sesion"));
        String modalidad = normalizarModalidad(val(f, "modalidad"));
        String etiqueta = (curso != null ? curso.getCodCurso() + " - " + curso.getNombre() : val(f, "curso"))
                + (seccion.isBlank() ? "" : " - " + seccion)
                + (tipoSesion.isBlank() ? "" : " - " + tipoSesion)
                + (docente.isBlank() ? "" : " - " + docente);

        // ── Dedupe contra la BD: si la clase YA existe (misma firma), no se duplica — se
        // conserva y se refrescan sus datos visibles (docente pudo cambiar en el Excel). ──
        String espacioKey = lab != null ? "L#" + lab.getId() : "A#" + aula.getId();
        Bloqueo existente = existentesPorFirma.remove(
                firma(espacioKey, dia, hi, hf, frecuencia, curso != null ? curso.getCodCurso() : "", seccion));
        if (existente != null) {
            existente.setDescripcion(etiqueta);
            existente.setResponsableNombre(docente.isBlank() ? null : docente);
            existente.setResponsableCorreo(vacioNull(val(f, "email_institucional")));
            existente.setTipoSesion(tipoSesion.isBlank() ? null : tipoSesion);
            existente.setModalidad(modalidad.isBlank() ? null : modalidad);
            bloqueoRepository.save(existente);
            resp.setClasesExistentes(resp.getClasesExistentes() + 1);
            return; // su franja ya está pre-cargada en `ocupacion`
        }

        // Anti-solape / dedup en memoria por espacio+día (incluye las clases existentes en BD,
        // pre-cargadas). Dos clases se cruzan solo si sus SEMANAS coinciden: A vs B NO chocan
        // (semanas alternas); GENERAL choca con todo.
        String claveEspacio = (lab != null ? "L" + lab.getId() : "A" + aula.getId()) + "|" + dia;
        int ini = hi.getHour() * 60 + hi.getMinute();
        int fin = hf.getHour() * 60 + hf.getMinute();
        List<int[]> franjas = ocupacion.computeIfAbsent(claveEspacio, k -> new ArrayList<>());
        for (int[] fr : franjas) {
            boolean semanasCoinciden = fr[2] == 0 || frecCode == 0 || fr[2] == frecCode;
            if (ini < fr[1] && fin > fr[0] && semanasCoinciden) { // se cruzan la misma semana
                resp.setClasesOmitidas(resp.getClasesOmitidas() + 1);
                return;
            }
        }
        franjas.add(new int[]{ini, fin, frecCode});

        // Rango de fechas del ciclo (recurrencia semanal)
        LocalDate[] rango = rangoCiclo(ciclo);

        Bloqueo clase = Bloqueo.builder()
                .laboratorio(lab)
                .aula(aula)
                .tipo("TOTAL")            // el espacio se ocupa completo (no hay clase parcial)
                .motivo("CLASE")
                .descripcion(etiqueta)
                .esClase(true)
                .diaSemana(dia)
                .ciclo(ciclo)
                .curso(curso)
                .frecuencia(frecuencia)
                .seccion(seccion.isBlank() ? null : seccion)
                .tipoSesion(tipoSesion.isBlank() ? null : tipoSesion)
                .modalidad(modalidad.isBlank() ? null : modalidad)
                .responsableNombre(docente.isBlank() ? null : docente)
                .responsableCorreo(vacioNull(val(f, "email_institucional")))
                .fechaInicio(rango[0])
                .fechaFin(rango[1])
                .horaInicio(hi)
                .horaFin(hf)
                .activo(true)
                .creadoPor(usuario)
                .build();
        bloqueoRepository.save(clase);
        resp.setClasesCreadas(resp.getClasesCreadas() + 1);
    }

    // ── Firma de una clase (identidad para dedupe/sync): espacio + día + franja + frecuencia
    // + curso + sección. Si algo de esto cambia, es OTRA clase (se crea/elimina); si solo
    // cambian docente/etiqueta, la firma coincide y se actualiza en sitio. ──

    private String firma(String espacioKey, String dia, LocalTime hi, LocalTime hf,
                         String frecuencia, String codCurso, String seccion) {
        return espacioKey + "|" + dia + "|" + hi + "|" + hf + "|"
                + (frecuencia == null || frecuencia.isBlank() ? "SEMANA_GENERAL" : frecuencia)
                + "|" + (codCurso == null ? "" : codCurso.trim().toUpperCase(Locale.ROOT))
                + "|" + (seccion == null ? "" : seccion.trim().toLowerCase(Locale.ROOT));
    }

    private String firmaDe(Bloqueo b) {
        String espacioKey = b.getLaboratorio() != null ? "L#" + b.getLaboratorio().getId() : "A#" + b.getAula().getId();
        return firma(espacioKey, b.getDiaSemana(), b.getHoraInicio(), b.getHoraFin(), b.getFrecuencia(),
                b.getCurso() != null ? b.getCurso().getCodCurso() : "",
                b.getSeccion());
    }

    /** Firma de una fila del archivo SIN efectos secundarios (pre-scan del modo sincronizar).
     *  Devuelve null si la fila no produce clase (descartable/ inválida) o si su espacio aún
     *  no existe en el catálogo (un espacio nuevo no puede tener clases previas que borrar). */
    private String firmaDeFila(Map<String, String> f, Map<String, Aula> aulas, Map<String, Laboratorio> labs) {
        String codAulaRaw = val(f, "cod_aula");
        if (codAulaRaw.isBlank()) return null;
        String codNorm = CAP_SUFFIX.matcher(codAulaRaw.trim().toUpperCase(Locale.ROOT)).replaceAll("").trim();
        if (codNorm.contains("VIRTUAL") || codNorm.equals("FICTICIO")) return null;
        String codCurso = val(f, "cod_curso").trim().toUpperCase(Locale.ROOT);
        if (codCurso.startsWith("RESV")) return null;
        String dia = normalizarDia(val(f, "dia_semana"));
        LocalTime hi = parseHora(val(f, "hora_inicio"));
        LocalTime hf = parseHora(val(f, "hora_fin"));
        if (dia == null || hi == null || hf == null || !hi.isBefore(hf)) return null;
        String espacioKey;
        if (codNorm.matches("L\\d.*")) {
            Laboratorio l = labs.get(codNorm);
            if (l == null) return null;
            espacioKey = "L#" + l.getId();
        } else {
            Aula a = aulas.get(codNorm);
            if (a == null) return null;
            espacioKey = "A#" + a.getId();
        }
        return firma(espacioKey, dia, hi, hf, normalizarFrecuencia(val(f, "frecuencia")), codCurso, val(f, "seccion"));
    }

    /** Pre-carga la franja de una clase existente en el mapa de anti-solape. */
    private void agregarFranja(Map<String, List<int[]>> ocupacion, Bloqueo b) {
        String clave = (b.getLaboratorio() != null ? "L" + b.getLaboratorio().getId() : "A" + b.getAula().getId())
                + "|" + b.getDiaSemana();
        int frecCode = "SEMANA_A".equals(b.getFrecuencia()) ? 1 : "SEMANA_B".equals(b.getFrecuencia()) ? 2 : 0;
        ocupacion.computeIfAbsent(clave, k -> new ArrayList<>()).add(new int[]{
                b.getHoraInicio().getHour() * 60 + b.getHoraInicio().getMinute(),
                b.getHoraFin().getHour() * 60 + b.getHoraFin().getMinute(),
                frecCode});
    }

    /**
     * Da de alta al docente de la fila como usuario con rol DOCENTE (consulta calendarios,
     * no reserva). Idempotente: si el correo ya existe (con cualquier rol) no lo toca. El
     * nombre del Excel viene "Apellidos, Nombres". Best-effort: si el rol DOCENTE no existe
     * (BD vieja sin V11) simplemente no crea nada.
     */
    private void registrarDocente(String correo, String nombre, Map<String, Boolean> vistos, ImportHorariosResponse resp) {
        if (correo == null) return;
        String key = correo.trim().toLowerCase(Locale.ROOT);
        if (!key.endsWith("@utec.edu.pe") || vistos.containsKey(key)) return;
        vistos.put(key, Boolean.TRUE);
        if (usuarioRepository.findByCorreoUtec(key).isPresent()) return;
        var rolDocente = roleRepository.findByNombre("DOCENTE").orElse(null);
        if (rolDocente == null) return;
        String nombres = nombre == null ? "" : nombre.trim();
        String apellidos = "";
        int coma = nombres.indexOf(',');
        if (coma > 0) {
            apellidos = nombres.substring(0, coma).trim();
            nombres = nombres.substring(coma + 1).trim();
        }
        usuarioRepository.save(Usuario.builder()
                .correoUtec(key)
                .nombres(nombres.isBlank() ? key.substring(0, key.indexOf('@')) : nombres)
                .apellidos(apellidos)
                .rol(rolDocente)
                .activo(true)
                .build());
        resp.setDocentesCreados(resp.getDocentesCreados() + 1);
    }

    // ── Resolución de aula / curso (upsert con caché) ──

    /** Crea un laboratorio MÍNIMO (INACTIVO) para un código L… que no está en el catálogo. */
    private Laboratorio crearLabMinimo(String codigo, Map<String, Laboratorio> cache, ImportHorariosResponse resp) {
        Integer piso = pisoDeCodigo(codigo);
        Laboratorio l = Laboratorio.builder()
                .codigoLab(codigo).nombre(codigo)
                .piso(piso != null ? piso : 1).ubicacionFase("Fase 1")
                .horaApertura(LocalTime.of(7, 0)).horaCierre(LocalTime.of(23, 0))
                .aforoTipo("MESA").aforoCantidad(0).aforoCapacidad(1)
                .estado("INACTIVO")
                .diasAtencion(List.of("Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"))
                .build();
        l = laboratorioRepository.save(l);
        cache.put(codigo, l);
        resp.setLaboratoriosCreados(resp.getLaboratoriosCreados() + 1);
        return l;
    }

    private Aula resolverAula(String codNorm, Map<String, String> f, Map<String, Aula> cache, ImportHorariosResponse resp) {
        Aula a = cache.get(codNorm);
        if (a != null) return a;
        a = Aula.builder()
                .codigo(codNorm)
                .nombre(codNorm)
                .tipo(clasificarTipo(codNorm))
                .capacidad(capacidad(codNorm, f))
                .piso(pisoDeCodigo(codNorm))
                .activo(true)
                .build();
        a = aulaRepository.save(a);
        cache.put(codNorm, a);
        resp.setAulasCreadas(resp.getAulasCreadas() + 1);
        return a;
    }

    private Curso resolverCurso(Map<String, String> f, Map<String, Curso> cache, ImportHorariosResponse resp) {
        String cod = val(f, "cod_curso").trim().toUpperCase(Locale.ROOT);
        if (cod.isBlank()) return null;
        Curso c = cache.get(cod);
        if (c != null) return c;
        c = Curso.builder()
                .codCurso(cod)
                .nombre(val(f, "curso").trim())
                .area(cod.replaceAll("\\d.*", ""))  // prefijo de letras
                .build();
        c = cursoRepository.save(c);
        cache.put(cod, c);
        resp.setCursosCreados(resp.getCursosCreados() + 1);
        return c;
    }

    private String clasificarTipo(String cod) {
        if (cod.startsWith("AUDITORIO")) return "AUDITORIO";
        if (cod.startsWith("AULAMAGNA") || cod.startsWith("AULA MAGNA")) return "AULA_MAGNA";
        if (cod.matches("A\\d.*")) return "AULA";
        if (cod.matches("M\\d.*")) return "AULA_MIXTA";
        if (cod.matches("S\\d.*")) return "SALA_ESTUDIO_SUM";
        if (cod.matches("L\\d.*")) return "AULA"; // lab no registrado → aula genérica (fallback)
        return "AULA";
    }

    private Integer capacidad(String cod, Map<String, String> f) {
        String cap = val(f, "capacidad_aula");
        if (!cap.isBlank()) {
            try { return (int) Double.parseDouble(cap.trim()); } catch (NumberFormatException ignored) { }
        }
        Matcher m = CAP_SUFFIX.matcher(val(f, "cod_aula")); // "(45)"
        if (m.find()) return Integer.parseInt(m.group(1));
        return null;
    }

    private Integer pisoDeCodigo(String cod) {
        Matcher m = Pattern.compile("[A-Z]+(\\d)").matcher(cod);
        return m.find() ? Integer.parseInt(m.group(1)) : null;
    }

    // ── Normalizadores ──

    private String normalizarCiclo(String raw) {
        if (raw == null) return null;
        Matcher m = Pattern.compile("(\\d{4})\\s*-\\s*(\\d)").matcher(raw);
        return m.find() ? m.group(1) + "-" + m.group(2) : null;
    }

    private LocalDate[] rangoCiclo(String ciclo) {
        String[] p = ciclo.split("-");
        int anio = Integer.parseInt(p[0].trim());
        int c = Integer.parseInt(p[1].trim());
        return switch (c) {
            case 0 -> new LocalDate[]{LocalDate.of(anio, 1, 1), LocalDate.of(anio, 2, 28)};
            case 1 -> new LocalDate[]{LocalDate.of(anio, 3, 1), LocalDate.of(anio, 7, 31)};
            default -> new LocalDate[]{LocalDate.of(anio, 8, 1), LocalDate.of(anio, 12, 31)};
        };
    }

    private String normalizarDia(String raw) {
        String s = sinAcentos(raw).toUpperCase(Locale.ROOT).trim();
        return switch (s) {
            case "LUNES" -> "LUNES";
            case "MARTES" -> "MARTES";
            case "MIERCOLES" -> "MIERCOLES";
            case "JUEVES" -> "JUEVES";
            case "VIERNES" -> "VIERNES";
            case "SABADO" -> "SABADO";
            case "DOMINGO" -> "DOMINGO";
            default -> null;
        };
    }

    private String normalizarTipoSesion(String raw) {
        String s = sinAcentos(raw).toUpperCase(Locale.ROOT).replaceAll("[\\d.].*", "").trim();
        if (s.startsWith("TEOR")) return "TEORICO";
        if (s.startsWith("LABOR")) return "LABORATORIO";
        if (s.startsWith("PRAC")) return "PRACTICO";
        return s;
    }

    private String normalizarModalidad(String raw) {
        String s = sinAcentos(raw).toUpperCase(Locale.ROOT).trim();
        return s.isBlank() ? "" : s;
    }

    private String normalizarFrecuencia(String raw) {
        String s = sinAcentos(raw).toUpperCase(Locale.ROOT).trim();
        if (s.contains("SEMANA A")) return "SEMANA_A";
        if (s.contains("SEMANA B")) return "SEMANA_B";
        return "SEMANA_GENERAL";
    }

    private String sinAcentos(String s) {
        if (s == null) return "";
        return Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
    }

    private String tituloCase(String s) {
        if (s == null || s.isBlank()) return "";
        return s.trim();
    }

    private LocalTime parseHora(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String s = raw.trim();
        if (s.contains("T")) s = s.substring(s.indexOf('T') + 1);
        for (String p : new String[]{"H:mm", "HH:mm", "H:mm:ss", "HH:mm:ss"}) {
            try { return LocalTime.parse(s, DateTimeFormatter.ofPattern(p)); } catch (Exception ignored) { }
        }
        return null;
    }

    private String vacioNull(String s) { return (s == null || s.isBlank()) ? null : s.trim(); }
    private String val(Map<String, String> f, String k) { return f.getOrDefault(k, ""); }

    // ── Parseo de archivo (POI o CSV), tolerante a las cabeceras de ambos esquemas ──

    List<Map<String, String>> parsear(MultipartFile archivo) {
        String nombre = archivo.getOriginalFilename() != null
                ? archivo.getOriginalFilename().toLowerCase(Locale.ROOT) : "";
        try (InputStream in = archivo.getInputStream()) {
            return nombre.endsWith(".csv") ? parsearCsv(in) : parsearExcel(in);
        } catch (IOException e) {
            throw new BusinessException("No se pudo leer el archivo: " + e.getMessage(), "FILE_UNREADABLE");
        }
    }

    private List<Map<String, String>> parsearExcel(InputStream in) throws IOException {
        List<Map<String, String>> filas = new ArrayList<>();
        try (Workbook wb = WorkbookFactory.create(in)) {
            Sheet hoja = wb.getSheetAt(0);
            Row cab = hoja.getRow(hoja.getFirstRowNum());
            if (cab == null) return filas;
            List<String> keys = new ArrayList<>();
            for (int c = 0; c < cab.getLastCellNum(); c++) keys.add(headerKey(celda(cab.getCell(c))));
            for (int r = cab.getRowNum() + 1; r <= hoja.getLastRowNum(); r++) {
                Row row = hoja.getRow(r);
                if (row == null) continue;
                Map<String, String> fila = new LinkedHashMap<>();
                boolean vacia = true;
                for (int c = 0; c < keys.size(); c++) {
                    String v = celda(row.getCell(c));
                    if (!v.isBlank()) vacia = false;
                    fila.put(keys.get(c), v);
                }
                if (!vacia) filas.add(fila);
            }
        }
        return filas;
    }

    private List<Map<String, String>> parsearCsv(InputStream in) throws IOException {
        String contenido = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        if (contenido.startsWith("﻿")) contenido = contenido.substring(1);
        String[] lineas = contenido.split("\r?\n");
        List<Map<String, String>> filas = new ArrayList<>();
        if (lineas.length == 0) return filas;
        char delim = lineas[0].contains(";") ? ';' : ',';
        List<String> keys = new ArrayList<>();
        for (String h : dividir(lineas[0], delim)) keys.add(headerKey(h));
        for (int i = 1; i < lineas.length; i++) {
            if (lineas[i].isBlank()) continue;
            List<String> vals = dividir(lineas[i], delim);
            Map<String, String> fila = new LinkedHashMap<>();
            for (int c = 0; c < keys.size(); c++) fila.put(keys.get(c), c < vals.size() ? vals.get(c).trim() : "");
            filas.add(fila);
        }
        return filas;
    }

    private List<String> dividir(String linea, char delim) {
        List<String> out = new ArrayList<>();
        StringBuilder sb = new StringBuilder();
        boolean q = false;
        for (int i = 0; i < linea.length(); i++) {
            char ch = linea.charAt(i);
            if (ch == '"') {
                if (q && i + 1 < linea.length() && linea.charAt(i + 1) == '"') { sb.append('"'); i++; }
                else q = !q;
            } else if (ch == delim && !q) { out.add(sb.toString()); sb.setLength(0); }
            else sb.append(ch);
        }
        out.add(sb.toString());
        return out;
    }

    /** Normaliza la cabecera a una clave canónica (sin acentos, minúscula, sin espacios/underscore). */
    private String headerKey(String raw) {
        String s = sinAcentos(raw).toLowerCase(Locale.ROOT).trim().replaceAll("[\\s_]+", "_");
        return switch (s) {
            case "periodo" -> "periodo";
            case "cod_curso", "codigo_curso" -> "cod_curso";
            case "curso", "nombre_curso" -> "curso";
            case "seccion" -> "seccion";
            case "sesion" -> "sesion";
            case "cod_aula", "codigo_aula", "aula" -> "cod_aula";
            case "capacidad_aula", "capacidad" -> "capacidad_aula";
            case "modalidad" -> "modalidad";
            case "dia_semana", "dia" -> "dia_semana";
            case "hora_inicio" -> "hora_inicio";
            case "hora_fin" -> "hora_fin";
            case "docente" -> "docente";
            case "email_institucional", "email", "correo" -> "email_institucional";
            case "tipo_carrera" -> "tipo_carrera";
            default -> s;
        };
    }

    private String celda(Cell cell) {
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
}

package pe.edu.utec.reservas.modules.analytics.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.utec.reservas.modules.analytics.dto.*;
import pe.edu.utec.reservas.modules.analytics.repository.AnalyticsRepository;
import pe.edu.utec.reservas.modules.analytics.repository.AulaStatsRepository;
import pe.edu.utec.reservas.modules.analytics.repository.BloqueoStatsRepository;
import pe.edu.utec.reservas.modules.analytics.repository.OperativoStatsRepository;
import pe.edu.utec.reservas.modules.aulas.model.CicloExcepcion;
import pe.edu.utec.reservas.modules.aulas.repository.AulaRepository;
import pe.edu.utec.reservas.modules.aulas.repository.CicloExcepcionRepository;
import pe.edu.utec.reservas.modules.laboratorios.model.Laboratorio;
import pe.edu.utec.reservas.modules.laboratorios.repository.LaboratorioRepository;
import pe.edu.utec.reservas.modules.laboratorios.repository.RecursoLabRepository;
import pe.edu.utec.reservas.modules.reservas.model.Reserva;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.iam.repository.UsuarioRepository;
import pe.edu.utec.reservas.shared.exceptions.BusinessException;
import pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException;
import jakarta.persistence.EntityManager;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class AnalyticsService {

    private final AnalyticsRepository analyticsRepository;
    private final BloqueoStatsRepository bloqueoStatsRepository;
    private final OperativoStatsRepository operativoStatsRepository;
    private final AulaStatsRepository aulaStatsRepository;
    private final AulaRepository aulaRepository;
    private final LaboratorioRepository laboratorioRepository;
    private final RecursoLabRepository recursoLabRepository;
    private final CicloExcepcionRepository cicloExcepcionRepository;
    private final UsuarioRepository usuarioRepository;
    private final EntityManager entityManager;

    /**
     * Alcance por rol para analytics: ADMIN/COORDINADOR ven todo; un DIRECTOR o un
     * RESPONSABLE_LAB SOLO pueden consultar la analítica de UNO de sus laboratorios (deben
     * elegir uno; no ven el agregado global). Evita que un rol acotado reciba datos/PII de
     * labs fuera de su ámbito (mismo patrón que {@code BloqueoService.labIdsDeUsuario}).
     */
    public void validarAccesoLab(Long labId, String correo) {
        Usuario u = usuarioRepository.findByCorreoUtec(correo)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", "correo", correo));
        String rol = u.getRol().getNombre();
        boolean esDirector = "DIRECTOR".equals(rol);
        if (!esDirector && !"RESPONSABLE_LAB".equals(rol)) return; // ADMIN/COORDINADOR sin restricción
        String sql = esDirector
                ? "SELECT DISTINCT l.id FROM laboratorios l WHERE l.director_id = :uid "
                        + "UNION SELECT DISTINCT lr.laboratorio_id FROM lab_responsables lr "
                        + "INNER JOIN usuarios u ON u.id = lr.usuario_id "
                        + "INNER JOIN departamentos d ON d.id = u.departamento_id WHERE d.director_id = :uid"
                : "SELECT laboratorio_id FROM lab_responsables WHERE usuario_id = :uid";
        @SuppressWarnings("unchecked")
        List<Number> ids = entityManager.createNativeQuery(sql)
                .setParameter("uid", u.getId())
                .getResultList();
        Set<Long> misLabs = ids.stream().map(Number::longValue).collect(Collectors.toSet());
        if (labId == null || !misLabs.contains(labId)) {
            throw new BusinessException(
                    "Solo puedes ver la analítica de tus laboratorios; elige uno de ellos.",
                    "FORBIDDEN");
        }
    }

    private static final String[] DIAS_SEMANA = {
            "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"
    };

    // dia_semana de las clases (LUNES..DOMINGO) → etiqueta legible del heatmap.
    private static final Map<String, String> DIA_CLASE_LABEL = Map.of(
            "LUNES", "Lunes", "MARTES", "Martes", "MIERCOLES", "Miércoles", "JUEVES", "Jueves",
            "VIERNES", "Viernes", "SABADO", "Sábado", "DOMINGO", "Domingo");

    // Ventana académica semanal de un aula: 07:00–22:00 × Lun–Sáb = 90 h/semana (denominador
    // del % de ocupación por aula; los horarios de UTEC dictan dentro de esa franja).
    private static final double VENTANA_SEMANAL_AULA = 15.0 * 6;

    /**
     * Analítica del ámbito AULAS (ADMIN + DOCENCIA): KPIs + 4 gráficas núcleo en un solo
     * payload. Las clases se filtran por ciclo exacto ("2026-1") o por año; los eventos de
     * aula usan el rango de fechas equivalente (mismos cortes de ciclo que el resto).
     */
    @Transactional(readOnly = true)
    @Cacheable(value = "analytics", key = "#root.methodName + '|' + #ciclo + '|' + #anio")
    public AulasAnalyticsResponse getAulasAnalytics(String ciclo, Integer anio) {
        String cicloParam = (ciclo == null || ciclo.isBlank()) ? null : ciclo;
        String anioParam = (cicloParam == null && anio != null) ? String.valueOf(anio) : null;

        Object[] kpis = aulaStatsRepository.kpisClases(cicloParam, anioParam).get(0);
        long totalClases = ((Number) kpis[0]).longValue();
        double horasSemanales = Math.round(((Number) kpis[1]).doubleValue() * 10) / 10.0;

        List<AulasAnalyticsResponse.OcupacionAula> ocupacion = aulaStatsRepository
                .horasPorAula(cicloParam, anioParam).stream()
                .map(r -> {
                    double horas = Math.round(((Number) r[3]).doubleValue() * 10) / 10.0;
                    return AulasAnalyticsResponse.OcupacionAula.builder()
                            .codigo((String) r[0]).tipo((String) r[1])
                            .piso(r[2] != null ? ((Number) r[2]).intValue() : null)
                            .horasSemana(horas)
                            .porcentaje(Math.round(horas / VENTANA_SEMANAL_AULA * 1000) / 10.0)
                            .build();
                }).toList();

        List<AulasAnalyticsResponse.TipoAmbiente> porTipo = aulaStatsRepository
                .clasesPorTipoAmbiente(cicloParam, anioParam).stream()
                .map(r -> AulasAnalyticsResponse.TipoAmbiente.builder()
                        .tipo((String) r[0])
                        .clases(((Number) r[1]).longValue())
                        .horasSemana(Math.round(((Number) r[2]).doubleValue() * 10) / 10.0)
                        .build())
                .toList();

        List<HeatmapCellResponse> heatmap = aulaStatsRepository.heatmapClases(cicloParam, anioParam).stream()
                .map(r -> HeatmapCellResponse.builder()
                        .dia(DIA_CLASE_LABEL.getOrDefault((String) r[0], (String) r[0]))
                        .hora(((Number) r[1]).intValue())
                        .cantidad(((Number) r[2]).longValue())
                        .build())
                .toList();

        // Eventos de aula: mismo corte temporal que el resto del dashboard (ciclo/año → rango).
        AnalyticsFilterRequest rango = AnalyticsFilterRequest.builder().ciclo(cicloParam).anio(anio).build();
        List<AulasAnalyticsResponse.EventoMes> eventosPorMes = aulaStatsRepository
                .eventosAulaPorMes(rango.getResolvedInicio(), rango.getResolvedFin()).stream()
                .map(r -> AulasAnalyticsResponse.EventoMes.builder()
                        .mes((String) r[0]).cantidad(((Number) r[1]).longValue()).build())
                .toList();

        return AulasAnalyticsResponse.builder()
                .totalClases(totalClases)
                .horasSemanales(horasSemanales)
                .aulasActivas(aulaRepository.countByActivoTrue())
                .totalEventos(eventosPorMes.stream().mapToLong(AulasAnalyticsResponse.EventoMes::getCantidad).sum())
                .ocupacionPorAula(ocupacion)
                .porTipoAmbiente(porTipo)
                .heatmap(heatmap)
                .eventosPorMes(eventosPorMes)
                .build();
    }

    /**
     * Años que tienen datos (reservas o bloqueos), para el filtro del dashboard.
     */
    @Transactional(readOnly = true)
    @Cacheable(value = "analytics", key = "#root.methodName")
    public java.util.List<Integer> getAniosConDatos() {
        return analyticsRepository.findAniosConDatos();
    }

    /**
     * Periodos "YYYY-C" con data analizable (para el filtro año + ciclo).
     */
    @Transactional(readOnly = true)
    @Cacheable(value = "analytics", key = "#root.methodName")
    public java.util.List<String> getPeriodosConDatos() {
        return analyticsRepository.findPeriodosConDatos();
    }

    /**
     * Dashboard completo con filtros.
     */
    @Transactional(readOnly = true)
    @Cacheable(value = "analytics", key = "#root.methodName + '|' + #filter")
    public DashboardFullResponse getDashboardFull(AnalyticsFilterRequest filter) {
        LocalDate inicio = filter.getResolvedInicio();
        LocalDate fin = filter.getResolvedFin();
        Long labId = filter.getLabId();
        String tipo = filter.getTipoReserva();
        String carrera = filter.getCarrera();

        // KPIs
        Integer total = analyticsRepository.countFiltered(inicio, fin, labId, tipo, carrera);
        Integer activas = analyticsRepository.countActivasFiltered(inicio, fin, labId, tipo, carrera);
        Integer canceladas = analyticsRepository.countCanceladasFiltered(inicio, fin, labId, tipo, carrera);
        Integer noShows = analyticsRepository.countNoShowsFiltered(inicio, fin, labId, tipo, carrera);
        Integer completadas = analyticsRepository.countCompletadasFiltered(inicio, fin, labId, tipo, carrera);

        // Por tipo de reserva
        Integer alumno = analyticsRepository.countByTipoReserva(inicio, fin, "ALUMNO", labId, carrera);
        // Los "eventos" son bloqueos (tabla `bloqueos`, ver bloqueoStats), nunca reservas;
        // la antigua query contaba reservas tipo BLOQUEO_* (siempre 0). Se mantiene la
        // segmentación con 0 para no alterar la forma de la respuesta.
        Integer evento = 0;

        // Tasas
        Double tasaAusentismo = total > 0 ? round((noShows.doubleValue() / total) * 100) : 0.0;
        Double tasaCancelacion = total > 0 ? round((canceladas.doubleValue() / total) * 100) : 0.0;

        // Ocupación por lab
        List<OcupacionResponse> ocupacion = getOcupacionPorLab(LocalDate.now(), labId);
        Double tasaOcupacion = ocupacion.isEmpty() ? 0.0 :
                round(ocupacion.stream().mapToDouble(OcupacionResponse::getPorcentajeOcupacion).average().orElse(0.0));

        // Bloqueos
        BloqueoStatsResponse bloqueoStats = getBloqueoStats(inicio, fin, labId);

        // Gráficos
        List<HeatmapCellResponse> heatmap = getHeatmap(inicio, fin, labId, tipo, carrera);
        List<ReservaPorHoraResponse> porHora = getPorHora(inicio, fin, labId, tipo, carrera);
        List<ReservaPorDiaResponse> porDia = getPorDia(inicio, fin, labId, tipo, carrera);
        List<ReservaPorMesResponse> porMes = getPorMes(inicio, fin, labId, tipo, carrera);
        // El gráfico por carrera muestra SIEMPRE todas las carreras (no se filtra por
        // la carrera seleccionada) para poder comparar y poblar el dropdown del filtro.
        List<ReservaPorCarreraResponse> porCarrera = getPorCarrera(inicio, fin, labId, tipo, null);

        // Descripción del filtro
        String desc = buildFilterDesc(filter, inicio, fin);

        return DashboardFullResponse.builder()
                .totalReservas(total)
                .reservasActivas(activas)
                .reservasCanceladas(canceladas)
                .noShows(noShows)
                .completadas(completadas)
                .tasaOcupacionGeneral(tasaOcupacion)
                .tasaAusentismo(tasaAusentismo)
                .tasaCancelacion(tasaCancelacion)
                .reservasAlumno(alumno)
                .reservasEvento(evento)
                .bloqueosParciales(bloqueoStats.getTotalParciales().intValue())
                .bloqueosTotales(bloqueoStats.getTotalTotales().intValue())
                .filtroDescripcion(desc)
                .ocupacionPorLaboratorio(ocupacion)
                .heatmap(heatmap)
                .reservasPorHora(porHora)
                .reservasPorDia(porDia)
                .reservasPorMes(porMes)
                .reservasPorCarrera(porCarrera)
                .bloqueoStats(bloqueoStats)
                .build();
    }

    /**
     * Bloqueos OPERATIVOS (ALMUERZO + MANTENIMIENTO + FERIADO): cantidad por lab, por mes e
     * historial. Estos motivos se excluyen del resto del dashboard; aquí se muestran aparte.
     */
    @Transactional(readOnly = true)
    @Cacheable(value = "analytics", key = "#root.methodName + '|' + #filter")
    public OperativosResponse getOperativos(AnalyticsFilterRequest filter) {
        LocalDate inicio = filter.getResolvedInicio();
        LocalDate fin = filter.getResolvedFin();
        Long labId = filter.getLabId();

        // Por laboratorio: pivota (lab, motivo, cantidad) → {mantenimiento, almuerzo, feriado, total}.
        Map<String, OperativosResponse.PorLab> porLabMap = new LinkedHashMap<>();
        for (Object[] r : operativoStatsRepository.countPorLabYMotivo(inicio, fin, labId)) {
            String lab = (String) r[0];
            OperativosResponse.PorLab fila = porLabMap.computeIfAbsent(lab,
                    k -> OperativosResponse.PorLab.builder().laboratorio(k).build());
            aplicarMotivo(asString(r[1]), num(r[2]), fila::setMantenimiento, fila::setAlmuerzo, fila::setFeriado, fila::setRetiro, fila);
        }
        List<OperativosResponse.PorLab> porLab = new ArrayList<>(porLabMap.values());
        porLab.sort((a, b) -> Integer.compare(b.getTotal(), a.getTotal()));   // más intervenido primero

        // Por mes: pivota (mes, motivo, cantidad). El orden ya viene ascendente del repo.
        Map<String, OperativosResponse.PorMes> porMesMap = new LinkedHashMap<>();
        for (Object[] r : operativoStatsRepository.countPorMesYMotivo(inicio, fin, labId)) {
            String mes = (String) r[0];
            OperativosResponse.PorMes fila = porMesMap.computeIfAbsent(mes,
                    k -> OperativosResponse.PorMes.builder().mes(k).build());
            aplicarMotivo(asString(r[1]), num(r[2]), fila::setMantenimiento, fila::setAlmuerzo, fila::setFeriado, fila::setRetiro, fila);
        }
        List<OperativosResponse.PorMes> porMes = new ArrayList<>(porMesMap.values());

        // Historial detallado.
        List<OperativosResponse.Historial> historial = new ArrayList<>();
        for (Object[] r : operativoStatsRepository.historial(inicio, fin, labId)) {
            historial.add(OperativosResponse.Historial.builder()
                    .id(num(r[0]).longValue())
                    .laboratorio((String) r[1])
                    .motivo(asString(r[2]))
                    .tipo(asString(r[3]))
                    .fecha(r[4] != null ? r[4].toString() : null)
                    .horaInicio(hhmm(r[5]))
                    .horaFin(hhmm(r[6]))
                    .recursos((String) r[7])
                    .descripcion((String) r[8])
                    .build());
        }

        int totalMant = porLab.stream().mapToInt(OperativosResponse.PorLab::getMantenimiento).sum();
        int totalAlm = porLab.stream().mapToInt(OperativosResponse.PorLab::getAlmuerzo).sum();
        int totalFer = porLab.stream().mapToInt(OperativosResponse.PorLab::getFeriado).sum();
        int totalRet = porLab.stream().mapToInt(OperativosResponse.PorLab::getRetiro).sum();

        // Cierres institucionales (todo UTEC) del periodo: son excepciones de calendario, no
        // bloqueos por-lab. Se listan aparte con sus días (acotados al periodo). El total es de
        // días DISTINTOS (dedup por si dos cierres se solapan).
        List<OperativosResponse.Cierre> cierres = new ArrayList<>();
        Set<LocalDate> diasCierre = new HashSet<>();
        for (CicloExcepcion e : cicloExcepcionRepository.findCierresEnRango(inicio, fin)) {
            LocalDate ini = e.getFechaInicio().isBefore(inicio) ? inicio : e.getFechaInicio();
            LocalDate f = e.getFechaFin().isAfter(fin) ? fin : e.getFechaFin();
            int dias = 0;
            for (LocalDate d = ini; !d.isAfter(f); d = d.plusDays(1)) { diasCierre.add(d); dias++; }
            cierres.add(OperativosResponse.Cierre.builder()
                    .fechaInicio(e.getFechaInicio().toString()).fechaFin(e.getFechaFin().toString())
                    .descripcion(e.getDescripcion()).dias(dias).build());
        }
        cierres.sort((a, b) -> a.getFechaInicio().compareTo(b.getFechaInicio()));

        return OperativosResponse.builder()
                .porLaboratorio(porLab)
                .porMes(porMes)
                .historial(historial)
                .totalMantenimiento(totalMant)
                .totalAlmuerzo(totalAlm)
                .totalFeriado(totalFer)
                .totalRetiro(totalRet)
                .cierres(cierres)
                .totalDiasCierre(diasCierre.size())
                .build();
    }

    /**
     * Insights extra: horas reservadas por laboratorio (ocupación real del periodo) y
     * distribución del tamaño de grupo (participantes por reserva). Respeta los filtros.
     */
    @Transactional(readOnly = true)
    @Cacheable(value = "analytics", key = "#root.methodName + '|' + #filter")
    public InsightsResponse getInsights(AnalyticsFilterRequest filter) {
        LocalDate inicio = filter.getResolvedInicio();
        LocalDate fin = filter.getResolvedFin();
        Long labId = filter.getLabId();
        String tipo = filter.getTipoReserva();
        String carrera = filter.getCarrera();

        // % de ocupación por lab = (horas reservadas + horas de EVENTOS) / (capacidad − horas
        // OPERATIVAS). Los eventos (clase/examen/evento) son USO del lab; los operativos
        // (mantenimiento/almuerzo/feriado) son downtime y se descuentan de la capacidad porque
        // no estaban disponibles para reservar. El periodo se acota al RANGO REAL de datos (en
        // "Histórico completo" el filtro es 2000–2030 y el denominador se dispararía → ~0%).
        // Capacidad = mesas × horario/día × días de atención (aprox. proporcional |diasAtencion|/7).
        List<Object[]> rango = analyticsRepository.rangoFechasReservas(inicio, fin);
        LocalDate effIni = !rango.isEmpty() ? toLocalDate(rango.get(0)[0]) : null;
        LocalDate effFin = !rango.isEmpty() ? toLocalDate(rango.get(0)[1]) : null;
        long totalDias = (effIni != null && effFin != null) ? ChronoUnit.DAYS.between(effIni, effFin) + 1 : 0;

        // Dashboard INDEPENDIENTE de activo/inactivo: se consideran TODOS los labs (findAll), no
        // solo los ACTIVO. Así aparecen todos los que tienen data (clases/eventos/reservas).
        Map<String, Laboratorio> labs = new HashMap<>();
        for (Laboratorio l : laboratorioRepository.findAll()) labs.put(l.getCodigoLab(), l);

        // Horas bloqueadas (operativas / eventos) por lab en el periodo efectivo.
        Map<String, double[]> bloq = new HashMap<>();   // codigoLab → [operativas, eventos]
        Map<String, Double> clasesPorLab = new HashMap<>();   // codigoLab → horas de clase (recurrentes)
        if (effIni != null) {
            for (Object[] b : analyticsRepository.horasBloqueadasPorLab(effIni, effFin, labId)) {
                bloq.put((String) b[0], new double[]{
                        b[1] != null ? ((Number) b[1]).doubleValue() : 0.0,
                        b[2] != null ? ((Number) b[2]).doubleValue() : 0.0});
            }
            for (Object[] c : analyticsRepository.horasClasePorLab(effIni, effFin, labId)) {
                clasesPorLab.put((String) c[0], c[1] != null ? ((Number) c[1]).doubleValue() : 0.0);
            }
        }

        // Días de CIERRE institucional dentro del periodo (feriado que cierra TODO UTEC): esos
        // días el lab no estaba disponible → se descuentan de la capacidad (downtime), igual que
        // los feriados/mantenimiento pero de forma GENERAL. Se usa un Set para no doble-contar
        // rangos de CIERRE solapados. La resta por lab es proporcional a sus días de atención.
        Set<LocalDate> cierreFechas = new HashSet<>();
        if (effIni != null) {
            for (CicloExcepcion e : cicloExcepcionRepository.findCierresEnRango(effIni, effFin)) {
                LocalDate d = e.getFechaInicio().isBefore(effIni) ? effIni : e.getFechaInicio();
                LocalDate hasta = e.getFechaFin().isAfter(effFin) ? effFin : e.getFechaFin();
                for (; !d.isAfter(hasta); d = d.plusDays(1)) cierreFechas.add(d);
            }
        }
        int cierreDias = cierreFechas.size();

        List<InsightsResponse.LabOcupacion> ocup = new ArrayList<>();
        for (Object[] r : analyticsRepository.horasReservadasPorLab(inicio, fin, labId, tipo, carrera)) {
            String cod = (String) r[0];
            double reservadas = r[1] != null ? ((Number) r[1]).doubleValue() : 0.0;
            Laboratorio l = labs.get(cod);
            double capacidadBruta = 0.0;   // capacidad teórica antes de descontar cualquier downtime
            double horasCierre = 0.0;      // horas-mesa perdidas por CIERRE institucional (todo UTEC)
            // mesas = max(recursos, 1): los labs DOCENTES no tienen mesas reservables (solo se usan
            // para clases). Se cuentan como UNA sala para que su capacidad no sea 0 y las clases
            // puedan expresarse como % (una clase ocupa todo el lab). Los labs de reserva usan sus
            // mesas reales (max(12,1)=12), sin cambio.
            int mesas = l != null ? Math.max(recursoLabRepository.countByLaboratorioId(l.getId()), 1) : 1;
            if (l != null && totalDias > 0 && l.getHoraApertura() != null && l.getHoraCierre() != null) {
                double horasDia = ChronoUnit.MINUTES.between(l.getHoraApertura(), l.getHoraCierre()) / 60.0;
                int diasSemana = (l.getDiasAtencion() != null && !l.getDiasAtencion().isEmpty()) ? l.getDiasAtencion().size() : 7;
                capacidadBruta = mesas * horasDia * (totalDias * diasSemana / 7.0);
                // CIERRES institucionales: proporcional a los días de atención del lab (un cierre en un
                // día que el lab no abría no le quita capacidad). Se acota a la capacidad bruta.
                if (cierreDias > 0)
                    horasCierre = Math.min(capacidadBruta, mesas * horasDia * (cierreDias * diasSemana / 7.0));
            }
            // Capacidad NETA (denominador del % de ocupación): descuenta los días de cierre (downtime),
            // igual que los operativos, para que el cierre NO penalice la utilización (% neto).
            double capacidadTeorica = Math.max(0.0, capacidadBruta - horasCierre);
            // Horas de bloqueo YA RECORTADAS a la ventana del lab (ver horasBloqueadasPorLab).
            double[] hb = bloq.getOrDefault(cod, new double[]{0.0, 0.0});
            double operativas = hb[0], eventos = hb[1];
            // Las clases del query son a nivel de SALA (una clase ocupa todo el lab); se escalan a
            // mesa-hora (× mesas) para ser coherentes con la capacidad y con reservas/eventos.
            double clases = clasesPorLab.getOrDefault(cod, 0.0) * mesas;
            // Modelo OEE: separamos DISPONIBILIDAD (uptime) de UTILIZACIÓN (uso del tiempo disponible).
            //  - Los OPERATIVOS (mantenimiento/almuerzo/feriado) son CIERRE (downtime): el lab no estaba
            //    disponible, así que se EXCLUYEN de la capacidad (denominador) → ocupación NETA. No
            //    penaliza al lab por feriados. Se reportan aparte como % cerrado (porcentajeCerrado).
            //  - Las CLASES del horario académico son USO del lab (como los eventos), pero se cuentan
            //    APARTE (categoría propia) para poder distinguirlas en la gráfica.
            //  - Vista "Solo reservas": la capacidad reservable excluye ADEMÁS eventos y clases (ahí el
            //    alumno no puede reservar); numerador = solo reservas.
            //  - "Todo"/"Solo bloqueos": numerador = reservas + eventos + clases (uso total).
            boolean soloReservas = Boolean.TRUE.equals(filter.getSoloReservas());
            double usadas = soloReservas ? reservadas : reservadas + eventos + clases;
            double disponible = Math.max(0.0, capacidadTeorica - operativas - (soloReservas ? eventos + clases : 0.0));
            double pct = disponible > 0 ? Math.min(100.0, round(usadas / disponible * 100)) : 0.0;
            double pctReservas = disponible > 0 ? round(reservadas / disponible * 100) : 0.0;
            double pctEventos = disponible > 0 && !soloReservas ? round(eventos / disponible * 100) : 0.0;
            double pctClases = disponible > 0 && !soloReservas ? round(clases / disponible * 100) : 0.0;
            // DISPONIBILIDAD (downtime): operativos y CIERRE institucional se miden contra la capacidad
            // BRUTA (antes de descontar nada) para que sean sumables entre sí y comparables entre labs.
            double pctCerrado = capacidadBruta > 0 ? Math.min(100.0, round(operativas / capacidadBruta * 100)) : 0.0;
            double pctCierre = capacidadBruta > 0 ? Math.min(100.0, round(horasCierre / capacidadBruta * 100)) : 0.0;
            ocup.add(InsightsResponse.LabOcupacion.builder()
                    .codigoLab(cod).horasReservadas(round(reservadas)).horasEventos(round(eventos))
                    .horasClases(round(clases))
                    .horasOperativas(round(operativas)).horasCierre(round(horasCierre))
                    .capacidadTotal(round(capacidadBruta))
                    .horasDisponibles(round(disponible)).porcentaje(pct)
                    .porcentajeReservas(pctReservas).porcentajeEventos(pctEventos).porcentajeClases(pctClases)
                    .porcentajeCerrado(pctCerrado).porcentajeCierre(pctCierre).build());
        }
        ocup.sort((a, b) -> Double.compare(b.getPorcentaje(), a.getPorcentaje())); // más aprovechado primero

        List<InsightsResponse.GrupoTamano> grupos = analyticsRepository
                .tamanoGrupo(inicio, fin, labId, tipo, carrera).stream()
                .map(r -> InsightsResponse.GrupoTamano.builder()
                        .participantes(((Number) r[0]).intValue())
                        .cantidad(((Number) r[1]).longValue())
                        .build())
                .toList();

        List<InsightsResponse.CruceCarreraLab> cruce = analyticsRepository
                .countPorCarreraYLab(inicio, fin, labId, tipo, carrera).stream()
                .map(r -> InsightsResponse.CruceCarreraLab.builder()
                        .carrera((String) r[0]).codigoLab((String) r[1])
                        .cantidad(((Number) r[2]).longValue()).build())
                .toList();

        return InsightsResponse.builder().ocupacionPorLab(ocup).tamanoGrupo(grupos)
                .cruceCarreraLab(cruce).build();
    }

    /**
     * Resumen EJECUTIVO: comparación contra el periodo anterior + insights narrativos +
     * procedencia de datos. Pensado para dirección (rector/decanos/directores).
     */
    @Transactional(readOnly = true)
    @Cacheable(value = "analytics", key = "#root.methodName + '|' + #filter")
    public ResumenEjecutivoResponse getResumenEjecutivo(AnalyticsFilterRequest filter) {
        LocalDate inicio = filter.getResolvedInicio();
        LocalDate fin = filter.getResolvedFin();
        Long labId = filter.getLabId();
        String tipo = filter.getTipoReserva();
        String carrera = filter.getCarrera();

        // ── Métricas del periodo actual ──
        int total = safe(analyticsRepository.countFiltered(inicio, fin, labId, tipo, carrera));
        int completadas = safe(analyticsRepository.countCompletadasFiltered(inicio, fin, labId, tipo, carrera));
        double aprovechamiento = total > 0 ? round(completadas * 100.0 / total) : 0.0;
        List<InsightsResponse.LabOcupacion> ocupActual = getInsights(filter).getOcupacionPorLab();
        double ocupacion = promedioOcupacion(ocupActual);

        // ── Comparación contra el periodo anterior (si existe) ──
        AnalyticsFilterRequest prev = periodoAnterior(filter);
        ResumenEjecutivoResponse.Comparacion comparacion = null;
        Double deltaReservasPct = null;
        if (prev != null) {
            LocalDate pIni = prev.getResolvedInicio(), pFin = prev.getResolvedFin();
            int pTotal = safe(analyticsRepository.countFiltered(pIni, pFin, labId, tipo, carrera));
            int pComplet = safe(analyticsRepository.countCompletadasFiltered(pIni, pFin, labId, tipo, carrera));
            double pAprov = pTotal > 0 ? round(pComplet * 100.0 / pTotal) : 0.0;
            double pOcup = promedioOcupacion(getInsights(prev).getOcupacionPorLab());

            List<ResumenEjecutivoResponse.Metrica> metricas = List.of(
                    metrica("Reservas", total, pTotal, ""),
                    metrica("Completadas", completadas, pComplet, ""),
                    metrica("Aprovechamiento", aprovechamiento, pAprov, "%"),
                    metrica("Ocupación", ocupacion, pOcup, "%"));
            deltaReservasPct = metricas.get(0).getDeltaPct();
            comparacion = ResumenEjecutivoResponse.Comparacion.builder()
                    .periodoActual(etiquetaPeriodo(filter))
                    .periodoAnterior(etiquetaPeriodo(prev))
                    .metricas(metricas).build();
        }

        // ── Insights narrativos ──
        List<ResumenEjecutivoResponse.Insight> insights = construirInsights(
                filter, inicio, fin, labId, tipo, carrera,
                total, aprovechamiento, ocupActual, comparacion, deltaReservasPct);

        // ── Procedencia ──
        List<Object[]> rango = analyticsRepository.rangoFechasReservas(inicio, fin);
        String rIni = null, rFin = null;
        if (!rango.isEmpty() && rango.get(0)[0] != null) {
            rIni = toLocalDate(rango.get(0)[0]).toString();
            rFin = toLocalDate(rango.get(0)[1]).toString();
        }
        ResumenEjecutivoResponse.Procedencia procedencia = ResumenEjecutivoResponse.Procedencia.builder()
                .fuente("Affluences (histórico importado) + reservas en vivo del sistema")
                .rangoInicio(rIni).rangoFin(rFin)
                .corte(LocalDate.now().toString())
                .totalRegistros(total)
                .labsConDatos(safe(analyticsRepository.countLabsConReservas(inicio, fin, labId, tipo, carrera)))
                .build();

        return ResumenEjecutivoResponse.builder()
                .comparacion(comparacion).insights(insights).procedencia(procedencia).build();
    }

    private List<ResumenEjecutivoResponse.Insight> construirInsights(
            AnalyticsFilterRequest filter, LocalDate inicio, LocalDate fin, Long labId, String tipo, String carrera,
            int total, double aprovechamiento, List<InsightsResponse.LabOcupacion> ocup,
            ResumenEjecutivoResponse.Comparacion comparacion, Double deltaReservasPct) {

        List<ResumenEjecutivoResponse.Insight> out = new ArrayList<>();
        if (total == 0) {
            out.add(insight("No hay reservas en el periodo seleccionado.", "neutro"));
            return out;
        }

        // 1) Variación vs periodo anterior
        if (comparacion != null && deltaReservasPct != null) {
            boolean sube = deltaReservasPct >= 0;
            out.add(insight(String.format(
                    "Las reservas %s %s%% respecto a %s (%d → %d).",
                    sube ? "subieron" : "bajaron", fmt(Math.abs(deltaReservasPct)),
                    comparacion.getPeriodoAnterior(),
                    (int) comparacion.getMetricas().get(0).getAnterior(), total),
                    sube ? "positivo" : "negativo"));
        }

        // 2) Aprovechamiento (check-in real)
        out.add(insight(String.format(
                "El %s%% de las reservas terminó en check-in (uso real confirmado).", fmt(aprovechamiento)),
                aprovechamiento >= 70 ? "positivo" : aprovechamiento < 40 ? "negativo" : "neutro"));

        // 3) Lab más aprovechado vs más ocioso (solo si hay ≥2 labs y no se filtró a uno)
        if (labId == null && ocup.size() >= 2) {
            InsightsResponse.LabOcupacion top = ocup.get(0);
            InsightsResponse.LabOcupacion bottom = ocup.get(ocup.size() - 1);
            out.add(insight(String.format(
                    "%s es el laboratorio más aprovechado (%s%%); %s el más ocioso (%s%%).",
                    top.getCodigoLab(), fmt(top.getPorcentaje()),
                    bottom.getCodigoLab(), fmt(bottom.getPorcentaje())),
                    "neutro"));
        }

        // 4) Día de la semana con más demanda
        Map<String, Long> porDia = new LinkedHashMap<>();
        for (HeatmapCellResponse c : getHeatmap(inicio, fin, labId, tipo, carrera))
            porDia.merge(c.getDia(), c.getCantidad(), Long::sum);
        porDia.entrySet().stream().max(Map.Entry.comparingByValue()).ifPresent(e ->
                out.add(insight(String.format("Los %s concentran la mayor demanda de reservas.", e.getKey().toLowerCase()), "neutro")));

        // 5) Franja horaria pico
        getPorHora(inicio, fin, labId, tipo, carrera).stream()
                .max((a, b) -> Long.compare(a.getCantidad(), b.getCantidad()))
                .ifPresent(h -> out.add(insight(String.format("La franja de mayor uso empieza a las %s.", h.getHora()), "neutro")));

        // 6) Carrera líder (dato único de Affluences)
        if (carrera == null) {
            getPorCarrera(inicio, fin, labId, tipo, null).stream().findFirst().ifPresent(c ->
                    out.add(insight(String.format("%s lidera las reservas (%d).", c.getCarrera(), c.getCantidad()), "neutro")));
        }
        return out;
    }

    /** Promedio del % de ocupación de los labs (0 si no hay). */
    private double promedioOcupacion(List<InsightsResponse.LabOcupacion> ocup) {
        return ocup.isEmpty() ? 0.0 :
                round(ocup.stream().mapToDouble(InsightsResponse.LabOcupacion::getPorcentaje).average().orElse(0.0));
    }

    /** Construye la métrica con su Δ% y dirección. */
    private ResumenEjecutivoResponse.Metrica metrica(String etiqueta, double actual, double anterior, String unidad) {
        Double deltaPct = anterior != 0 ? round((actual - anterior) / anterior * 100) : null;
        String dir = actual > anterior ? "sube" : actual < anterior ? "baja" : "igual";
        return ResumenEjecutivoResponse.Metrica.builder()
                .etiqueta(etiqueta).actual(round(actual)).anterior(round(anterior))
                .deltaPct(deltaPct).direccion(dir).unidad(unidad).build();
    }

    /**
     * Filtro del PERIODO ANTERIOR equivalente, o null si no hay uno comparable:
     *  - ciclo YYYY-C → mismo ciclo del año anterior;
     *  - año Y → año Y-1;
     *  - rango de fechas libre → ventana inmediatamente anterior de igual longitud;
     *  - sin filtro temporal (histórico completo) → null.
     */
    private AnalyticsFilterRequest periodoAnterior(AnalyticsFilterRequest f) {
        AnalyticsFilterRequest.AnalyticsFilterRequestBuilder b = AnalyticsFilterRequest.builder()
                .labId(f.getLabId()).tipoReserva(f.getTipoReserva()).carrera(f.getCarrera());
        if (f.getCiclo() != null && f.getCiclo().matches("\\d{4}-[012]")) {
            String[] p = f.getCiclo().split("-");
            return b.ciclo((Integer.parseInt(p[0]) - 1) + "-" + p[1]).build();
        }
        if (f.getAnio() != null) return b.anio(f.getAnio() - 1).build();
        if (f.getFechaInicio() != null && f.getFechaFin() != null) {
            long dias = ChronoUnit.DAYS.between(f.getFechaInicio(), f.getFechaFin()) + 1;
            LocalDate pFin = f.getFechaInicio().minusDays(1);
            return b.fechaInicio(pFin.minusDays(dias - 1)).fechaFin(pFin).build();
        }
        return null;
    }

    private String etiquetaPeriodo(AnalyticsFilterRequest f) {
        if (f.getCiclo() != null) return "Ciclo " + f.getCiclo();
        if (f.getAnio() != null) return "Año " + f.getAnio();
        if (f.getFechaInicio() != null && f.getFechaFin() != null) return f.getFechaInicio() + " — " + f.getFechaFin();
        return "Histórico completo";
    }

    private static int safe(Integer v) { return v != null ? v : 0; }
    private static String fmt(double v) { double r = Math.round(v * 10) / 10.0; return r == Math.floor(r) ? String.valueOf((long) r) : String.valueOf(r); }
    private static ResumenEjecutivoResponse.Insight insight(String t, String tipo) {
        return ResumenEjecutivoResponse.Insight.builder().texto(t).tipo(tipo).build();
    }

    // Convierte el valor de fecha de una query nativa (java.sql.Date o LocalDate) a LocalDate.
    private static LocalDate toLocalDate(Object o) {
        if (o == null) return null;
        if (o instanceof java.sql.Date d) return d.toLocalDate();
        if (o instanceof LocalDate ld) return ld;
        return LocalDate.parse(o.toString());
    }

    // Suma `cantidad` al campo correcto (MANTENIMIENTO/ALMUERZO/FERIADO) y recalcula el total de la fila.
    private void aplicarMotivo(String motivo, Number cantidad, java.util.function.IntConsumer setMant,
                               java.util.function.IntConsumer setAlm, java.util.function.IntConsumer setFer,
                               java.util.function.IntConsumer setRet, Object fila) {
        int c = cantidad != null ? cantidad.intValue() : 0;
        if ("MANTENIMIENTO".equalsIgnoreCase(motivo)) setMant.accept(c);
        else if ("ALMUERZO".equalsIgnoreCase(motivo)) setAlm.accept(c);
        else if ("FERIADO".equalsIgnoreCase(motivo)) setFer.accept(c);
        else if ("RETIRO".equalsIgnoreCase(motivo)) setRet.accept(c);
        if (fila instanceof OperativosResponse.PorLab f) f.setTotal(f.getMantenimiento() + f.getAlmuerzo() + f.getFeriado() + f.getRetiro());
        else if (fila instanceof OperativosResponse.PorMes f) f.setTotal(f.getMantenimiento() + f.getAlmuerzo() + f.getFeriado() + f.getRetiro());
    }

    private static String asString(Object o) { return o != null ? o.toString() : null; }
    private static Number num(Object o) { return o instanceof Number n ? n : 0; }
    private static String hhmm(Object t) { return t != null ? t.toString().substring(0, 5) : null; }

    /**
     * KPIs en vivo (día actual, sin filtros).
     */
    @Transactional(readOnly = true)
    @Cacheable(value = "analytics", key = "#root.methodName")
    public KpiResponse getDashboardHoy() {
        LocalDate hoy = LocalDate.now();
        Integer totalHoy = analyticsRepository.countByFecha(hoy);
        Integer activas = analyticsRepository.countActivasByFecha(hoy);
        Integer canceladas = analyticsRepository.countCanceladasFiltered(hoy, hoy, null, null, null);
        Integer noShows = analyticsRepository.countNoShowsFiltered(hoy, hoy, null, null, null);

        List<OcupacionResponse> ocupacion = getOcupacionPorLab(hoy, null);
        Double tasaOcupacion = ocupacion.isEmpty() ? 0.0 :
                round(ocupacion.stream().mapToDouble(OcupacionResponse::getPorcentajeOcupacion).average().orElse(0.0));
        Double tasaAusentismo = totalHoy > 0 ? round((noShows.doubleValue() / totalHoy) * 100) : 0.0;

        return KpiResponse.builder()
                .totalReservasHoy(totalHoy).reservasActivas(activas)
                .reservasCanceladas(canceladas).noShows(noShows)
                .tasaOcupacionGeneral(tasaOcupacion).tasaAusentismo(tasaAusentismo)
                .ocupacionPorLaboratorio(ocupacion).build();
    }

    // ─── Ocupación ───
    private List<OcupacionResponse> getOcupacionPorLab(LocalDate fecha, Long labId) {
        List<Laboratorio> labs = labId != null
                ? laboratorioRepository.findById(labId).map(List::of).orElse(List.of())
                : laboratorioRepository.findAll();   // independiente de activo/inactivo

        return labs.stream().map(lab -> {
            Integer totalRecursos = recursoLabRepository.countByLaboratorioId(lab.getId());
            int ocupados = analyticsRepository.findActivasByLabAndFecha(lab.getId(), fecha).size();
            double pct = totalRecursos > 0 ? round((ocupados * 100.0) / totalRecursos) : 0.0;
            return OcupacionResponse.builder()
                    .codigoLab(lab.getCodigoLab()).laboratorioNombre(lab.getNombre())
                    .totalRecursos(totalRecursos).recursosOcupados(ocupados)
                    .recursosDisponibles(totalRecursos - ocupados).porcentajeOcupacion(pct).build();
        }).toList();
    }

    // ─── Heatmap ───
    private List<HeatmapCellResponse> getHeatmap(LocalDate inicio, LocalDate fin, Long labId, String tipo, String carrera) {
        return analyticsRepository.countHeatmapFiltered(inicio, fin, labId, tipo, carrera).stream()
                .map(row -> HeatmapCellResponse.builder()
                        .dia(DIAS_SEMANA[((Number) row[0]).intValue()])
                        .hora(((Number) row[1]).intValue())
                        .cantidad(((Number) row[2]).longValue()).build())
                .toList();
    }

    // ─── Por hora ───
    private List<ReservaPorHoraResponse> getPorHora(LocalDate inicio, LocalDate fin, Long labId, String tipo, String carrera) {
        return analyticsRepository.countPorHoraFiltered(inicio, fin, labId, tipo, carrera).stream()
                .map(row -> ReservaPorHoraResponse.builder()
                        .hora(((Number) row[0]).intValue() + ":00")
                        .cantidad(((Number) row[1]).longValue()).build())
                .toList();
    }

    // ─── Por día ───
    private List<ReservaPorDiaResponse> getPorDia(LocalDate inicio, LocalDate fin, Long labId, String tipo, String carrera) {
        return analyticsRepository.countPorDiaFiltered(inicio, fin, labId, tipo, carrera).stream()
                .map(row -> ReservaPorDiaResponse.builder()
                        .fecha(row[0].toString()).total(((Number) row[1]).longValue())
                        .completadas(((Number) row[2]).longValue()).canceladas(((Number) row[3]).longValue())
                        .noShows(((Number) row[4]).longValue()).build())
                .toList();
    }

    // ─── Por mes ───
    private List<ReservaPorMesResponse> getPorMes(LocalDate inicio, LocalDate fin, Long labId, String tipo, String carrera) {
        return analyticsRepository.countPorMesFiltered(inicio, fin, labId, tipo, carrera).stream()
                .map(row -> ReservaPorMesResponse.builder()
                        .mes(row[0].toString()).total(((Number) row[1]).longValue())
                        .completadas(((Number) row[2]).longValue()).canceladas(((Number) row[3]).longValue())
                        .noShows(((Number) row[4]).longValue()).build())
                .toList();
    }

    // ─── Por carrera ───
    private List<ReservaPorCarreraResponse> getPorCarrera(LocalDate inicio, LocalDate fin, Long labId, String tipo, String carrera) {
        return analyticsRepository.countPorCarreraFiltered(inicio, fin, labId, tipo, carrera).stream()
                .map(row -> ReservaPorCarreraResponse.builder()
                        .carrera((String) row[0])
                        .cantidad(((Number) row[1]).longValue()).build())
                .toList();
    }

    // ─── Bloqueos ───
    private BloqueoStatsResponse getBloqueoStats(LocalDate inicio, LocalDate fin, Long labId) {
        return BloqueoStatsResponse.builder()
                .totalParciales(bloqueoStatsRepository.countParcialesFiltered(inicio, fin, labId))
                .totalTotales(bloqueoStatsRepository.countTotalesFiltered(inicio, fin, labId))
                .laboratorioMasBloqueado(bloqueoStatsRepository.findLabMasBloqueado(inicio, fin, labId))
                .motivoMasFrecuente(bloqueoStatsRepository.findMotivoMasFrecuente(inicio, fin, labId))
                .build();
    }

    // ─── Tabla exportable ───
    @Transactional(readOnly = true)
    @Cacheable(value = "analytics", key = "#root.methodName + '|' + #filter")
    public List<ReservaDetalleExportResponse> getTablaReservas(AnalyticsFilterRequest filter) {
        LocalDate inicio = filter.getResolvedInicio();
        LocalDate fin = filter.getResolvedFin();

        return analyticsRepository.findAllFiltered(inicio, fin, filter.getLabId(), filter.getTipoReserva(), filter.getCarrera())
                .stream().map(r -> ReservaDetalleExportResponse.builder()
                        .id(r.getId()).fecha(r.getFecha().toString())
                        .horaInicio(r.getHoraInicio().toString()).horaFin(r.getHoraFin().toString())
                        .estado(r.getEstado())
                        .laboratorioCodigo(r.getRecurso().getLaboratorio().getCodigoLab())
                        .laboratorioNombre(r.getRecurso().getLaboratorio().getNombre())
                        .recursoNombre(r.getRecurso().getNombre()).recursoTipo(r.getRecurso().getTipo())
                        .usuarioNombre(r.getUsuario().getNombres() + " " + r.getUsuario().getApellidos())
                        .usuarioCorreo(r.getUsuario().getCorreoUtec())
                        .participantes(r.getParticipantes()).tipoReserva(r.getTipoReserva())
                        .carrera(r.getCarrera()).build())
                .toList();
    }

    // ─── Helpers ───
    private Double round(double val) { return Math.round(val * 100.0) / 100.0; }

    private String buildFilterDesc(AnalyticsFilterRequest f, LocalDate inicio, LocalDate fin) {
        StringBuilder sb = new StringBuilder();
        boolean sinRango = f.getFechaInicio() == null && f.getFechaFin() == null
                && f.getCiclo() == null && f.getAnio() == null;
        if (sinRango) {
            sb.append("Histórico completo");
        } else {
            sb.append(inicio).append(" — ").append(fin);
        }
        if (f.getCiclo() != null) sb.append(" | Ciclo ").append(f.getCiclo());
        if (f.getAnio() != null) sb.append(" | Año ").append(f.getAnio());
        if (f.getLabId() != null) {
            laboratorioRepository.findById(f.getLabId())
                    .ifPresent(lab -> sb.append(" | ").append(lab.getCodigoLab()));
        }
        if (f.getTipoReserva() != null) sb.append(" | Tipo: ").append(f.getTipoReserva());
        return sb.toString();
    }
}
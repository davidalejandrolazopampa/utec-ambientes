package pe.edu.utec.reservas.modules.analytics;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.utec.reservas.modules.analytics.dto.AnalyticsFilterRequest;
import pe.edu.utec.reservas.modules.analytics.service.AnalyticsService;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class AnalyticsServiceTest {

    @Autowired private AnalyticsService analyticsService;
    @Autowired private pe.edu.utec.reservas.modules.iam.repository.RoleRepository roleRepository;
    @Autowired private pe.edu.utec.reservas.modules.iam.repository.UsuarioRepository usuarioRepository;
    @Autowired private pe.edu.utec.reservas.modules.laboratorios.repository.LaboratorioRepository laboratorioRepository;
    @Autowired private pe.edu.utec.reservas.modules.aulas.repository.AulaRepository aulaRepository;
    @Autowired private pe.edu.utec.reservas.modules.bloqueos.repository.BloqueoRepository bloqueoRepository;
    @Autowired private pe.edu.utec.reservas.modules.aulas.repository.CicloExcepcionRepository excepcionRepository;
    @Autowired private jakarta.persistence.EntityManager entityManager;

    @Test
    @DisplayName("getDashboardHoy no falla y devuelve KPIs")
    void dashboardHoy() {
        assertNotNull(analyticsService.getDashboardHoy());
    }

    @Test
    @DisplayName("getDashboardFull sin filtros = histórico completo (global)")
    void dashboardFullDefaults() {
        var resp = analyticsService.getDashboardFull(new AnalyticsFilterRequest());
        assertNotNull(resp);
        // Sin filtro de fecha/ciclo/año el rango debe ser histórico completo, no "últimos 30 días"
        assertEquals("Histórico completo", resp.getFiltroDescripcion());
    }

    @Test
    @DisplayName("AnalyticsFilterRequest sin filtros resuelve a rango histórico completo")
    void filtroSinRangoEsHistorico() {
        AnalyticsFilterRequest f = new AnalyticsFilterRequest();
        assertEquals(java.time.LocalDate.of(2000, 1, 1), f.getResolvedInicio());
        assertTrue(f.getResolvedFin().isAfter(java.time.LocalDate.now()));
    }

    @Test
    @DisplayName("getDashboardFull resolviendo el rango por año")
    void dashboardFullPorAnio() {
        AnalyticsFilterRequest f = new AnalyticsFilterRequest();
        f.setAnio(2026);
        f.setTipoReserva("ALUMNO");
        assertNotNull(analyticsService.getDashboardFull(f));
    }

    @Test
    @DisplayName("getDashboardFull resolviendo el rango por ciclo")
    void dashboardFullPorCiclo() {
        AnalyticsFilterRequest f = new AnalyticsFilterRequest();
        f.setCiclo("2026-1");
        assertNotNull(analyticsService.getDashboardFull(f));
    }

    @Test
    @DisplayName("getTablaReservas no falla")
    void tablaReservas() {
        AnalyticsFilterRequest f = new AnalyticsFilterRequest();
        f.setTipoReserva("ALUMNO");
        assertNotNull(analyticsService.getTablaReservas(f));
    }

    @Test
    @DisplayName("getOperativos devuelve las 3 secciones (por lab, por mes, historial)")
    void operativos() {
        var resp = analyticsService.getOperativos(new AnalyticsFilterRequest());
        assertNotNull(resp);
        assertNotNull(resp.getPorLaboratorio());
        assertNotNull(resp.getPorMes());
        assertNotNull(resp.getHistorial());
        // El total de mantenimientos coincide con la suma por laboratorio.
        int sumaMant = resp.getPorLaboratorio().stream().mapToInt(p -> p.getMantenimiento()).sum();
        assertEquals(sumaMant, resp.getTotalMantenimiento());
        // Lo mismo para feriados (operativo añadido junto a almuerzo/mantenimiento).
        int sumaFer = resp.getPorLaboratorio().stream().mapToInt(p -> p.getFeriado()).sum();
        assertEquals(sumaFer, resp.getTotalFeriado());
        // Y para RETIRO (categoría propia añadida a la sección Operativo).
        int sumaRet = resp.getPorLaboratorio().stream().mapToInt(p -> p.getRetiro()).sum();
        assertEquals(sumaRet, resp.getTotalRetiro());
        assertNotNull(resp.getCierres());
    }

    @Test
    @DisplayName("getOperativos incluye RETIRO como categoría y lista los CIERRES institucionales")
    void operativos_incluyeRetiroYCierre() {
        // Lab + un RETIRO de mesas (bloqueo parcial, todo el día) hoy.
        var admin = usuarioRepository.save(pe.edu.utec.reservas.modules.iam.model.Usuario.builder()
                .correoUtec("op-ret@utec.edu.pe").nombres("Op").apellidos("Ret")
                .rol(roleRepository.findByNombre("ADMIN").orElseThrow()).activo(true).build());
        var lab = laboratorioRepository.save(pe.edu.utec.reservas.modules.laboratorios.model.Laboratorio.builder()
                .codigoLab("LRET").nombre("Lab Retiro").piso(1).ubicacionFase("F1")
                .horaApertura(java.time.LocalTime.of(8, 0)).horaCierre(java.time.LocalTime.of(18, 0))
                .aforoTipo("MESA").aforoCantidad(2).aforoCapacidad(4).estado("ACTIVO")
                .diasAtencion(java.util.List.of("Lunes")).build());
        bloqueoRepository.save(pe.edu.utec.reservas.modules.bloqueos.model.Bloqueo.builder()
                .laboratorio(lab).tipo("PARCIAL").motivo("RETIRO").descripcion("Mesas retiradas")
                .esClase(false).fechaInicio(java.time.LocalDate.now()).fechaFin(java.time.LocalDate.now())
                .activo(true).creadoPor(admin).build());
        // Un CIERRE institucional hoy.
        excepcionRepository.save(pe.edu.utec.reservas.modules.aulas.model.CicloExcepcion.builder()
                .ciclo("TESTX").fechaInicio(java.time.LocalDate.now()).fechaFin(java.time.LocalDate.now())
                .tipo("CIERRE").descripcion("Aniversario UTEC").build());

        var resp = analyticsService.getOperativos(new AnalyticsFilterRequest());
        assertTrue(resp.getTotalRetiro() >= 1);                          // el RETIRO cuenta como operativo
        assertTrue(resp.getPorLaboratorio().stream().anyMatch(p -> "Lab Retiro".equals(p.getLaboratorio()) && p.getRetiro() >= 1));
        assertTrue(resp.getTotalDiasCierre() >= 1);                      // el cierre aparece con sus días
        assertTrue(resp.getCierres().stream().anyMatch(c -> "Aniversario UTEC".equals(c.getDescripcion())));
    }

    /** La fila de ocupación de L108 en el filtro dado. */
    private pe.edu.utec.reservas.modules.analytics.dto.InsightsResponse.LabOcupacion ocupL108(AnalyticsFilterRequest f) {
        return analyticsService.getInsights(f).getOcupacionPorLab().stream()
                .filter(o -> "L108".equals(o.getCodigoLab())).findFirst().orElseThrow();
    }

    @Test
    @DisplayName("Un CIERRE institucional se refleja como 'cerrado' (baja disponible, sube % cierre; capacidad bruta intacta)")
    void insightsCapacidadDescuentaCierre() {
        // Sin caché en tests (spring.cache.type=none) → la 2ª llamada recomputa.
        AnalyticsFilterRequest f = new AnalyticsFilterRequest(); f.setAnio(2026);
        var antes = ocupL108(f);
        // CIERRE de todo 2026 → cubre el periodo efectivo de L108.
        excepcionRepository.save(pe.edu.utec.reservas.modules.aulas.model.CicloExcepcion.builder()
                .ciclo("2026-1").fechaInicio(java.time.LocalDate.of(2026, 1, 1)).fechaFin(java.time.LocalDate.of(2026, 12, 31))
                .tipo("CIERRE").descripcion("Cierre test").build());
        var despues = ocupL108(f);
        // Modelo % neto: la capacidad BRUTA no cambia, pero el cierre se hace visible (horas/% cierre)
        // y baja la capacidad DISPONIBLE (denominador neto), sin penalizar la utilización.
        assertEquals(antes.getCapacidadTotal(), despues.getCapacidadTotal(), 0.01, "la capacidad bruta no cambia");
        assertTrue(despues.getHorasCierre() > 0, "el cierre debe reflejarse como horas de cierre");
        assertTrue(despues.getPorcentajeCierre() > 0, "el cierre debe reflejarse como % cerrado por cierre");
        assertTrue(despues.getHorasDisponibles() < antes.getHorasDisponibles(), "la capacidad disponible (neta) debe bajar con el cierre");
    }

    @Test
    @DisplayName("getOperativos con filtro de lab y año no falla")
    void operativosFiltrado() {
        AnalyticsFilterRequest f = new AnalyticsFilterRequest();
        f.setAnio(2026);
        f.setLabId(127L);
        assertNotNull(analyticsService.getOperativos(f));
    }

    @Test
    @DisplayName("getResumenEjecutivo por año trae comparación vs año anterior, insights y procedencia")
    void resumenEjecutivoPorAnio() {
        AnalyticsFilterRequest f = new AnalyticsFilterRequest();
        f.setAnio(2026);
        var resp = analyticsService.getResumenEjecutivo(f);
        assertNotNull(resp);
        // Filtrar por 2026 debe generar comparación contra 2025 (el baseline tiene ambos años).
        assertNotNull(resp.getComparacion());
        assertEquals("Año 2026", resp.getComparacion().getPeriodoActual());
        assertEquals("Año 2025", resp.getComparacion().getPeriodoAnterior());
        assertEquals(4, resp.getComparacion().getMetricas().size()); // Reservas, Completadas, Aprovechamiento, Ocupación
        // Insights y procedencia siempre presentes.
        assertNotNull(resp.getInsights());
        assertTrue(resp.getInsights().size() > 0);
        assertNotNull(resp.getProcedencia());
        assertNotNull(resp.getProcedencia().getFuente());
        assertNotNull(resp.getProcedencia().getCorte());
        assertTrue(resp.getProcedencia().getTotalRegistros() >= 0);
    }

    @Test
    @DisplayName("getResumenEjecutivo histórico completo: sin comparación pero con insights/procedencia")
    void resumenEjecutivoHistorico() {
        var resp = analyticsService.getResumenEjecutivo(new AnalyticsFilterRequest());
        assertNotNull(resp);
        // Sin filtro temporal no hay periodo anterior comparable.
        assertEquals(null, resp.getComparacion());
        assertNotNull(resp.getInsights());
        assertNotNull(resp.getProcedencia());
    }

    @Test
    @DisplayName("getInsights devuelve % de ocupación por lab y tamaño de grupo (>0 con datos semilla)")
    void insights() {
        var resp = analyticsService.getInsights(new AnalyticsFilterRequest());
        assertNotNull(resp);
        assertNotNull(resp.getOcupacionPorLab());
        assertNotNull(resp.getTamanoGrupo());
        // El baseline trae reservas de L108 → hay horas reservadas, capacidad y % > 0.
        assertTrue(resp.getOcupacionPorLab().size() > 0);
        var top = resp.getOcupacionPorLab().get(0); // ordenado por % desc
        assertTrue(top.getHorasReservadas() > 0);
        assertTrue(top.getPorcentaje() > 0);
        assertTrue(top.getPorcentaje() <= 100);
        // Disponibilidad (OEE): % cerrado por operativos, en rango; capacidad total ≥ disponible.
        assertTrue(top.getPorcentajeCerrado() >= 0 && top.getPorcentajeCerrado() <= 100);
        assertTrue(top.getCapacidadTotal() >= top.getHorasDisponibles());
        // Clases del horario como categoría propia (0 si el DB de test no trae clases): no-negativas.
        assertTrue(top.getHorasClases() >= 0);
        assertTrue(top.getPorcentajeReservas() >= 0 && top.getPorcentajeEventos() >= 0 && top.getPorcentajeClases() >= 0);
        assertTrue(resp.getTamanoGrupo().size() > 0);
        // Cruce carrera × lab (Fase 2): el baseline de L108 trae participantes con carrera.
        assertNotNull(resp.getCruceCarreraLab());
        assertTrue(resp.getCruceCarreraLab().size() > 0);
    }

    @Test
    @DisplayName("validarAccesoLab: RESPONSABLE_LAB solo consulta la analítica de SUS labs (debe elegir uno)")
    void validarAccesoLab_responsable() {
        var rol = roleRepository.findByNombre("RESPONSABLE_LAB").orElseThrow();
        var resp = usuarioRepository.save(pe.edu.utec.reservas.modules.iam.model.Usuario.builder()
                .correoUtec("resp-analytics@utec.edu.pe").nombres("Resp").apellidos("Analytics")
                .rol(rol).activo(true).build());
        var labs = laboratorioRepository.findAll();
        var suyo = labs.get(0);
        var ajeno = labs.get(1);
        entityManager.createNativeQuery(
                        "INSERT INTO lab_responsables (laboratorio_id, usuario_id) VALUES (:lab, :uid)")
                .setParameter("lab", suyo.getId()).setParameter("uid", resp.getId())
                .executeUpdate();

        // Con SU lab pasa; sin lab elegido o con un lab ajeno → FORBIDDEN (mismo patrón que el director).
        assertDoesNotThrow(() -> analyticsService.validarAccesoLab(suyo.getId(), resp.getCorreoUtec()));
        var sinLab = assertThrows(pe.edu.utec.reservas.shared.exceptions.BusinessException.class,
                () -> analyticsService.validarAccesoLab(null, resp.getCorreoUtec()));
        assertEquals("FORBIDDEN", sinLab.getErrorCode());
        assertThrows(pe.edu.utec.reservas.shared.exceptions.BusinessException.class,
                () -> analyticsService.validarAccesoLab(ajeno.getId(), resp.getCorreoUtec()));

        // ADMIN sigue sin restricción (puede ver el agregado global, sin labId).
        assertDoesNotThrow(() -> analyticsService.validarAccesoLab(null, "conceptlab@utec.edu.pe"));
    }

    @Test
    @DisplayName("getAulasAnalytics: KPIs de clases (frecuencia A/B pondera 0.5), ocupación, heatmap y eventos de aula")
    void aulasAnalytics() {
        var admin = usuarioRepository.findByCorreoUtec("conceptlab@utec.edu.pe").orElseThrow();
        var aula = aulaRepository.save(pe.edu.utec.reservas.modules.aulas.model.Aula.builder()
                .codigo("A-TEST").nombre("Aula Test Analytics").tipo("AULA").capacidad(40).piso(5).activo(true).build());
        // Clase semanal de 2h (lunes) + clase quincenal de 2h (martes, SEMANA_A → pesa 0.5).
        bloqueoRepository.save(pe.edu.utec.reservas.modules.bloqueos.model.Bloqueo.builder()
                .aula(aula).tipo("TOTAL").motivo("CLASE").esClase(true).activo(true)
                .diaSemana("LUNES").ciclo("2026-1").frecuencia("SEMANA_GENERAL")
                .fechaInicio(java.time.LocalDate.of(2026, 3, 23)).fechaFin(java.time.LocalDate.of(2026, 7, 4))
                .horaInicio(java.time.LocalTime.of(9, 0)).horaFin(java.time.LocalTime.of(11, 0))
                .creadoPor(admin).build());
        bloqueoRepository.save(pe.edu.utec.reservas.modules.bloqueos.model.Bloqueo.builder()
                .aula(aula).tipo("TOTAL").motivo("CLASE").esClase(true).activo(true)
                .diaSemana("MARTES").ciclo("2026-1").frecuencia("SEMANA_A")
                .fechaInicio(java.time.LocalDate.of(2026, 3, 23)).fechaFin(java.time.LocalDate.of(2026, 7, 4))
                .horaInicio(java.time.LocalTime.of(10, 0)).horaFin(java.time.LocalTime.of(12, 0))
                .creadoPor(admin).build());
        // Evento de aula (NO clase) dentro del ciclo.
        bloqueoRepository.save(pe.edu.utec.reservas.modules.bloqueos.model.Bloqueo.builder()
                .aula(aula).tipo("TOTAL").motivo("EVENTO").esClase(false).activo(true)
                .descripcion("Charla en aula")
                .fechaInicio(java.time.LocalDate.of(2026, 5, 12)).fechaFin(java.time.LocalDate.of(2026, 5, 12))
                .horaInicio(java.time.LocalTime.of(18, 0)).horaFin(java.time.LocalTime.of(20, 0))
                .creadoPor(admin).build());

        var resp = analyticsService.getAulasAnalytics("2026-1", null);
        assertEquals(2, resp.getTotalClases());
        assertEquals(3.0, resp.getHorasSemanales());   // 2h + 2h×0.5
        assertTrue(resp.getAulasActivas() >= 1);
        assertEquals(1, resp.getTotalEventos());
        // Ocupación por aula: A-TEST con 3 h/semana → 3/90 = 3.3%.
        var oc = resp.getOcupacionPorAula().stream().filter(o -> "A-TEST".equals(o.getCodigo())).findFirst().orElseThrow();
        assertEquals(3.0, oc.getHorasSemana());
        assertEquals(3.3, oc.getPorcentaje());
        assertEquals("AULA", oc.getTipo());
        // Por tipo de ambiente: el tipo AULA acumula las 2 clases.
        var tipo = resp.getPorTipoAmbiente().stream().filter(t -> "AULA".equals(t.getTipo())).findFirst().orElseThrow();
        assertEquals(2, tipo.getClases());
        // Heatmap por proyección: la clase del lunes ocupa las franjas 9 y 10.
        assertTrue(resp.getHeatmap().stream().anyMatch(h -> "Lunes".equals(h.getDia()) && h.getHora() == 9 && h.getCantidad() >= 1));
        assertTrue(resp.getHeatmap().stream().anyMatch(h -> "Lunes".equals(h.getDia()) && h.getHora() == 10 && h.getCantidad() >= 1));
        // Eventos de aula agrupados por mes.
        assertTrue(resp.getEventosPorMes().stream().anyMatch(e -> "2026-05".equals(e.getMes()) && e.getCantidad() == 1));
        // Filtrar otro ciclo → sin clases (las sembradas son de 2026-1).
        assertEquals(0, analyticsService.getAulasAnalytics("2026-2", null).getTotalClases());
    }

    @Test
    @DisplayName("getInsights soloReservas excluye los eventos del numerador (% ≤ combinado)")
    void insightsSoloReservas() {
        AnalyticsFilterRequest combinado = new AnalyticsFilterRequest();
        combinado.setAnio(2026);
        AnalyticsFilterRequest solo = new AnalyticsFilterRequest();
        solo.setAnio(2026);
        solo.setSoloReservas(true);

        var pctCombinadoL108 = analyticsService.getInsights(combinado).getOcupacionPorLab().stream()
                .filter(o -> "L108".equals(o.getCodigoLab())).findFirst().orElseThrow().getPorcentaje();
        var oL108Solo = analyticsService.getInsights(solo).getOcupacionPorLab().stream()
                .filter(o -> "L108".equals(o.getCodigoLab())).findFirst().orElseThrow();
        // L108 tiene muchos bloqueos de evento → solo-reservas debe dar un % menor o igual.
        assertTrue(oL108Solo.getPorcentaje() <= pctCombinadoL108);
        // horasEventos se sigue devolviendo (para el desglose del tooltip), aunque no sume al %.
        assertTrue(oL108Solo.getHorasEventos() >= 0);
    }
}

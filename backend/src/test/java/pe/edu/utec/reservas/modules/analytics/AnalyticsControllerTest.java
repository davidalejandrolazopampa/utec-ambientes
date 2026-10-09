package pe.edu.utec.reservas.modules.analytics;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import pe.edu.utec.reservas.modules.analytics.controller.AnalyticsController;
import pe.edu.utec.reservas.modules.analytics.dto.DashboardFullResponse;
import pe.edu.utec.reservas.modules.analytics.dto.KpiResponse;
import pe.edu.utec.reservas.modules.analytics.dto.OperativosResponse;
import pe.edu.utec.reservas.modules.analytics.service.AnalyticsService;
import org.springframework.security.core.userdetails.UserDetails;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AnalyticsControllerTest {

    @Mock private AnalyticsService analyticsService;
    @Mock private UserDetails userDetails;
    @InjectMocks private AnalyticsController controller;

    @Test
    void dashboardHoy() {
        KpiResponse k = new KpiResponse();
        when(analyticsService.getDashboardHoy()).thenReturn(k);
        assertSame(k, controller.dashboardHoy().getBody().getData());
    }

    @Test
    void dashboardFull_armaFiltroYDelegado() {
        DashboardFullResponse d = new DashboardFullResponse();
        when(analyticsService.getDashboardFull(any())).thenReturn(d);
        var r = controller.dashboardFull(1L, "2026-1", 2026, "ALUMNO", "CS",
                LocalDate.of(2026, 1, 1), LocalDate.of(2026, 6, 1), userDetails);
        assertSame(d, r.getBody().getData());
        verify(analyticsService).getDashboardFull(any());
    }

    @Test
    void aulas_delegaAlServicio() {
        var a = pe.edu.utec.reservas.modules.analytics.dto.AulasAnalyticsResponse.builder().totalClases(3).build();
        when(analyticsService.getAulasAnalytics("2026-1", null)).thenReturn(a);
        var r = controller.aulas("2026-1", null);
        assertSame(a, r.getBody().getData());
        verify(analyticsService).getAulasAnalytics("2026-1", null);
    }

    @Test
    void tablaReservas() {
        when(analyticsService.getTablaReservas(any())).thenReturn(List.of());
        var r = controller.tablaReservas(null, null, null, null, null, null, null, userDetails);
        assertTrue(r.getBody().getData().isEmpty());
    }

    @Test
    void operativos_armaFiltroYDelegado() {
        OperativosResponse o = OperativosResponse.builder().build();
        when(analyticsService.getOperativos(any())).thenReturn(o);
        var r = controller.operativos(1L, "2026-1", 2026, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 6, 1), userDetails);
        assertSame(o, r.getBody().getData());
        verify(analyticsService).getOperativos(any());
    }

    @Test
    void anios_y_periodos() {
        when(analyticsService.getAniosConDatos()).thenReturn(List.of(2025, 2026));
        assertEquals(2, controller.anios().getBody().getData().size());
        when(analyticsService.getPeriodosConDatos()).thenReturn(List.of("2026-1"));
        assertEquals(1, controller.periodos().getBody().getData().size());
    }

    @Test
    void insights_armaFiltroYDelegado() {
        var ins = new pe.edu.utec.reservas.modules.analytics.dto.InsightsResponse();
        when(analyticsService.getInsights(any())).thenReturn(ins);
        var r = controller.insights(1L, "2026-1", 2026, "CS", true,
                LocalDate.of(2026, 1, 1), LocalDate.of(2026, 6, 1), userDetails);
        assertSame(ins, r.getBody().getData());
        verify(analyticsService).validarAccesoLab(1L, userDetails.getUsername());
    }

    @Test
    void resumenEjecutivo_armaFiltroYDelegado() {
        var re = new pe.edu.utec.reservas.modules.analytics.dto.ResumenEjecutivoResponse();
        when(analyticsService.getResumenEjecutivo(any())).thenReturn(re);
        var r = controller.resumenEjecutivo(null, null, null, null, null, null, null, userDetails);
        assertSame(re, r.getBody().getData());
        verify(analyticsService).getResumenEjecutivo(any());
    }
}

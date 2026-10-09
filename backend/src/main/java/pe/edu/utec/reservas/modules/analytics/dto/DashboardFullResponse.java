package pe.edu.utec.reservas.modules.analytics.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DashboardFullResponse {
    // KPIs
    private Integer totalReservas;
    private Integer reservasActivas;
    private Integer reservasCanceladas;
    private Integer noShows;
    private Integer completadas;
    private Double tasaOcupacionGeneral;
    private Double tasaAusentismo;
    private Double tasaCancelacion;

    // Segmentación por tipo
    private Integer reservasAlumno;
    private Integer reservasEvento;
    private Integer bloqueosParciales;
    private Integer bloqueosTotales;

    // Filtro aplicado
    private String filtroDescripcion;

    // Sub-datos
    private List<OcupacionResponse> ocupacionPorLaboratorio;
    private List<HeatmapCellResponse> heatmap;
    private List<ReservaPorHoraResponse> reservasPorHora;
    private List<ReservaPorDiaResponse> reservasPorDia;
    private List<ReservaPorMesResponse> reservasPorMes;
    private List<ReservaPorCarreraResponse> reservasPorCarrera;
    private BloqueoStatsResponse bloqueoStats;
}
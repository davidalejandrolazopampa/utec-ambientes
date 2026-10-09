import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { CalendarClock, RefreshCw, ImageDown, Printer, Download, Upload, GraduationCap, Search, BarChart3, Clock, Construction, DoorOpen, CheckCircle2, XCircle, Wrench, Ban } from 'lucide-react';
import { toPng } from 'html-to-image';
import PageHeader, { btnOnBanner } from '@/components/ui/PageHeader';
import toast from 'react-hot-toast';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    LineChart, Line, Cell, PieChart, Pie, FunnelChart, Funnel, LabelList,
    ComposedChart, ReferenceLine
} from 'recharts';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '@/components/ui/DataTable';
import Segmented from '@/components/ui/Segmented';
import EmptyState from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import api from '@/services/api';
import { hoyLocal } from '@/utils/fecha';

/* ───────── Types ───────── */
interface OcupacionLab { codigoLab: string; laboratorioNombre: string; totalRecursos: number; recursosOcupados: number; recursosDisponibles: number; porcentajeOcupacion: number; }
interface HeatmapCell { dia: string; hora: number; cantidad: number; }
interface ReservaPorDia { fecha: string; total: number; completadas: number; canceladas: number; noShows: number; }
interface ReservaPorMes { mes: string; total: number; completadas: number; canceladas: number; noShows: number; }
interface ReservaPorHora { hora: string; cantidad: number; }
interface ReservaPorCarrera { carrera: string; cantidad: number; }
interface BloqueoStats { totalParciales: number; totalTotales: number; laboratorioMasBloqueado: string; motivoMasFrecuente: string; }
interface DashboardFull { totalReservas: number; reservasActivas: number; reservasCanceladas: number; noShows: number; completadas: number; tasaOcupacionGeneral: number; tasaAusentismo: number; tasaCancelacion: number; reservasAlumno: number; reservasEvento: number; bloqueosParciales: number; bloqueosTotales: number; filtroDescripcion: string; ocupacionPorLaboratorio: OcupacionLab[]; heatmap: HeatmapCell[]; reservasPorHora: ReservaPorHora[]; reservasPorDia: ReservaPorDia[]; reservasPorMes: ReservaPorMes[]; reservasPorCarrera: ReservaPorCarrera[]; bloqueoStats: BloqueoStats; }
interface LabOption { id: number; codigoLab: string; nombre: string; }
interface ReservaDetalle { id: number; fecha: string; horaInicio: string; horaFin: string; estado: string; laboratorioCodigo: string; laboratorioNombre: string; recursoNombre: string; recursoTipo: string; usuarioNombre: string; usuarioCorreo: string; participantes: number; tipoReserva: string; carrera?: string; }
interface BloqueoItem { id: number; laboratorioCodigo: string; laboratorioNombre: string; tipo: string; motivo: string; descripcion?: string; fechaInicio: string; fechaFin: string; horaInicio?: string; horaFin?: string; activo: boolean; creadoPorNombre: string; createdAt: string; responsableNombre?: string; responsableCorreo?: string; }
// Bloqueos OPERATIVOS (ALMUERZO + MANTENIMIENTO + FERIADO): se muestran aparte en la vista Solo bloqueos.
interface OperativoLab { laboratorio: string; mantenimiento: number; almuerzo: number; feriado: number; retiro: number; total: number; }
interface OperativoMes { mes: string; mantenimiento: number; almuerzo: number; feriado: number; retiro: number; total: number; }
interface OperativoHist { id: number; laboratorio: string; motivo: string; tipo: string; fecha: string; horaInicio?: string; horaFin?: string; recursos?: string; descripcion?: string; }
interface CierreInstitucional { fechaInicio: string; fechaFin: string; descripcion?: string; dias: number; }
interface Operativos { porLaboratorio: OperativoLab[]; porMes: OperativoMes[]; historial: OperativoHist[]; totalMantenimiento: number; totalAlmuerzo: number; totalFeriado: number; totalRetiro: number; cierres: CierreInstitucional[]; totalDiasCierre: number; }
interface Insights { ocupacionPorLab: { codigoLab: string; horasReservadas: number; horasEventos: number; horasClases: number; horasOperativas: number; horasCierre: number; capacidadTotal: number; horasDisponibles: number; porcentaje: number; porcentajeReservas: number; porcentajeEventos: number; porcentajeClases: number; porcentajeCerrado: number; porcentajeCierre: number }[]; tamanoGrupo: { participantes: number; cantidad: number }[]; cruceCarreraLab?: { carrera: string; codigoLab: string; cantidad: number }[]; }
// Ámbito AULAS (ADMIN + DOCENCIA): clases del horario académico + eventos de aula.
interface AulasAnalytics {
    totalClases: number; horasSemanales: number; aulasActivas: number; totalEventos: number;
    ocupacionPorAula: { codigo: string; tipo: string; piso: number | null; horasSemana: number; porcentaje: number }[];
    porTipoAmbiente: { tipo: string; clases: number; horasSemana: number }[];
    heatmap: HeatmapCell[];
    eventosPorMes: { mes: string; cantidad: number }[];
}
// Resumen EJECUTIVO (dirección): Δ vs periodo anterior + insights narrativos + procedencia de datos.
interface MetricaComparada { etiqueta: string; actual: number; anterior: number; deltaPct: number | null; direccion: string; unidad: string; }
interface ResumenEjecutivo {
    comparacion: { periodoActual: string; periodoAnterior: string; metricas: MetricaComparada[] } | null;
    insights: { texto: string; tipo: string }[];
    procedencia: { fuente: string; rangoInicio: string | null; rangoFin: string | null; corte: string; totalRegistros: number; labsConDatos: number };
}

/* ───────── Constants ───────── */
const UTEC = { cyan: '#00BFFF', dark: '#231F20', blue: '#015EEA', green: '#34A853', yellow: '#FBBC05', red: '#EA4335', gray: '#8F8F8F', orange: '#E67E22', violet: '#8B5CF6' };
// Etiqueta de los gráficos circulares: "valor · %". En porciones muy chicas (<5%) se omite
// para que las etiquetas no se encimen cuando hay muchas categorías — el dato completo sigue
// en el tooltip y la leyenda. Los PieChart llevan además margen para que las etiquetas de los
// bordes no se recorten.
export const pieLabel = ({ value, percent }: { value: number; percent?: number }) =>
    (percent ?? 0) < 0.05 ? '' : `${value} · ${Math.round((percent ?? 0) * 100)}%`;
const PIE_MARGIN = { top: 14, right: 28, bottom: 6, left: 28 };
const DIAS_ORDER = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const HORAS = Array.from({ length: 13 }, (_, i) => i + 7);
// Franja del heatmap de AULAS: las clases se dictan de 07:00 a 22:00.
const HORAS_AULA = Array.from({ length: 15 }, (_, i) => i + 7);

export function buildCiclos(): { value: string; label: string }[] {
    const now = new Date(); const currentYear = now.getFullYear();
    const ciclos: { value: string; label: string }[] = [];
    for (let y = currentYear; y >= currentYear - 2; y--) {
        ciclos.push({ value: `${y}-2`, label: `${y}-2 (Ago–Dic)` });
        ciclos.push({ value: `${y}-1`, label: `${y}-1 (Mar–Jul)` });
        ciclos.push({ value: `${y}-0`, label: `${y}-0 (Ene–Feb)` });
    }
    return ciclos;
}
export function buildAnios(): number[] { const c = new Date().getFullYear(); return Array.from({ length: 5 }, (_, i) => c - i); }

// Etiquetas de los ciclos UTEC (0=verano, 1/2=regulares).
export const CICLO_LABEL: Record<string, string> = { '0': 'Ene–Feb', '1': 'Mar–Jul', '2': 'Ago–Dic' };

// Rango de fechas [ini, fin] (YYYY-MM-DD) según ciclo/año, para filtrar bloqueos en cliente
// igual que el backend filtra las reservas. Sin ciclo ni año → null (sin filtro de fecha).
export function rangoFechas(ciclo: string, anio: string): { ini: string; fin: string } | null {
    if (ciclo) {
        const [y, c] = ciclo.split('-');
        if (c === '2') return { ini: `${y}-08-01`, fin: `${y}-12-31` };
        if (c === '1') return { ini: `${y}-03-01`, fin: `${y}-07-31` };
        if (c === '0') return { ini: `${y}-01-01`, fin: `${y}-02-28` };  // coincide con el backend (Feb 28)
    }
    if (anio) return { ini: `${anio}-01-01`, fin: `${anio}-12-31` };
    return null;
}

// Rango del PERIODO ANTERIOR equivalente (mismo ciclo del año pasado / año-1), para el
// resumen de bloqueos por cliente. null si no hay periodo comparable (histórico completo).
export function rangoFechasPrev(ciclo: string, anio: string): { ini: string; fin: string; etiqueta: string } | null {
    if (ciclo) {
        const [y, c] = ciclo.split('-');
        const py = String(Number(y) - 1);
        const r = rangoFechas(`${py}-${c}`, '');
        return r ? { ...r, etiqueta: `Ciclo ${py}-${c}` } : null;
    }
    if (anio) {
        const py = String(Number(anio) - 1);
        return { ini: `${py}-01-01`, fin: `${py}-12-31`, etiqueta: `Año ${py}` };
    }
    return null;
}

/* ───────── Main Component ───────── */
export default function DashboardPage() {
    const [labId, setLabId] = useState<string>('');
    const [ciclo, setCiclo] = useState<string>('');
    const [anio, setAnio] = useState<string>('');
    const [vista, setVista] = useState<string>('RESUMEN');
    const [carrera, setCarrera] = useState<string>('');
    const [activeTab, setActiveTab] = useState<'graficos' | 'tabla'>('graficos');
    const [granularidad, setGranularidad] = useState<'dia' | 'semana' | 'mes'>('dia');

    // 2 vistas (fusión jul-2026): "Resumen" = las antiguas Todo + Solo reservas + Solo bloqueos
    // en secciones temáticas con anclas (Operativo colapsable); "OEE" = uso del lab (instalación).
    const esResumen = vista === 'RESUMEN';
    const esOee = vista === 'OEE';   // vista de instalación: ocupación + disponibilidad + capacidad ociosa + heatmap
    // Toggle local de la tarjeta de ocupación: contar SOLO reservas de alumnos (excluye
    // eventos/clases del numerador y de la capacidad reservable) — antes era la vista "Solo reservas".
    const [soloRes, setSoloRes] = useState(false);

    const qc = useQueryClient();
    const esAdmin = useAuthStore((s) => s.user?.rol === 'ADMIN');
    // Un DIRECTOR o un RESPONSABLE_LAB solo ven la analítica de SUS labs (el backend lo
    // exige): el dropdown se limita a sus labs y deben elegir uno (sin "Todos").
    const esAcotado = useAuthStore((s) => s.user?.rol === 'DIRECTOR' || s.user?.rol === 'RESPONSABLE_LAB');
    // Ámbito 🧪 Laboratorios | 🏫 Aulas: DOCENCIA solo ve Aulas; ADMIN alterna entre ambos;
    // el resto de roles solo Laboratorios. Con esAulas se APAGAN las queries de labs (un
    // DOCENCIA no puede llamarlas: el backend le daría 403).
    const esDocencia = useAuthStore((s) => s.user?.rol === 'DOCENCIA');
    const [ambito, setAmbito] = useState<'LABS' | 'AULAS'>(esDocencia ? 'AULAS' : 'LABS');
    const esAulas = ambito === 'AULAS';
    const esLabs = !esAulas;
    // Color de texto de ejes/etiquetas de las gráficas, adaptable a dark mode.
    const theme = useThemeStore((s) => s.theme);
    const setTheme = useThemeStore((s) => s.setTheme);
    const esOscuro = theme === 'dark';
    const ejeColor = esOscuro ? '#E5E9EF' : '#231F20';   // valores fuertes (números sobre barras)
    const ejeMuted = esOscuro ? '#9BA3AD' : '#6b7280';   // títulos de eje (secundarios)
    const celdaVacia = esOscuro ? 'rgba(255,255,255,0.04)' : '#F8F8F8'; // fondo de celda sin dato (heatmap/cruce)
    const celdaTextoTenue = esOscuro ? '#E5E9EF' : '#231F20';           // texto en celda de baja intensidad

    // Descargar las gráficas tal como se ven (con los filtros aplicados) como PNG.
    const graficosRef = useRef<HTMLDivElement>(null);
    const descargarGraficos = async () => {
        const el = graficosRef.current;
        if (!el) return;
        // Exportar SIEMPRE en claro (PNG con fondo blanco). En dark, las gráficas usan texto
        // claro (por props/CSS de Recharts) que quedaría ilegible sobre el blanco del PNG; por
        // eso cambiamos a claro, esperamos a que React re-pinte y restauramos el tema al final.
        const eraOscuro = theme === 'dark';
        if (eraOscuro) {
            setTheme('light');
            await new Promise((r) => setTimeout(r, 120));
        }
        // Cabecera temporal (título + fecha + filtros), solo para la imagen — no se ve en pantalla.
        const header = document.createElement('div');
        header.style.cssText = 'padding:10px 4px 12px;margin-bottom:10px;border-bottom:2px solid #e5e5e5;font-family:Inter,sans-serif;';
        const ambito = esOee ? ' — Uso del lab (OEE)' : '';
        const filtros = dashboard?.filtroDescripcion ? ` · ${dashboard.filtroDescripcion}` : '';
        header.innerHTML =
            `<div style="font-size:18px;font-weight:700;color:#231F20;">UTEC Ambientes — Dashboard${ambito}</div>` +
            `<div style="font-size:12px;color:#6b7280;margin-top:3px;">${new Date().toLocaleString('es-PE')}${filtros}</div>`;
        el.insertBefore(header, el.firstChild);
        try {
            const dataUrl = await toPng(el, { backgroundColor: '#ffffff', pixelRatio: 2, cacheBust: true });
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `dashboard_graficos_${hoyLocal()}.png`;
            a.click();
        } catch {
            toast.error('No se pudieron descargar las gráficas');
        } finally {
            el.removeChild(header);
            if (eraOscuro) setTheme('dark'); // restaura el tema del usuario
        }
    };

    // Reporte ejecutivo one-pager → PDF vía "Imprimir" del navegador (Guardar como PDF).
    // La hoja se monta SOLO durante la impresión (no en el render normal) para no duplicar
    // datos en el DOM; el CSS de impresión (body.printing-reporte) muestra solo esa hoja.
    const [reporteVisible, setReporteVisible] = useState(false);
    const imprimirReporte = () => setReporteVisible(true);
    useEffect(() => {
        if (!reporteVisible) return;
        document.body.classList.add('printing-reporte');
        const cleanup = () => { document.body.classList.remove('printing-reporte'); setReporteVisible(false); };
        window.addEventListener('afterprint', cleanup, { once: true });
        window.print();
        return () => window.removeEventListener('afterprint', cleanup);
    }, [reporteVisible]);

    const queryParams = useMemo(() => {
        const params = new URLSearchParams();
        if (labId) params.set('labId', labId);
        if (ciclo) params.set('ciclo', ciclo);
        if (anio && !ciclo) params.set('anio', anio);
        if (carrera) params.set('carrera', carrera);
        return params.toString();
    }, [labId, ciclo, anio, carrera]);

    // mis-laboratorios respeta el rol: ADMIN/COORDINADOR → todos; DIRECTOR/RESPONSABLE_LAB → solo los suyos.
    const { data: labs } = useQuery({ queryKey: ['labs-dashboard'], queryFn: () => api.get<{ data: LabOption[] }>('/laboratorios/mis-laboratorios'), select: (res) => res.data.data, enabled: esLabs });
    // Rol acotado: si aún no eligió lab, se selecciona el primero de los suyos (el backend rechaza "todos").
    useEffect(() => { if (esAcotado && !labId && labs && labs.length > 0) setLabId(String(labs[0].id)); }, [esAcotado, labs, labId]);

    // Periodos "YYYY-C" con data ANALIZABLE (reservas o bloqueos no operativos) → de
    // aquí se derivan el filtro de Año y el de Ciclo, mostrando solo años/ciclos CON
    // registros (sin vacíos; p. ej. no ofrece 2024 Ene–Feb ni 2026 Ago–Dic). Los años
    // futuros salen solos cuando llega su primer dato. Fallback: ventana por reloj.
    const { data: periodosData } = useQuery({ queryKey: ['analytics-periodos'], queryFn: () => api.get<{ data: string[] }>('/analytics/periodos'), select: (res) => res.data.data, enabled: esLabs });
    // Ciclos académicos CREADOS (ciclos_academicos): el desplegable los ofrece aunque aún no
    // tengan datos (recién creados/futuros) y de aquí sale el ciclo ACTUAL para el default.
    const { data: ciclosAcad } = useQuery({ queryKey: ['ciclos'], queryFn: () => api.get('/ciclos'), select: (r) => r.data.data as { codigo: string; anio: number; ciclo: number; fechaInicio: string; fechaFin: string }[] });
    // Códigos "YYYY-C" = UNIÓN de los periodos con datos + los ciclos académicos creados.
    const codigosPeriodo = useMemo(
        () => [...new Set([...(periodosData ?? []), ...((ciclosAcad ?? []).map((c) => c.codigo))])],
        [periodosData, ciclosAcad]);
    const anios = useMemo(() => {
        const ys = [...new Set(codigosPeriodo.map((p) => Number(p.split('-')[0])))].sort((a, b) => b - a);
        return ys.length > 0 ? ys : buildAnios();
    }, [codigosPeriodo]);
    const ciclosPorAnio = useMemo(() => {
        const m: Record<string, string[]> = {};
        codigosPeriodo.forEach((p) => { const [y, c] = p.split('-'); (m[y] ??= []).push(c); });
        Object.values(m).forEach((cs) => cs.sort());
        return m;
    }, [codigosPeriodo]);
    // Ciclo ACTUAL: el que contiene HOY, o el más reciente ya iniciado (para el default).
    const cicloActual = useMemo(() => {
        const hoy = new Date().toISOString().slice(0, 10);
        const cs = ciclosAcad ?? [];
        const dentro = cs.find((c) => hoy >= c.fechaInicio && hoy <= c.fechaFin);
        if (dentro) return dentro;
        return [...cs].filter((c) => c.fechaInicio <= hoy).sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio))[0] ?? null;
    }, [ciclosAcad]);
    // Al abrir, el dashboard arranca en el AÑO y CICLO actual (una sola vez; no pisa al usuario).
    const defaultAplicado = useRef(false);
    useEffect(() => {
        if (defaultAplicado.current || !cicloActual) return;
        if (anio === '' && ciclo === '') { setAnio(String(cicloActual.anio)); setCiclo(cicloActual.codigo); }
        defaultAplicado.current = true;
    }, [cicloActual, anio, ciclo]);

    // Sin refetchInterval: el dashboard es un REPORTE, no una vista operativa. Antes el
    // auto-poll de 60s solo cubría 2 de las 7 queries (KPIs se movían pero insights/resumen
    // no → falsa sensación de frescura) y disparaba agregaciones pesadas por cada viewer.
    // La frescura la dan: el botón "Actualizar" (invalida TODO) + refetchOnWindowFocus
    // global (al volver a la pestaña) + el indicador "Actualizado hace X".
    const { data: dashboard, isLoading, isFetching, dataUpdatedAt } = useQuery({
        queryKey: ['dashboard-full', queryParams],
        queryFn: () => api.get<{ data: DashboardFull }>(`/analytics/dashboard/full?${queryParams}`),
        select: (res) => res.data.data,
        enabled: esLabs,
    });

    // Ámbito AULAS: payload agregador (KPIs + 4 gráficas) en una sola llamada.
    const { data: aulasData } = useQuery({
        queryKey: ['analytics-aulas', ciclo, anio],
        queryFn: () => {
            const p = new URLSearchParams();
            if (ciclo) p.set('ciclo', ciclo);
            if (anio && !ciclo) p.set('anio', anio);
            return api.get<{ data: AulasAnalytics }>(`/analytics/aulas?${p.toString()}`);
        },
        select: (res) => res.data.data,
        enabled: esAulas,
    });

    // Refresca TODOS los datos del dashboard (reservas, tabla, bloqueos) a pedido, y
    // muestra "hace cuánto" se actualizó. Es el ÚNICO mecanismo manual de frescura (se
    // quitó el auto-poll de 60s: cubría solo 2 queries y cargaba el backend); además el
    // dashboard se refresca solo al volver a la pestaña (refetchOnWindowFocus global).
    const refrescar = () => {
        qc.invalidateQueries({ queryKey: ['dashboard-full'] });
        qc.invalidateQueries({ queryKey: ['tabla-reservas'] });
        qc.invalidateQueries({ queryKey: ['bloqueos-dashboard'] });
        qc.invalidateQueries({ queryKey: ['operativos'] });
        qc.invalidateQueries({ queryKey: ['resumen-ejecutivo'] });
        qc.invalidateQueries({ queryKey: ['analytics-aulas'] });
    };
    const [, forzarReloj] = useState(0);
    useEffect(() => {
        const t = setInterval(() => forzarReloj((n) => n + 1), 15000); // re-pinta el "hace X"
        return () => clearInterval(t);
    }, []);
    const haceCuanto = (ts: number) => {
        if (!ts) return '';
        const seg = Math.floor((Date.now() - ts) / 1000);
        if (seg < 10) return 'recién';
        if (seg < 60) return `hace ${seg}s`;
        const min = Math.floor(seg / 60);
        if (min < 60) return `hace ${min} min`;
        return `hace ${Math.floor(min / 60)} h`;
    };

    const { data: tablaData, isLoading: loadingTabla } = useQuery({
        queryKey: ['tabla-reservas', queryParams],
        queryFn: () => api.get<{ data: ReservaDetalle[] }>(`/analytics/tabla?${queryParams}`),
        select: (res) => res.data.data,
        enabled: esLabs && (activeTab === 'tabla' || esResumen),
    });

    // Ambas vistas de labs lo usan (el panel "Hoy" y la sección de Bloqueos del Resumen).
    const { data: bloqueosRaw, isLoading: loadingBloqueos } = useQuery({
        queryKey: ['bloqueos-dashboard'],
        queryFn: () => api.get<{ data: BloqueoItem[] }>('/bloqueos/todos'),
        select: (res) => res.data.data,
        enabled: esLabs,
    });

    // Bloqueos operativos (mantenimiento + almuerzo): sección "Operativo" (colapsable) del Resumen.
    // Respeta los filtros de lab/año/ciclo (van en queryParams). El backend ya filtra a esos motivos.
    const { data: operativos } = useQuery({
        queryKey: ['operativos', queryParams],
        queryFn: () => api.get<{ data: Operativos }>(`/analytics/operativos?${queryParams}`),
        select: (res) => res.data.data,
        enabled: esLabs && esResumen,
    });

    // Insights: horas reservadas por lab (ocupación real del periodo) + tamaño de grupo.
    // Con el toggle "Solo reservas" el % de ocupación cuenta SOLO reservas de alumnos (excluye
    // los bloqueos de evento del numerador); sin él queda combinada (reservas + eventos + clases).
    const insightsParams = soloRes ? `${queryParams}${queryParams ? '&' : ''}soloReservas=true` : queryParams;
    const { data: insights } = useQuery({
        queryKey: ['insights', insightsParams],
        queryFn: () => api.get<{ data: Insights }>(`/analytics/insights?${insightsParams}`),
        select: (res) => res.data.data,
        // Se usa en el Resumen (ocupación/disponibilidad/ociosa) y en OEE — solo ámbito labs.
        enabled: esLabs,
    });

    // Resumen ejecutivo (dirección): comparación vs periodo anterior + conclusiones + procedencia.
    const { data: resumen } = useQuery({
        queryKey: ['resumen-ejecutivo', queryParams],
        queryFn: () => api.get<{ data: ResumenEjecutivo }>(`/analytics/resumen-ejecutivo?${queryParams}`),
        select: (res) => res.data.data,
        enabled: esLabs,
    });

    // El dashboard excluye los bloqueos OPERATIVOS (ALMUERZO, MANTENIMIENTO y FERIADO) de TODO
    // (KPIs, gráficas, tabla): cierran el lab pero no son eventos a analizar. Su gestión
    // sigue disponible en la página de Bloqueos.
    // Los bloqueos también respetan los filtros de laboratorio y de año/ciclo (igual que las
    // reservas), además de excluir los motivos operativos. /bloqueos/todos los trae sin filtrar.
    const bloqueosList = useMemo(() => {
        const rango = rangoFechas(ciclo, anio);
        const labCod = labId ? labs?.find((l: LabOption) => String(l.id) === labId)?.codigoLab : null;
        return (bloqueosRaw ?? []).filter((b) =>
            b.motivo !== 'ALMUERZO' && b.motivo !== 'MANTENIMIENTO' && b.motivo !== 'FERIADO' && b.motivo !== 'RETIRO'
            && (!labCod || b.laboratorioCodigo === labCod)
            && (!rango || (b.fechaInicio <= rango.fin && b.fechaFin >= rango.ini))
        );
    }, [bloqueosRaw, ciclo, anio, labId, labs]);

    const heatmapMatrix = useMemo(() => buildHeatmapMatrix(dashboard?.heatmap || []), [dashboard?.heatmap]);
    const maxHeat = useMemo(() => Math.max(...(dashboard?.heatmap || []).map(h => h.cantidad), 1), [dashboard?.heatmap]);
    // Heatmap del ámbito AULAS (clases por día × hora); las clases se dictan hasta las 22:00.
    const aulasHeatMatrix = useMemo(() => buildHeatmapMatrix(aulasData?.heatmap || []), [aulasData?.heatmap]);
    const maxAulasHeat = useMemo(() => Math.max(...(aulasData?.heatmap || []).map(h => h.cantidad), 1), [aulasData?.heatmap]);

    const pieData = useMemo(() => {
        if (!dashboard) return [];
        const items = [];
        if (dashboard.reservasAlumno > 0) items.push({ name: 'Alumno', value: dashboard.reservasAlumno, fill: UTEC.cyan });
        // Un bloqueo TOTAL es un "Evento" (reserva el lab completo). reservasEvento quedó
        // obsoleto (siempre 0 tras V9), así que la categoría "Evento" usa los bloqueos totales.
        if (dashboard.bloqueosTotales > 0) items.push({ name: 'Evento', value: dashboard.bloqueosTotales, fill: UTEC.blue });
        if (dashboard.bloqueosParciales > 0) items.push({ name: 'Bloqueo Parcial', value: dashboard.bloqueosParciales, fill: UTEC.yellow });
        return items;
    }, [dashboard]);

    // Ocupación y Reservas por carrera van a ANCHO COMPLETO (apiladas), no lado a lado: como
    // tienen muy distinto n° de barras (labs vs carreras), cada una usa SU propio alto para que
    // las barras queden a una densidad cómoda. Ocupación usa un track de fondo por lab.
    const alturaCarrera = Math.max(220, (dashboard?.reservasPorCarrera?.length ?? 0) * 34);
    // "Reservas por día": con muchos días las barras se aplastan. Se le da un ancho MÍNIMO
    // por día (~28px) y scroll horizontal; el eje X muestra 1 etiqueta cada ~3 días (interval)
    // para que las fechas no se encimen.
    const nDiasReserva = dashboard?.reservasPorDia?.length ?? 0;
    const anchoPorDia = Math.max(640, nDiasReserva * 28);

    // Embudo de estados: de TODAS las reservas, cuántas no se cancelaron y cuántas se USARON
    // (check-in/completadas). Deja ver la fuga por cancelación + no-show de un vistazo.
    const embudoData = useMemo(() => {
        const total = dashboard?.totalReservas ?? 0;
        const activas = dashboard?.reservasActivas ?? 0;
        const completadas = dashboard?.completadas ?? 0;
        // Etapas: Reservadas → Vigentes/usadas (no canceladas = activas + completadas) → Con
        // check-in (completadas). Con datos 100% históricos "Vigentes" ≈ "Con check-in" (no hay
        // activas), así que la etapa intermedia solo se muestra si aporta (activas > 0).
        const noCanceladas = activas + completadas;
        const etapas = [{ name: 'Reservadas', value: total, fill: UTEC.cyan }];
        if (activas > 0) etapas.push({ name: 'Vigentes/usadas', value: noCanceladas, fill: UTEC.blue });
        etapas.push({ name: 'Con check-in', value: completadas, fill: UTEC.green });
        return etapas;
    }, [dashboard]);

    // Reservas por día de la semana (agrega el heatmap por día → patrón semanal Lun–Dom).
    const porDiaSemana = useMemo(() => {
        const acc: Record<string, number> = {};
        (dashboard?.heatmap ?? []).forEach((c) => { acc[c.dia] = (acc[c.dia] ?? 0) + c.cantidad; });
        return DIAS_ORDER.map((d) => ({ dia: d.slice(0, 3), cantidad: acc[d] ?? 0 }));
    }, [dashboard?.heatmap]);

    /* ── Fase 2: Pareto de carreras (concentración 80/20) ── */
    // Barras (n° reservas, desc) + línea de % acumulado. La línea cruza el 80% donde está la
    // "pocas carreras que explican la mayoría de la demanda" (regla de Pareto). Las carreras
    // que forman ese núcleo (acumulado previo < 80%) se marcan con enNucleo para pintarlas
    // distinto y contar cuántas son.
    const paretoCarreras = useMemo(() => {
        const src = [...(dashboard?.reservasPorCarrera ?? [])].sort((a, b) => b.cantidad - a.cantidad);
        const total = src.reduce((s, c) => s + c.cantidad, 0);
        let acc = 0;
        return src.map((c) => {
            const prevPct = total > 0 ? (acc / total) * 100 : 0;
            acc += c.cantidad;
            return { carrera: c.carrera, cantidad: c.cantidad, acumulado: total > 0 ? Math.round((acc / total) * 1000) / 10 : 0, enNucleo: prevPct < 80 };
        });
    }, [dashboard?.reservasPorCarrera]);
    const nucleoPareto = useMemo(() => paretoCarreras.filter((c) => c.enNucleo).length, [paretoCarreras]);

    /* ── Fase 2: Capacidad ociosa por lab (horas libres = disponibles − usadas) ── */
    // Ociosa = capacidad (denominador del modo) − uso (numerador del modo). Con el toggle "Solo
    // reservas" horasDisponibles ya excluye los eventos y el uso son solo reservas; en el resto
    // el uso es reservas + eventos. Así no se descuentan los eventos dos veces.
    const capacidadOciosa = useMemo(() => {
        return (insights?.ocupacionPorLab ?? []).map((o) => {
            // Las clases del horario también son USO del lab (salvo en modo "solo reservas", donde
            // la capacidad reservable ya las excluye del denominador).
            const usadas = Math.round((soloRes ? o.horasReservadas : o.horasReservadas + o.horasEventos + o.horasClases) * 10) / 10;
            const ociosas = Math.max(0, Math.round((o.horasDisponibles - usadas) * 10) / 10);
            return { codigoLab: o.codigoLab, ociosas, usadas };
        }).sort((a, b) => b.ociosas - a.ociosas);
    }, [insights?.ocupacionPorLab, soloRes]);

    /* ── Fase 2: Cruce carrera × lab (pivot para heatmap) ── */
    const cruce = useMemo(() => {
        const rows = insights?.cruceCarreraLab ?? [];
        const labsSet = new Set<string>(), carrMap: Record<string, Record<string, number>> = {};
        let max = 0;
        rows.forEach((r) => {
            labsSet.add(r.codigoLab);
            (carrMap[r.carrera] ??= {})[r.codigoLab] = r.cantidad;
            if (r.cantidad > max) max = r.cantidad;
        });
        const labsArr = [...labsSet].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        // Carreras ordenadas por total desc, top 12 para que la tabla no explote.
        const carrArr = Object.entries(carrMap)
            .map(([carrera, m]) => ({ carrera, total: Object.values(m).reduce((s, v) => s + v, 0), m }))
            .sort((a, b) => b.total - a.total).slice(0, 12);
        return { labs: labsArr, carreras: carrArr, max };
    }, [insights?.cruceCarreraLab]);

    /* ── Fase 3: Proyección de demanda (regresión lineal) + media móvil de 3 ── */
    // Toma el total mensual histórico, dibuja una media móvil de 3 meses (suaviza el ruido) y
    // proyecta los próximos 2 meses por mínimos cuadrados sobre el índice. Es un forecast simple
    // y honesto (lineal); se recalibra al llegar datos en vivo de más labs.
    const proyeccion = useMemo(() => {
        const hist = (dashboard?.reservasPorMes ?? []).map((m) => ({ mes: m.mes, total: m.total }));
        const n = hist.length;
        const rows: { mes: string; total: number | null; media: number | null; proyeccion: number | null }[] =
            hist.map((h, i) => {
                const w = hist.slice(Math.max(0, i - 2), i + 1);
                return { mes: h.mes, total: h.total, media: Math.round(w.reduce((s, x) => s + x.total, 0) / w.length), proyeccion: null };
            });
        if (n >= 3) {
            const ys = hist.map((h) => h.total);
            const sx = (n - 1) * n / 2;
            const sy = ys.reduce((a, b) => a + b, 0);
            const sxx = ys.reduce((a, _b, i) => a + i * i, 0);
            const sxy = ys.reduce((a, b, i) => a + i * b, 0);
            const denom = n * sxx - sx * sx;
            const slope = denom !== 0 ? (n * sxy - sx * sy) / denom : 0;
            const intercept = (sy - slope * sx) / n;
            rows[n - 1].proyeccion = rows[n - 1].total;   // ancla la línea al último real
            const [ly, lm] = hist[n - 1].mes.split('-').map(Number);
            for (let k = 1; k <= 2; k++) {
                const d = new Date(ly, lm - 1 + k, 1);
                const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                rows.push({ mes, total: null, media: null, proyeccion: Math.max(0, Math.round(intercept + slope * (n - 1 + k))) });
            }
        }
        return rows;
    }, [dashboard?.reservasPorMes]);
    const hayProyeccion = proyeccion.some((r) => r.total === null); // hubo ≥3 meses para proyectar

    // Umbral de saturación del mapa de calor: celdas con ≥80% del máximo se marcan como "pico".
    const umbralSaturacion = useMemo(() => Math.max(1, Math.ceil(maxHeat * 0.8)), [maxHeat]);

    /* ── Datos para gráficos de bloqueos (bloqueosList ya excluye ALMUERZO y MANTENIMIENTO) ── */
    const bloqueosPorTipo = useMemo(() => {
        const p = bloqueosList.filter((b) => b.tipo === 'PARCIAL').length;
        const t = bloqueosList.filter((b) => b.tipo === 'TOTAL').length;
        const arr: { name: string; value: number; fill: string }[] = [];
        if (p > 0) arr.push({ name: 'Parcial', value: p, fill: UTEC.yellow });
        if (t > 0) arr.push({ name: 'Total', value: t, fill: UTEC.red });
        return arr;
    }, [bloqueosList]);

    const bloqueosPorMotivo = useMemo(() => {
        const m: Record<string, number> = {};
        bloqueosList.forEach((b) => { m[b.motivo] = (m[b.motivo] ?? 0) + 1; });
        return Object.entries(m).map(([motivo, cantidad]) => ({ motivo, cantidad })).sort((a, b) => b.cantidad - a.cantidad);
    }, [bloqueosList]);

    const bloqueosPorLab = useMemo(() => {
        const m: Record<string, number> = {};
        bloqueosList.forEach((b) => { m[b.laboratorioCodigo] = (m[b.laboratorioCodigo] ?? 0) + 1; });
        return Object.entries(m).map(([lab, cantidad]) => ({ lab, cantidad })).sort((a, b) => b.cantidad - a.cantidad).slice(0, 10);
    }, [bloqueosList]);

    /* ── (C) Bloqueos por día de la semana y por mes (de fechaInicio) ── */
    const bloqueosPorDiaSemana = useMemo(() => {
        const acc: Record<string, number> = {};
        bloqueosList.forEach((b) => { const d = new Date(b.fechaInicio + 'T00:00:00'); const dia = DIAS_ORDER[(d.getDay() + 6) % 7]; acc[dia] = (acc[dia] ?? 0) + 1; });
        return DIAS_ORDER.map((d) => ({ dia: d.slice(0, 3), cantidad: acc[d] ?? 0 }));
    }, [bloqueosList]);
    const bloqueosPorMes = useMemo(() => {
        const acc: Record<string, number> = {};
        bloqueosList.forEach((b) => { const mes = b.fechaInicio.slice(0, 7); acc[mes] = (acc[mes] ?? 0) + 1; });
        return Object.entries(acc).map(([mes, cantidad]) => ({ mes, cantidad })).sort((a, b) => a.mes.localeCompare(b.mes));
    }, [bloqueosList]);

    /* ── (E) Pareto de motivos de bloqueo (concentración) ── */
    const paretoMotivos = useMemo(() => {
        const src = [...bloqueosPorMotivo];
        const total = src.reduce((s, m) => s + m.cantidad, 0);
        let acc = 0;
        return src.map((m) => { acc += m.cantidad; return { motivo: m.motivo, cantidad: m.cantidad, acumulado: total > 0 ? Math.round((acc / total) * 1000) / 10 : 0 }; });
    }, [bloqueosPorMotivo]);

    /* ── (B) Resumen ejecutivo de BLOQUEOS: Δ vs periodo anterior + conclusiones (cliente) ── */
    const resumenBloqueos = useMemo(() => {
        const labCod = labId ? labs?.find((l: LabOption) => String(l.id) === labId)?.codigoLab : null;
        const noOperativo = (b: BloqueoItem) => b.motivo !== 'ALMUERZO' && b.motivo !== 'MANTENIMIENTO' && b.motivo !== 'FERIADO' && b.motivo !== 'RETIRO' && (!labCod || b.laboratorioCodigo === labCod);
        const enRango = (b: BloqueoItem, r: { ini: string; fin: string } | null) => !r || (b.fechaInicio <= r.fin && b.fechaFin >= r.ini);
        const cur = (bloqueosRaw ?? []).filter((b) => noOperativo(b) && enRango(b, rangoFechas(ciclo, anio)));
        const rp = rangoFechasPrev(ciclo, anio);
        const prev = rp ? (bloqueosRaw ?? []).filter((b) => noOperativo(b) && enRango(b, rp)) : null;
        const cuenta = (arr: BloqueoItem[]) => ({
            total: arr.length,
            parciales: arr.filter((b) => b.tipo === 'PARCIAL').length,
            totales: arr.filter((b) => b.tipo === 'TOTAL').length,
            labs: new Set(arr.map((b) => b.laboratorioCodigo)).size,
        });
        const a = cuenta(cur);
        const metrica = (etiqueta: string, actual: number, anterior: number) => {
            const deltaPct = anterior !== 0 ? Math.round(((actual - anterior) / anterior) * 1000) / 10 : null;
            return { etiqueta, actual, anterior, deltaPct, direccion: actual > anterior ? 'sube' : actual < anterior ? 'baja' : 'igual' };
        };
        const comparacion = prev ? (() => { const p = cuenta(prev); return { periodoAnterior: rp!.etiqueta, metricas: [metrica('Bloqueos', a.total, p.total), metrica('Parciales', a.parciales, p.parciales), metrica('Totales', a.totales, p.totales), metrica('Labs afectados', a.labs, p.labs)] }; })() : null;
        // Conclusiones de bloqueos
        const insights: { texto: string; tipo: string }[] = [];
        if (a.total === 0) { insights.push({ texto: 'No hay bloqueos (no operativos) en el periodo seleccionado.', tipo: 'neutro' }); }
        else {
            if (comparacion) { const d = comparacion.metricas[0].deltaPct; if (d !== null) insights.push({ texto: `Los bloqueos ${d >= 0 ? 'subieron' : 'bajaron'} ${Math.abs(d)}% respecto a ${rp!.etiqueta} (${comparacion.metricas[0].anterior} → ${a.total}).`, tipo: d >= 0 ? 'negativo' : 'positivo' }); }
            const topMotivo = [...bloqueosPorMotivo][0];
            if (topMotivo) insights.push({ texto: `El motivo más frecuente es ${topMotivo.motivo} (${topMotivo.cantidad} de ${a.total}).`, tipo: 'neutro' });
            const topLab = [...bloqueosPorLab][0];
            if (topLab) insights.push({ texto: `${topLab.lab} es el laboratorio más bloqueado (${topLab.cantidad}).`, tipo: 'neutro' });
            insights.push({ texto: `${a.totales} cierres totales y ${a.parciales} parciales sobre ${a.labs} laboratorio(s).`, tipo: 'neutro' });
        }
        return { comparacion, insights };
    }, [bloqueosRaw, ciclo, anio, labId, labs, bloqueosPorMotivo, bloqueosPorLab]);

    /* ── (A) Segmentación de estados (donut) para "Solo reservas" ── */
    const estadosDonut = useMemo(() => {
        if (!dashboard) return [];
        const items = [
            { name: 'Completadas', value: dashboard.completadas ?? 0, fill: UTEC.green },
            { name: 'Canceladas', value: dashboard.reservasCanceladas ?? 0, fill: UTEC.yellow },
            { name: 'No-shows', value: dashboard.noShows ?? 0, fill: UTEC.red },
            { name: 'Activas', value: dashboard.reservasActivas ?? 0, fill: UTEC.cyan },
        ];
        return items.filter((i) => i.value > 0);
    }, [dashboard]);

    /* ── Tendencia con granularidad: día de semana / semana del mes / mes ── */
    const tendenciaData = useMemo(() => {
        if (granularidad === 'mes') {
            return (dashboard?.reservasPorMes ?? []).map((m) => ({ label: m.mes, total: m.total, completadas: m.completadas, canceladas: m.canceladas, noShows: m.noShows }));
        }
        const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
        const DIA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
        type B = { label: string; sortKey: string; total: number; completadas: number; canceladas: number; noShows: number };
        const buckets = new Map<string, B>();
        (dashboard?.reservasPorDia ?? []).forEach((d) => {
            const date = new Date(d.fecha + 'T00:00:00');
            let key: string, label: string, sortKey: string;
            if (granularidad === 'dia') {
                const idx = date.getDay() === 0 ? 6 : date.getDay() - 1; // Lun=0 … Dom=6
                key = String(idx); label = DIA[idx]; sortKey = String(idx);
            } else {
                const wom = Math.ceil(date.getDate() / 7);
                key = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}-S${wom}`;
                label = `S${wom} ${MES[date.getMonth()]}`; sortKey = key;
            }
            const b = buckets.get(key) ?? { label, sortKey, total: 0, completadas: 0, canceladas: 0, noShows: 0 };
            b.total += d.total; b.completadas += d.completadas; b.canceladas += d.canceladas; b.noShows += d.noShows;
            buckets.set(key, b);
        });
        return [...buckets.values()].sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
    }, [dashboard, granularidad]);

    const exportCSV = () => {
        if (!tablaData?.length) return;
        const headers = ['ID', 'Fecha', 'Hora Inicio', 'Hora Fin', 'Estado', 'Lab', 'Recurso', 'Usuario', 'Correo', 'Carrera', 'Participantes', 'Tipo'];
        const rows = tablaData.map(r => [r.id, r.fecha, r.horaInicio, r.horaFin, r.estado, r.laboratorioCodigo, r.recursoNombre, r.usuarioNombre, r.usuarioCorreo, r.carrera || '', r.participantes, r.tipoReserva]);
        const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url;
        a.download = `reservas_${hoyLocal()}.csv`; a.click(); URL.revokeObjectURL(url);
    };

    const exportBloqueosCSV = () => {
        if (!bloqueosList?.length) return;
        const headers = ['ID', 'Lab', 'Tipo', 'Motivo', 'Descripción', 'Fecha Inicio', 'Fecha Fin', 'Hora Inicio', 'Hora Fin', 'Creado Por', 'Fecha Creación'];
        const rows = bloqueosList.map((b: BloqueoItem) => [b.id, b.laboratorioCodigo, b.tipo, b.motivo, b.descripcion || '', b.fechaInicio, b.fechaFin, b.horaInicio || 'Todo el día', b.horaFin || '', b.creadoPorNombre, b.createdAt]);
        const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url;
        a.download = `bloqueos_${hoyLocal()}.csv`; a.click(); URL.revokeObjectURL(url);
    };

    // ── Respaldo (solo ADMIN): descargar JSON y restaurar (dedup por ID) ──
    const descargarRespaldo = async () => {
        try {
            const { data } = await api.get('/respaldo');
            const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url;
            a.download = `respaldo_utec_${hoyLocal()}.json`; a.click(); URL.revokeObjectURL(url);
        } catch { toast.error('No se pudo descargar el respaldo'); }
    };
    const restaurarRespaldo = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const json = JSON.parse(await file.text());
            const { data } = await api.post('/respaldo', json);
            toast.success(`Restaurado: ${data.data.usuariosInsertados} alumnos, ${data.data.reservasInsertadas} reservas y ${data.data.bloqueosInsertados} bloqueos nuevos`);
            qc.invalidateQueries();
        } catch { toast.error('Archivo inválido o error al restaurar'); }
        e.target.value = '';
    };

    const clearFilters = () => { setLabId(''); setCiclo(''); setAnio(''); setVista('RESUMEN'); setCarrera(''); };
    const hasFilters = labId || ciclo || anio || vista !== 'RESUMEN' || carrera;

    if (isLoading) return <div className="text-center py-12 text-utec-gray-200">Cargando dashboard...</div>;

    /* ───────── Tabla de reservas reutilizable ───────── */
    const reservaCols: ColumnDef<ReservaDetalle, unknown>[] = [
        { accessorKey: 'fecha', header: 'Fecha' },
        { id: 'hora', header: 'Hora', accessorFn: (r) => `${r.horaInicio}–${r.horaFin}` },
        { accessorKey: 'estado', header: 'Estado', cell: ({ getValue }) => <EstadoBadge estado={getValue() as string} /> },
        { accessorKey: 'tipoReserva', header: 'Tipo', cell: ({ getValue }) => <TipoBadge tipo={getValue() as string} /> },
        { accessorKey: 'laboratorioCodigo', header: 'Lab' },
        { accessorKey: 'recursoNombre', header: 'Recurso' },
        { accessorKey: 'usuarioNombre', header: 'Usuario' },
        { accessorKey: 'usuarioCorreo', header: 'Correo' },
        { accessorKey: 'carrera', header: 'Carrera', cell: ({ getValue }) => (getValue() as string) || '—' },
        { accessorKey: 'participantes', header: 'Part.' },
    ];

    const TablaReservas = () => (
        <DataTable bare data={tablaData ?? []} columns={reservaCols} filename="reservas" searchPlaceholder="Buscar por lab, usuario, carrera, estado…" />
    );

    /* ───────── Tabla de bloqueos reutilizable ───────── */
    const TablaBloqueos = () => (
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
                <thead className="sticky top-0 bg-utec-gray-50 z-10">
                <tr className="border-b border-utec-gray-100">
                    {['ID', 'Lab', 'Tipo', 'Motivo', 'Título', 'Fecha', 'Horario', 'Responsable', 'Correo'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-xs font-medium text-utec-gray-200 uppercase whitespace-nowrap">{h}</th>
                    ))}
                </tr>
                </thead>
                <tbody>
                {bloqueosList?.map((b: BloqueoItem) => (
                    <tr key={b.id} className="border-b border-utec-gray-50 hover:bg-utec-gray-50">
                        <td className="px-3 py-2 font-mono text-utec-gray-200">{b.id}</td>
                        <td className="px-3 py-2 font-medium">{b.laboratorioCodigo}</td>
                        <td className="px-3 py-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${b.tipo === 'TOTAL' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>{b.tipo}</span>
                        </td>
                        <td className="px-3 py-2">{b.motivo}</td>
                        <td className="px-3 py-2">{b.descripcion || '—'}</td>
                        <td className="px-3 py-2">{b.fechaInicio}</td>
                        <td className="px-3 py-2">{b.horaInicio?.slice(0, 5) || 'Todo'} — {b.horaFin?.slice(0, 5) || 'el día'}</td>
                        <td className="px-3 py-2 font-medium">{b.responsableNombre || b.creadoPorNombre}</td>
                        <td className="px-3 py-2 text-utec-gray-200">{b.responsableCorreo || '—'}</td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );

    // ── Tarjetas reutilizables (se componen distinto según la vista: Todo / Reservas / Bloqueos / OEE) ──
    const hayCruce = cruce.carreras.length > 0 && cruce.labs.length > 0;
    // Tooltip de la ocupación apilada: por serie muestra el % y sus horas del payload.
    const tipOcupacion = (v: number, n: string, p: any) => {
        const d = p?.payload || {};
        const h = n === 'Reservas' ? d.horasReservadas : n === 'Eventos' ? d.horasEventos : d.horasClases;
        return [`${v}%  ·  ${h ?? 0} h`, n];
    };
    const ocupAlto = Math.max(160, (insights?.ocupacionPorLab?.length ?? 1) * 30); // 30px/lab → con 54 hace scroll
    const ocupacionCard = (
        <div className="card">
            <div className="flex items-baseline justify-between flex-wrap gap-1 mb-1">
                <h2 className="font-display font-bold text-utec-dark">% de ocupación por laboratorio{soloRes ? ' (solo reservas)' : ''}</h2>
                {/* Modo de conteo (antes era la vista "Solo reservas"): excluye eventos/clases. */}
                <label className="text-xs text-utec-gray-200 flex items-center gap-1.5 cursor-pointer select-none">
                    <input type="checkbox" checked={soloRes} onChange={(e) => setSoloRes(e.target.checked)} className="accent-[#00BFFF]" />
                    Solo reservas de alumnos
                </label>
            </div>
            <p className="text-xs text-utec-gray-200 mb-2">{soloRes
                ? 'Ocupación NETA: solo reservas de alumnos ÷ capacidad reservable = horario del lab menos las horas de evento y de clase (ahí el alumno no puede reservar) y menos los cierres por feriado/mantenimiento.'
                : 'Ocupación NETA: uso (reservas + eventos + clases) ÷ capacidad DISPONIBLE, apilado por tipo de uso. Las clases del horario académico cuentan como uso, aparte de eventos y reservas. La capacidad excluye feriados/mantenimiento (cierre) → no penaliza al lab por feriados. Las horas se recortan a la ventana del lab.'} La disponibilidad (% cerrado) se ve aparte. Filtra por ciclo para un % del periodo real. Se listan TODOS los labs con datos (independiente de activo/inactivo) — usa el scroll.</p>
            {!soloRes && (
                <div className="flex flex-wrap gap-3 mb-2 text-xs text-utec-gray-200">
                    <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: UTEC.cyan }} />Reservas de alumnos (mesas)</span>
                    <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: UTEC.orange }} />Eventos (bloqueos del lab)</span>
                    <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: UTEC.blue }} />Clases del horario académico</span>
                </div>
            )}
            <div className="overflow-y-auto pr-1" style={{ maxHeight: 460 }}>
                <ResponsiveContainer width="100%" height={ocupAlto}>
                    <BarChart data={insights?.ocupacionPorLab || []} layout="vertical" margin={{ top: 4, left: 4, right: 56, bottom: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                        <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} label={{ value: '% de ocupación', position: 'insideBottom', offset: -6, fontSize: 12, fill: ejeMuted }} />
                        <YAxis type="category" dataKey="codigoLab" tick={{ fontSize: 11 }} width={52} interval={0} />
                        <Tooltip formatter={tipOcupacion} />
                        <Bar dataKey="porcentajeReservas" stackId="oc" fill={UTEC.cyan} name="Reservas" isAnimationActive={false} radius={soloRes ? [0, 4, 4, 0] : [0, 0, 0, 0]}>
                            {soloRes && <LabelList dataKey="porcentaje" position="right" fontSize={11} fill={ejeColor} formatter={(v: number) => `${v}%`} />}
                        </Bar>
                        {!soloRes && <Bar dataKey="porcentajeEventos" stackId="oc" fill={UTEC.orange} name="Eventos" isAnimationActive={false} />}
                        {!soloRes && (
                            <Bar dataKey="porcentajeClases" stackId="oc" fill={UTEC.blue} name="Clases" isAnimationActive={false} radius={[0, 4, 4, 0]}>
                                <LabelList dataKey="porcentaje" position="right" fontSize={11} fill={ejeColor} formatter={(v: number) => `${v}%`} />
                            </Bar>
                        )}
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
    const tamanoGrupoCard = (
        <div className="card">
            <h2 className="font-display font-bold text-utec-dark mb-1">Tamaño de grupo</h2>
            <p className="text-xs text-utec-gray-200 mb-2">Alumnos por reserva (titular + acompañantes) — solo reservas de alumnos. Ayuda a dimensionar la capacidad de las mesas: si dominan los grupos de 1–2, sobran mesas grandes.</p>
            <ResponsiveContainer width="100%" height={260}>
                <BarChart data={insights?.tamanoGrupo || []} margin={{ top: 24, right: 10, left: 8, bottom: 18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" /><XAxis dataKey="participantes" tick={{ fontSize: 12 }} label={{ value: 'Participantes', position: 'insideBottom', offset: -4, fontSize: 12, fill: ejeMuted }} /><YAxis allowDecimals={false} domain={[0, (max: number) => Math.ceil((max || 1) * 1.15)]} label={{ value: 'N° de reservas', angle: -90, position: 'insideLeft', fontSize: 12, fill: ejeMuted, style: { textAnchor: 'middle' } }} /><Tooltip labelFormatter={(v) => `${v} participante(s)`} /><Bar dataKey="cantidad" fill={UTEC.blue} radius={[4, 4, 0, 0]} name="Reservas" isAnimationActive={false} label={{ position: 'top', fontSize: 11, fill: ejeColor }} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
    const disponibilidadCard = (
        <div className="card">
            <h2 className="font-display font-bold text-utec-dark mb-1">Disponibilidad por laboratorio</h2>
            <p className="text-xs text-utec-gray-200 mb-2">% del periodo que el lab estuvo <b>cerrado</b> (downtime), dentro de su horario: por <b>feriado o mantenimiento</b> (operativo) y por <b>cierre institucional de todo UTEC</b>. Se muestra <b>aparte</b> del % de ocupación (que es utilización del tiempo que sí estuvo abierto) para no confundir "cerrado" con "ocioso". Menos es mejor.</p>
            {(insights?.ocupacionPorLab?.length ?? 0) > 0 ? (
                <div className="overflow-y-auto pr-1" style={{ maxHeight: 460 }}>
                    <ResponsiveContainer width="100%" height={Math.max(120, (insights?.ocupacionPorLab?.length ?? 1) * 30)}>
                        <BarChart data={(insights?.ocupacionPorLab || []).map((o) => ({ ...o, pctNoDisp: Math.round((o.porcentajeCerrado + o.porcentajeCierre) * 10) / 10 }))} layout="vertical" margin={{ top: 4, left: 4, right: 56, bottom: 16 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                            <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} label={{ value: '% cerrado', position: 'insideBottom', offset: -6, fontSize: 12, fill: ejeMuted }} />
                            <YAxis type="category" dataKey="codigoLab" tick={{ fontSize: 11 }} width={52} interval={0} />
                            <Tooltip formatter={(v: number, name: string, p: any) => { const d = p?.payload || {}; const h = name === 'Cierre institucional' ? d.horasCierre : d.horasOperativas; return [`${v}%  —  ${h ?? 0} de ${d.capacidadTotal ?? 0} h`, name]; }} />
                            <Bar dataKey="porcentajeCerrado" stackId="cerr" fill={UTEC.gray} name="Operativo (feriado/mant.)" isAnimationActive={false} />
                            <Bar dataKey="porcentajeCierre" stackId="cerr" fill={UTEC.violet} radius={[0, 4, 4, 0]} name="Cierre institucional" isAnimationActive={false}>
                                <LabelList dataKey="pctNoDisp" position="right" fontSize={11} fill={ejeColor} formatter={(v: number) => `${v}%`} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            ) : <p className="text-sm text-utec-gray-200 text-center py-8">Sin datos</p>}
        </div>
    );
    const cruceCard = hayCruce ? (
        <div className="card">
            <h2 className="font-display font-bold text-utec-dark mb-1">Carrera × Laboratorio</h2>
            <p className="text-xs text-utec-gray-200 mb-3">Qué carrera domina qué laboratorio (reservas por participante). Útil para planificar horarios y convenios; escala cuando se importen más labs.</p>
            <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                <table className="border-collapse">
                    <thead className="sticky top-0 bg-white z-10"><tr><th className="text-xs text-utec-gray-200 font-medium p-2 text-left sticky left-0 bg-white">Carrera</th>{cruce.labs.map((l) => <th key={l} className="text-xs text-utec-gray-200 font-medium p-2 text-center">{l}</th>)}</tr></thead>
                    <tbody>{cruce.carreras.map((row) => (
                        <tr key={row.carrera}>
                            <td className="text-xs text-utec-dark p-2 pr-4 whitespace-nowrap sticky left-0 bg-white">{row.carrera}</td>
                            {cruce.labs.map((l) => { const v = row.m[l] ?? 0; const it = cruce.max > 0 ? v / cruce.max : 0; return <td key={l} className="p-0.5"><div className="min-w-[44px] h-7 rounded flex items-center justify-center text-xs font-medium" style={{ backgroundColor: it === 0 ? celdaVacia : `rgba(1, 94, 234, ${0.12 + it * 0.85})`, color: it > 0.5 ? 'white' : celdaTextoTenue }} title={`${row.carrera} · ${l}: ${v}`}>{v > 0 ? v : ''}</div></td>; })}
                        </tr>
                    ))}</tbody>
                </table>
            </div>
        </div>
    ) : null;
    const capacidadOciosaCard = (
        <div className="card">
            <h2 className="font-display font-bold text-utec-dark mb-1">Capacidad ociosa por laboratorio (horas){soloRes ? ' — reservable' : ''}</h2>
            <p className="text-xs text-utec-gray-200 mb-2">Horas-mesa que quedaron <b>libres DENTRO del horario de atención</b> de cada laboratorio (p. ej. 9:00 a. m.–6:00 p. m.; si el responsable cambia el horario del lab, el cálculo usa la nueva ventana automáticamente). {soloRes ? 'En modo "solo reservas" la capacidad reservable ya descuenta las horas de evento y de clase; lo libre es lo que el alumno pudo reservar y no reservó.' : 'Las clases y eventos que caen dentro de esa ventana cuentan como horas USADAS (no libres);'} lo que ocurre fuera del horario de atención no se cuenta. Los cierres por feriado/mantenimiento se excluyen de la capacidad (ver "Disponibilidad"). Ordenado por horas libres: dónde hay más cupo desaprovechado.</p>
            <div className="flex flex-wrap gap-3 mb-2 text-xs text-utec-gray-200">
                <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: UTEC.cyan }} />Usadas ({soloRes ? 'solo reservas de alumnos' : 'reservas + eventos + clases'})</span>
                <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: UTEC.gray }} />Libres (ociosas)</span>
            </div>
            <div className="overflow-y-auto pr-1" style={{ maxHeight: 460 }}>
                <ResponsiveContainer width="100%" height={Math.max(260, capacidadOciosa.length * 30)}>
                    <BarChart data={capacidadOciosa} layout="vertical" margin={{ top: 4, left: 4, right: 56, bottom: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                        <XAxis type="number" allowDecimals={false} label={{ value: 'Horas dentro del horario de atención', position: 'insideBottom', offset: -6, fontSize: 12, fill: ejeMuted }} />
                        <YAxis type="category" dataKey="codigoLab" tick={{ fontSize: 11 }} width={52} interval={0} />
                        <Tooltip formatter={(v: number, n: string) => [`${v} h`, n]} />
                        <Bar dataKey="usadas" stackId="cap" fill={UTEC.cyan} name={soloRes ? 'Usadas (solo reservas)' : 'Usadas (reservas + eventos + clases)'} isAnimationActive={false} />
                        <Bar dataKey="ociosas" stackId="cap" fill={UTEC.gray} radius={[0, 4, 4, 0]} name="Libres (ociosas)" isAnimationActive={false} label={{ position: 'right', fontSize: 11, fill: ejeColor, formatter: (v: number) => `${v}` }} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
    const heatmapCard = (
        <div className="card mb-6">
            <div className="flex items-baseline justify-between flex-wrap gap-1 mb-1">
                <h2 className="font-display font-bold text-utec-dark">Mapa de calor — Reservas de alumnos por día y hora</h2>
                <span className="text-xs text-utec-gray-200 flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ boxShadow: `inset 0 0 0 2px ${UTEC.red}`, backgroundColor: 'rgba(0,191,255,0.8)' }} /> franja pico (≥ {umbralSaturacion} reservas)</span>
            </div>
            <p className="text-xs text-utec-gray-200 mb-3">N° de reservas de alumnos en cada franja día × hora del periodo filtrado (no incluye eventos ni clases). Las celdas con borde rojo son la franja de saturación: ahí conviene reforzar atención o ampliar cupo.</p>
            <div className="overflow-x-auto"><table className="w-full border-collapse"><thead><tr><th className="text-xs text-utec-gray-200 font-medium p-2 text-left w-16">Hora</th>{DIAS_ORDER.map(d => <th key={d} className="text-xs text-utec-gray-200 font-medium p-2 text-center">{d.slice(0, 3)}</th>)}</tr></thead><tbody>{HORAS.map(hora => <tr key={hora}><td className="text-xs text-utec-gray-200 p-1 font-mono">{`${hora}:00`}</td>{DIAS_ORDER.map(dia => { const val = heatmapMatrix[dia]?.[hora] || 0; const intensity = maxHeat > 0 ? val / maxHeat : 0; const pico = val >= umbralSaturacion; return <td key={dia} className="p-0.5"><div className="w-full h-7 rounded flex items-center justify-center text-xs font-medium" style={{ backgroundColor: intensity === 0 ? celdaVacia : `rgba(0, 191, 255, ${0.15 + intensity * 0.85})`, color: intensity > 0.5 ? 'white' : celdaTextoTenue, boxShadow: pico ? `inset 0 0 0 2px ${UTEC.red}` : undefined }} title={`${dia} ${hora}:00 — ${val} reservas${pico ? ' · franja pico (saturación)' : ''}`}>{val > 0 ? val : ''}</div></td>; })}</tr>)}</tbody></table></div>
        </div>
    );

    // Resumen ejecutivo de BLOQUEOS (Δ vs periodo anterior + conclusiones, calculado en cliente).
    const resumenBloqueosCard = (
        <div className="mb-6 space-y-3">
            {resumenBloqueos.comparacion && (
                <div className="card">
                    <div className="flex items-baseline justify-between flex-wrap gap-1 mb-3">
                        <h2 className="font-display font-bold text-utec-dark">Bloqueos vs periodo anterior</h2>
                        <span className="text-xs text-utec-gray-200">vs {resumenBloqueos.comparacion.periodoAnterior}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {resumenBloqueos.comparacion.metricas.map((m) => {
                            const sube = m.direccion === 'sube', igual = m.direccion === 'igual';
                            // Bloqueos: más NO es necesariamente mejor → subir se pinta rojo, bajar verde.
                            const color = igual ? UTEC.gray : sube ? UTEC.red : UTEC.green;
                            const flecha = igual ? '→' : sube ? '▲' : '▼';
                            return (
                                <div key={m.etiqueta} className="bg-utec-gray-50 rounded-lg p-3">
                                    <p className="text-xs text-utec-gray-200">{m.etiqueta}</p>
                                    <p className="text-xl font-bold text-utec-dark leading-tight">{m.actual}</p>
                                    <p className="text-xs font-semibold mt-0.5" style={{ color }}>{flecha} {m.deltaPct === null ? '—' : `${m.deltaPct > 0 ? '+' : ''}${m.deltaPct}%`}<span className="text-utec-gray-200 font-normal"> vs {m.anterior}</span></p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
            {resumenBloqueos.insights.length > 0 && (
                <div className="card">
                    <h2 className="font-display font-bold text-utec-dark mb-2"><Search size={14} className="inline align-[-2px] mr-1" />Conclusiones (bloqueos)</h2>
                    <ul className="space-y-1.5">
                        {resumenBloqueos.insights.map((ins, i) => {
                            const dot = ins.tipo === 'positivo' ? UTEC.green : ins.tipo === 'negativo' ? UTEC.red : UTEC.gray;
                            return <li key={i} className="flex items-start gap-2 text-sm text-utec-dark"><span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dot }} /><span>{ins.texto}</span></li>;
                        })}
                    </ul>
                </div>
            )}
        </div>
    );

    // ── Panel "Hoy": foto operativa del día desde los datos ya cargados ──
    const hoyISO = hoyLocal();
    const bloqueosHoy = (bloqueosRaw ?? [])
        .filter((b) => b.fechaInicio <= hoyISO && b.fechaFin >= hoyISO)
        .sort((a, b) => (a.horaInicio ?? '').localeCompare(b.horaInicio ?? ''));
    const OPERATIVOS_HOY = ['ALMUERZO', 'MANTENIMIENTO', 'FERIADO', 'RETIRO'];
    const eventosHoy = bloqueosHoy.filter((b) => !OPERATIVOS_HOY.includes(b.motivo));
    const cierresHoy = bloqueosHoy.filter((b) => OPERATIVOS_HOY.includes(b.motivo));
    const reservasHoy = dashboard?.reservasPorDia?.find((d) => d.fecha === hoyISO)?.total ?? 0;
    const fechaLarga = new Date(hoyISO + 'T00:00:00').toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });

    return (
        <div>
            {/* ─── Header ─── */}
            <PageHeader
                title="Dashboard Analítico"
                subtitle={dashboard?.filtroDescripcion}
                actions={
                    <>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={refrescar}
                                disabled={isFetching}
                                className={`${btnOnBanner} ${isFetching ? 'opacity-60 cursor-wait' : ''}`}
                                title="Volver a cargar los datos del dashboard ahora"
                            >
                                <span className="inline-flex items-center gap-1.5"><RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} /> Actualizar</span>
                            </button>
                            {dataUpdatedAt > 0 && (
                                <span className="text-xs text-utec-gray-200 whitespace-nowrap" title="Última vez que se cargaron los datos">
                                    {isFetching ? 'Actualizando…' : `Actualizado ${haceCuanto(dataUpdatedAt)}`}
                                </span>
                            )}
                        </div>
                        {activeTab === 'graficos' && (
                            <>
                                <button onClick={descargarGraficos} className={btnOnBanner} title="Descargar las gráficas visibles como imagen PNG"><span className="inline-flex items-center gap-1.5"><ImageDown size={16} /> Descargar gráficos</span></button>
                                {esLabs && <button onClick={imprimirReporte} className={btnOnBanner} title="Genera un reporte ejecutivo de una página (Guardar como PDF)"><span className="inline-flex items-center gap-1.5"><Printer size={16} /> Reporte ejecutivo</span></button>}
                            </>
                        )}
                        {esAdmin && (
                            <div className="flex gap-2">
                                <button onClick={descargarRespaldo} className={btnOnBanner} title="Respaldo PARCIAL: descarga alumnos, reservas y bloqueos como JSON (NO incluye aulas, ciclos, clases ni organización). Para un respaldo total usa db/ops/backup.sh."><span className="inline-flex items-center gap-1.5"><Download size={16} /> Respaldo operativo</span></button>
                                <label className={`${btnOnBanner} cursor-pointer`} title="Subir un respaldo operativo (no duplica lo que ya existe)">
                                    <span className="inline-flex items-center gap-1.5"><Upload size={16} /> Restaurar</span>
                                    <input type="file" accept="application/json,.json" onChange={restaurarRespaldo} className="hidden" />
                                </label>
                            </div>
                        )}
                        {esLabs && (
                            <Segmented
                                value={activeTab}
                                onChange={setActiveTab}
                                options={[{ value: 'graficos', label: 'Gráficos' }, { value: 'tabla', label: 'Tabla de datos' }]}
                            />
                        )}
                    </>
                }
            />

            {/* ─── Switch de ámbito (solo ADMIN alterna; DOCENCIA nace en Aulas) ─── */}
            {esAdmin && (
                <div className="mb-4">
                    <Segmented
                        value={ambito}
                        onChange={(v) => setAmbito(v)}
                        options={[{ value: 'LABS', label: '🧪 Laboratorios' }, { value: 'AULAS', label: '🏫 Aulas' }]}
                    />
                </div>
            )}

            {/* ─── Filters ─── */}
            <div className="card mb-6">
                <div className="flex items-center gap-2 mb-3">
                    <h2 className="text-sm font-bold text-utec-dark">Filtros</h2>
                    {hasFilters && <button onClick={clearFilters} className="text-xs text-utec-cyan hover:underline">Limpiar filtros</button>}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {/* 1. Laboratorio (o vista global) — solo en ámbito labs */}
                    {esLabs && (
                    <div>
                        <label className="block text-xs text-utec-gray-200 mb-1">Laboratorio</label>
                        <select value={labId} onChange={(e) => setLabId(e.target.value)} className="input-field text-sm">
                            {!esAcotado && <option value="">Todos los laboratorios</option>}
                            {labs?.map((l: LabOption) => <option key={l.id} value={l.id}>{l.codigoLab} — {l.nombre}</option>)}
                        </select>
                    </div>
                    )}
                    {/* 2. Año (al cambiarlo se reinicia el ciclo) */}
                    <div>
                        <label className="block text-xs text-utec-gray-200 mb-1">Año</label>
                        <select value={anio} onChange={(e) => { setAnio(e.target.value); setCiclo(''); }} className="input-field text-sm">
                            <option value="">Todos los años</option>
                            {anios.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    {/* 3. Ciclo académico — SIEMPRE presente (deshabilitado hasta elegir año) para
                        que el resto de filtros no se muevan; solo lista los ciclos CON datos de ese año. */}
                    <div>
                        <label className="block text-xs text-utec-gray-200 mb-1">Ciclo académico</label>
                        <select value={ciclo} onChange={(e) => setCiclo(e.target.value)} disabled={!anio}
                            className="input-field text-sm disabled:bg-utec-gray-50 disabled:text-utec-gray-200 disabled:cursor-not-allowed">
                            {!anio ? (
                                <option value="">Elige un año primero</option>
                            ) : (
                                <>
                                    <option value="">Todo el año {anio}</option>
                                    {(ciclosPorAnio[anio] ?? []).map((c) => (
                                        <option key={c} value={`${anio}-${c}`}>{anio}-{c} ({CICLO_LABEL[c]})</option>
                                    ))}
                                </>
                            )}
                        </select>
                    </div>
                    {/* 4. Vista (fusión 4→2): Resumen combina reservas + bloqueos; OEE es la de instalación. */}
                    {esLabs && (
                    <div>
                        <label className="block text-xs text-utec-gray-200 mb-1">Vista</label>
                        <select value={vista} onChange={(e) => { setVista(e.target.value); if (e.target.value === 'OEE') setCarrera(''); }} className="input-field text-sm">
                            <option value="RESUMEN">Resumen (reservas + bloqueos)</option>
                            <option value="OEE">Uso del lab (OEE)</option>
                        </select>
                    </div>
                    )}
                    {/* 5. Carrera — atributo de las reservas → aplica en el Resumen (no en OEE/Aulas). */}
                    {esLabs && esResumen && (
                        <div className={`rounded-lg p-2 -m-2 transition-colors ${carrera ? 'bg-utec-cyan/10 ring-1 ring-utec-cyan' : ''}`}>
                            <label className="block text-xs font-bold text-utec-cyan mb-1"><GraduationCap size={14} className="inline align-[-2px] mr-1" />Carrera {carrera && <span className="ml-1 px-1.5 py-0.5 rounded bg-utec-cyan text-white text-[10px] align-middle">activo</span>}</label>
                            <select value={carrera} onChange={(e) => setCarrera(e.target.value)} className={`input-field text-sm ${carrera ? 'border-utec-cyan font-semibold text-utec-dark' : ''}`}>
                                <option value="">Todas las carreras</option>
                                {[...(dashboard?.reservasPorCarrera ?? [])].map(c => <option key={c.carrera} value={c.carrera}>{c.carrera}</option>)}
                            </select>
                        </div>
                    )}
                </div>
            </div>

            {/* ═══════════ ÁMBITO AULAS (ADMIN + DOCENCIA) ═══════════ */}
            {esAulas ? (
                <div ref={graficosRef}>
                    <p className="text-sm text-utec-gray-200 mb-4">Ámbito <b className="text-utec-dark">Aulas</b> (Programación Académica): las <b>clases del horario</b> son ocupación recurrente semanal y los <b>eventos</b> son bloqueos puntuales del aula. Filtra por año/ciclo para ver un periodo.</p>
                    {/* KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                        <KpiCard label="Clases programadas" value={aulasData?.totalClases ?? 0} hint="Sesiones semanales del horario académico en aulas (una fila del horario = una clase)." />
                        <KpiCard label="Horas dictadas / semana" value={aulasData?.horasSemanales ?? 0} color={UTEC.blue} hint="Horas de clase por semana; las quincenales (Semana A/B) cuentan 0.5." />
                        <KpiCard label="Aulas activas" value={aulasData?.aulasActivas ?? 0} color={UTEC.cyan} hint="Aulas activas en el catálogo (todas, tengan o no clases)." />
                        <KpiCard label="Eventos de aula" value={aulasData?.totalEventos ?? 0} color={UTEC.orange} hint="Bloqueos de aula que NO son clases (charlas, reservas del ambiente…) en el periodo." />
                    </div>
                    {/* % de ocupación por aula + por tipo de ambiente */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        <div className="card">
                            <h2 className="font-display font-bold text-utec-dark mb-1">% de ocupación por aula</h2>
                            <p className="text-xs text-utec-gray-200 mb-2">Horas de clase por semana ÷ ventana académica semanal (07:00–22:00 × Lun–Sáb = 90 h). Las quincenales pesan 0.5. Ordenado de más a menos saturada — usa el scroll.</p>
                            {(aulasData?.ocupacionPorAula?.length ?? 0) > 0 ? (
                                <div className="overflow-y-auto pr-1" style={{ maxHeight: 460 }}>
                                    <ResponsiveContainer width="100%" height={Math.max(160, (aulasData?.ocupacionPorAula?.length ?? 1) * 28)}>
                                        <BarChart data={aulasData?.ocupacionPorAula || []} layout="vertical" margin={{ top: 4, left: 4, right: 56, bottom: 16 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                                            <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} label={{ value: '% de ocupación semanal', position: 'insideBottom', offset: -6, fontSize: 12, fill: ejeMuted }} />
                                            <YAxis type="category" dataKey="codigo" tick={{ fontSize: 11 }} width={64} interval={0} />
                                            <Tooltip formatter={(v: number, _n, p: any) => [`${v}%  ·  ${p?.payload?.horasSemana ?? 0} h/sem`, 'Ocupación']} />
                                            <Bar dataKey="porcentaje" fill={UTEC.cyan} radius={[0, 4, 4, 0]} name="% ocupación" isAnimationActive={false} label={{ position: 'right', fontSize: 11, fill: ejeColor, formatter: (v: number) => `${v}%` }} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : <p className="text-sm text-utec-gray-200 text-center py-8">Sin clases en este periodo</p>}
                        </div>
                        <div className="card">
                            <h2 className="font-display font-bold text-utec-dark mb-1">Horas por tipo de ambiente</h2>
                            <p className="text-xs text-utec-gray-200 mb-2">Horas semanales de clase según el tipo de espacio (el tooltip muestra el n° de clases).</p>
                            {(aulasData?.porTipoAmbiente?.length ?? 0) > 0 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={aulasData?.porTipoAmbiente || []} margin={{ top: 24, right: 10, left: 8, bottom: 46 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                                        <XAxis dataKey="tipo" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" interval={0} height={56} />
                                        <YAxis allowDecimals={false} domain={[0, (max: number) => Math.ceil((max || 1) * 1.15)]} label={{ value: 'Horas / semana', angle: -90, position: 'insideLeft', fontSize: 12, fill: ejeMuted, style: { textAnchor: 'middle' } }} />
                                        <Tooltip formatter={(v: number, _n, p: any) => [`${v} h/sem  ·  ${p?.payload?.clases ?? 0} clases`, p?.payload?.tipo]} />
                                        <Bar dataKey="horasSemana" fill={UTEC.blue} radius={[4, 4, 0, 0]} name="Horas/semana" isAnimationActive={false} label={{ position: 'top', fontSize: 11, fill: ejeColor }} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : <p className="text-sm text-utec-gray-200 text-center py-8">Sin clases en este periodo</p>}
                        </div>
                    </div>
                    {/* Heatmap día × hora de clases (franja pico de docencia) */}
                    <div className="card mb-6">
                        <h2 className="font-display font-bold text-utec-dark mb-1">Mapa de calor — Clases por día y hora</h2>
                        <p className="text-xs text-utec-gray-200 mb-3">Cuántas clases se dictan a la vez en cada franja: la zona más intensa es la franja pico de docencia (dónde NO cabe una sección nueva) y la clara, dónde sí.</p>
                        <div className="overflow-x-auto"><table className="w-full border-collapse"><thead><tr><th className="text-xs text-utec-gray-200 font-medium p-2 text-left w-16">Hora</th>{DIAS_ORDER.map(d => <th key={d} className="text-xs text-utec-gray-200 font-medium p-2 text-center">{d.slice(0, 3)}</th>)}</tr></thead><tbody>{HORAS_AULA.map(hora => <tr key={hora}><td className="text-xs text-utec-gray-200 p-1 font-mono">{`${hora}:00`}</td>{DIAS_ORDER.map(dia => { const val = aulasHeatMatrix[dia]?.[hora] || 0; const intensity = maxAulasHeat > 0 ? val / maxAulasHeat : 0; return <td key={dia} className="p-0.5"><div className="w-full h-7 rounded flex items-center justify-center text-xs font-medium" style={{ backgroundColor: intensity === 0 ? celdaVacia : `rgba(1, 94, 234, ${0.12 + intensity * 0.85})`, color: intensity > 0.5 ? 'white' : celdaTextoTenue }} title={`${dia} ${hora}:00 — ${val} clases`}>{val > 0 ? val : ''}</div></td>; })}</tr>)}</tbody></table></div>
                    </div>
                    {/* Eventos de aula por mes */}
                    <div className="card mb-6">
                        <h2 className="font-display font-bold text-utec-dark mb-1">Eventos de aula por mes</h2>
                        <p className="text-xs text-utec-gray-200 mb-2">Bloqueos de aula que no son clases (charlas, actividades, reservas del ambiente).</p>
                        {(aulasData?.eventosPorMes?.length ?? 0) > 0 ? (
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={aulasData?.eventosPorMes || []} margin={{ top: 24, right: 10, left: 8, bottom: 18 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} label={{ value: 'Mes', position: 'insideBottom', offset: -4, fontSize: 12, fill: ejeMuted }} />
                                    <YAxis allowDecimals={false} domain={[0, (max: number) => Math.ceil((max || 1) * 1.15)]} label={{ value: 'N° de eventos', angle: -90, position: 'insideLeft', fontSize: 12, fill: ejeMuted, style: { textAnchor: 'middle' } }} />
                                    <Tooltip />
                                    <Bar dataKey="cantidad" fill={UTEC.orange} radius={[4, 4, 0, 0]} name="Eventos" isAnimationActive={false} label={{ position: 'top', fontSize: 11, fill: ejeColor }} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : <p className="text-sm text-utec-gray-200 text-center py-8">Sin eventos de aula en este periodo</p>}
                    </div>
                </div>
            ) : (
            <>
            {/* ─── Panel HOY (foto operativa del día) ─── */}
            <div className="card mb-6">
                <div className="flex items-center gap-2 mb-4">
                    <CalendarClock size={18} className="text-utec-cyan" />
                    <h2 className="text-base font-display font-bold text-ink">Hoy</h2>
                    <span className="text-sm text-ink-muted capitalize">· {fechaLarga}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                    <MiniStat label="Reservas hoy" value={reservasHoy} color="#00BFFF" />
                    <MiniStat label="Eventos hoy" value={eventosHoy.length} color="#015EEA" />
                    <MiniStat label="Cierres operativos" value={cierresHoy.length} color="#FBBC05" />
                </div>
                {bloqueosHoy.length > 0 ? (
                    <ul className="space-y-1.5">
                        {bloqueosHoy.slice(0, 6).map((b) => (
                            <li key={b.id} className="flex items-center gap-3 text-sm">
                                <span className="tabular text-ink-muted w-28 shrink-0">
                                    {b.horaInicio ? `${b.horaInicio.slice(0, 5)}–${b.horaFin?.slice(0, 5)}` : 'Todo el día'}
                                </span>
                                <span className="font-medium text-ink w-16 shrink-0">{b.laboratorioCodigo}</span>
                                <span className="text-ink-muted truncate">{b.descripcion || b.motivo}</span>
                            </li>
                        ))}
                        {bloqueosHoy.length > 6 && <li className="text-xs text-ink-muted pl-1">y {bloqueosHoy.length - 6} más…</li>}
                    </ul>
                ) : (
                    <p className="text-sm text-ink-muted">Sin eventos ni cierres programados para hoy.</p>
                )}
            </div>

            {/* ─── KPIs ─── */}
            {esOee ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-2">
                    <KpiCard label="Reservas" value={dashboard?.totalReservas ?? 0} hint="Total de reservas en el periodo filtrado (sin filtro = histórico completo)." />
                    <KpiCard label="Bloqueos" value={bloqueosList?.length ?? 0} color={UTEC.red} hint="Bloqueos de lab en el periodo (excluye ALMUERZO, que es operativo)." />
                    <KpiCard label="Completadas" value={dashboard?.completadas ?? 0} color={UTEC.blue} hint="Reservas con check-in realizado (uso presencial confirmado)." />
                    <KpiCard label="No-shows" value={dashboard?.noShows ?? 0} color={UTEC.red} hint="Reservas canceladas automáticamente por no hacer check-in a tiempo." />
                    <KpiCard label="Ocupación hoy" value={`${dashboard?.tasaOcupacionGeneral ?? 0}%`} color={UTEC.cyan} hint="Foto del momento: % de recursos ocupados HOY (no del periodo histórico). En vistas de años pasados sale 0%." />
                    <KpiCard label="Ausentismo" value={`${dashboard?.tasaAusentismo ?? 0}%`} color={UTEC.orange} hint="No-shows ÷ total de reservas. 0% si los datos importados no traían no-shows." />
                </div>
            ) : (
                /* Resumen: los KPIs fusionados de reservas + bloqueos (las "Activas" viven en el donut de estados). */
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-2">
                    <KpiCard label="Reservas" value={dashboard?.totalReservas ?? 0} hint="Total de reservas en el periodo filtrado (sin filtro = histórico completo)." />
                    <KpiCard label="Bloqueos" value={bloqueosList?.length ?? 0} color={UTEC.red} hint="Bloqueos de lab en el periodo (excluye los operativos: almuerzo/mantenimiento/feriado)." />
                    <KpiCard label="Completadas" value={dashboard?.completadas ?? 0} color={UTEC.blue} hint="Reservas con check-in realizado (uso presencial confirmado)." />
                    <KpiCard label="Canceladas" value={dashboard?.reservasCanceladas ?? 0} color={UTEC.yellow} hint="Reservas anuladas por el usuario o el sistema." />
                    <KpiCard label="No-shows" value={dashboard?.noShows ?? 0} color={UTEC.red} hint="Reservas canceladas automáticamente por no hacer check-in a tiempo." />
                    <KpiCard label="Ocupación hoy" value={`${dashboard?.tasaOcupacionGeneral ?? 0}%`} color={UTEC.cyan} hint="Foto del momento: % de recursos ocupados HOY (no del periodo histórico). En vistas de años pasados sale 0%." />
                    <KpiCard label="Ausentismo" value={`${dashboard?.tasaAusentismo ?? 0}%`} color={UTEC.orange} hint="No-shows ÷ total de reservas. 0% si los datos importados no traían no-shows." />
                    <KpiCard label="Cancelación" value={`${dashboard?.tasaCancelacion ?? 0}%`} color={UTEC.yellow} hint="Canceladas ÷ total de reservas." />
                </div>
            )}

            {/* ─── Leyenda de los KPIs ─── */}
            {(
                <details className="mb-6 text-sm text-utec-gray-200">
                    <summary className="cursor-pointer select-none text-utec-cyan font-medium hover:underline">ⓘ ¿Qué significa cada indicador?</summary>
                    <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 pl-1">
                        <li><span className="font-semibold text-utec-dark">Reservas / Total:</span> reservas en el periodo filtrado. Sin filtros = <em>histórico completo</em>.</li>
                        <li><span className="font-semibold text-utec-dark">Completadas:</span> con check-in realizado (uso presencial confirmado).</li>
                        <li><span className="font-semibold text-utec-dark">No-shows:</span> canceladas por no hacer check-in a tiempo.</li>
                        <li><span className="font-semibold text-utec-dark">Ocupación hoy:</span> foto del momento — % de recursos ocupados <em>hoy</em>, no del periodo. Por eso en años pasados sale 0%.</li>
                        <li><span className="font-semibold text-utec-dark">Ausentismo:</span> no-shows ÷ total. 0% si los datos importados no traían no-shows.</li>
                        <li><span className="font-semibold text-utec-dark">Bloqueos:</span> cierres del lab en el periodo (excluye ALMUERZO, que es operativo).</li>
                    </ul>
                </details>
            )}

            {/* ─── Anclas de navegación del Resumen (secciones temáticas) ─── */}
            {esResumen && activeTab === 'graficos' && (
                <nav className="mb-6 flex flex-wrap gap-2 text-sm">
                    {[['#sec-resumen', 'Resumen ejecutivo'], ['#sec-reservas', '📈 Reservas'], ['#sec-bloqueos', '🚧 Bloqueos'], ['#sec-operativo', '🛠️ Operativo']].map(([href, label]) => (
                        <a key={href} href={href} className="px-3 py-1.5 rounded-full border border-utec-gray-100 bg-white text-utec-dark hover:border-utec-cyan hover:text-utec-cyan transition-colors">{label}</a>
                    ))}
                </nav>
            )}

            {/* ═══════════ RESUMEN EJECUTIVO (dirección) ═══════════ */}
            {esResumen && resumen && (
                <div id="sec-resumen" className="mb-6 space-y-3 scroll-mt-20">
                    {/* Comparación vs periodo anterior: Δ de los KPIs clave */}
                    {resumen.comparacion && (
                        <div className="card">
                            <div className="flex items-baseline justify-between flex-wrap gap-1 mb-3">
                                <h2 className="font-display font-bold text-utec-dark">Comparación con el periodo anterior</h2>
                                <span className="text-xs text-utec-gray-200">{resumen.comparacion.periodoActual} <span className="mx-1">vs</span> {resumen.comparacion.periodoAnterior}</span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {resumen.comparacion.metricas.map((m) => {
                                    const sube = m.direccion === 'sube';
                                    const igual = m.direccion === 'igual';
                                    // Para las 4 métricas "más es mejor": sube=verde, baja=rojo.
                                    const color = igual ? UTEC.gray : sube ? UTEC.green : UTEC.red;
                                    const flecha = igual ? '→' : sube ? '▲' : '▼';
                                    const val = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}${m.unidad}`;
                                    return (
                                        <div key={m.etiqueta} className="bg-utec-gray-50 rounded-lg p-3">
                                            <p className="text-xs text-utec-gray-200">{m.etiqueta}</p>
                                            <p className="text-xl font-bold text-utec-dark leading-tight">{val(m.actual)}</p>
                                            <p className="text-xs font-semibold mt-0.5" style={{ color }}>
                                                {flecha} {m.deltaPct === null ? '—' : `${m.deltaPct > 0 ? '+' : ''}${m.deltaPct}%`}
                                                <span className="text-utec-gray-200 font-normal"> vs {val(m.anterior)}</span>
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    {/* Conclusiones automáticas */}
                    {(resumen.insights?.length ?? 0) > 0 && (
                        <div className="card">
                            <h2 className="font-display font-bold text-utec-dark mb-2"><Search size={14} className="inline align-[-2px] mr-1" />Conclusiones</h2>
                            <ul className="space-y-1.5">
                                {resumen.insights.map((ins, i) => {
                                    const dot = ins.tipo === 'positivo' ? UTEC.green : ins.tipo === 'negativo' ? UTEC.red : UTEC.gray;
                                    return (
                                        <li key={i} className="flex items-start gap-2 text-sm text-utec-dark">
                                            <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dot }} />
                                            <span>{ins.texto}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}
                    {/* Sello de procedencia: fuente y corte de los datos (para audiencia ejecutiva) */}
                    {resumen.procedencia && (
                    <p className="text-xs text-utec-gray-200 flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1">
                        <span><BarChart3 size={14} className="inline align-[-2px] mr-1" /><span className="font-medium text-utec-dark">Fuente:</span> {resumen.procedencia.fuente}</span>
                        {resumen.procedencia.rangoInicio && <span>· <span className="font-medium text-utec-dark">Datos:</span> {resumen.procedencia.rangoInicio} → {resumen.procedencia.rangoFin}</span>}
                        <span>· <span className="font-medium text-utec-dark">Corte:</span> {resumen.procedencia.corte}</span>
                        <span>· {resumen.procedencia.totalRegistros.toLocaleString('es-PE')} reservas</span>
                        <span>· {resumen.procedencia.labsConDatos} lab(s) con datos</span>
                    </p>
                    )}
                </div>
            )}

            {/* ═══════════ PESTAÑA GRÁFICOS ═══════════ */}
            {/* Leyenda/footnote permanente: cómo leer la ocupación y las ventanas horarias */}
            {activeTab === 'graficos' && (
                <details className="mb-6 rounded-lg border border-utec-gray-100 bg-utec-gray-50 px-4 py-3 text-xs text-utec-gray-200" open>
                    <summary className="cursor-pointer select-none font-semibold text-utec-dark">ⓘ Cómo se calcula la ocupación (ventanas horarias)</summary>
                    <ul className="mt-2 space-y-1 pl-1">
                        <li><Clock size={14} className="inline align-[-2px] mr-1" /><span className="font-medium text-utec-dark">Reservas de alumnos:</span> solo dentro del <span className="font-medium">horario del laboratorio</span> (p. ej. 9am–6pm).</li>
                        <li><Construction size={14} className="inline align-[-2px] mr-1" /><span className="font-medium text-utec-dark">Bloqueos/eventos:</span> ocurren en la ventana institucional <span className="font-medium">7am–11pm</span>, pero sus horas se <span className="font-medium">recortan al horario del lab</span> para el cálculo (un evento 7am–11pm sobre un lab 9am–6pm aporta 9h, no 16h).</li>
                        <li><BarChart3 size={14} className="inline align-[-2px] mr-1" /><span className="font-medium text-utec-dark">% de ocupación (NETA):</span> uso ÷ capacidad <span className="font-medium">disponible</span>. La capacidad <span className="font-medium">excluye feriados/mantenimiento</span> (el lab estuvo <span className="font-medium">cerrado</span>, no es capacidad ociosa) → no penaliza al lab por feriados. En <span className="font-medium">Todo/Solo bloqueos</span> = (reservas + eventos) ÷ capacidad; en <span className="font-medium">Solo reservas</span> = reservas ÷ capacidad reservable (descuenta también las horas de evento).</li>
                        <li><DoorOpen size={14} className="inline align-[-2px] mr-1" /><span className="font-medium text-utec-dark">Disponibilidad:</span> el cierre por feriado/mantenimiento <span className="font-medium">y por cierre institucional de todo UTEC</span> se reporta <span className="font-medium">aparte</span> (gráfica "Disponibilidad por laboratorio", % cerrado) — separa <em>"no lo usamos"</em> de <em>"estaba cerrado"</em> (modelo OEE).</li>
                    </ul>
                </details>
            )}
            {activeTab === 'graficos' && esResumen && (
                <div ref={graficosRef}>
                    {/* ═══ Sección RESERVAS: demanda y uso ═══ */}
                    <h2 id="sec-reservas" className="scroll-mt-20 font-display font-bold text-lg text-utec-dark border-b-2 border-utec-cyan pb-1 mb-4">📈 Reservas — demanda y uso</h2>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        <div className="card">
                            <h2 className="font-display font-bold text-utec-dark mb-1">Segmentación por tipo de uso</h2>
                            <p className="text-xs text-utec-gray-200 mb-3"><b>Reserva de alumno</b> = una mesa reservada desde la app · <b>Evento</b> = bloqueo TOTAL (una actividad reserva el laboratorio completo) · <b>Bloqueo parcial</b> = solo algunas mesas quedan tomadas (el resto sigue reservable). Las <b>clases del horario académico NO entran aquí</b>: se miden como categoría propia en "% de ocupación por laboratorio".</p>
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <StatBox label="Reservas de alumnos" value={dashboard?.reservasAlumno ?? 0} color={UTEC.cyan} />
                                {/* "Eventos" = bloqueos TOTAL (reservan el lab completo). reservasEvento quedó obsoleto (0 tras V9). */}
                                <StatBox label="Eventos (lab completo)" value={dashboard?.bloqueosTotales ?? 0} color={UTEC.blue} />
                                <StatBox label="Bloqueos parciales (por mesas)" value={dashboard?.bloqueosParciales ?? 0} color={UTEC.yellow} />
                            </div>
                            {pieData.length > 0 && (
                                <ResponsiveContainer width="100%" height={240}>
                                    <PieChart margin={PIE_MARGIN}><Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={62} innerRadius={36} paddingAngle={2} label={pieLabel} labelLine={false}>{pieData.map((e, i) => <Cell key={i} fill={e.fill} />)}</Pie><Tooltip formatter={(v: number, n: string) => [`${v}`, n]} /><Legend /></PieChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                        {/* Estados de las reservas (donut). La antigua tarjeta "Bloqueos" era
                            redundante con la sección Bloqueos de abajo (Parcial vs Total + detalle). */}
                        <div className="card">
                            <h2 className="font-display font-bold text-utec-dark mb-1">Estados de las reservas</h2>
                            <p className="text-xs text-utec-gray-200 mb-3">Resultado final de cada reserva de alumno: <b>Completada</b> = el alumno asistió e hizo check-in · <b>Cancelada</b> = anulada antes de usarse (por el alumno o un gestor) · <b>No-show</b> = no asistió y el sistema la canceló solo · <b>Activa</b> = aún vigente (pendiente, confirmada o en curso). Solo reservas de alumnos; no incluye eventos ni bloqueos.</p>
                            <div className="grid grid-cols-2 gap-3 mb-2">
                                <StatBox label="Completadas (con check-in)" value={dashboard?.completadas ?? 0} color={UTEC.green} />
                                <StatBox label="No-shows (no asistió)" value={dashboard?.noShows ?? 0} color={UTEC.red} />
                            </div>
                            {estadosDonut.length > 0 ? (
                                <ResponsiveContainer width="100%" height={240}>
                                    <PieChart margin={PIE_MARGIN}><Pie data={estadosDonut} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={62} innerRadius={36} paddingAngle={2} label={pieLabel} labelLine={false}>{estadosDonut.map((e, i) => <Cell key={i} fill={e.fill} />)}</Pie><Tooltip formatter={(v: number, n: string) => [`${v}`, n]} /><Legend /></PieChart>
                                </ResponsiveContainer>
                            ) : <p className="text-sm text-utec-gray-200 text-center py-8">Sin datos</p>}
                        </div>
                    </div>
                    {/* Embudo de estados + patrón semanal (2 columnas). */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        <div className="card">
                            <h2 className="font-display font-bold text-utec-dark mb-1">Embudo de estados</h2>
                            <p className="text-xs text-utec-gray-200 mb-2">Solo reservas de alumnos: de todas las registradas, cuántas terminaron en check-in (asistencia real). La caída entre etapas es la fuga por cancelación + no-show.</p>
                            <ResponsiveContainer width="100%" height={260}>
                                <FunnelChart margin={{ top: 10, right: 12, bottom: 10, left: 12 }}>
                                    <Tooltip formatter={(v: number, n: string) => [`${v}`, n]} />
                                    <Funnel dataKey="value" nameKey="name" data={embudoData} isAnimationActive={false}>
                                        {/* Nombre + valor CENTRADOS dentro del trapecio → el embudo queda
                                            centrado (sin correrse por las etiquetas laterales). */}
                                        <LabelList position="center" stroke="none" content={(p: any) => {
                                            const d = embudoData[Number(p.index) || 0] || { name: '' };
                                            const cx = Number(p.x || 0) + Number(p.width || 0) / 2;
                                            const cy = Number(p.y || 0) + Number(p.height || 0) / 2;
                                            return (
                                                <text x={cx} y={cy} textAnchor="middle" fill="#ffffff">
                                                    <tspan x={cx} dy="-3" fontSize={12} fontWeight="bold">{d.name}</tspan>
                                                    <tspan x={cx} dy="18" fontSize={13}>{p.value}</tspan>
                                                </text>
                                            );
                                        }} />
                                    </Funnel>
                                </FunnelChart>
                            </ResponsiveContainer>
                            {/* La caída del embudo = canceladas + no-show; se muestra aquí porque no
                                es una "etapa" posterior al check-in sino la fuga. */}
                            {(() => {
                                const total = dashboard?.totalReservas ?? 0;
                                const completadas = dashboard?.completadas ?? 0;
                                const perdidas = (dashboard?.reservasCanceladas ?? 0) + (dashboard?.noShows ?? 0);
                                const pct = total > 0 ? Math.round((completadas / total) * 100) : 0;
                                return (
                                    <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs text-utec-gray-200 -mt-1">
                                        <span><CheckCircle2 size={14} className="inline align-[-2px] mr-1" />Con check-in: <b className="text-utec-dark">{completadas}</b> ({pct}%)</span>
                                        <span><XCircle size={14} className="inline align-[-2px] mr-1" />Canceladas / no-show: <b className="text-utec-dark">{perdidas}</b></span>
                                    </div>
                                );
                            })()}
                        </div>
                        <div className="card">
                            <h2 className="font-display font-bold text-utec-dark mb-1">Reservas por día de la semana</h2>
                            <p className="text-xs text-utec-gray-200 mb-2">Patrón semanal agregado de las reservas de alumnos (no incluye eventos ni clases). Útil para planificar horarios y personal de atención.</p>
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={porDiaSemana} margin={{ top: 24, right: 10, left: 8, bottom: 18 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" /><XAxis dataKey="dia" tick={{ fontSize: 12 }} label={{ value: 'Día de la semana', position: 'insideBottom', offset: -4, fontSize: 12, fill: ejeMuted }} /><YAxis allowDecimals={false} domain={[0, (max: number) => Math.ceil((max || 1) * 1.15)]} label={{ value: 'N° de reservas', angle: -90, position: 'insideLeft', fontSize: 12, fill: ejeMuted, style: { textAnchor: 'middle' } }} /><Tooltip /><Bar dataKey="cantidad" fill={UTEC.cyan} radius={[4, 4, 0, 0]} name="Reservas" isAnimationActive={false} label={{ position: 'top', fontSize: 11, fill: ejeColor }} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    {/* Fila OEE: Ocupación + Disponibilidad — el par utilización/disponibilidad. */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        {ocupacionCard}
                        {disponibilidadCard}
                    </div>
                    {/* Fila secundaria: Tamaño de grupo + Cruce carrera×lab. */}
                    <div className={`grid grid-cols-1 ${hayCruce ? 'lg:grid-cols-2' : ''} gap-6 mb-6`}>
                        {tamanoGrupoCard}
                        {cruceCard}
                    </div>
                    {/* Reservas por carrera de alumnos (ancho completo). */}
                    <div className="card mb-6">
                            <h2 className="font-display font-bold text-utec-dark mb-1">Reservas por carrera de alumnos</h2>
                            <p className="text-xs text-utec-gray-200 mb-2">Se cuenta <b>por alumno participante</b>: una reserva con varios alumnos suma 1 a la carrera de <b>cada</b> participante (titular + acompañantes) — por eso el total puede superar el n° de reservas. Solo participantes con carrera registrada; la barra naranja es la carrera filtrada.</p>
                            {(dashboard?.reservasPorCarrera?.length ?? 0) > 0 ? (
                                <ResponsiveContainer width="100%" height={alturaCarrera}>
                                    <BarChart data={dashboard?.reservasPorCarrera || []} layout="vertical" margin={{ top: 0, left: 4, right: 40, bottom: 16 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                                        <XAxis type="number" allowDecimals={false} label={{ value: 'N° de reservas', position: 'insideBottom', offset: -6, fontSize: 12, fill: ejeMuted }} />
                                        <YAxis type="category" dataKey="carrera" tick={{ fontSize: 11 }} width={190} />
                                        <Tooltip />
                                        <Bar dataKey="cantidad" fill={UTEC.blue} radius={[0, 4, 4, 0]} name="Reservas" isAnimationActive={false} label={{ position: 'right', fontSize: 11, fill: ejeColor }}>
                                            {(dashboard?.reservasPorCarrera || []).map((c, i) => (
                                                <Cell key={i} fill={carrera && c.carrera === carrera ? UTEC.orange : UTEC.blue} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : <p className="text-sm text-utec-gray-200 text-center py-12">Sin datos de carrera (solo Affluences L108 los trae)</p>}
                        </div>
                    {/* ── Fase 2: Pareto de carreras + Capacidad ociosa por lab ── */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        <div className="card">
                            <h2 className="font-display font-bold text-utec-dark mb-1">Concentración de la demanda (Pareto)</h2>
                            <p className="text-xs text-utec-gray-200 mb-2">Pocas carreras explican la mayoría de las reservas de alumnos (regla 80/20): las <b>barras azules</b> son el núcleo que acumula el <b>80% de la demanda</b>{paretoCarreras.length > 0 ? <> — <b>{nucleoPareto} de {paretoCarreras.length} carreras</b></> : null}; las grises aportan el 20% restante. La línea naranja es el % acumulado y la punteada roja marca el corte del 80%. Cuenta por alumno participante (igual que "Reservas por carrera").</p>
                            {paretoCarreras.length > 0 ? (
                                <ResponsiveContainer width="100%" height={Math.max(280, paretoCarreras.length * 26)}>
                                    <ComposedChart data={paretoCarreras} margin={{ top: 16, right: 44, left: 8, bottom: 56 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                                        <XAxis dataKey="carrera" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} height={64}
                                            tickFormatter={(v: string) => v.length > 20 ? `${v.slice(0, 19)}…` : v} />
                                        <YAxis yAxisId="l" allowDecimals={false} label={{ value: 'Reservas (por alumno)', angle: -90, position: 'insideLeft', fontSize: 11, fill: ejeMuted, style: { textAnchor: 'middle' } }} />
                                        <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                                        <Tooltip formatter={(v: number, n: string) => n === '% acumulado' ? [`${v}%`, n] : [`${v}`, n]} />
                                        <ReferenceLine yAxisId="r" y={80} stroke={UTEC.red} strokeDasharray="4 4" label={{ value: '80%', position: 'right', fontSize: 10, fill: UTEC.red }} />
                                        <Bar yAxisId="l" dataKey="cantidad" radius={[4, 4, 0, 0]} name="Reservas" isAnimationActive={false} label={{ position: 'top', fontSize: 10, fill: ejeColor }}>
                                            {paretoCarreras.map((c, i) => <Cell key={i} fill={c.enNucleo ? UTEC.blue : UTEC.gray} />)}
                                        </Bar>
                                        <Line yAxisId="r" type="monotone" dataKey="acumulado" stroke={UTEC.orange} strokeWidth={2} dot={{ r: 2 }} name="% acumulado" isAnimationActive={false} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            ) : <p className="text-sm text-utec-gray-200 text-center py-12">Sin datos de carrera</p>}
                        </div>
                        {capacidadOciosaCard}
                    </div>
                    {heatmapCard}
                    {/* Una sola columna: cada gráfica de tendencia diaria/horaria ocupa el ANCHO
                        COMPLETO (antes iban a 2 columnas y "Reservas por día" quedaba a media
                        pantalla, con las barras apretadas al ver muchos días). */}
                    <div className="grid grid-cols-1 gap-6 mb-6">
                        <div className="card"><h2 className="font-display font-bold text-utec-dark mb-1">Reservas por hora</h2><p className="text-xs text-utec-gray-200 mb-3">Reservas de alumnos según su hora de inicio (demanda horaria acumulada del periodo). No incluye eventos ni clases.</p><ResponsiveContainer width="100%" height={280}><BarChart data={dashboard?.reservasPorHora || []} margin={{ top: 24, right: 10, left: 8, bottom: 18 }}><CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" /><XAxis dataKey="hora" tick={{ fontSize: 11 }} label={{ value: 'Hora del día', position: 'insideBottom', offset: -4, fontSize: 12, fill: ejeMuted }} /><YAxis allowDecimals={false} domain={[0, (max: number) => Math.ceil((max || 1) * 1.15)]} label={{ value: 'N° de reservas', angle: -90, position: 'insideLeft', fontSize: 12, fill: ejeMuted, style: { textAnchor: 'middle' } }} /><Tooltip /><Bar dataKey="cantidad" fill={UTEC.cyan} radius={[4, 4, 0, 0]} name="Reservas" label={{ position: 'top', fontSize: 11, fill: ejeColor }} /></BarChart></ResponsiveContainer></div>
                        <div className="card"><div className="flex items-center justify-between mb-1"><h2 className="font-display font-bold text-utec-dark">Reservas por día</h2>{nDiasReserva > 24 && <span className="text-xs text-utec-gray-200">← desliza para ver todos los días →</span>}</div><p className="text-xs text-utec-gray-200 mb-3">Reservas de alumnos por fecha, apiladas según su estado final (completada / cancelada / no-show).</p><div className="overflow-x-auto pb-1"><div style={{ minWidth: anchoPorDia }}><ResponsiveContainer width="100%" height={340}><BarChart data={dashboard?.reservasPorDia || []} margin={{ top: 5, right: 10, left: 8, bottom: 18 }}><CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" /><XAxis dataKey="fecha" tick={{ fontSize: 10 }} interval={2} tickFormatter={(v) => v.slice(5)} label={{ value: 'Fecha (MM-DD)', position: 'insideBottom', offset: -4, fontSize: 12, fill: ejeMuted }} /><YAxis allowDecimals={false} label={{ value: 'N° de reservas', angle: -90, position: 'insideLeft', fontSize: 12, fill: ejeMuted, style: { textAnchor: 'middle' } }} /><Tooltip labelFormatter={(v) => `Fecha: ${v}`} /><Legend /><Bar dataKey="completadas" stackId="d" fill={UTEC.green} name="Completadas" isAnimationActive={false} /><Bar dataKey="canceladas" stackId="d" fill={UTEC.yellow} name="Canceladas" isAnimationActive={false} /><Bar dataKey="noShows" stackId="d" fill={UTEC.red} radius={[4, 4, 0, 0]} name="No-shows" isAnimationActive={false} /></BarChart></ResponsiveContainer></div></div></div>
                    </div>
                    {/* ── Fase 3: Proyección de demanda + media móvil ── */}
                    <div className="card mb-6">
                        <h2 className="font-display font-bold text-utec-dark mb-1">Proyección de demanda</h2>
                        <p className="text-xs text-utec-gray-200 mb-2">Basada solo en reservas de alumnos: total mensual (barras) + media móvil de 3 meses (suaviza el ruido) + proyección lineal de los próximos 2 meses (línea punteada). {hayProyeccion ? 'Estimación simple para planear capacidad.' : 'Se necesitan ≥3 meses de datos para proyectar.'}</p>
                        <ResponsiveContainer width="100%" height={320}>
                            <ComposedChart data={proyeccion} margin={{ top: 24, right: 12, left: 8, bottom: 18 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                                <XAxis dataKey="mes" tick={{ fontSize: 11 }} label={{ value: 'Mes', position: 'insideBottom', offset: -4, fontSize: 12, fill: ejeMuted }} />
                                <YAxis allowDecimals={false} domain={[0, (max: number) => Math.ceil((max || 1) * 1.15)]} label={{ value: 'N° de reservas', angle: -90, position: 'insideLeft', fontSize: 12, fill: ejeMuted, style: { textAnchor: 'middle' } }} />
                                <Tooltip formatter={(v: number, n: string) => [v == null ? '—' : `${v}`, n]} />
                                <Legend />
                                <Bar dataKey="total" fill={UTEC.cyan} radius={[4, 4, 0, 0]} name="Reservas (real)" isAnimationActive={false} label={{ position: 'top', fontSize: 10, fill: ejeColor }} />
                                <Line type="monotone" dataKey="media" stroke={UTEC.blue} strokeWidth={2} dot={false} name="Media móvil 3m" isAnimationActive={false} connectNulls />
                                <Line type="monotone" dataKey="proyeccion" stroke={UTEC.orange} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} name="Proyección" isAnimationActive={false} connectNulls />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                    {/* Reservas por mes — ANCHO COMPLETO, entre "Reservas por día" y "Tendencia". */}
                    <div className="card mb-6"><h2 className="font-display font-bold text-utec-dark mb-1">Reservas por mes</h2><p className="text-xs text-utec-gray-200 mb-3">Reservas de alumnos por mes: total y desglose por estado final. No incluye eventos ni clases.</p><ResponsiveContainer width="100%" height={340}><BarChart data={dashboard?.reservasPorMes || []} margin={{ top: 24, right: 10, left: 8, bottom: 18 }}><CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" /><XAxis dataKey="mes" tick={{ fontSize: 12 }} label={{ value: 'Mes', position: 'insideBottom', offset: -4, fontSize: 12, fill: ejeMuted }} /><YAxis allowDecimals={false} label={{ value: 'N° de reservas', angle: -90, position: 'insideLeft', fontSize: 12, fill: ejeMuted, style: { textAnchor: 'middle' } }} domain={[0, (max: number) => Math.ceil((max || 1) * 1.15)]} /><Tooltip /><Legend /><Bar dataKey="total" fill={UTEC.cyan} radius={[4, 4, 0, 0]} name="Total" label={{ position: 'top', fontSize: 11, fill: ejeColor }} /><Bar dataKey="completadas" fill={UTEC.green} radius={[4, 4, 0, 0]} name="Completadas" label={{ position: 'top', fontSize: 10, fill: ejeColor }} /><Bar dataKey="canceladas" fill={UTEC.yellow} radius={[4, 4, 0, 0]} name="Canceladas" label={{ position: 'top', fontSize: 10, fill: ejeColor }} /><Bar dataKey="noShows" fill={UTEC.red} radius={[4, 4, 0, 0]} name="No-shows" label={{ position: 'top', fontSize: 10, fill: ejeColor }} /></BarChart></ResponsiveContainer></div>
                    <div className="card mb-6">
                        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                            <h2 className="font-display font-bold text-utec-dark">Tendencia de reservas</h2>
                            <div className="flex bg-utec-gray-50 rounded-lg p-1 border border-utec-gray-100">
                                {([['dia', 'Día de semana'], ['semana', 'Semana del mes'], ['mes', 'Mes']] as const).map(([v, l]) => (
                                    <button key={v} onClick={() => setGranularidad(v)} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${granularidad === v ? 'bg-utec-cyan text-white' : 'text-utec-gray-200 hover:text-utec-dark'}`}>{l}</button>
                                ))}
                            </div>
                        </div>
                        <p className="text-xs text-utec-gray-200 mb-3">Evolución de las reservas de alumnos por estado final, con la granularidad elegida (día de semana / semana del mes / mes).</p>
                        {tendenciaData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={tendenciaData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                                    <YAxis allowDecimals={false} />
                                    <Tooltip />
                                    <Legend />
                                    <Line type="monotone" dataKey="total" stroke={UTEC.cyan} strokeWidth={2} dot={false} name="Total" />
                                    <Line type="monotone" dataKey="completadas" stroke={UTEC.green} strokeWidth={1.5} dot={false} name="Completadas" />
                                    <Line type="monotone" dataKey="canceladas" stroke={UTEC.yellow} strokeWidth={1.5} dot={false} name="Canceladas" />
                                    <Line type="monotone" dataKey="noShows" stroke={UTEC.red} strokeWidth={1.5} dot={false} name="No-shows" />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : <p className="text-sm text-utec-gray-200 text-center py-12">Sin datos en este periodo</p>}
                    </div>

                    {/* ═══ Sección BLOQUEOS (la antigua vista "Solo bloqueos") ═══ */}
                    <h2 id="sec-bloqueos" className="scroll-mt-20 font-display font-bold text-lg text-utec-dark border-b-2 border-utec-cyan pb-1 mb-4">🚧 Bloqueos</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                        <KpiCard label="Total bloqueos" value={bloqueosList?.length ?? 0} />
                        <KpiCard label="Parciales" value={bloqueosList?.filter((b: BloqueoItem) => b.tipo === 'PARCIAL').length ?? 0} color={UTEC.yellow} />
                        <KpiCard label="Totales" value={bloqueosList?.filter((b: BloqueoItem) => b.tipo === 'TOTAL').length ?? 0} color={UTEC.red} />
                        <KpiCard label="Labs afectados" value={new Set(bloqueosList?.map((b: BloqueoItem) => b.laboratorioCodigo)).size ?? 0} color={UTEC.cyan} />
                    </div>
                    {resumenBloqueosCard}
                    {(bloqueosList?.length ?? 0) === 0 ? (
                        <div className="card mb-6"><p className="text-sm text-utec-gray-200 text-center py-12">Sin bloqueos en este periodo</p></div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                                <div className="card">
                                    <h2 className="font-display font-bold text-utec-dark mb-1">Parcial vs Total</h2>
                                    <p className="text-xs text-utec-gray-200 mb-3">Alcance de cada bloqueo: <b>TOTAL</b> = la actividad reserva el laboratorio completo (ninguna mesa queda libre) · <b>PARCIAL</b> = solo las mesas seleccionadas (el resto sigue reservable). Las <b>clases del horario académico NO se cuentan aquí</b> (no son bloqueos; se ven en "% de ocupación"); un motivo CLASE/EXAMEN en esta sección es un bloqueo puntual registrado a mano.</p>
                                    <ResponsiveContainer width="100%" height={240}>
                                        <PieChart margin={PIE_MARGIN}>
                                        <Pie data={bloqueosPorTipo} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={40} paddingAngle={2} label={pieLabel} labelLine={false}>{bloqueosPorTipo.map((e, i) => <Cell key={i} fill={e.fill} />)}</Pie><Tooltip formatter={(v: number, n: string) => [`${v} bloqueo(s)`, n === 'Total' ? 'Total (lab completo)' : 'Parcial (algunas mesas)']} />
                                        <Legend formatter={(n: string) => n === 'Total' ? 'Total (lab completo)' : 'Parcial (algunas mesas)'} /></PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="lg:col-span-2 card">
                                    <h2 className="font-display font-bold text-utec-dark mb-1">Bloqueos por motivo</h2>
                                    <p className="text-xs text-utec-gray-200 mb-3">Motivo declarado al crear cada bloqueo. Excluye los operativos (almuerzo/mantenimiento/feriado — ver la sección Operativo); CLASE y EXAMEN aquí son bloqueos puntuales creados a mano, no el horario académico recurrente.</p>
                                    <ResponsiveContainer width="100%" height={220}>
                                        <BarChart data={bloqueosPorMotivo} margin={{ top: 24, right: 10, left: 8, bottom: 18 }}><CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" /><XAxis dataKey="motivo" tick={{ fontSize: 11 }} label={{ value: 'Motivo', position: 'insideBottom', offset: -4, fontSize: 12, fill: ejeMuted }} /><YAxis allowDecimals={false} domain={[0, (max: number) => Math.ceil((max || 1) * 1.15)]} label={{ value: 'N° de bloqueos', angle: -90, position: 'insideLeft', fontSize: 12, fill: ejeMuted, style: { textAnchor: 'middle' } }} /><Tooltip /><Bar dataKey="cantidad" fill={UTEC.orange} radius={[4, 4, 0, 0]} name="Bloqueos" isAnimationActive={false} label={{ position: 'top', fontSize: 11, fill: ejeColor }} /></BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                            {/* La Disponibilidad (% cerrado) ya se muestra arriba, junto a la Ocupación:
                                aquí "Labs más bloqueados" se empareja con el Pareto de motivos. */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                                <div className="card">
                                    <h2 className="font-display font-bold text-utec-dark mb-1">Laboratorios más bloqueados</h2>
                                    <p className="text-xs text-utec-gray-200 mb-3">Top 10 laboratorios por n° de bloqueos (parciales + totales) del periodo filtrado. Excluye operativos y clases del horario.</p>
                                    <ResponsiveContainer width="100%" height={Math.max(180, bloqueosPorLab.length * 36)}>
                                        <BarChart data={bloqueosPorLab} layout="vertical" margin={{ left: 30, right: 40, bottom: 16 }}><CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" /><XAxis type="number" allowDecimals={false} label={{ value: 'N° de bloqueos', position: 'insideBottom', offset: -6, fontSize: 12, fill: ejeMuted }} /><YAxis type="category" dataKey="lab" tick={{ fontSize: 12 }} width={70} /><Tooltip /><Bar dataKey="cantidad" fill={UTEC.cyan} radius={[0, 4, 4, 0]} name="Bloqueos" isAnimationActive={false} label={{ position: 'right', fontSize: 11, fill: ejeColor }} /></BarChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="card">
                                    <h2 className="font-display font-bold text-utec-dark mb-1">Concentración de motivos (Pareto)</h2>
                                    <p className="text-xs text-utec-gray-200 mb-2">Qué motivos concentran la mayoría de los cierres. La línea es el % acumulado; donde cruza el 80% están los pocos motivos que explican el grueso.</p>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <ComposedChart data={paretoMotivos} margin={{ top: 12, right: 44, left: 8, bottom: 18 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                                            <XAxis dataKey="motivo" tick={{ fontSize: 11 }} />
                                            <YAxis yAxisId="l" allowDecimals={false} label={{ value: 'Bloqueos', angle: -90, position: 'insideLeft', fontSize: 11, fill: ejeMuted, style: { textAnchor: 'middle' } }} />
                                            <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                                            <Tooltip formatter={(v: number, n: string) => n === '% acumulado' ? [`${v}%`, n] : [`${v}`, n]} />
                                            <ReferenceLine yAxisId="r" y={80} stroke={UTEC.red} strokeDasharray="4 4" label={{ value: '80%', position: 'right', fontSize: 10, fill: UTEC.red }} />
                                            <Bar yAxisId="l" dataKey="cantidad" fill={UTEC.orange} radius={[4, 4, 0, 0]} name="Bloqueos" isAnimationActive={false} label={{ position: 'top', fontSize: 11, fill: ejeColor }} />
                                            <Line yAxisId="r" type="monotone" dataKey="acumulado" stroke={UTEC.blue} strokeWidth={2} dot={{ r: 2 }} name="% acumulado" isAnimationActive={false} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                            {/* Patrón temporal de los bloqueos */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                                <div className="card">
                                    <h2 className="font-display font-bold text-utec-dark mb-1">Bloqueos por día de la semana</h2>
                                    <p className="text-xs text-utec-gray-200 mb-2">Qué días se cierra más el laboratorio (patrón semanal). Cada bloqueo cuenta una vez, según su fecha de inicio.</p>
                                    <ResponsiveContainer width="100%" height={260}>
                                        <BarChart data={bloqueosPorDiaSemana} margin={{ top: 24, right: 10, left: 8, bottom: 18 }}><CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" /><XAxis dataKey="dia" tick={{ fontSize: 12 }} label={{ value: 'Día de la semana', position: 'insideBottom', offset: -4, fontSize: 12, fill: ejeMuted }} /><YAxis allowDecimals={false} domain={[0, (max: number) => Math.ceil((max || 1) * 1.15)]} label={{ value: 'N° de bloqueos', angle: -90, position: 'insideLeft', fontSize: 12, fill: ejeMuted, style: { textAnchor: 'middle' } }} /><Tooltip /><Bar dataKey="cantidad" fill={UTEC.orange} radius={[4, 4, 0, 0]} name="Bloqueos" isAnimationActive={false} label={{ position: 'top', fontSize: 11, fill: ejeColor }} /></BarChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="card">
                                    <h2 className="font-display font-bold text-utec-dark mb-1">Bloqueos por mes</h2>
                                    <p className="text-xs text-utec-gray-200 mb-2">Tendencia mensual de los cierres, por fecha de inicio del bloqueo. Sirve para anticipar los meses con más actividad de eventos.</p>
                                    <ResponsiveContainer width="100%" height={260}>
                                        <BarChart data={bloqueosPorMes} margin={{ top: 24, right: 10, left: 8, bottom: 18 }}><CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" /><XAxis dataKey="mes" tick={{ fontSize: 11 }} label={{ value: 'Mes', position: 'insideBottom', offset: -4, fontSize: 12, fill: ejeMuted }} /><YAxis allowDecimals={false} domain={[0, (max: number) => Math.ceil((max || 1) * 1.15)]} label={{ value: 'N° de bloqueos', angle: -90, position: 'insideLeft', fontSize: 12, fill: ejeMuted, style: { textAnchor: 'middle' } }} /><Tooltip /><Bar dataKey="cantidad" fill={UTEC.blue} radius={[4, 4, 0, 0]} name="Bloqueos" isAnimationActive={false} label={{ position: 'top', fontSize: 11, fill: ejeColor }} /></BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </>
                    )}
                    <div className="card mb-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-display font-bold text-utec-dark">Detalle de Bloqueos</h2>
                            <button onClick={exportBloqueosCSV} disabled={!bloqueosList?.length} className="btn-primary text-sm disabled:opacity-50">Exportar CSV</button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <div className="bg-utec-gray-50 rounded-lg p-4"><p className="text-sm text-utec-gray-200 mb-1">Lab más bloqueado</p><p className="text-lg font-bold text-utec-dark">{dashboard?.bloqueoStats?.laboratorioMasBloqueado || '—'}</p></div>
                            <div className="bg-utec-gray-50 rounded-lg p-4"><p className="text-sm text-utec-gray-200 mb-1">Motivo más frecuente</p><p className="text-lg font-bold text-utec-dark">{dashboard?.bloqueoStats?.motivoMasFrecuente || '—'}</p></div>
                        </div>
                        {bloqueosList?.length ? <TablaBloqueos /> : <p className="text-sm text-utec-gray-200 text-center py-8">Sin bloqueos activos</p>}
                    </div>

                    {/* ═══ Sección OPERATIVO (colapsable): mant + almuerzo + feriado + retiro + cierre ═══ */}
                    <details id="sec-operativo" className="card mb-6 scroll-mt-20">
                        <summary className="cursor-pointer select-none">
                            <h2 className="font-display font-bold text-utec-dark inline"><Wrench size={14} className="inline align-[-2px] mr-1" />Operativo — Mantenimiento, Almuerzo, Feriado, Retiro y Cierre</h2>
                            <p className="text-xs text-utec-gray-200 mt-1">Todo lo que reduce la capacidad del lab sin ser un evento: mantenimiento/almuerzo/feriado, <b>retiro de mesas</b> (mesas fuera un periodo) y <b>cierre institucional</b> (UTEC cerrada). No cuentan como eventos ni envían correos. Despliega para verlos aparte.</p>
                        </summary>
                        <div className="mt-4 grid grid-cols-3 md:grid-cols-5 gap-3 mb-6">
                            <StatBox label="Mantenimientos" value={operativos?.totalMantenimiento ?? 0} color={UTEC.gray} />
                            <StatBox label="Almuerzos" value={operativos?.totalAlmuerzo ?? 0} color={UTEC.orange} />
                            <StatBox label="Feriados" value={operativos?.totalFeriado ?? 0} color={UTEC.blue} />
                            <StatBox label="Retiros de mesas" value={operativos?.totalRetiro ?? 0} color={UTEC.violet} />
                            <StatBox label="Días de cierre (UTEC)" value={operativos?.totalDiasCierre ?? 0} color={UTEC.red} />
                        </div>
                        {((operativos?.porLaboratorio?.length ?? 0) === 0 && (operativos?.porMes?.length ?? 0) === 0) ? (
                            <p className="text-sm text-utec-gray-200 text-center py-8">Sin bloqueos operativos en este periodo</p>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div>
                                    <h3 className="text-sm font-semibold text-utec-dark mb-2">Por laboratorio</h3>
                                    <ResponsiveContainer width="100%" height={Math.max(180, (operativos?.porLaboratorio?.length ?? 1) * 36)}>
                                        <BarChart data={operativos?.porLaboratorio || []} layout="vertical" margin={{ left: 20, right: 30, bottom: 16 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                                            <XAxis type="number" allowDecimals={false} label={{ value: 'N° de bloqueos', position: 'insideBottom', offset: -6, fontSize: 12, fill: ejeMuted }} />
                                            <YAxis type="category" dataKey="laboratorio" tick={{ fontSize: 11 }} width={130} />
                                            <Tooltip /><Legend />
                                            <Bar dataKey="mantenimiento" stackId="op" fill={UTEC.gray} name="Mantenimiento" isAnimationActive={false} />
                                            <Bar dataKey="almuerzo" stackId="op" fill={UTEC.orange} name="Almuerzo" isAnimationActive={false} />
                                            <Bar dataKey="feriado" stackId="op" fill={UTEC.blue} name="Feriado" isAnimationActive={false} />
                                            <Bar dataKey="retiro" stackId="op" fill={UTEC.violet} name="Retiro de mesas" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold text-utec-dark mb-2">Por mes</h3>
                                    <ResponsiveContainer width="100%" height={220}>
                                        <BarChart data={operativos?.porMes || []} margin={{ top: 5, right: 10, left: 8, bottom: 18 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                                            <XAxis dataKey="mes" tick={{ fontSize: 11 }} label={{ value: 'Mes', position: 'insideBottom', offset: -4, fontSize: 12, fill: ejeMuted }} />
                                            <YAxis allowDecimals={false} label={{ value: 'N° de bloqueos', angle: -90, position: 'insideLeft', fontSize: 12, fill: ejeMuted, style: { textAnchor: 'middle' } }} />
                                            <Tooltip /><Legend />
                                            <Bar dataKey="mantenimiento" stackId="op" fill={UTEC.gray} name="Mantenimiento" isAnimationActive={false} />
                                            <Bar dataKey="almuerzo" stackId="op" fill={UTEC.orange} name="Almuerzo" isAnimationActive={false} />
                                            <Bar dataKey="feriado" stackId="op" fill={UTEC.blue} name="Feriado" isAnimationActive={false} />
                                            <Bar dataKey="retiro" stackId="op" fill={UTEC.violet} name="Retiro de mesas" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}
                        {(operativos?.historial?.length ?? 0) > 0 && (
                            <div className="mt-6">
                                <h3 className="text-sm font-semibold text-utec-dark mb-2">Historial ({operativos?.historial.length})</h3>
                                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                                    <table className="min-w-full text-sm">
                                        <thead className="sticky top-0 bg-utec-gray-50 z-10"><tr className="text-left text-utec-gray-200 border-b">
                                            <th className="py-2 px-3 whitespace-nowrap">Lab</th><th className="py-2 px-3 whitespace-nowrap">Motivo</th><th className="py-2 px-3 whitespace-nowrap">Tipo</th><th className="py-2 px-3 whitespace-nowrap">Fecha</th><th className="py-2 px-3 whitespace-nowrap">Horario</th><th className="py-2 px-3 whitespace-nowrap">Recursos</th><th className="py-2 px-3 whitespace-nowrap">Detalle</th>
                                        </tr></thead>
                                        <tbody>
                                            {operativos?.historial.map((h) => (
                                                <tr key={h.id} className="border-b border-gray-100 hover:bg-utec-gray-50">
                                                    <td className="py-2 px-3 font-medium text-utec-dark">{h.laboratorio}</td>
                                                    <td className="py-2 px-3">
                                                        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${h.motivo === 'MANTENIMIENTO' ? 'bg-gray-100 text-gray-700' : h.motivo === 'FERIADO' ? 'bg-blue-50 text-blue-700' : h.motivo === 'RETIRO' ? 'bg-violet-100 text-violet-700' : 'bg-amber-50 text-amber-700'}`}>{h.motivo}</span>
                                                    </td>
                                                    <td className="py-2 px-3">{h.tipo}</td>
                                                    <td className="py-2 px-3">{h.fecha}</td>
                                                    <td className="py-2 px-3">{h.horaInicio ? `${h.horaInicio}–${h.horaFin}` : 'Todo el día'}</td>
                                                    <td className="py-2 px-3">{h.recursos || '—'}</td>
                                                    <td className="py-2 px-3 text-utec-gray-200">{h.descripcion || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                        {/* Cierres institucionales (todo UTEC): no son bloqueos por-lab → lista aparte. */}
                        {(operativos?.cierres?.length ?? 0) > 0 && (
                            <div className="mt-6">
                                <h3 className="text-sm font-semibold text-utec-dark mb-1"><Ban size={13} className="inline align-[-2px] mr-1 text-red-600" />Cierres institucionales (todo UTEC)</h3>
                                <p className="text-xs text-utec-gray-200 mb-2">Días que UTEC cerró por completo (feriado institucional): no se pudo reservar ningún lab y no cuentan en la capacidad. Se gestionan en el calendario académico (Ciclos).</p>
                                <div className="flex flex-wrap gap-2">
                                    {operativos?.cierres.map((c, i) => (
                                        <span key={i} className="inline-flex items-center gap-1.5 text-xs bg-red-50 border border-red-200 text-red-800 px-2.5 py-1 rounded-lg">
                                            <b>{c.descripcion || 'Cierre'}</b>
                                            <span className="text-red-600">{c.fechaInicio}{c.fechaFin !== c.fechaInicio ? `–${c.fechaFin}` : ''}</span>
                                            <span className="text-red-400">· {c.dias} día{c.dias === 1 ? '' : 's'}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </details>
                </div>
            )}

            {/* ═══════════ VISTA OEE — Uso del lab (facility) ═══════════ */}
            {activeTab === 'graficos' && esOee && (
                <div ref={graficosRef}>
                    <p className="text-sm text-utec-gray-200 mb-4">Vista de <b className="text-utec-dark">rendimiento del laboratorio</b> (modelo OEE): <b>utilización</b> (cuánto se usó del tiempo abierto) frente a <b>disponibilidad</b> (cuánto estuvo cerrado), más el cupo libre y las franjas pico. Pensada para una lectura ejecutiva de una pantalla.</p>
                    {/* Par OEE: utilización | disponibilidad */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        {ocupacionCard}
                        {disponibilidadCard}
                    </div>
                    {capacidadOciosaCard}
                    <div className="mb-6" />
                    {heatmapCard}
                </div>
            )}

            {/* ═══════════ PESTAÑA TABLA (ambas vistas: reservas + bloqueos) ═══════════ */}
            {activeTab === 'tabla' && (
                <div className="space-y-6">
                    <div className="card">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-display font-bold text-utec-dark">Reservas <span className="text-sm font-normal text-utec-gray-200">({tablaData?.length ?? 0})</span></h3>
                        </div>
                        {loadingTabla ? <SkeletonRows /> : tablaData?.length ? <TablaReservas /> : <EmptyState title="Sin reservas" description="No hay reservas para el filtro actual." />}
                    </div>
                    <div className="card">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-display font-bold text-utec-dark">Bloqueos <span className="text-sm font-normal text-utec-gray-200">({bloqueosList?.length ?? 0})</span></h3>
                            <button onClick={exportBloqueosCSV} disabled={!bloqueosList?.length} className="btn-primary text-sm disabled:opacity-50">Exportar CSV</button>
                        </div>
                        {loadingBloqueos ? <p className="text-center py-8 text-utec-gray-200">Cargando...</p> : bloqueosList?.length ? <TablaBloqueos /> : <p className="text-center py-8 text-utec-gray-200">Sin bloqueos</p>}
                    </div>
                </div>
            )}

            </>
            )}

            {/* ═══════════ REPORTE EJECUTIVO one-pager (portal → PDF al imprimir) ═══════════ */}
            {reporteVisible && createPortal(
                <div className="reporte-ejecutivo-sheet" style={{ fontFamily: 'Inter, Arial, sans-serif', color: UTEC.dark, padding: '12mm', boxSizing: 'border-box' }}>
                    <div style={{ borderBottom: `3px solid ${UTEC.cyan}`, paddingBottom: 8, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        <div>
                            <div style={{ fontSize: 20, fontWeight: 800 }}>UTEC Ambientes — Reporte Ejecutivo</div>
                            <div style={{ fontSize: 11, color: '#6b7280' }}>{dashboard?.filtroDescripcion || 'Histórico completo'}</div>
                        </div>
                        <div style={{ fontSize: 10, color: '#6b7280', textAlign: 'right' }}>{new Date().toLocaleString('es-PE')}</div>
                    </div>

                    {resumen?.comparacion && (
                        <>
                            <div style={{ fontSize: 13, fontWeight: 700, margin: '4px 0 6px' }}>Comparación: {resumen.comparacion.periodoActual} vs {resumen.comparacion.periodoAnterior}</div>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                {resumen.comparacion.metricas.map((m) => {
                                    const sube = m.direccion === 'sube', igual = m.direccion === 'igual';
                                    const color = igual ? UTEC.gray : sube ? UTEC.green : UTEC.red;
                                    const v = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}${m.unidad}`;
                                    return (
                                        <div key={m.etiqueta} style={{ flex: 1, border: '1px solid #e5e5e5', borderRadius: 8, padding: '6px 8px' }}>
                                            <div style={{ fontSize: 10, color: '#6b7280' }}>{m.etiqueta}</div>
                                            <div style={{ fontSize: 18, fontWeight: 800 }}>{v(m.actual)}</div>
                                            <div style={{ fontSize: 10, fontWeight: 700, color }}>{igual ? '→' : sube ? '▲' : '▼'} {m.deltaPct === null ? '—' : `${m.deltaPct > 0 ? '+' : ''}${m.deltaPct}%`}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {(resumen?.insights?.length ?? 0) > 0 && (
                        <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Conclusiones</div>
                            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, lineHeight: 1.6 }}>
                                {resumen!.insights.map((ins, i) => <li key={i}>{ins.texto}</li>)}
                            </ul>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Ocupación por laboratorio (top)</div>
                            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                                <tbody>{(insights?.ocupacionPorLab ?? []).slice(0, 6).map((o) => (
                                    <tr key={o.codigoLab}><td style={{ padding: '2px 0' }}>{o.codigoLab}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{o.porcentaje}%</td></tr>
                                ))}</tbody>
                            </table>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Reservas por carrera (top)</div>
                            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                                <tbody>{(dashboard?.reservasPorCarrera ?? []).slice(0, 6).map((c) => (
                                    <tr key={c.carrera}><td style={{ padding: '2px 0' }}>{c.carrera}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{c.cantidad}</td></tr>
                                ))}</tbody>
                            </table>
                        </div>
                    </div>

                    {resumen?.procedencia && (
                        <div style={{ borderTop: '1px solid #e5e5e5', paddingTop: 6, fontSize: 9, color: '#6b7280' }}>
                            Fuente: {resumen.procedencia.fuente}
                            {resumen.procedencia.rangoInicio && ` · Datos: ${resumen.procedencia.rangoInicio} → ${resumen.procedencia.rangoFin}`}
                            {` · Corte: ${resumen.procedencia.corte} · ${resumen.procedencia.totalRegistros.toLocaleString('es-PE')} reservas · ${resumen.procedencia.labsConDatos} lab(s)`}
                            <div style={{ marginTop: 2 }}>Generado por UTEC Ambientes · Concept Lab · © {new Date().getFullYear()} UTEC.</div>
                        </div>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
}

/* ───────── Sub-components ───────── */
function KpiCard({ label, value, color, hint }: { label: string; value: string | number; color?: string; hint?: string }) {
    return (
        <div className="card !p-4 flex flex-col gap-2 hover:-translate-y-0.5 transition-transform" title={hint}>
            <div className="flex items-center gap-2 min-w-0">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color || '#00BFFF' }} />
                <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-muted truncate">
                    {label}{hint && <span className="ml-1 cursor-help">ⓘ</span>}
                </p>
            </div>
            <p className="text-[26px] leading-none font-bold text-ink tabular">{value}</p>
        </div>
    );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className="rounded-lg border border-line px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted truncate">{label}</p>
            </div>
            <p className="text-xl font-bold text-ink tabular leading-none">{value}</p>
        </div>
    );
}
function StatBox({ label, value, color, small }: { label: string; value: number; color: string; small?: boolean }) {
    return <div className="bg-utec-gray-50 rounded-lg p-3 text-center"><p className={`${small ? 'text-lg' : 'text-2xl'} font-bold`} style={{ color }}>{value}</p><p className="text-xs text-utec-gray-200">{label}</p></div>;
}
function EstadoBadge({ estado }: { estado: string }) {
    const s: Record<string, string> = { PENDIENTE: 'bg-blue-100 text-blue-800', CONFIRMADA: 'bg-cyan-100 text-cyan-800', EN_CURSO: 'bg-green-100 text-green-800', COMPLETADA: 'bg-green-200 text-green-900', CANCELADA: 'bg-yellow-100 text-yellow-800', NO_SHOW: 'bg-red-100 text-red-800' };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s[estado] || 'bg-gray-100 text-gray-800'}`}>{estado}</span>;
}
function TipoBadge({ tipo }: { tipo: string }) {
    const s: Record<string, string> = { ALUMNO: 'bg-cyan-50 text-cyan-700', EVENTO: 'bg-blue-50 text-blue-700' };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s[tipo] || 'bg-gray-100 text-gray-800'}`}>{tipo}</span>;
}
export function buildHeatmapMatrix(data: HeatmapCell[]): Record<string, Record<number, number>> {
    const m: Record<string, Record<number, number>> = {};
    ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].forEach(d => { m[d] = {}; });
    data.forEach(({ dia, hora, cantidad }) => { if (m[dia]) m[dia][hora] = cantidad; });
    return m;
}
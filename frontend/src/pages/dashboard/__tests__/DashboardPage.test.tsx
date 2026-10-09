import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import DashboardPage, { rangoFechas } from '../DashboardPage';

const DASHBOARD = {
    totalReservas: 42, reservasActivas: 10, reservasCanceladas: 5, noShows: 3, completadas: 24,
    tasaOcupacionGeneral: 65, tasaAusentismo: 7, tasaCancelacion: 12,
    reservasAlumno: 30, reservasEvento: 12, bloqueosParciales: 4, bloqueosTotales: 2,
    filtroDescripcion: 'Últimos 30 días',
    ocupacionPorLaboratorio: [{ codigoLab: 'L108', laboratorioNombre: 'Concept', totalRecursos: 5, recursosOcupados: 3, recursosDisponibles: 2, porcentajeOcupacion: 60 }],
    heatmap: [{ dia: 'Lunes', hora: 8, cantidad: 3 }, { dia: 'Martes', hora: 10, cantidad: 1 }],
    reservasPorHora: [{ hora: '08:00', cantidad: 5 }],
    reservasPorDia: [{ fecha: '2026-06-01', total: 5, completadas: 3, canceladas: 1, noShows: 1 }, { fecha: '2026-06-08', total: 4, completadas: 2, canceladas: 1, noShows: 0 }],
    reservasPorMes: [{ mes: '2026-06', total: 9, completadas: 5, canceladas: 2, noShows: 1 }],
    bloqueoStats: { totalParciales: 4, totalTotales: 2, laboratorioMasBloqueado: 'L108', motivoMasFrecuente: 'CLASE' },
    reservasPorCarrera: [{ carrera: 'Ingenieria Mecanica', cantidad: 50 }, { carrera: 'Computer Science', cantidad: 30 }],
};
const TABLA = [{ id: 1, fecha: '2026-06-01', horaInicio: '08:00', horaFin: '09:00', estado: 'COMPLETADA', laboratorioCodigo: 'L108', laboratorioNombre: 'Concept', recursoNombre: 'Mesa 1', recursoTipo: 'MESA', usuarioNombre: 'Juan Perez', usuarioCorreo: 'juan@utec.edu.pe', participantes: 2, tipoReserva: 'ALUMNO' }];
const BLOQUEOS = [
    { id: 1, laboratorioCodigo: 'L108', laboratorioNombre: 'Concept', tipo: 'PARCIAL', motivo: 'CLASE', fechaInicio: '2026-06-10', fechaFin: '2026-06-10', horaInicio: '08:00:00', horaFin: '10:00:00', activo: true, creadoPorNombre: 'Ana', createdAt: '2026-06-01' },
    { id: 2, laboratorioCodigo: 'L201', laboratorioNombre: 'Dos', tipo: 'TOTAL', motivo: 'EVENTO', fechaInicio: '2026-06-11', fechaFin: '2026-06-11', activo: true, creadoPorNombre: 'Ana', createdAt: '2026-06-01' },
];

const OPERATIVOS = {
    porLaboratorio: [{ laboratorio: 'Concept', mantenimiento: 3, almuerzo: 1, feriado: 2, retiro: 4, total: 10 }],
    porMes: [{ mes: '2026-06', mantenimiento: 3, almuerzo: 1, feriado: 2, retiro: 4, total: 10 }],
    historial: [
        { id: 9, laboratorio: 'Concept', motivo: 'MANTENIMIENTO', tipo: 'PARCIAL', fecha: '2026-06-10', horaInicio: '09:00', horaFin: '13:00', recursos: 'MESA 8', descripcion: 'Cambio de PC' },
        { id: 10, laboratorio: 'Concept', motivo: 'RETIRO', tipo: 'PARCIAL', fecha: '2026-06-11', recursos: 'MESA 12', descripcion: 'Mesas retiradas' },
    ],
    totalMantenimiento: 3, totalAlmuerzo: 1, totalFeriado: 2, totalRetiro: 4,
    cierres: [{ fechaInicio: '2026-07-28', fechaFin: '2026-07-29', descripcion: 'Fiestas Patrias', dias: 2 }],
    totalDiasCierre: 2,
};

const RESUMEN = {
    comparacion: {
        periodoActual: 'Año 2026', periodoAnterior: 'Año 2025',
        metricas: [
            { etiqueta: 'Reservas', actual: 42, anterior: 30, deltaPct: 40, direccion: 'sube', unidad: '' },
            { etiqueta: 'Completadas', actual: 24, anterior: 20, deltaPct: 20, direccion: 'sube', unidad: '' },
            { etiqueta: 'Aprovechamiento', actual: 57, anterior: 66, deltaPct: -13.6, direccion: 'baja', unidad: '%' },
            { etiqueta: 'Ocupación', actual: 62, anterior: 55, deltaPct: 12.7, direccion: 'sube', unidad: '%' },
        ],
    },
    insights: [
        { texto: 'Las reservas subieron 40% respecto a Año 2025 (30 → 42).', tipo: 'positivo' },
        { texto: 'El 57% de las reservas terminó en check-in (uso real confirmado).', tipo: 'neutro' },
    ],
    procedencia: { fuente: 'Affluences (histórico importado) + reservas en vivo del sistema', rangoInicio: '2025-01-02', rangoFin: '2026-06-30', corte: '2026-07-02', totalRegistros: 42, labsConDatos: 1 },
};

const INSIGHTS = {
    ocupacionPorLab: [
        { codigoLab: 'L108', horasReservadas: 1200, horasEventos: 300, horasClases: 200, horasOperativas: 200, horasCierre: 120, capacidadTotal: 2200, horasDisponibles: 2000, porcentaje: 85, porcentajeReservas: 60, porcentajeEventos: 15, porcentajeClases: 10, porcentajeCerrado: 9, porcentajeCierre: 5 },
        { codigoLab: 'L107', horasReservadas: 0, horasEventos: 0, horasClases: 0, horasOperativas: 0, horasCierre: 0, capacidadTotal: 800, horasDisponibles: 800, porcentaje: 0, porcentajeReservas: 0, porcentajeEventos: 0, porcentajeClases: 0, porcentajeCerrado: 0, porcentajeCierre: 0 },
    ],
    tamanoGrupo: [{ participantes: 1, cantidad: 20 }, { participantes: 2, cantidad: 8 }],
    cruceCarreraLab: [
        { carrera: 'Ciencia de la Computación', codigoLab: 'L108', cantidad: 90 },
        { carrera: 'Ingeniería Mecánica', codigoLab: 'L108', cantidad: 40 },
    ],
};

// Ámbito AULAS (ADMIN + DOCENCIA)
const AULAS = {
    totalClases: 12, horasSemanales: 21.5, aulasActivas: 8, totalEventos: 3,
    ocupacionPorAula: [
        { codigo: 'A502', tipo: 'AULA', piso: 5, horasSemana: 18, porcentaje: 20 },
        { codigo: 'M604', tipo: 'AULA_MIXTA', piso: 6, horasSemana: 9, porcentaje: 10 },
    ],
    porTipoAmbiente: [{ tipo: 'AULA', clases: 8, horasSemana: 18 }, { tipo: 'AULA_MIXTA', clases: 4, horasSemana: 9 }],
    heatmap: [{ dia: 'Lunes', hora: 9, cantidad: 4 }, { dia: 'Martes', hora: 10, cantidad: 2 }],
    eventosPorMes: [{ mes: '2026-05', cantidad: 2 }, { mes: '2026-06', cantidad: 1 }],
};

const apiGet = vi.fn((url: string) => {
    if (url.includes('/analytics/aulas')) return Promise.resolve({ data: { data: AULAS } });
    if (url.includes('/analytics/resumen-ejecutivo')) return Promise.resolve({ data: { data: RESUMEN } });
    if (url.includes('/analytics/insights')) return Promise.resolve({ data: { data: INSIGHTS } });
    if (url.includes('/analytics/dashboard/full')) return Promise.resolve({ data: { data: DASHBOARD } });
    if (url.includes('/analytics/operativos')) return Promise.resolve({ data: { data: OPERATIVOS } });
    if (url.includes('/analytics/tabla')) return Promise.resolve({ data: { data: TABLA } });
    if (url.includes('/bloqueos/todos')) return Promise.resolve({ data: { data: BLOQUEOS } });
    if (url.includes('/laboratorios')) return Promise.resolve({ data: { data: [{ id: 5, codigoLab: 'L108', nombre: 'Concept' }] } });
    return Promise.resolve({ data: { data: [] } });
});

const apiPost = vi.fn((_url: string, _body?: unknown) => Promise.resolve({ data: { data: { usuariosInsertados: 2, reservasInsertadas: 3, bloqueosInsertados: 1, bloqueoRecursosInsertados: 0 } } }));
vi.mock('@/services/api', () => ({ default: { get: (url: string) => apiGet(url), post: (url: string, body: unknown) => apiPost(url, body) } }));
// Rol mutable por test (default ADMIN); los tests de rol acotado lo cambian y lo restauran.
const rolMock = vi.hoisted(() => ({ rol: 'ADMIN' }));
vi.mock('@/store/authStore', () => ({ useAuthStore: (sel: (s: { user: { rol: string } }) => unknown) => sel({ user: { rol: rolMock.rol } }) }));
vi.mock('html-to-image', () => ({ toPng: vi.fn(() => Promise.resolve('data:image/png;base64,xxx')) }));
import { toPng } from 'html-to-image';

const renderPage = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={qc}><BrowserRouter><DashboardPage /></BrowserRouter></QueryClientProvider>
    );
};

describe('DashboardPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        URL.createObjectURL = vi.fn(() => 'blob:mock');
        URL.revokeObjectURL = vi.fn();
    });

    it('renderiza el dashboard TODO con KPIs y descripción del filtro', async () => {
        renderPage();
        expect(await screen.findByRole('heading', { name: /Dashboard Analítico/i })).toBeInTheDocument();
        expect(await screen.findByText('Últimos 30 días')).toBeInTheDocument();
        expect(screen.getByText('% de ocupación por laboratorio')).toBeInTheDocument();
        expect(screen.getByText('Embudo de estados')).toBeInTheDocument();
        expect(screen.getByText('Tamaño de grupo')).toBeInTheDocument();
        expect(screen.getByText('Reservas por día de la semana')).toBeInTheDocument();
        expect(screen.getByText('Mapa de calor — Reservas de alumnos por día y hora')).toBeInTheDocument();
        // Leyenda/footnote de ventanas horarias + regla de ocupación (feriados/mantenimiento fuera).
        expect(screen.getByText('ⓘ Cómo se calcula la ocupación (ventanas horarias)')).toBeInTheDocument();
        expect(screen.getAllByText(/excluye feriados\/mantenimiento|feriados\/mantenimiento/).length).toBeGreaterThan(0);
        // Disponibilidad (OEE) se muestra aparte de la ocupación.
        expect(screen.getByText('Disponibilidad por laboratorio')).toBeInTheDocument();
    });

    it('muestra el resumen ejecutivo: comparación vs periodo anterior, conclusiones y procedencia', async () => {
        renderPage();
        expect(await screen.findByText('Comparación con el periodo anterior')).toBeInTheDocument();
        expect(screen.getByText(/Año 2026/)).toBeInTheDocument();
        expect(screen.getAllByText(/Año 2025/).length).toBeGreaterThan(0);
        // Conclusiones automáticas
        expect(screen.getByText('Conclusiones')).toBeInTheDocument();
        expect(screen.getByText(/Las reservas subieron 40%/)).toBeInTheDocument();
        // Sello de procedencia
        expect(screen.getByText(/Affluences \(histórico importado\)/)).toBeInTheDocument();
    });

    it('muestra las gráficas de analista de la Fase 2 (Pareto, capacidad ociosa, cruce carrera×lab)', async () => {
        renderPage();
        expect(await screen.findByText('Concentración de la demanda (Pareto)')).toBeInTheDocument();
        expect(screen.getByText('Capacidad ociosa por laboratorio (horas)')).toBeInTheDocument();
        expect(screen.getByText('Carrera × Laboratorio')).toBeInTheDocument();
    });

    it('muestra la Fase 3: proyección de demanda y la leyenda de franja pico del heatmap', async () => {
        renderPage();
        expect(await screen.findByText('Proyección de demanda')).toBeInTheDocument();
        expect(screen.getByText(/franja pico/)).toBeInTheDocument();
    });

    it('genera el reporte ejecutivo one-pager (window.print)', async () => {
        const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: /Reporte ejecutivo/i }));
        expect(await screen.findByText('UTEC Ambientes — Reporte Ejecutivo')).toBeInTheDocument();
        await waitFor(() => expect(printSpy).toHaveBeenCalled());
        printSpy.mockRestore();
    });

    it('cambia la granularidad de la tendencia (día/semana/mes)', async () => {
        renderPage();
        await screen.findByText('Tendencia de reservas');
        fireEvent.click(screen.getByRole('button', { name: 'Semana del mes' }));
        fireEvent.click(screen.getByRole('button', { name: 'Mes' }));
        fireEvent.click(screen.getByRole('button', { name: 'Día de semana' }));
        expect(screen.getByText('Tendencia de reservas')).toBeInTheDocument();
    });

    it('pestaña Tabla de datos muestra reservas y bloqueos, exporta CSV', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Dashboard Analítico/i });
        fireEvent.click(screen.getByRole('tab', { name: 'Tabla de datos' }));
        expect(await screen.findByText('Juan Perez')).toBeInTheDocument();
        const exportBtns = screen.getAllByRole('button', { name: /CSV/i });
        fireEvent.click(exportBtns[0]);
        expect(URL.createObjectURL).toHaveBeenCalled();
    });

    it('(A) el Resumen incluye la sección de BLOQUEOS con sus KPIs, gráficas y Operativo', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Dashboard Analítico/i });
        // Anclas de navegación de las secciones temáticas.
        expect(screen.getByRole('link', { name: /🚧 Bloqueos/ })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /🛠️ Operativo/ })).toBeInTheDocument();
        expect(await screen.findByText('Parcial vs Total')).toBeInTheDocument();
        expect(screen.getByText('Bloqueos por motivo')).toBeInTheDocument();
        expect(screen.getByText('Laboratorios más bloqueados')).toBeInTheDocument();
        // Sección operativa (mantenimiento + almuerzo + feriado), colapsable, aparte de los eventos.
        expect(await screen.findByText(/Operativo — Mantenimiento, Almuerzo, Feriado, Retiro y Cierre/)).toBeInTheDocument();
        expect(screen.getByText('Feriados')).toBeInTheDocument();          // KPI operativo de feriados
        expect(screen.getByText('Por laboratorio')).toBeInTheDocument();
        expect(screen.getByText('Por mes')).toBeInTheDocument();
        expect(screen.getByText('MESA 8')).toBeInTheDocument();          // recurso del historial
        expect(screen.getByText('Cambio de PC')).toBeInTheDocument();    // detalle del historial
        // Retiro de mesas como categoría propia (KPI + fila en el historial).
        expect(screen.getByText('Retiros de mesas')).toBeInTheDocument();
        expect(screen.getByText('RETIRO')).toBeInTheDocument();
        // Cierre institucional visible (KPI + lista con su rango).
        expect(screen.getByText('Días de cierre (UTEC)')).toBeInTheDocument();
        expect(screen.getByText('Cierres institucionales (todo UTEC)')).toBeInTheDocument();
        expect(screen.getByText('Fiestas Patrias')).toBeInTheDocument();
        // La sección Bloqueos conserva su resumen propio y gráficas temporales.
        expect(screen.getByText('Bloqueos por día de la semana')).toBeInTheDocument();
        expect(screen.getByText('Bloqueos por mes')).toBeInTheDocument();
        expect(screen.getByText('Concentración de motivos (Pareto)')).toBeInTheDocument();
        expect(screen.getByText('Conclusiones (bloqueos)')).toBeInTheDocument();
        // Y convive con el resumen ejecutivo de RESERVAS (fusión, ya no vistas separadas).
        expect(screen.getByText('Comparación con el periodo anterior')).toBeInTheDocument();
        expect(screen.getByText('Disponibilidad por laboratorio')).toBeInTheDocument();
    });

    it('(A) el Resumen trae el donut de estados y no la antigua tarjeta redundante "Bloqueos"', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Dashboard Analítico/i });
        expect(await screen.findByText('Estados de las reservas')).toBeInTheDocument();
        // la tarjeta "Bloqueos" de la antigua vista Todo (con "Lab más bloqueado:") no existe:
        // su contenido vive en la sección Bloqueos (Parcial vs Total + Detalle).
        expect(screen.queryByText('Lab más bloqueado:')).not.toBeInTheDocument();
    });

    it('vista OEE (Uso del lab): ocupación + disponibilidad + capacidad ociosa + heatmap', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Dashboard Analítico/i });
        fireEvent.change(screen.getByRole('option', { name: 'Uso del lab (OEE)' }).closest('select')!, { target: { value: 'OEE' } });
        expect(await screen.findByText(/% de ocupación por laboratorio/)).toBeInTheDocument();
        expect(screen.getByText('Disponibilidad por laboratorio')).toBeInTheDocument();
        expect(screen.getByText(/Capacidad ociosa por laboratorio/)).toBeInTheDocument();
        expect(screen.getByText('Mapa de calor — Reservas de alumnos por día y hora')).toBeInTheDocument();
        // NO trae las gráficas de demanda (embudo, carreras…) — es vista de instalación.
        expect(screen.queryByText('Embudo de estados')).not.toBeInTheDocument();
    });

    it('el toggle "Solo reservas de alumnos" pide soloReservas=true (excluye eventos)', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Dashboard Analítico/i });
        fireEvent.click(await screen.findByLabelText(/Solo reservas de alumnos/i));
        await waitFor(() => expect(apiGet.mock.calls.some(c => String(c[0]).includes('/analytics/insights') && String(c[0]).includes('soloReservas=true'))).toBe(true));
        // el título de la tarjeta indica el modo
        expect(await screen.findByText(/% de ocupación por laboratorio \(solo reservas\)/)).toBeInTheDocument();
    });

    it('muestra el gráfico por carrera y filtra por carrera (filtro visible en el Resumen)', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Dashboard Analítico/i });
        expect(await screen.findByText('Reservas por carrera de alumnos')).toBeInTheDocument();
        // El filtro de carrera está disponible directamente en el Resumen.
        fireEvent.change((await screen.findByRole('option', { name: 'Ingenieria Mecanica' })).closest('select')!, { target: { value: 'Ingenieria Mecanica' } });
        await waitFor(() => expect(apiGet.mock.calls.some(c => String(c[0]).includes('carrera=Ingenieria'))).toBe(true));
    });

    it('aplica filtro de laboratorio y luego limpia', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Dashboard Analítico/i });
        const selects = screen.getAllByRole('combobox');
        fireEvent.change(selects[0], { target: { value: '5' } }); // labId
        const limpiar = await screen.findByRole('button', { name: /Limpiar filtros/i });
        fireEvent.click(limpiar);
        await waitFor(() => expect(screen.queryByRole('button', { name: /Limpiar filtros/i })).not.toBeInTheDocument());
    });

    it('(B) RESPONSABLE_LAB: sin opción "Todos", se auto-selecciona su primer lab', async () => {
        rolMock.rol = 'RESPONSABLE_LAB';
        try {
            renderPage();
            await screen.findByRole('heading', { name: /Dashboard Analítico/i });
            // El dropdown de lab no ofrece el agregado global (el backend lo rechaza para roles acotados)…
            expect(screen.queryByText('Todos los laboratorios')).not.toBeInTheDocument();
            // …y se auto-selecciona el primero de SUS labs (mis-laboratorios → id 5).
            await waitFor(() => expect(apiGet).toHaveBeenCalledWith(expect.stringContaining('labId=5')));
        } finally {
            rolMock.rol = 'ADMIN';
        }
    });

    it('(C) ADMIN alterna al ámbito Aulas: KPIs de clases + 4 gráficas núcleo', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Dashboard Analítico/i });
        fireEvent.click(screen.getByRole('tab', { name: '🏫 Aulas' }));
        expect(await screen.findByText('Clases programadas')).toBeInTheDocument();
        expect(screen.getByText('Horas dictadas / semana')).toBeInTheDocument();
        expect(screen.getByText('Aulas activas')).toBeInTheDocument();
        expect(screen.getByText('Eventos de aula')).toBeInTheDocument();
        expect(screen.getByText('% de ocupación por aula')).toBeInTheDocument();
        expect(screen.getByText('Horas por tipo de ambiente')).toBeInTheDocument();
        expect(screen.getByText('Mapa de calor — Clases por día y hora')).toBeInTheDocument();
        expect(screen.getByText('Eventos de aula por mes')).toBeInTheDocument();
        // pide el payload agregador
        await waitFor(() => expect(apiGet.mock.calls.some(c => String(c[0]).includes('/analytics/aulas'))).toBe(true));
        // y oculta el contenido de labs (panel Hoy / secciones del Resumen)
        expect(screen.queryByText('📈 Reservas — demanda y uso')).not.toBeInTheDocument();
    });

    it('(C) DOCENCIA nace en el ámbito Aulas y NO llama a la analítica de labs', async () => {
        rolMock.rol = 'DOCENCIA';
        try {
            renderPage();
            await screen.findByRole('heading', { name: /Dashboard Analítico/i });
            expect(await screen.findByText('Clases programadas')).toBeInTheDocument();
            // sin switch de ámbito (solo ADMIN alterna)
            expect(screen.queryByRole('tab', { name: '🧪 Laboratorios' })).not.toBeInTheDocument();
            // las queries de labs quedan apagadas (el backend le daría 403 a DOCENCIA)
            await waitFor(() => expect(apiGet.mock.calls.some(c => String(c[0]).includes('/analytics/aulas'))).toBe(true));
            expect(apiGet.mock.calls.some(c => String(c[0]).includes('/analytics/dashboard/full'))).toBe(false);
            expect(apiGet.mock.calls.some(c => String(c[0]).includes('/analytics/insights'))).toBe(false);
        } finally {
            rolMock.rol = 'ADMIN';
        }
    });

    it('descarga las gráficas como PNG (toPng)', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Dashboard Analítico/i });
        fireEvent.click(screen.getByRole('button', { name: /Descargar gráficos/i }));
        await waitFor(() => expect(toPng).toHaveBeenCalled());
    });

    it('ADMIN descarga el respaldo (GET /respaldo)', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Dashboard Analítico/i });
        fireEvent.click(screen.getByRole('button', { name: /Respaldo/i }));
        await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/respaldo'));
    });

    it('ADMIN restaura un respaldo desde archivo JSON (POST /respaldo)', async () => {
        const { container } = renderPage();
        await screen.findByRole('heading', { name: /Dashboard Analítico/i });
        const input = container.querySelector('input[type="file"]') as HTMLInputElement;
        const file = new File([JSON.stringify({ usuarios: [], reservas: [] })], 'respaldo.json', { type: 'application/json' });
        // jsdom: fijar files explícitamente y forzar file.text()
        file.text = () => Promise.resolve(JSON.stringify({ usuarios: [], reservas: [] }));
        Object.defineProperty(input, 'files', { value: [file], configurable: true });
        fireEvent.change(input);
        await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/respaldo', expect.anything()));
    });

    it('el filtro de carrera aparece en el Resumen pero NO en OEE', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Dashboard Analítico/i });
        expect(screen.getByRole('option', { name: 'Todas las carreras' })).toBeInTheDocument();
        fireEvent.change(screen.getByRole('option', { name: 'Uso del lab (OEE)' }).closest('select')!, { target: { value: 'OEE' } });
        expect(screen.queryByRole('option', { name: 'Todas las carreras' })).toBeNull();
    });
});

describe('rangoFechas', () => {
    it('deriva el rango por ciclo y por año; sin filtro → null', () => {
        expect(rangoFechas('2025-2', '')).toEqual({ ini: '2025-08-01', fin: '2025-12-31' });
        expect(rangoFechas('2025-1', '')).toEqual({ ini: '2025-03-01', fin: '2025-07-31' });
        expect(rangoFechas('', '2025')).toEqual({ ini: '2025-01-01', fin: '2025-12-31' });
        expect(rangoFechas('', '')).toBeNull();
    });
});

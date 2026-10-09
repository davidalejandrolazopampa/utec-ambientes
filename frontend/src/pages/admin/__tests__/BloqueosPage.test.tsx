import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import BloqueosPage from '../BloqueosPage';

// Fechas en hora LOCAL (igual que hoyLocal en el componente), para no depender de UTC.
const localDate = (offsetDias = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const HOY = localDate(0);
const MANANA = localDate(1);
const AYER = localDate(-1);

const BLOQUEOS = [
    { id: 1, laboratorioCodigo: 'L108', laboratorioNombre: 'Concept Lab', tipo: 'TOTAL', motivo: 'EVENTO', descripcion: 'Hackathon', fechaInicio: HOY, fechaFin: HOY, horaInicio: '08:00:00', horaFin: '23:59:00', activo: true, creadoPorNombre: 'Ana Diaz', createdAt: '2026-06-01T10:00:00' },
    { id: 2, laboratorioCodigo: 'L201', laboratorioNombre: 'Lab Dos', tipo: 'PARCIAL', motivo: 'CLASE', fechaInicio: MANANA, fechaFin: MANANA, activo: true, creadoPorNombre: 'Carla Ruiz', createdAt: '2026-06-02T10:00:00' },
    { id: 3, laboratorioCodigo: 'L301', laboratorioNombre: 'Lab Tres', tipo: 'PARCIAL', motivo: 'MANTENIMIENTO', fechaInicio: AYER, fechaFin: AYER, horaInicio: '07:00:00', horaFin: '09:00:00', activo: true, creadoPorNombre: 'Diego', createdAt: '2026-05-30T10:00:00' },
    // Desordenados a propósito (14:00 antes que 10:00 y 12:00) para validar el ordenamiento.
    { id: 6, laboratorioCodigo: 'L601', laboratorioNombre: 'Lab Seis', tipo: 'PARCIAL', motivo: 'EXAMEN', fechaInicio: MANANA, fechaFin: MANANA, horaInicio: '14:00:00', horaFin: '15:00:00', activo: true, creadoPorNombre: 'X', createdAt: '2026-06-03T10:00:00' },
    { id: 4, laboratorioCodigo: 'L401', laboratorioNombre: 'Lab Cuatro', tipo: 'PARCIAL', motivo: 'ASESORIA', fechaInicio: MANANA, fechaFin: MANANA, horaInicio: '10:00:00', horaFin: '11:00:00', activo: true, creadoPorNombre: 'X', createdAt: '2026-06-03T10:00:00' },
    { id: 5, laboratorioCodigo: 'L501', laboratorioNombre: 'Lab Cinco', tipo: 'PARCIAL', motivo: 'REUNION', fechaInicio: MANANA, fechaFin: MANANA, horaInicio: '12:00:00', horaFin: '13:00:00', activo: true, creadoPorNombre: 'X', createdAt: '2026-06-03T10:00:00' },
    // Una CLASE del horario (recurrente): va a su sección propia con día/frecuencia/curso.
    { id: 7, laboratorioCodigo: 'L108', laboratorioNombre: 'Concept Lab', tipo: 'TOTAL', motivo: 'CLASE', esClase: true, diaSemana: 'LUNES', frecuencia: 'SEMANA_A', ciclo: '2026-1', cursoCodigo: 'CS101', cursoNombre: 'Algoritmos', seccion: '1', fechaInicio: '2026-03-01', fechaFin: '2026-07-31', horaInicio: '09:00:00', horaFin: '11:00:00', activo: true, creadoPorNombre: 'Programación Académica', createdAt: '2026-06-01T10:00:00' },
];
const LABS = [{ id: 1, codigoLab: 'L108', nombre: 'Concept Lab' }];
// Reserva activa en MESA 1 (id 10) hoy → la mesa sale "parcial" en el editor.
const RESERVAS_LAB = [{ recursoId: 10, estado: 'CONFIRMADA', fecha: HOY, horaInicio: '09:00:00', horaFin: '11:00:00' }];

const apiGet = vi.fn((url: string) => {
    if (url.includes('/bloqueos/todos')) return Promise.resolve({ data: { data: BLOQUEOS } });
    if (url.includes('/reservas/laboratorio')) return Promise.resolve({ data: { data: RESERVAS_LAB } });
    if (url.includes('/bloqueos/laboratorio')) return Promise.resolve({ data: { data: [
        { id: 99, tipo: 'PARCIAL', motivo: 'CLASE', fechaInicio: HOY, fechaFin: HOY, horaInicio: '10:00:00', horaFin: '11:00:00', recursosAfectados: [10] },
    ] } });
    if (url.includes('/laboratorios/mis-laboratorios')) return Promise.resolve({ data: { data: LABS } });
    if (url.includes('/recursos')) return Promise.resolve({ data: { data: [
        { id: 10, nombre: 'MESA 1', tipo: 'MESA' }, { id: 11, nombre: 'PC 1', tipo: 'PC' },
    ] } });
    return Promise.resolve({ data: { data: [] } });
});
const apiPut = vi.fn((_url: string, _body?: unknown) => Promise.resolve({ data: { data: {} } }));
const apiDelete = vi.fn((_url: string) => Promise.resolve({ data: {} }));

vi.mock('@/services/api', () => ({
    default: {
        get: (url: string) => apiGet(url),
        put: (url: string, body: unknown) => apiPut(url, body),
        delete: (url: string) => apiDelete(url),
    },
}));

// Usuario ADMIN → ve todos los labs (el scope por rol filtra a los propios si no es global).
vi.mock('@/store/authStore', () => ({
    useAuthStore: (sel?: (s: unknown) => unknown) => {
        const state = { user: { rol: 'ADMIN', nombreCompleto: 'Admin' } };
        return sel ? sel(state) : state;
    },
}));

const renderPage = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={qc}><BrowserRouter><BloqueosPage /></BrowserRouter></QueryClientProvider>
    );
};

describe('BloqueosPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true) as never;
    });

    it('agrupa en Hoy / Programados / Pasados y pinta KPIs y badges', async () => {
        renderPage();
        expect(await screen.findByRole('heading', { name: /Hoy/ })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Programados/ })).toBeInTheDocument();
        expect(screen.getByText('Bloqueos Pasados')).toBeInTheDocument();
        // tipos / motivos / descripción / todo el día
        expect(screen.getByText('TOTAL')).toBeInTheDocument();
        expect(screen.getByText('Evento')).toBeInTheDocument();
        expect(screen.getByText('Hackathon')).toBeInTheDocument();
        expect(screen.getByText('Todo el día')).toBeInTheDocument();
    });

    it('ordena los Programados por fecha y hora ascendente (aunque lleguen desordenados)', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Programados/ });
        const texto = document.body.textContent || '';
        // Entrada desordenada (Seis=14:00 primero); esperado por hora: Cuatro(10) < Cinco(12) < Seis(14).
        const posCuatro = texto.indexOf('Lab Cuatro');
        const posCinco = texto.indexOf('Lab Cinco');
        const posSeis = texto.indexOf('Lab Seis');
        expect(posCuatro).toBeGreaterThan(-1);
        expect(posCuatro).toBeLessThan(posCinco);
        expect(posCinco).toBeLessThan(posSeis);
    });

    it('filtra por laboratorio (deja solo los bloqueos del lab elegido)', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Programados/ });
        // Antes de filtrar se ven varios labs
        expect(screen.getByText('Lab Cuatro')).toBeInTheDocument();
        expect(screen.getByText('Lab Cinco')).toBeInTheDocument();
        // El filtro es el 1er combobox (cabecera); elegimos L401 (Lab Cuatro)
        const filtro = screen.getAllByRole('combobox')[0];
        fireEvent.change(filtro, { target: { value: 'L401' } });
        expect(screen.getByText('Lab Cuatro')).toBeInTheDocument();
        expect(screen.queryByText('Lab Cinco')).not.toBeInTheDocument();
    });

    it('elimina un bloqueo (confirm + DELETE)', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Hoy/ });
        fireEvent.click(screen.getAllByRole('button', { name: /Eliminar/ })[0]);
        await waitFor(() => expect(apiDelete).toHaveBeenCalledWith('/bloqueos/1'));
    });

    it('abre el modal de edición, elige lab y guarda', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Hoy/ });
        fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]);
        expect(await screen.findByText('Editar bloqueo')).toBeInTheDocument();
        // comboboxes: [0]=filtro por lab (cabecera) · [1]=lab del modal · [2]=tipo · [3]=motivo
        const selects = screen.getAllByRole('combobox');
        fireEvent.change(selects[1], { target: { value: '1' } });      // lab del modal
        fireEvent.change(selects[2], { target: { value: 'TOTAL' } });  // tipo → EVENTO
        fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));
        await waitFor(() => expect(apiPut).toHaveBeenCalledWith('/bloqueos/1', expect.objectContaining({ tipo: 'TOTAL' })));
    });

    it('en edición PARCIAL muestra el selector de recursos y guarda recursosIds', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Hoy/ });
        fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]); // bloqueo 1 (L108, en LABS)
        await screen.findByText('Editar bloqueo');
        // cambiar tipo a PARCIAL → aparece el selector de recursos del lab
        // comboboxes: [0]=filtro por lab (cabecera) · [1]=lab del modal · [2]=tipo
        const selects = screen.getAllByRole('combobox');
        fireEvent.change(selects[2], { target: { value: 'PARCIAL' } });
        fireEvent.click(await screen.findByRole('button', { name: /MESA 1/ }));
        fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));
        await waitFor(() => expect(apiPut).toHaveBeenCalledWith('/bloqueos/1',
            expect.objectContaining({ tipo: 'PARCIAL', recursosIds: [10] })));
    });

    it('editor TOTAL: avisa cierre total y permite elegir hora + duración como en una reserva', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Hoy/ });
        fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]); // bloqueo 1 (TOTAL, HOY)
        await screen.findByText('Editar bloqueo');
        expect(screen.getByText(/se cierra/i)).toBeInTheDocument();          // aviso de bloqueo total
        fireEvent.click(await screen.findByRole('button', { name: '15:00' })); // grilla de hora
        fireEvent.click(await screen.findByRole('button', { name: /^1 hora 15:00/ })); // duración
        fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));
        await waitFor(() => expect(apiPut).toHaveBeenCalledWith('/bloqueos/1',
            expect.objectContaining({ tipo: 'TOTAL', horaInicio: '15:00:00', horaFin: '16:00:00' })));
    });

    it('las clases van a su sección propia con día/frecuencia/curso, y el toggle "Mostrar clases" funciona', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Hoy/ });

        // La clase (esClase) NO se mezcla con los eventos: sale en "Clases del horario"
        expect(screen.getByText('Clases del horario')).toBeInTheDocument();
        expect(screen.getByText(/^Lunes/)).toBeInTheDocument();      // capitaliza(diaSemana)
        expect(screen.getByText('Sem. A')).toBeInTheDocument();       // frecLabel(SEMANA_A)
        expect(screen.getByText(/CS101/)).toBeInTheDocument();        // curso (código)
        expect(screen.getByText(/Ciclo 2026-1/)).toBeInTheDocument(); // ciclo

        // El toggle "Mostrar clases" alterna su estado (aria-pressed)
        const toggle = screen.getByRole('button', { name: /Mostrar clases/ });
        expect(toggle).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(toggle);
        const on = await screen.findByRole('button', { name: /Ocultar clases/ });
        expect(on).toHaveAttribute('aria-pressed', 'true');
    });
});

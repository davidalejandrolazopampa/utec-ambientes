import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

const mockUser = { rol: 'ADMIN' };
vi.mock('@/store/authStore', () => ({
    useAuthStore: (selector: any) => selector({ user: mockUser }),
}));

const RECURSOS = [
    { id: 10, nombre: 'MESA 1', tipo: 'MESA', estado: 'DISPONIBLE', capacidadPersonas: 4 },
    { id: 11, nombre: 'MESA 2', tipo: 'MESA', estado: 'DISPONIBLE', capacidadPersonas: 4 },
    { id: 12, nombre: 'Proyector', tipo: 'EQUIPO', estado: 'DISPONIBLE', capacidadPersonas: 0 },
];
// Fecha local (igual que hoyLocal en el componente; el form usa la fecha local por defecto).
const HOY = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
const apiGet = vi.fn((url: string) => {
    if (url.includes('mis-laboratorios')) return Promise.resolve({ data: { data: [{ id: 1, codigoLab: 'L1', nombre: 'Lab 1' }] } });
    if (url.match(/\/aulas($|\?)/)) return Promise.resolve({ data: { data: [{ id: 50, codigo: 'A101', nombre: 'Aula 101', tipo: 'AULA' }] } });
    if (url.includes('/bloqueos/aula/')) return Promise.resolve({ data: { data: [] } });
    if (url.includes('/recursos')) return Promise.resolve({ data: { data: RECURSOS } });
    if (url.includes('/usuarios')) return Promise.resolve({ data: { data: [{ id: 7, nombreCompleto: 'David Lazo', rol: 'RESPONSABLE_LAB', correoUtec: 'dlazo@utec.edu.pe' }] } });
    if (url.includes('/bloqueos/laboratorio/')) return Promise.resolve({ data: { data: [{ tipo: 'TOTAL', fechaInicio: HOY, fechaFin: HOY, horaInicio: '10:00:00', horaFin: '11:00:00' }] } });
    return Promise.resolve({ data: { data: [] } });
});
const apiPost = vi.fn((_url: string, _body?: unknown) => Promise.resolve({ data: { data: {} } }));

vi.mock('@/services/api', () => ({
    default: { get: (url: string) => apiGet(url), post: (url: string, body: unknown) => apiPost(url, body) },
}));

import CrearBloqueoPage from '../CrearBloqueoPage';

const renderPage = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={qc}><BrowserRouter><CrearBloqueoPage /></BrowserRouter></QueryClientProvider>
    );
};

const elegirLab = async () => {
    // [0] = Tipo de ambiente (Laboratorio por defecto), [1] = selector del ambiente concreto.
    const selects = await screen.findAllByRole('combobox');
    await screen.findByRole('option', { name: /Lab 1/ });
    fireEvent.change(selects[1], { target: { value: '1' } });
    await screen.findByText(/Tipo de bloqueo/);
};

describe('CrearBloqueoPage', () => {
    beforeEach(() => { vi.clearAllMocks(); mockUser.rol = 'ADMIN'; });

    it('COORDINADOR solo puede bloquear laboratorios (sin opción de aulas)', async () => {
        mockUser.rol = 'COORDINADOR';
        renderPage();
        const combos = await screen.findAllByRole('combobox');
        // El selector de tipo queda fijo en Laboratorio (deshabilitado, sin Aula/Auditorio/Sala).
        expect((combos[0] as HTMLSelectElement).value).toBe('LABORATORIO');
        expect(combos[0]).toBeDisabled();
        expect(screen.queryByRole('option', { name: 'Aula' })).not.toBeInTheDocument();
        expect(screen.queryByRole('option', { name: 'Auditorio' })).not.toBeInTheDocument();
    });

    it('renderiza el título y el selector de laboratorio', () => {
        renderPage();
        expect(screen.getByRole('heading', { name: 'Crear Bloqueo' })).toBeInTheDocument();
    });

    it('al elegir un laboratorio muestra tipo, motivo y el botón Crear Bloqueo', async () => {
        renderPage();
        await elegirLab();
        expect(screen.getByText(/Motivo/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Crear Bloqueo/i })).toBeInTheDocument();
    });

    it('flujo PARCIAL: selecciona recursos y crea el bloqueo (POST)', async () => {
        renderPage();
        await elegirLab();
        fireEvent.click(screen.getByRole('button', { name: /Parcial/i }));
        fireEvent.click(screen.getByRole('button', { name: 'Clase' }));
        fireEvent.change(screen.getByPlaceholderText(/Clase de Física/i), { target: { value: 'Clase de Redes' } });
        fireEvent.change(screen.getByPlaceholderText(/Juan Pérez García/i), { target: { value: 'Ana Torres' } });
        fireEvent.change(screen.getByPlaceholderText(/jperez@utec/i), { target: { value: 'ana@utec.edu.pe' } });
        // En PARCIAL las mesas aparecen ANTES del horario (con su color por fecha)
        fireEvent.click(await screen.findByText('MESA 1'));               // toggle individual
        fireEvent.click(screen.getByRole('button', { name: /Seleccionar todos/i }));
        // recién ahora aparece la cuadrícula de horas (según las mesas elegidas)
        fireEvent.click(await screen.findByRole('button', { name: '08:00' }));
        fireEvent.click(await screen.findByRole('button', { name: /^1 hora 08:00/ }));
        fireEvent.click(screen.getByRole('button', { name: /Crear Bloqueo/i }));
        await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/bloqueos', expect.objectContaining({ tipo: 'PARCIAL' })));
    });

    it('flujo TOTAL: sin responsable no envía (validación)', async () => {
        renderPage();
        await elegirLab();
        // tipo TOTAL es el default
        fireEvent.change(screen.getByPlaceholderText(/Taller de Innovación/i), { target: { value: 'Hackathon' } });
        fireEvent.click(screen.getByRole('button', { name: '09:00' }));
        fireEvent.click(await screen.findByRole('button', { name: /^1 hora 09:00/ }));
        // botón habilitado (lab+hora+fin+titulo) pero falta responsable
        fireEvent.click(screen.getByRole('button', { name: /Crear Bloqueo/i }));
        await waitFor(() => expect(apiPost).not.toHaveBeenCalled());
    });

    it('marca las horas ocupadas (bloqueo existente) y autocompleta el título al elegir motivo', async () => {
        renderPage();
        await elegirLab();
        // hay un bloqueo TOTAL 10:00–11:00 hoy → la hora 10:00 queda deshabilitada (tipo TOTAL por defecto)
        await waitFor(() => expect(screen.getByRole('button', { name: '10:00' })).toBeDisabled());
        expect(screen.getByRole('button', { name: '09:00' })).not.toBeDisabled();
        // al elegir el motivo ALMUERZO se autocompleta el título
        fireEvent.click(screen.getByRole('button', { name: 'Almuerzo' }));
        expect(screen.getByDisplayValue('Almuerzo')).toBeInTheDocument();
    });

    it('la duración topa en la primera franja ocupada tras la hora de inicio', async () => {
        renderPage();
        await elegirLab();
        // Bloqueo existente 10:00–11:00. Al elegir 09:00, lo libre es solo hasta 10:00:
        fireEvent.click(await screen.findByRole('button', { name: '09:00' }));
        // "1 hora" (09:00–10:00) sí se ofrece; "1 hora 30 min" (09:00–10:30) NO (pisaría las 10:00).
        expect(await screen.findByRole('button', { name: /^1 hora 09:00/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /1 hora 30 min/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /2 horas/ })).not.toBeInTheDocument();
    });

    it('TOTAL: el motivo FERIADO está disponible y autocompleta el título (operativo)', async () => {
        renderPage();
        await elegirLab();
        // tipo TOTAL es el default → FERIADO es una opción de motivo
        fireEvent.click(screen.getByRole('button', { name: 'Feriado' }));
        // FERIADO es operativo: autocompleta el título con el usuario logeado
        expect(screen.getByDisplayValue('Feriado')).toBeInTheDocument();
    });

    it('flujo AULA: bloquea un aula en su totalidad (POST con aulaId)', async () => {
        renderPage();
        const selects = await screen.findAllByRole('combobox');
        // Cambia el tipo de ambiente a "Aula".
        fireEvent.change(selects[0], { target: { value: 'AULA' } });
        // El segundo combobox ahora lista las aulas; elige A101.
        const selects2 = await screen.findAllByRole('combobox');
        await screen.findByRole('option', { name: /A101/ });
        fireEvent.change(selects2[1], { target: { value: '50' } });
        // No hay selector Total/Parcial en aulas; se llena el resto.
        fireEvent.change(await screen.findByPlaceholderText(/Taller de Innovación/i), { target: { value: 'Ceremonia' } });
        fireEvent.change(screen.getByPlaceholderText(/Juan Pérez García/i), { target: { value: 'Ana Torres' } });
        fireEvent.change(screen.getByPlaceholderText(/jperez@utec/i), { target: { value: 'ana@utec.edu.pe' } });
        fireEvent.click(await screen.findByRole('button', { name: '09:00' }));
        fireEvent.click(await screen.findByRole('button', { name: /^1 hora 09:00/ }));
        fireEvent.click(screen.getByRole('button', { name: /Crear Bloqueo/i }));
        await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/bloqueos',
            expect.objectContaining({ aulaId: 50, laboratorioId: null, tipo: 'TOTAL' })));
    });

    it('se pre-llena desde Buscar libres (?aula&aulaTipo&fecha&horaInicio&horaFin)', async () => {
        const { MemoryRouter } = await import('react-router-dom');
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(
            <QueryClientProvider client={qc}>
                <MemoryRouter initialEntries={['/admin/bloqueos/crear?aula=50&aulaTipo=AULA&fecha=2026-07-20&horaInicio=15:00&horaFin=17:00']}>
                    <CrearBloqueoPage />
                </MemoryRouter>
            </QueryClientProvider>,
        );
        // Tipo de ambiente = Aula y el aula A101 (id 50) ya elegida, sin ningún click.
        const combos = await screen.findAllByRole('combobox');
        expect((combos[0] as HTMLSelectElement).value).toBe('AULA');
        await waitFor(() => expect((combos[1] as HTMLSelectElement).value).toBe('50'));
        // La franja llegó pre-cargada desde el buscador.
        expect(screen.getAllByText(/15:00/).length).toBeGreaterThan(0);
    });
});

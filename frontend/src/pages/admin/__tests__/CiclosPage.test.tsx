import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const apiGet = vi.fn((url: string, _c?: unknown) => {
    if (url.includes('/ciclos')) return Promise.resolve({ data: { data: [
        { id: 1, anio: 2026, ciclo: 0, codigo: '2026-0', fechaInicio: '2026-01-05', fechaFin: '2026-02-28', excepciones: [] },
        { id: 2, anio: 2026, ciclo: 1, codigo: '2026-1', fechaInicio: '2026-03-23', fechaFin: '2026-07-04', excepciones: [
            { id: 7, fechaInicio: '2026-04-02', fechaFin: '2026-04-03', tipo: 'FERIADO', descripcion: 'Semana Santa' },
        ] },
    ] } });
    if (url.includes('/aulas/cursos')) return Promise.resolve({ data: { data: [{ id: 9, codCurso: 'CS100', nombre: 'Programación', area: 'CS' }] } });
    return Promise.resolve({ data: { data: [] } });
});
const apiPut = vi.fn((_u?: string, _b?: unknown) => Promise.resolve({ data: { data: {} } }));
const apiPost = vi.fn((_u?: string, _b?: unknown) => Promise.resolve({ data: { data: {} } }));
const apiDelete = vi.fn((_u?: string) => Promise.resolve({ data: { data: {} } }));
vi.mock('@/services/api', () => ({ default: { get: (u: string, c?: unknown) => apiGet(u, c), post: (u: string, b: unknown) => apiPost(u, b), put: (u: string, b: unknown) => apiPut(u, b), delete: (u: string) => apiDelete(u) } }));

import CiclosPage from '../CiclosPage';

const renderPage = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={qc}><CiclosPage /></QueryClientProvider>);
};

describe('CiclosPage', () => {
    beforeEach(() => vi.clearAllMocks());

    it('lista los ciclos con sus fechas y permite editar', async () => {
        renderPage();
        expect(screen.getByRole('heading', { name: 'Ciclos académicos' })).toBeInTheDocument();
        // Fila del 2026-1 con su fecha de inicio
        const inputs = await screen.findAllByDisplayValue('2026-03-23');
        expect(inputs.length).toBeGreaterThan(0);
        // Cambiar la fecha habilita Guardar → PUT
        fireEvent.change(inputs[0], { target: { value: '2026-03-30' } });
        const guardar = screen.getAllByRole('button', { name: /Guardar/ }).find((b) => !(b as HTMLButtonElement).disabled)!;
        fireEvent.click(guardar);
        await waitFor(() => expect(apiPut).toHaveBeenCalledWith('/ciclos/2', expect.objectContaining({ fechaInicio: '2026-03-30' })));
    });

    it('muestra las excepciones (feriado) y permite eliminar y agregar', async () => {
        renderPage();
        // La excepción sembrada aparece
        expect(await screen.findByText(/Semana Santa/)).toBeInTheDocument();
        // Eliminar (× de la chip)
        fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[0]);
        await waitFor(() => expect(apiDelete).toHaveBeenCalledWith('/ciclos/excepciones/7'));
        // Agregar: llenar fechas y click Agregar → POST
        const desde = screen.getAllByLabelText('Desde')[0];
        const hasta = screen.getAllByLabelText('Hasta')[0];
        fireEvent.change(desde, { target: { value: '2026-06-29' } });
        fireEvent.change(hasta, { target: { value: '2026-06-29' } });
        fireEvent.click(screen.getAllByRole('button', { name: /Agregar$/ })[0]);
        await waitFor(() => expect(apiPost).toHaveBeenCalledWith(expect.stringContaining('/excepciones'), expect.objectContaining({ fechaInicio: '2026-06-29' })));
    });

    it('agrega un CIERRE institucional (tipo CIERRE) con su aviso', async () => {
        renderPage();
        await screen.findByText(/Semana Santa/);
        // Elige el tipo "Cierre institucional" en el primer form de excepciones
        const opt = (await screen.findAllByRole('option', { name: /Cierre institucional/ }))[0];
        const select = opt.closest('select')!;
        fireEvent.change(select, { target: { value: 'CIERRE' } });
        // Aparece el aviso de que cierra todo UTEC
        expect(await screen.findByText(/cierra.*todo UTEC|no se puede reservar ning/i)).toBeInTheDocument();
        // Llena fechas y agrega → POST con tipo CIERRE
        fireEvent.change(screen.getAllByLabelText('Desde')[0], { target: { value: '2026-07-28' } });
        fireEvent.change(screen.getAllByLabelText('Hasta')[0], { target: { value: '2026-07-29' } });
        fireEvent.click(screen.getAllByRole('button', { name: /Agregar$/ })[0]);
        await waitFor(() => expect(apiPost).toHaveBeenCalledWith(
            expect.stringContaining('/excepciones'),
            expect.objectContaining({ tipo: 'CIERRE', fechaInicio: '2026-07-28', fechaFin: '2026-07-29' })));
    });

    it('agrega un año nuevo', async () => {
        renderPage();
        fireEvent.change(screen.getByPlaceholderText(/2027/), { target: { value: '2028' } });
        fireEvent.click(screen.getByRole('button', { name: /Agregar año/ }));
        // el POST se dispara (año válido)
        await waitFor(() => expect(screen.getByRole('heading', { name: 'Ciclos académicos' })).toBeInTheDocument());
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const apiGet = vi.fn((url: string, _cfg?: unknown) => {
    if (url.includes('/aulas')) return Promise.resolve({ data: { data: [
        { id: 1, codigo: 'A501', nombre: 'A501', tipo: 'AULA', capacidad: 30, piso: 5, activo: true },
        { id: 2, codigo: 'AUDITORIO', tipo: 'AUDITORIO', capacidad: 300, activo: false },
    ] } });
    return Promise.resolve({ data: { data: [] } });
});
const apiPost = vi.fn((_u?: string, _b?: unknown) => Promise.resolve({ data: { data: {
    ciclo: '2026-1', filasLeidas: 100, virtualesDescartadas: 10, aulasCreadas: 3, cursosCreados: 8,
    clasesCreadas: 70, clasesOmitidas: 12, errores: 0, problemas: [],
} } }));
vi.mock('@/services/api', () => ({ default: { get: (u: string, c?: unknown) => apiGet(u, c), post: (u: string, b: unknown) => apiPost(u, b), put: vi.fn(), delete: vi.fn() } }));

import DocenciaPage from '../DocenciaPage';

const renderPage = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={qc}><DocenciaPage /></QueryClientProvider>);
};

describe('DocenciaPage', () => {
    beforeEach(() => vi.clearAllMocks());

    it('muestra el importador y la tabla de aulas', async () => {
        renderPage();
        expect(screen.getByRole('heading', { name: 'Programación Académica' })).toBeInTheDocument();
        expect(screen.getByText(/Importar horarios/)).toBeInTheDocument();
        expect(await screen.findByText('A501')).toBeInTheDocument();
        expect(screen.getByText('Inactiva')).toBeInTheDocument(); // el auditorio inactivo
    });

    it('abre el modal de nueva aula', async () => {
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: /Nueva aula/ }));
        expect(await screen.findByRole('heading', { name: 'Nueva aula' })).toBeInTheDocument();
    });

    it('importa un horario y muestra el resumen', async () => {
        renderPage();
        const file = new File(['Periodo;Cod_Curso\n2026 - 1;CS1'], 'h.csv', { type: 'text/csv' });
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(input, { target: { files: [file] } });
        fireEvent.click(screen.getByRole('button', { name: /^Importar$/ }));
        await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/aulas/horarios/importar', expect.any(FormData)));
        expect(await screen.findByText(/Ciclo 2026-1/)).toBeInTheDocument();
        expect(screen.getByText('70')).toBeInTheDocument(); // clases creadas
    });
});

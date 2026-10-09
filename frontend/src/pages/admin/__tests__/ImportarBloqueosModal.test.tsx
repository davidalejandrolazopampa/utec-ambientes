import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const apiGet = vi.fn((url: string, _cfg?: unknown) => {
    if (url.includes('mis-laboratorios')) return Promise.resolve({ data: { data: [
        { id: 1, codigoLab: 'L1', nombre: 'Lab Uno' },
        { id: 127, codigoLab: 'L108', nombre: 'Concept Lab' },
    ] } });
    return Promise.resolve({ data: { data: [] } });
});
const apiPost = vi.fn((_url: string, _body?: unknown) => Promise.resolve({ data: { data: {
    total: 3, creados: 2, omitidos: 1, errores: 0,
    detalle: [
        { fila: 1, titulo: 'Charla A', estado: 'CREADO', mensaje: 'L108', bloqueoId: 10 },
        { fila: 2, titulo: 'Charla B', estado: 'CREADO', mensaje: 'L108', bloqueoId: 11 },
        { fila: 3, titulo: 'Charla C', estado: 'OMITIDO', mensaje: 'Ya existe un bloqueo total' },
    ],
} } }));

vi.mock('@/services/api', () => ({
    default: { get: (url: string, cfg?: unknown) => apiGet(url, cfg), post: (url: string, body: unknown) => apiPost(url, body) },
}));

import ImportarBloqueosModal from '../ImportarBloqueosModal';

const renderModal = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onClose = vi.fn();
    render(
        <QueryClientProvider client={qc}><ImportarBloqueosModal onClose={onClose} /></QueryClientProvider>
    );
    return { onClose };
};

describe('ImportarBloqueosModal', () => {
    beforeEach(() => vi.clearAllMocks());

    it('muestra el título, la ayuda de columnas y las plantillas', () => {
        renderModal();
        expect(screen.getByRole('heading', { name: /Importar bloqueos/i })).toBeInTheDocument();
        expect(screen.getByText(/Plantilla Excel/)).toBeInTheDocument();
        expect(screen.getByText(/Plantilla CSV/)).toBeInTheDocument();
    });

    it('preselecciona L108 (Concept Lab) cuando existe', async () => {
        renderModal();
        const select = await screen.findByRole('combobox');
        await screen.findByRole('option', { name: /L108 — Concept Lab/ });
        await waitFor(() => expect((select as HTMLSelectElement).value).toBe('127'));
    });

    it('importa el archivo y muestra el resumen por fila', async () => {
        renderModal();
        await screen.findByRole('option', { name: /L108/ });

        const file = new File(['Codigo Lab;Titulo\nL108;X'], 'eventos.csv', { type: 'text/csv' });
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(input, { target: { files: [file] } });

        fireEvent.click(screen.getByRole('button', { name: /Importar/ }));

        await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/bloqueos/importar', expect.any(FormData)));
        // Resumen: 2 creados, 1 omitido + el detalle de la fila omitida
        expect(await screen.findByText('2')).toBeInTheDocument();
        expect(screen.getByText(/Ya existe un bloqueo total/)).toBeInTheDocument();
        expect(screen.getByText(/Charla C/)).toBeInTheDocument();
    });

    it('el botón Importar está deshabilitado sin archivo', () => {
        renderModal();
        expect(screen.getByRole('button', { name: /Importar/ })).toBeDisabled();
    });
});

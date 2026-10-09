import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SancionesPanel, ModalSancionesActivas } from '../modals';
import api from '@/services/api';

const PERSONA = {
    id: 5, correoUtec: 'ana.torres@utec.edu.pe', nombres: 'Ana', apellidos: 'Torres',
    nombreCompleto: 'Ana Torres', rol: 'ESTUDIANTE', activo: true,
};
const SANCIONES = [
    { id: 1, laboratorioId: null, laboratorioCodigo: null, motivo: 'Incumplimiento del reglamento', fechaInicio: '2026-07-01', fechaFin: null, activo: true, vigente: true },
];
const ACTIVAS = [
    { id: 3, usuarioId: 5, usuarioNombre: 'Ana Torres', laboratorioId: null, laboratorioCodigo: null, motivo: 'No devolvió equipos', fechaInicio: '2026-07-10', fechaFin: '2026-08-10', activo: true, vigente: true },
];
const LABS = [{ id: 9, codigoLab: 'L108', nombre: 'Concept Lab', estado: 'ACTIVO' }];

vi.mock('@/services/api', () => ({
    default: {
        get: vi.fn((url: string) => {
            if (url.includes('/sanciones/activas')) return Promise.resolve({ data: { data: ACTIVAS } });
            if (url.includes('/sanciones/usuario')) return Promise.resolve({ data: { data: SANCIONES } });
            if (url.includes('/laboratorios/mis-laboratorios')) return Promise.resolve({ data: { data: LABS } });
            return Promise.resolve({ data: { data: [] } });
        }),
        post: vi.fn(() => Promise.resolve({ data: { data: [] } })),
        patch: vi.fn(() => Promise.resolve({ data: { data: {} } })),
    },
}));

const renderPanel = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={qc}><SancionesPanel persona={PERSONA as never} /></QueryClientProvider>
    );
};

describe('SancionesPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true) as never;
    });

    it('muestra las sanciones activas del alumno', async () => {
        renderPanel();
        expect(await screen.findByText('Todos los laboratorios')).toBeInTheDocument();
        expect(screen.getByText('Vigente')).toBeInTheDocument();
        expect(screen.getByText('Incumplimiento del reglamento')).toBeInTheDocument();
    });

    it('aplica una sanción global (todos los labs) con el motivo escrito', async () => {
        renderPanel();
        fireEvent.click(await screen.findByRole('button', { name: /Sancionar/i }));
        fireEvent.change(screen.getByPlaceholderText(/Motivo/i), { target: { value: 'No devolvió equipos' } });
        fireEvent.click(screen.getByRole('button', { name: /Aplicar sanción/i }));

        await waitFor(() => expect(api.post).toHaveBeenCalledWith('/sanciones', expect.objectContaining({
            usuarioId: 5,
            laboratorioIds: [],
            motivo: 'No devolvió equipos',
        })));
    });

    it('levanta una sanción activa', async () => {
        renderPanel();
        fireEvent.click(await screen.findByRole('button', { name: /Levantar/i }));
        await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/sanciones/1/levantar'));
    });
});

describe('ModalSancionesActivas (vista global)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true) as never;
    });

    const renderModal = () => {
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        return render(
            <QueryClientProvider client={qc}><ModalSancionesActivas onClose={() => {}} /></QueryClientProvider>
        );
    };

    it('lista todas las sanciones activas con el nombre del alumno', async () => {
        renderModal();
        expect(await screen.findByText('Ana Torres')).toBeInTheDocument();
        expect(screen.getByText(/No devolvió equipos/)).toBeInTheDocument();
    });

    it('levanta una sanción desde la vista global', async () => {
        renderModal();
        fireEvent.click(await screen.findByRole('button', { name: /Levantar/i }));
        await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/sanciones/3/levantar'));
    });
});

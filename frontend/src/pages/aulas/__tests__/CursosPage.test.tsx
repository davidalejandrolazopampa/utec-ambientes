import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiGet = vi.fn((url: string, _cfg?: unknown) => {
    if (url.includes('/aulas/areas')) return Promise.resolve({ data: { data: ['CS', 'AD'] } });
    if (url.includes('/cursos/1/clases')) return Promise.resolve({ data: { data: [
        { id: 5, espacioCodigo: 'A501', espacioTipo: 'AULA', esLab: false, diaSemana: 'LUNES', horaInicio: '09:00:00', horaFin: '11:00:00', tipoSesion: 'TEORICO', seccion: 'Sección 1', docente: 'Juan Perez' },
    ] } });
    if (url.includes('/aulas/cursos')) return Promise.resolve({ data: { data: [
        { id: 1, codCurso: 'CS100', nombre: 'Algoritmos', area: 'CS' },
    ] } });
    return Promise.resolve({ data: { data: [] } });
});

vi.mock('@/services/api', () => ({ default: { get: (url: string, cfg?: unknown) => apiGet(url, cfg) } }));

import CursosPage from '../CursosPage';

const renderPage = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={qc}><CursosPage /></QueryClientProvider>);
};

describe('CursosPage', () => {
    beforeEach(() => vi.clearAllMocks());

    it('lista cursos y muestra el horario al abrir uno', async () => {
        renderPage();
        expect(screen.getByRole('heading', { name: 'Cursos' })).toBeInTheDocument();
        // El curso aparece
        const curso = await screen.findByText('Algoritmos');
        fireEvent.click(curso);
        // Su sesión aparece en el detalle
        expect(await screen.findByText(/A501/)).toBeInTheDocument();
        expect(screen.getByText(/Lun 09:00–11:00/)).toBeInTheDocument();
        expect(screen.getByText('Juan Perez')).toBeInTheDocument();
    });
});

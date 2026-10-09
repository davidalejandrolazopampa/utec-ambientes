import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MainLayout from '../MainLayout';
import { useAuthStore } from '@/store/authStore';

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }));
// useRealtime (montado en MainLayout) pide un ticket SSE; lo neutralizamos en el test.
vi.mock('@/services/api', () => ({ default: { post: vi.fn(() => new Promise(() => {})) } }));

const renderLayout = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={qc}><BrowserRouter><MainLayout /></BrowserRouter></QueryClientProvider>);
};

describe('MainLayout', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (useAuthStore as any).mockReturnValue({
            user: { rol: 'ADMIN', nombres: 'Ada', apellidos: 'Lovelace' },
            logout: vi.fn(),
        });
    });

    it('renderiza el layout con el nombre del usuario', () => {
        renderLayout();
        expect(screen.getAllByText(/Ada Lovelace/i).length).toBeGreaterThan(0);
    });

    it('muestra el logo de UTEC', () => {
        renderLayout();
        expect(screen.getAllByAltText('UTEC').length).toBeGreaterThan(0);
    });
});

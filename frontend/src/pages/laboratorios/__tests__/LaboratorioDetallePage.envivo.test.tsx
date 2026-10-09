import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

// Fecha local de HOY, igual que la calcula el componente (sin corrimiento UTC).
const HOY = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();

vi.mock('@/store/authStore', () => ({ useAuthStore: (s: any) => s({ user: { rol: 'ESTUDIANTE' } }) }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: () => ({ id: '1' }) };
});

vi.mock('@/services/laboratorios', () => ({
  laboratoriosApi: {
    // Sin diasAtencion → atiende todos los días, así HOY y MAÑANA están abiertos.
    obtener: () => Promise.resolve({ data: { data: {
      id: 1, nombre: 'Concept Lab', codigoLab: 'L108', estado: 'ACTIVO', piso: 1, ubicacionFase: 'F1',
      horaApertura: '08:00:00', horaCierre: '18:00:00', recursosDisponibles: 1, totalRecursos: 1,
      aforoCantidad: 1, aforoTipo: 'MESA', aforoCapacidad: 4,
    } } }),
    recursos: () => Promise.resolve({ data: { data: [
      { id: 1, nombre: 'MESA 1', tipo: 'MESA', estado: 'DISPONIBLE', capacidadPersonas: 4, qrCode: 'L108-MESA-001' },
    ] } }),
  },
}));
vi.mock('@/services/reservas', () => ({ reservasApi: { crear: () => Promise.resolve({ data: { data: {} } }) } }));

vi.mock('@/services/api', () => ({
  default: {
    get: vi.fn((url: string) => {
      // Bloqueo TOTAL de HOY el día completo (sin franja) → la mesa está "EN USO" ahora mismo,
      // pero MAÑANA no hay ningún bloqueo: debe volver a verse DISPONIBLE.
      if (url.includes('/bloqueos/laboratorio/')) return Promise.resolve({ data: { data: [
        { id: 1, tipo: 'TOTAL', fechaInicio: HOY, fechaFin: HOY, horaInicio: null, horaFin: null },
      ] } });
      return Promise.resolve({ data: { data: [] } });
    }),
    post: () => Promise.resolve({ data: { data: {} } }),
  },
}));

import LaboratorioDetallePage from '../LaboratorioDetallePage';

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><BrowserRouter><LaboratorioDetallePage /></BrowserRouter></QueryClientProvider>);
};

describe('LaboratorioDetallePage — el estado "en vivo" (EN USO) solo aplica a HOY', () => {
  it('muestra "EN USO" hoy con bloqueo vigente, pero "DISPONIBLE" al elegir mañana', async () => {
    renderPage();

    // Por defecto la fecha es HOY: con el bloqueo total vigente, la mesa está EN USO.
    expect(await screen.findByText('EN USO')).toBeInTheDocument();

    // Al cambiar a Mañana (sin bloqueos ese día) la foto del momento ya no aplica → DISPONIBLE.
    fireEvent.click(await screen.findByRole('button', { name: 'Mañana' }));
    expect(await screen.findByText('DISPONIBLE')).toBeInTheDocument();
    expect(screen.queryByText('EN USO')).not.toBeInTheDocument();
  });
});

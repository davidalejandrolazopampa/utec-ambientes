import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

// Mañana en fecha local (igual que el chip "Mañana" del selector).
const MANANA = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();

vi.mock('@/store/authStore', () => ({ useAuthStore: (s: any) => s({ user: { rol: 'ESTUDIANTE' } }) }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: () => ({ id: '1' }) };
});

vi.mock('@/services/laboratorios', () => ({
  laboratoriosApi: {
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
      // Horas en "HH:mm:ss" como las serializa el backend (LocalTime) — el frontend debe normalizar.
      if (url.includes('/bloqueos/laboratorio/')) return Promise.resolve({ data: { data: [
        { id: 1, tipo: 'PARCIAL', fechaInicio: MANANA, fechaFin: MANANA, horaInicio: '10:00:00', horaFin: '11:00:00', recursosAfectados: [1] },
        { id: 2, tipo: 'TOTAL', fechaInicio: MANANA, fechaFin: MANANA, horaInicio: '16:00:00', horaFin: '17:00:00' },
      ] } });
      if (url.includes('/reservas/recurso/')) return Promise.resolve({ data: { data: [
        { id: 1, estado: 'PENDIENTE', horaInicio: '12:00:00', horaFin: '13:00:00' },
        { id: 2, estado: 'EN_CURSO', horaInicio: '14:00:00', horaFin: '15:00:00' },
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

describe('LaboratorioDetallePage — grilla de horas con estados', () => {
  it('marca como deshabilitadas las horas bloqueada/reservada/check-in y deja libres las disponibles', async () => {
    renderPage();
    // La fecha se elige PRIMERO (selector arriba de la grilla); luego se selecciona la mesa.
    fireEvent.click(await screen.findByRole('button', { name: 'Mañana' }));
    fireEvent.click(await screen.findByText('MESA 1'));
    await screen.findByText('Hora inicio');

    const horaBtn = (h: string) => screen.findByRole('button', { name: h });

    // Bloqueada PARCIAL (10:00), TOTAL (16:00), reservada (12:00), check-in (14:00) → disabled
    expect(await horaBtn('10:00')).toBeDisabled();
    expect(await horaBtn('16:00')).toBeDisabled();
    expect(await horaBtn('12:00')).toBeDisabled();
    expect(await horaBtn('14:00')).toBeDisabled();
    // Libre → habilitada
    expect(await horaBtn('08:00')).not.toBeDisabled();

    // La leyenda de colores se muestra
    expect(screen.getByText('Reservada')).toBeInTheDocument();
    expect(screen.getByText('Check-in hecho')).toBeInTheDocument();
    expect(screen.getByText('Bloqueada')).toBeInTheDocument();
  });
});

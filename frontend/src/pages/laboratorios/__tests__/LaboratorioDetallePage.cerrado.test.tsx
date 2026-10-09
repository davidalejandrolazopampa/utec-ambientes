import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

// diasAtencion = solo MAÑANA (un día que nunca es hoy) → el lab está cerrado hoy.
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MANANA_DIA = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return DIAS[d.getDay()]; })();

vi.mock('@/store/authStore', () => ({ useAuthStore: (s: any) => s({ user: { rol: 'ESTUDIANTE', correoUtec: 't@utec.edu.pe' } }) }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: () => ({ id: '1' }) };
});
vi.mock('@/services/laboratorios', () => ({
  laboratoriosApi: {
    obtener: () => Promise.resolve({ data: { data: {
      id: 1, nombre: 'Concept Lab', codigoLab: 'L108', estado: 'ACTIVO', piso: 1, ubicacionFase: 'F1',
      horaApertura: '09:00:00', horaCierre: '18:00:00', recursosDisponibles: 0, totalRecursos: 2,
      aforoCantidad: 2, aforoTipo: 'MESA', aforoCapacidad: 5,
      diasAtencion: [MANANA_DIA],
    } } }),
    recursos: () => Promise.resolve({ data: { data: [
      { id: 1, nombre: 'MESA 1', tipo: 'MESA', estado: 'DISPONIBLE', capacidadPersonas: 5, qrCode: 'L108-MESA-001' },
      { id: 2, nombre: 'MESA 2', tipo: 'MESA', estado: 'DISPONIBLE', capacidadPersonas: 5, qrCode: 'L108-MESA-002' },
    ] } }),
  },
}));
vi.mock('@/services/reservas', () => ({ reservasApi: { crear: () => Promise.resolve({ data: { data: {} } }) } }));
vi.mock('@/services/api', () => ({ default: { get: vi.fn(() => Promise.resolve({ data: { data: [] } })), post: () => Promise.resolve({ data: { data: {} } }) } }));

import LaboratorioDetallePage from '../LaboratorioDetallePage';

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><BrowserRouter><LaboratorioDetallePage /></BrowserRouter></QueryClientProvider>);
};

describe('LaboratorioDetallePage — lab cerrado hoy', () => {
  it('muestra aviso, marca las mesas como CERRADO y no permite seleccionarlas', async () => {
    renderPage();
    // Aviso sobre la grilla
    expect(await screen.findByText(/no atiende los/i)).toBeInTheDocument();
    // Las mesas muestran el badge CERRADO (no DISPONIBLE)
    const badges = await screen.findAllByText('CERRADO');
    expect(badges.length).toBe(2);
    expect(screen.queryByText('DISPONIBLE')).toBeNull();
    // Al intentar seleccionar una mesa, no se abre el panel de Reservar
    fireEvent.click(screen.getByText('MESA 1'));
    expect(screen.queryByText('Hora inicio')).toBeNull();
  });

  it('al elegir "Mañana" (día que sí atiende) las mesas se habilitan y se pueden reservar', async () => {
    renderPage();
    await screen.findByText(/no atiende los/i);
    // El selector de fecha está SIEMPRE visible (arriba de la grilla): cambiar a Mañana.
    fireEvent.click(screen.getByRole('button', { name: 'Mañana' }));
    // Ya no hay aviso de cerrado ni badges CERRADO; las mesas vuelven a DISPONIBLE.
    expect(screen.queryByText(/no atiende los/i)).toBeNull();
    expect(screen.queryByText('CERRADO')).toBeNull();
    // Ahora sí se puede seleccionar una mesa y abrir el panel de Reservar.
    fireEvent.click(screen.getByText('MESA 1'));
    expect(await screen.findByText('Hora inicio')).toBeInTheDocument();
  });
});

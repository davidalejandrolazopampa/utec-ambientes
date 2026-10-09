import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

vi.mock('@/store/authStore', () => ({
  useAuthStore: (s: any) => s({ user: { rol: 'ESTUDIANTE', correoUtec: 'titular@utec.edu.pe' } }),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: () => ({ id: '1' }) };
});

vi.mock('@/services/laboratorios', () => ({
  laboratoriosApi: {
    obtener: () => Promise.resolve({ data: { data: {
      id: 1, nombre: 'Concept Lab', codigoLab: 'L108', estado: 'ACTIVO', piso: 1, ubicacionFase: 'F1',
      horaApertura: '08:00:00', horaCierre: '18:00:00', recursosDisponibles: 1, totalRecursos: 1,
      aforoCantidad: 1, aforoTipo: 'MESA', aforoCapacidad: 5,
    } } }),
    recursos: () => Promise.resolve({ data: { data: [
      { id: 1, nombre: 'MESA 1', tipo: 'MESA', estado: 'DISPONIBLE', capacidadPersonas: 5, qrCode: 'L108-MESA-001' },
    ] } }),
  },
}));
vi.mock('@/services/reservas', () => ({ reservasApi: { crear: () => Promise.resolve({ data: { data: {} } }) } }));
vi.mock('@/services/api', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: { data: [] } })), post: () => Promise.resolve({ data: { data: {} } }) },
}));

import LaboratorioDetallePage from '../LaboratorioDetallePage';

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><BrowserRouter><LaboratorioDetallePage /></BrowserRouter></QueryClientProvider>);
};

describe('LaboratorioDetallePage — correos de participantes', () => {
  it('genera N-1 casillas de correo según los participantes y bloquea el titular', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('MESA 1'));
    await screen.findByText('Hora inicio');

    // El titular (usuario logueado) aparece como input deshabilitado con su correo.
    const titular = screen.getByDisplayValue('titular@utec.edu.pe') as HTMLInputElement;
    expect(titular).toBeDisabled();

    // Con 1 participante (default) no hay casillas adicionales.
    expect(screen.queryByPlaceholderText('nombre.apellido@utec.edu.pe')).toBeNull();

    // Elegir 3 participantes → aparecen 2 casillas adicionales.
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(screen.getAllByPlaceholderText('nombre.apellido@utec.edu.pe')).toHaveLength(2);

    // Reducir a 2 → queda 1 casilla.
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    const casillas = screen.getAllByPlaceholderText('nombre.apellido@utec.edu.pe');
    expect(casillas).toHaveLength(1);

    // Un correo inválido marca el borde rojo; uno válido lo quita.
    fireEvent.change(casillas[0], { target: { value: 'novalido' } });
    expect(casillas[0].className).toContain('border-red-400');
    fireEvent.change(casillas[0], { target: { value: 'amigo@utec.edu.pe' } });
    expect(casillas[0].className).not.toContain('border-red-400');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CheckinPage from '../CheckinPage';
import { useAuthStore } from '@/store/authStore';

vi.mock('@/services/api', () => ({
    default: { post: vi.fn(), get: vi.fn(() => Promise.resolve({ data: { data: {} } })) },
}));

import api from '@/services/api';
const mockPost = api.post as unknown as ReturnType<typeof vi.fn>;

const renderCheckin = (qr = 'QR-123') =>
    render(
        <MemoryRouter initialEntries={[`/checkin/${qr}`]}>
            <Routes>
                <Route path="/checkin/:qrCode" element={<CheckinPage />} />
                <Route path="/login" element={<div>PANTALLA LOGIN</div>} />
                <Route path="/reservas" element={<div>PANTALLA RESERVAS</div>} />
            </Routes>
        </MemoryRouter>
    );

describe('CheckinPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        useAuthStore.setState({ isAuthenticated: true });
    });

    it('check-in exitoso muestra el mensaje y el detalle del recurso', async () => {
        mockPost.mockResolvedValueOnce({
            data: { data: { mensaje: 'Check-in registrado', recursoNombre: 'Mesa 1', laboratorioNombre: 'Concept Lab' } },
        });
        renderCheckin();
        expect(await screen.findByText(/Check-in Exitoso/i)).toBeInTheDocument();
        expect(screen.getByText('Mesa 1')).toBeInTheDocument();
        expect(screen.getByText('Concept Lab')).toBeInTheDocument();
        expect(mockPost).toHaveBeenCalledWith('/checkin/qr/QR-123');
    });

    it('check-in fallido muestra el error del backend', async () => {
        mockPost.mockRejectedValueOnce({ response: { data: { message: 'Reserva no encontrada' } } });
        renderCheckin();
        expect(await screen.findByText(/Check-in Fallido/i)).toBeInTheDocument();
        expect(screen.getByText('Reserva no encontrada')).toBeInTheDocument();
    });

    it('si no está autenticado, redirige a login y guarda el QR pendiente', async () => {
        useAuthStore.setState({ isAuthenticated: false });
        renderCheckin('QR-PEND');
        expect(await screen.findByText('PANTALLA LOGIN')).toBeInTheDocument();
        expect(localStorage.getItem('checkin_pendiente')).toBe('QR-PEND');
        expect(mockPost).not.toHaveBeenCalled();
    });
});

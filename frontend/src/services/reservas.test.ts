import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/services/api', () => ({
    default: {
        get: vi.fn(() => Promise.resolve({ data: { data: [] } })),
        post: vi.fn(() => Promise.resolve({ data: { data: {} } })),
        delete: vi.fn(() => Promise.resolve({ data: { data: {} } })),
    },
}));

import api from '@/services/api';
import { reservasApi } from './reservas';

const mockGet = api.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = api.post as unknown as ReturnType<typeof vi.fn>;
const mockDelete = api.delete as unknown as ReturnType<typeof vi.fn>;

describe('reservasApi', () => {
    beforeEach(() => vi.clearAllMocks());

    it('crear() hace POST /reservas con el body', () => {
        const body = { recursoId: 1, fecha: '2026-06-10', horaInicio: '08:00', horaFin: '09:00', participantes: 1 } as never;
        reservasApi.crear(body);
        expect(mockPost).toHaveBeenCalledWith('/reservas', body);
    });

    it('misReservas() pega a /reservas/mis-reservas', () => {
        reservasApi.misReservas();
        expect(mockGet).toHaveBeenCalledWith('/reservas/mis-reservas');
    });

    it('porRecurso() sin fecha no añade querystring', () => {
        reservasApi.porRecurso(5);
        expect(mockGet).toHaveBeenCalledWith('/reservas/recurso/5');
    });

    it('porRecurso() con fecha añade ?fecha=', () => {
        reservasApi.porRecurso(5, '2026-06-10');
        expect(mockGet).toHaveBeenCalledWith('/reservas/recurso/5?fecha=2026-06-10');
    });

    it('cancelar(id) hace DELETE /reservas/:id', () => {
        reservasApi.cancelar(9);
        expect(mockDelete).toHaveBeenCalledWith('/reservas/9');
    });

    it('checkin() hace POST /checkin con reservaId y qrCode', () => {
        reservasApi.checkin(3, 'QR-XYZ');
        expect(mockPost).toHaveBeenCalledWith('/checkin', { reservaId: 3, qrCode: 'QR-XYZ' });
    });
});

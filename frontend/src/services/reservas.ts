import api from './api';
import type { ApiResponse, Reserva, CreateReservaRequest } from '@/types';

/** Página de reservas (Gestión de Reservas paginada en el servidor). */
export interface ReservaPage {
    content: Reserva[];
    total: number;
    page: number;
    size: number;
    totalPages: number;
}

export const reservasApi = {
    crear: (data: CreateReservaRequest) =>
        api.post<ApiResponse<Reserva>>('/reservas', data),

    misReservas: () =>
        api.get<ApiResponse<Reserva[]>>('/reservas/mis-reservas'),

    // Gestión de Reservas PAGINADA en el servidor (evita bajar las 8k+ de golpe).
    // labId opcional = filtro por laboratorio (desplegable); respeta el alcance por rol.
    buscarMisReservas: (q: string, page: number, size: number, labId?: number) =>
        api.get<ApiResponse<ReservaPage>>('/reservas/mis-reservas/buscar', {
            params: { q: q || undefined, labId: labId || undefined, page, size },
        }),

    porRecurso: (recursoId: number, fecha?: string) => {
        const params = fecha ? `?fecha=${fecha}` : '';
        return api.get<ApiResponse<Reserva[]>>(`/reservas/recurso/${recursoId}${params}`);
    },

    cancelar: (id: number) =>
        api.delete<ApiResponse<Reserva>>(`/reservas/${id}`),

    reactivar: (id: number) =>
        api.post<ApiResponse<Reserva>>(`/reservas/${id}/reactivar`),

    completar: (id: number) =>
        api.post<ApiResponse<Reserva>>(`/reservas/${id}/completar`),

    noShow: (id: number) =>
        api.post<ApiResponse<Reserva>>(`/reservas/${id}/no-show`),

    checkin: (reservaId: number, qrCode: string) =>
        api.post<ApiResponse<unknown>>('/checkin', { reservaId, qrCode }),
};

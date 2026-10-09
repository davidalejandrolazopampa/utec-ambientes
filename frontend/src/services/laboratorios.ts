import api from './api';
import type { ApiResponse, Laboratorio, RecursoLab } from '@/types';

export const laboratoriosApi = {
    listar: (piso?: number, fase?: string) => {
        const params = new URLSearchParams();
        if (piso) params.append('piso', piso.toString());
        if (fase) params.append('fase', fase);
        return api.get<ApiResponse<Laboratorio[]>>(`/laboratorios?${params}`);
    },
    misLaboratorios: () =>
        api.get<ApiResponse<Laboratorio[]>>('/laboratorios/mis-laboratorios'),
    todosAdmin: () =>
        api.get<ApiResponse<Laboratorio[]>>('/laboratorios/admin/todos'),
    obtener: (id: number) =>
        api.get<ApiResponse<Laboratorio>>(`/laboratorios/${id}`),
    obtenerPorCodigo: (codigo: string) =>
        api.get<ApiResponse<Laboratorio>>(`/laboratorios/codigo/${codigo}`),
    recursos: (id: number) =>
        api.get<ApiResponse<RecursoLab[]>>(`/laboratorios/${id}/recursos`),
};
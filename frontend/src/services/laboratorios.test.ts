import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/services/api', () => ({
    default: {
        get: vi.fn(() => Promise.resolve({ data: { data: [] } })),
    },
}));

import api from '@/services/api';
import { laboratoriosApi } from './laboratorios';

const mockGet = api.get as unknown as ReturnType<typeof vi.fn>;

describe('laboratoriosApi', () => {
    beforeEach(() => vi.clearAllMocks());

    it('listar() sin filtros pega a /laboratorios', () => {
        laboratoriosApi.listar();
        expect(mockGet).toHaveBeenCalledWith('/laboratorios?');
    });

    it('listar(piso, fase) arma el querystring', () => {
        laboratoriosApi.listar(2, 'F1');
        const url = mockGet.mock.calls[0][0] as string;
        expect(url).toContain('piso=2');
        expect(url).toContain('fase=F1');
    });

    it('misLaboratorios() pega a /laboratorios/mis-laboratorios', () => {
        laboratoriosApi.misLaboratorios();
        expect(mockGet).toHaveBeenCalledWith('/laboratorios/mis-laboratorios');
    });

    it('todosAdmin() pega a /laboratorios/admin/todos', () => {
        laboratoriosApi.todosAdmin();
        expect(mockGet).toHaveBeenCalledWith('/laboratorios/admin/todos');
    });

    it('obtener(id) y recursos(id) usan el id en la ruta', () => {
        laboratoriosApi.obtener(7);
        laboratoriosApi.recursos(7);
        expect(mockGet).toHaveBeenCalledWith('/laboratorios/7');
        expect(mockGet).toHaveBeenCalledWith('/laboratorios/7/recursos');
    });

    it('obtenerPorCodigo(codigo) pega a /laboratorios/codigo/:codigo', () => {
        laboratoriosApi.obtenerPorCodigo('L108');
        expect(mockGet).toHaveBeenCalledWith('/laboratorios/codigo/L108');
    });
});

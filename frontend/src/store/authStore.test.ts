import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/services/api', () => ({ default: { post: vi.fn(), get: vi.fn() } }));

import api from '@/services/api';
import { useAuthStore } from './authStore';
import { getAccessToken } from '@/services/token';

describe('authStore', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false, isBootstrapping: true });
    });

    it('login guarda el access token en memoria y marca autenticado', async () => {
        (api.post as any).mockResolvedValue({ data: { data: {
            accessToken: 'tok', correoUtec: 'a@utec.edu.pe', nombres: 'A', apellidos: 'B', rol: 'ADMIN', cargo: '',
        } } });
        await useAuthStore.getState().login('cred');
        expect(useAuthStore.getState().isAuthenticated).toBe(true);
        expect(useAuthStore.getState().user?.rol).toBe('ADMIN');
        expect(getAccessToken()).toBe('tok');
    });

    it('fetchMe con éxito setea el usuario y termina el bootstrapping', async () => {
        (api.get as any).mockResolvedValue({ data: { data: { correoUtec: 'a@utec.edu.pe', rol: 'ADMIN' } } });
        await useAuthStore.getState().fetchMe();
        expect(useAuthStore.getState().isAuthenticated).toBe(true);
        expect(useAuthStore.getState().isBootstrapping).toBe(false);
    });

    it('fetchMe con error limpia la sesión', async () => {
        (api.get as any).mockRejectedValue(new Error('401'));
        await useAuthStore.getState().fetchMe();
        expect(useAuthStore.getState().isAuthenticated).toBe(false);
        expect(useAuthStore.getState().isBootstrapping).toBe(false);
    });

    it('logout llama al backend y limpia la sesión', async () => {
        (api.post as any).mockResolvedValue({});
        useAuthStore.setState({ isAuthenticated: true, user: { rol: 'ADMIN' } as any });
        await useAuthStore.getState().logout();
        expect(api.post).toHaveBeenCalledWith('/auth/logout');
        expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
});

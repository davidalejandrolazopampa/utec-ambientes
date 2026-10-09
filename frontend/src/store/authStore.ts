import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/services/api';
import { setAccessToken, clearAccessToken } from '@/services/token';
import type { UserProfile } from '@/types';

interface AuthState {
    user: UserProfile | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    // true mientras se intenta rehidratar la sesión al cargar la app (vía cookie).
    isBootstrapping: boolean;
    login: (credential: string) => Promise<void>;
    fetchMe: () => Promise<void>;
    logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            isBootstrapping: true,

            login: async (credential: string) => {
                set({ isLoading: true });
                try {
                    const { data } = await api.post('/auth/google', { credential });
                    const auth = data.data;
                    // El access token vive solo en memoria; el refresh va en cookie HttpOnly.
                    setAccessToken(auth.accessToken);
                    set({
                        user: {
                            id: 0,
                            correoUtec: auth.correoUtec,
                            nombres: auth.nombres,
                            apellidos: auth.apellidos,
                            nombreCompleto: `${auth.nombres} ${auth.apellidos}`,
                            rol: auth.rol,
                            cargo: auth.cargo,
                        },
                        isAuthenticated: true,
                        isLoading: false,
                        isBootstrapping: false,
                    });
                } catch (error) {
                    set({ isLoading: false });
                    throw error;
                }
            },

            // Rehidrata la sesión: si no hay access token en memoria (p. ej. tras F5),
            // el interceptor de api intentará /auth/refresh con la cookie automáticamente.
            fetchMe: async () => {
                set({ isLoading: true });
                try {
                    const { data } = await api.get('/auth/me');
                    set({ user: data.data, isAuthenticated: true });
                } catch {
                    clearAccessToken();
                    set({ user: null, isAuthenticated: false });
                } finally {
                    set({ isLoading: false, isBootstrapping: false });
                }
            },

            logout: async () => {
                try {
                    await api.post('/auth/logout'); // borra la cookie del refresh token
                } catch {
                    // aunque falle el server, limpiamos el estado local igual
                }
                clearAccessToken();
                set({ user: null, isAuthenticated: false });
            },
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({
                user: state.user,
                isAuthenticated: state.isAuthenticated,
            }),
        }
    )
);

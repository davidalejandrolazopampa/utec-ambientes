import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import { useAuthStore } from '@/store/authStore';

const renderAt = (allowedRoles?: string[]) =>
    render(
        <MemoryRouter initialEntries={['/']}>
            <Routes>
                <Route element={<ProtectedRoute allowedRoles={allowedRoles} />}>
                    <Route path="/" element={<div>CONTENIDO PROTEGIDO</div>} />
                </Route>
                <Route path="/login" element={<div>PANTALLA LOGIN</div>} />
                <Route path="/laboratorios" element={<div>PANTALLA LABS</div>} />
            </Routes>
        </MemoryRouter>
    );

describe('ProtectedRoute', () => {
    beforeEach(() => {
        useAuthStore.setState({ isBootstrapping: false, isAuthenticated: false, user: null });
    });

    it('muestra "Verificando sesión" mientras bootstrappea', () => {
        useAuthStore.setState({ isBootstrapping: true });
        renderAt();
        expect(screen.getByText(/Verificando sesión/i)).toBeInTheDocument();
    });

    it('redirige a /login si no está autenticado', () => {
        renderAt();
        expect(screen.getByText('PANTALLA LOGIN')).toBeInTheDocument();
    });

    it('muestra el contenido si está autenticado y no hay roles restringidos', () => {
        useAuthStore.setState({ isAuthenticated: true, user: { rol: 'ESTUDIANTE' } as never });
        renderAt();
        expect(screen.getByText('CONTENIDO PROTEGIDO')).toBeInTheDocument();
    });

    it('redirige a /laboratorios si el rol no está permitido', () => {
        useAuthStore.setState({ isAuthenticated: true, user: { rol: 'ESTUDIANTE' } as never });
        renderAt(['ADMIN']);
        expect(screen.getByText('PANTALLA LABS')).toBeInTheDocument();
    });

    it('muestra el contenido si el rol está permitido', () => {
        useAuthStore.setState({ isAuthenticated: true, user: { rol: 'ADMIN' } as never });
        renderAt(['ADMIN', 'COORDINADOR']);
        expect(screen.getByText('CONTENIDO PROTEGIDO')).toBeInTheDocument();
    });
});

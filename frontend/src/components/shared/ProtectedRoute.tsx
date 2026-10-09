import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

interface Props {
    allowedRoles?: string[];
}

export default function ProtectedRoute({ allowedRoles }: Props) {
    const { isAuthenticated, user, isBootstrapping } = useAuthStore();

    // Mientras se rehidrata la sesión (vía cookie de refresh), esperar.
    if (isBootstrapping) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-utec-gray-50">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-utec-gray-100 border-t-utec-cyan mx-auto mb-4" />
                    <p className="text-sm text-utec-gray-200">Verificando sesión...</p>
                </div>
            </div>
        );
    }

    // Sesión no válida → login
    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    // Verificar roles
    if (allowedRoles && user && !allowedRoles.includes(user.rol)) {
        return <Navigate to="/laboratorios" replace />;
    }

    return <Outlet />;
}
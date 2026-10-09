import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import MainLayout from '@/layouts/MainLayout';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import LoginPage from '@/pages/auth/LoginPage';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import { useAuthStore } from '@/store/authStore';

// Páginas cargadas bajo demanda (code-splitting): cada ruta es su propio chunk,
// así el arranque es liviano y no se compila/descarga todo de golpe.
const LaboratoriosPage = lazy(() => import('@/pages/laboratorios/LaboratoriosPage'));
const LaboratorioDetallePage = lazy(() => import('@/pages/laboratorios/LaboratorioDetallePage'));
const AulasPage = lazy(() => import('@/pages/aulas/AulasPage'));
const CursosPage = lazy(() => import('@/pages/aulas/CursosPage'));
const DocenciaPage = lazy(() => import('@/pages/admin/DocenciaPage'));
const CiclosPage = lazy(() => import('@/pages/admin/CiclosPage'));
const ReservasPage = lazy(() => import('@/pages/reservas/ReservasPage'));
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'));
const BloqueosPage = lazy(() => import('@/pages/admin/BloqueosPage'));
const CrearLaboratorioPage = lazy(() => import('@/pages/admin/CrearLaboratorioPage'));
const CrearBloqueoPage = lazy(() => import('@/pages/admin/CrearBloqueoPage'));
const CheckinPage = lazy(() => import('@/pages/checkin/CheckinPage'));
const OrganizacionPage = lazy(() => import('@/pages/admin/OrganizacionPage'));
const OcupacionPage = lazy(() => import('@/pages/ocupacion/OcupacionPage'));

// El calendario por-lab se unificó con el Calendario general (/aulas): la ruta vieja
// redirige preseleccionando el laboratorio (deep-links y marcadores siguen funcionando).
function CalendarioLabRedirect() {
    const { id } = useParams();
    return <Navigate to={`/aulas?lab=${id}`} replace />;
}

function PageFallback() {
    return (
        <div className="flex items-center justify-center py-24 text-ink-muted" role="status" aria-live="polite">
            <Loader2 className="animate-spin text-utec-cyan" size={28} />
            <span className="ml-3 text-sm">Cargando…</span>
        </div>
    );
}

function App() {
    const fetchMe = useAuthStore((s) => s.fetchMe);

    useEffect(() => {
        // Al cargar la app intentamos rehidratar la sesión: /auth/me usa el access
        // token en memoria y, si no hay, el interceptor lo renueva con la cookie.
        fetchMe();
    }, []);

    return (
        <ConfirmProvider>
            <Suspense fallback={<PageFallback />}>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />

                    <Route element={<ProtectedRoute />}>
                        <Route element={<MainLayout />}>
                            <Route path="/" element={<Navigate to="/laboratorios" replace />} />
                            <Route path="/dashboard" element={<DashboardPage />} />
                            <Route path="/laboratorios" element={<LaboratoriosPage />} />
                            <Route path="/laboratorios/:id" element={<LaboratorioDetallePage />} />
                            <Route path="/laboratorios/:id/calendario" element={<CalendarioLabRedirect />} />
                            <Route path="/reservas" element={<ReservasPage />} />
                            <Route path="/calendario" element={<Navigate to="/aulas" replace />} />
                            <Route path="/aulas" element={<AulasPage />} />
                            <Route path="/cursos" element={<CursosPage />} />
                            {/* Ocupación: solo roles de gestión (los estudiantes no la ven ni por URL directa) */}
                            <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'COORDINADOR', 'DIRECTOR', 'RESPONSABLE_LAB']} />}>
                                <Route path="/ocupacion" element={<OcupacionPage />} />
                            </Route>
                            <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'COORDINADOR', 'DOCENCIA']} />}>
                                <Route path="/admin/docencia" element={<DocenciaPage />} />
                                <Route path="/admin/ciclos" element={<CiclosPage />} />
                            </Route>
                            <Route path="/admin/organizacion" element={<OrganizacionPage />} />
                            <Route path="/admin/bloqueos" element={<BloqueosPage />} />
                            <Route path="/admin/laboratorios/crear" element={<CrearLaboratorioPage />} />
                            <Route path="/admin/bloqueos/crear" element={<CrearBloqueoPage />} />
                            <Route path="/checkin/:qrCode" element={<CheckinPage />} />
                        </Route>
                    </Route>

                    <Route path="*" element={<Navigate to="/login" replace />} />
                </Routes>
            </Suspense>
            <Toaster position="top-right" />
        </ConfirmProvider>
    );
}

export default App;

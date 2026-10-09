import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, Building2, CalendarCheck, CalendarDays, Ban, BarChart3, Users, DoorOpen, BookOpen, CalendarRange,
    Menu, X, Sun, Moon, LogOut, type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { useRealtime } from '@/hooks/useRealtime';

interface NavItem { name: string; path: string; icon: LucideIcon; roles: string[]; }
interface NavGroup { label: string; items: NavItem[]; }

const navGroups: NavGroup[] = [
    {
        label: 'Operación',
        items: [
            { name: 'Laboratorios', path: '/laboratorios', icon: Building2, roles: [] },
            { name: 'Calendario', path: '/aulas', icon: CalendarDays, roles: [] },
            { name: 'Cursos', path: '/cursos', icon: BookOpen, roles: [] },
            // Reservas: todos MENOS el DOCENTE (solo-consulta: ve calendarios pero no reserva).
            { name: 'Reservas', path: '/reservas', icon: CalendarCheck, roles: ['ADMIN', 'COORDINADOR', 'DIRECTOR', 'RESPONSABLE_LAB', 'DOCENCIA', 'ESTUDIANTE'] },
            { name: 'Bloqueos', path: '/admin/bloqueos', icon: Ban, roles: ['ADMIN', 'COORDINADOR', 'DIRECTOR', 'RESPONSABLE_LAB'] },
        ],
    },
    {
        label: 'Análisis',
        items: [
            { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'COORDINADOR', 'DIRECTOR', 'RESPONSABLE_LAB', 'DOCENCIA'] },
            { name: 'Ocupación', path: '/ocupacion', icon: BarChart3, roles: ['ADMIN', 'COORDINADOR', 'DIRECTOR', 'RESPONSABLE_LAB'] },
        ],
    },
    {
        label: 'Administración',
        items: [
            // COORDINADOR y DOCENCIA entran en modo directorio (solo Personas de su ámbito).
            { name: 'Organización', path: '/admin/organizacion', icon: Users, roles: ['ADMIN', 'COORDINADOR', 'DOCENCIA'] },
            { name: 'Programación Académica', path: '/admin/docencia', icon: DoorOpen, roles: ['ADMIN', 'COORDINADOR', 'DOCENCIA'] },
            { name: 'Ciclos académicos', path: '/admin/ciclos', icon: CalendarRange, roles: ['ADMIN', 'COORDINADOR', 'DOCENCIA'] },
        ],
    },
];

// Etiquetas legibles del rol (el badge no debe mostrar el valor crudo RESPONSABLE_LAB).
const ROL_LABEL: Record<string, string> = {
    ADMIN: 'Administrador',
    COORDINADOR: 'Coordinador',
    DIRECTOR: 'Director',
    RESPONSABLE_LAB: 'Responsable de Lab',
    DOCENCIA: 'Docencia',
    DOCENTE: 'Docente',
    ESTUDIANTE: 'Estudiante',
};
const rolLabel = (rol?: string) => (rol ? ROL_LABEL[rol] ?? rol : '');

function ThemeToggle() {
    const { theme, toggle } = useThemeStore();
    return (
        <button
            onClick={toggle}
            className="nav-item w-full justify-start"
            aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            <span>{theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>
        </button>
    );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
    const { user, logout } = useAuthStore();
    const location = useLocation();
    const navigate = useNavigate();

    const groups = navGroups
        .map((g) => ({
            ...g,
            items: g.items.filter((it) => it.roles.length === 0 || !user || it.roles.includes(user.rol)),
        }))
        .filter((g) => g.items.length > 0);

    const handleLogout = () => {
        logout();
        navigate('/login');
        onNavigate?.();
    };

    return (
        <div className="flex flex-col h-full">
            {/* Logo */}
            <Link to="/" onClick={onNavigate} className="flex items-center gap-2.5 h-20 px-5 shrink-0">
                <img src="https://utec.edu.pe/sites/default/files/2024-10/LOGO_UTEC.svg" alt="UTEC" className="h-11 brightness-0 invert" />
                <span className="text-base font-semibold text-utec-cyan">Ambientes</span>
            </Link>

            {/* Navegación agrupada */}
            <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-6" aria-label="Navegación principal">
                {groups.map((group) => (
                    <div key={group.label}>
                        <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/40">
                            {group.label}
                        </p>
                        <div className="space-y-0.5">
                            {group.items.map((item) => {
                                const active = location.pathname.startsWith(item.path);
                                const Icon = item.icon;
                                return (
                                    <Link
                                        key={item.path}
                                        to={item.path}
                                        onClick={onNavigate}
                                        aria-current={active ? 'page' : undefined}
                                        className={`nav-item relative ${active ? 'nav-item-active' : ''}`}
                                    >
                                        {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-utec-cyan" />}
                                        <Icon size={18} className={active ? 'text-utec-cyan' : ''} />
                                        <span>{item.name}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            {/* Pie: tema + usuario + salir */}
            <div className="border-t border-white/10 px-3 py-3 space-y-1 shrink-0">
                <ThemeToggle />
                {user && (
                    <>
                        <div className="px-3 py-2">
                            <p className="text-sm font-medium text-white truncate">{user.nombres} {user.apellidos}</p>
                            <span className="inline-flex items-center px-2 py-0.5 mt-1 rounded-full text-[10px] font-semibold bg-utec-cyan/15 text-utec-cyan">
                                {rolLabel(user.rol)}
                            </span>
                        </div>
                        <button onClick={handleLogout} className="nav-item w-full justify-start hover:text-danger">
                            <LogOut size={18} />
                            <span>Cerrar sesión</span>
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

export default function MainLayout() {
    const [drawerOpen, setDrawerOpen] = useState(false);
    useRealtime(); // empuje SSE: refresca listas/calendarios al instante ante check-in/reservas/bloqueos

    return (
        <div className="min-h-screen flex bg-bg">
            {/* Sidebar desktop */}
            <aside className="hidden lg:flex flex-col w-64 bg-sidebar shrink-0 sticky top-0 h-screen">
                <SidebarContent />
            </aside>

            {/* Drawer móvil */}
            {drawerOpen && (
                <>
                    <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setDrawerOpen(false)} />
                    <aside className="lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-sidebar">
                        <SidebarContent onNavigate={() => setDrawerOpen(false)} />
                    </aside>
                </>
            )}

            {/* Columna de contenido */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Top bar móvil */}
                <header className="lg:hidden flex items-center justify-between h-14 px-4 bg-sidebar text-white shrink-0">
                    <button onClick={() => setDrawerOpen(true)} className="p-2 -ml-2 rounded-lg hover:bg-white/10" aria-label="Abrir menú">
                        <Menu size={22} />
                    </button>
                    <img src="https://utec.edu.pe/sites/default/files/2024-10/LOGO_UTEC.svg" alt="UTEC" className="h-8 brightness-0 invert" />
                    <span className="w-6" />
                </header>

                <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <Outlet />
                </main>

                <footer className="border-t border-line mt-auto">
                    <div className="max-w-[1440px] mx-auto px-4 py-4 text-center">
                        <p className="text-xs text-ink-muted">Universidad de Ingeniería y Tecnología — UTEC</p>
                    </div>
                </footer>
            </div>

            {/* Botón X flotante para cerrar drawer (accesible) */}
            {drawerOpen && (
                <button onClick={() => setDrawerOpen(false)} className="lg:hidden fixed top-3 right-3 z-50 p-2 rounded-lg bg-white/10 text-white" aria-label="Cerrar menú">
                    <X size={20} />
                </button>
            )}
        </div>
    );
}

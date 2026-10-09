import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { POLL } from '@/config/polling';
import { Link } from 'react-router-dom';
import { MapPin, Clock, CircleDot, Filter, RotateCcw, Layers, BookOpen, Package, Briefcase, Wrench, GraduationCap, Calendar, Ban, Printer, Sparkles } from 'lucide-react';
import { laboratoriosApi } from '@/services/laboratorios';
import api from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import Badge from '@/components/ui/Badge';
import PageHeader, { btnOnBanner } from '@/components/ui/PageHeader';
import LiveIndicator from '@/components/ui/LiveIndicator';
import QrMesasPrint, { imprimirHojaQr } from '@/components/shared/QrMesasPrint';
import CrearLaboratorioPage from '@/pages/admin/CrearLaboratorioPage';
import { hoyLocal, labAtiende, labYaCerroHoy, nombreDiaEs } from '@/utils/fecha';
import type { Laboratorio, RecursoLab } from '@/types';

const pisoLabel = (p: number) => (p < 0 ? `Sótano ${Math.abs(p)}` : `Piso ${p}`);

interface MiSancion { id: number; laboratorioCodigo: string | null; motivo: string; fechaInicio: string; fechaFin: string | null; }

export default function LaboratoriosPage() {
    const [busqueda, setBusqueda] = useState('');
    const [pisoFilter, setPisoFilter] = useState<number | undefined>();
    const [faseFilter, setFaseFilter] = useState<string | undefined>();
    const [disponibilidadFilter, setDisponibilidadFilter] = useState<'todos' | 'ahora' | 'hoy' | 'cerrados'>('todos');
    const [estadoFilter, setEstadoFilter] = useState<'todos' | 'activos' | 'inactivos'>('todos');
    const [carreraFilter, setCarreraFilter] = useState<string | undefined>();
    const [servicioFilter, setServicioFilter] = useState<string | undefined>();
    const [ordenar, setOrdenar] = useState<'codigo' | 'nombre' | 'piso'>('piso');
    const [showCrear, setShowCrear] = useState(false);
    const [filtersOpen, setFiltersOpen] = useState(false);

    const user = useAuthStore((s) => s.user);
    const esAdmin = user?.rol && ['ADMIN', 'COORDINADOR'].includes(user.rol);
    const esEstudiante = user?.rol === 'ESTUDIANTE';
    // Imprimir QR de mesas desde la tarjeta (roles de gestión: todos menos estudiante).
    const puedeImprimirQr = !!user?.rol && user.rol !== 'ESTUDIANTE';

    // Aviso de sanción: si el alumno está sancionado, se le muestra un banner (no podrá reservar).
    const { data: misSanciones } = useQuery({
        queryKey: ['mis-sanciones'],
        queryFn: () => api.get<{ data: MiSancion[] }>('/sanciones/mias').then((r) => r.data.data),
        enabled: esEstudiante,
    });
    const [qrLab, setQrLab] = useState<Laboratorio | null>(null);
    const [printPending, setPrintPending] = useState(false);
    const { data: qrRecursos } = useQuery({
        queryKey: ['lista-qr-recursos', qrLab?.id],
        queryFn: () => api.get(`/laboratorios/${qrLab!.id}/recursos`),
        select: (r) => r.data.data as RecursoLab[],
        enabled: !!qrLab,
    });
    useEffect(() => {
        if (printPending && qrLab && (qrRecursos?.length ?? 0) > 0) {
            setPrintPending(false);
            const t = setTimeout(() => imprimirHojaQr(qrLab.codigoLab), 60); // espera el render de la hoja
            return () => clearTimeout(t);
        }
    }, [printPending, qrLab, qrRecursos]);
    const imprimirQr = (e: React.MouseEvent, lab: Laboratorio) => {
        e.preventDefault(); e.stopPropagation();
        setQrLab(lab); setPrintPending(true);
    };

    const { data: allLabs, isLoading, isFetching } = useQuery({
        queryKey: esEstudiante ? ['laboratorios'] : esAdmin ? ['laboratorios-all'] : ['mis-laboratorios'],
        queryFn: () => esEstudiante ? laboratoriosApi.listar() : esAdmin ? laboratoriosApi.todosAdmin() : laboratoriosApi.misLaboratorios(),
        select: (res) => res.data.data,
        // Auto-refresh (POLL.NORMAL, 60s): cambios de horario/estado/disponibilidad hechos por un
        // admin se ven sin recargar a mano.
        refetchInterval: POLL.NORMAL,
    });

    // Pisos derivados de los labs reales (incluye sótanos -1, -2)
    const pisos = useMemo(
        () => [...new Set((allLabs ?? []).map((l: Laboratorio) => l.piso))].sort((a, b) => a - b),
        [allLabs]
    );

    // Fases presentes en los labs (derivadas, no hardcodeadas): así no aparece "Fase 1"
    // si el usuario no ve ningún lab de esa fase.
    const fases = useMemo(
        () => [...new Set((allLabs ?? []).map((l: Laboratorio) => l.ubicacionFase).filter(Boolean))].sort() as string[],
        [allLabs]
    );

    // Carreras presentes en los labs (para el filtro), sin vacías y ordenadas.
    const carreras = useMemo(
        () => [...new Set((allLabs ?? []).map((l: Laboratorio) => l.carreraNombre).filter(Boolean))].sort() as string[],
        [allLabs]
    );

    // Servicios ofrecidos por los labs (nombres distintos, para el filtro).
    const servicios = useMemo(
        () => [...new Set((allLabs ?? []).flatMap((l: Laboratorio) => (l.servicios ?? []).map((s) => s.nombre)))].sort() as string[],
        [allLabs]
    );

    const data = useMemo(() => {
        if (!allLabs) return [];

        let filtered = allLabs.filter((l: Laboratorio) => {
            if (busqueda) {
                const term = busqueda.toLowerCase();
                // Busca en nombre, código, carrera, departamento, facultad y responsables.
                const haystack = [
                    l.nombre, l.codigoLab, l.carreraNombre, l.departamentoNombre,
                    l.facultadNombre, ...(l.responsables ?? []), ...(l.servicios ?? []).map((s) => s.nombre),
                ].filter(Boolean).join(' ').toLowerCase();
                if (!haystack.includes(term)) return false;
            }

            if (pisoFilter !== undefined && l.piso !== pisoFilter) return false;
            if (faseFilter && l.ubicacionFase !== faseFilter) return false;
            if (carreraFilter && l.carreraNombre !== carreraFilter) return false;
            if (servicioFilter && !(l.servicios ?? []).some((s) => s.nombre === servicioFilter)) return false;

            // Estado administrativo (solo lo ven los roles de gestión; el alumno solo recibe activos).
            if (estadoFilter === 'activos' && l.estado !== 'ACTIVO') return false;
            if (estadoFilter === 'inactivos' && l.estado === 'ACTIVO') return false;

            // Disponibilidad real (sin confundir "cerrado" con "lleno"):
            if (disponibilidadFilter === 'ahora' && l.recursosDisponibles === 0) return false;
            if (disponibilidadFilter === 'hoy' && (l.recursosDisponiblesHoy ?? 0) === 0) return false;
            // "Cerrados hoy" = no atiende hoy O ya pasó su hora de cierre.
            if (disponibilidadFilter === 'cerrados' && labAtiende(hoyLocal(), l.diasAtencion) && !labYaCerroHoy(l.horaCierre)) return false;

            return true;
        });

        filtered.sort((a: Laboratorio, b: Laboratorio) => {
            // Grupo PRIMARIO: primero los ACTIVOS, luego los INACTIVOS (bloques separados).
            const aAct = a.estado === 'ACTIVO' ? 0 : 1;
            const bAct = b.estado === 'ACTIVO' ? 0 : 1;
            if (aAct !== bAct) return aAct - bAct;
            // Dentro de cada grupo, por el campo elegido. (Piso "menor a mayor" = Sótano 2 (-2)
            // → Piso 1 → 2…, porque los sótanos son negativos.)
            if (ordenar === 'codigo') {
                // Por código de lab (el "item": L021, L101, L108, L203…), de MAYOR a menor.
                // `numeric` ordena bien las cifras (L108 < L203) y tolera L203-2 / T021.
                return b.codigoLab.localeCompare(a.codigoLab, undefined, { numeric: true });
            } else if (ordenar === 'nombre') {
                return a.nombre.localeCompare(b.nombre);
            } else if (ordenar === 'piso') {
                return a.piso - b.piso;
            }
            return 0;
        });

        return filtered;
    }, [allLabs, busqueda, pisoFilter, faseFilter, carreraFilter, servicioFilter, disponibilidadFilter, estadoFilter, ordenar]);

    const hasFilters = busqueda || pisoFilter !== undefined || faseFilter || carreraFilter || servicioFilter || disponibilidadFilter !== 'todos' || estadoFilter !== 'todos';

    const clearAllFilters = () => {
        setBusqueda('');
        setPisoFilter(undefined);
        setFaseFilter(undefined);
        setCarreraFilter(undefined);
        setServicioFilter(undefined);
        setDisponibilidadFilter('todos');
        setEstadoFilter('todos');
        setOrdenar('piso');
    };

    const FilterBox = ({
                           active,
                           onClick,
                           children
                       }: {
        active: boolean;
        onClick: () => void;
        children: React.ReactNode;
    }) => (
        <button
            onClick={onClick}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                active
                    ? 'bg-utec-cyan text-white shadow-md'
                    : 'bg-white text-gray-700 border-2 border-gray-200 hover:border-utec-cyan'
            }`}
        >
            {children}
        </button>
    );

    return (
        <div>
            {/* Header */}
            <PageHeader
                title="Laboratorios"
                actions={
                    <div className="flex items-center gap-2">
                        <LiveIndicator fetching={isFetching} />
                        {esAdmin && <button onClick={() => setShowCrear(true)} className={btnOnBanner}>+ Crear Lab</button>}
                    </div>
                }
            />

            {/* Aviso de sanción (alumno): no podrá reservar mientras esté vigente */}
            {esEstudiante && (misSanciones?.length ?? 0) > 0 && (
                <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
                    <div className="flex items-start gap-2">
                        <Ban size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-red-800">
                            <p className="font-bold">Tienes una sanción activa: no puedes reservar.</p>
                            <ul className="mt-1 space-y-0.5 list-disc list-inside">
                                {misSanciones!.map((s) => (
                                    <li key={s.id}>
                                        {s.laboratorioCodigo ? `Laboratorio ${s.laboratorioCodigo}` : 'Todos los laboratorios'}
                                        {s.fechaFin ? ` · hasta el ${s.fechaFin}` : ' · sin fecha de fin'} — {s.motivo}
                                    </li>
                                ))}
                            </ul>
                            <p className="mt-1 text-xs text-red-600">Si crees que es un error, comunícate con el coordinador.</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Búsqueda */}
            <div className="mb-6">
                <input
                    type="text"
                    placeholder="Buscar por nombre, código, carrera o responsable..."
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    className="input-field w-full"
                />
            </div>

            {/* Controles principales */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
                {/* Botón desplegable filtros */}
                <button
                    onClick={() => setFiltersOpen(!filtersOpen)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                        filtersOpen
                            ? 'bg-utec-cyan text-white shadow-md'
                            : 'bg-white text-gray-700 border-2 border-gray-200 hover:border-utec-cyan'
                    }`}
                >
                    <span>{filtersOpen ? '▼' : '▶'}</span>
                    <span className="inline-flex items-center gap-1.5"><Filter size={14} /> Filtros</span>
                    {hasFilters && <span className="ml-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">!</span>}
                </button>

                {/* Ordenar por */}
                <div className="flex-1 sm:flex-none">
                    <div className="relative">
                        <select
                            value={ordenar}
                            onChange={(e) => setOrdenar(e.target.value as any)}
                            className="appearance-none w-full px-4 py-2 pr-10 bg-white border-2 border-gray-200 rounded-lg text-gray-700 font-medium focus:outline-none focus:border-utec-cyan transition-all hover:border-utec-cyan cursor-pointer"
                        >
                            <option value="codigo">Código (mayor a menor)</option>
                            <option value="nombre">Nombre (A-Z)</option>
                            <option value="piso">Piso (menor a mayor)</option>
                        </select>
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none text-gray-600">
                            ▼
                        </div>
                    </div>
                </div>

                {/* Limpiar filtros */}
                {hasFilters && (
                    <button
                        onClick={clearAllFilters}
                        className="px-4 py-2 bg-red-100 text-red-600 rounded-lg font-medium hover:bg-red-200 transition-all"
                    >
                        <RotateCcw size={14} className="inline align-[-2px]" /> Limpiar
                    </button>
                )}
            </div>

            {/* Filtros Desplegables */}
            {filtersOpen && (
                <div className="bg-white border-2 border-gray-200 rounded-lg p-6 mb-6 animate-in fade-in slide-in-from-top-2">
                    <div className="space-y-6">
                        {/* Piso */}
                        <div>
                            <h3 className="text-sm font-bold text-utec-dark mb-3 uppercase inline-flex items-center gap-1.5"><MapPin size={14} /> Piso</h3>
                            <div className="flex flex-wrap gap-2">
                                <FilterBox active={!pisoFilter} onClick={() => setPisoFilter(undefined)}>
                                    Todos
                                </FilterBox>
                                {pisos.map((p) => (
                                    <FilterBox
                                        key={p}
                                        active={pisoFilter === p}
                                        onClick={() => setPisoFilter(pisoFilter === p ? undefined : p)}
                                    >
                                        {pisoLabel(p)}
                                    </FilterBox>
                                ))}
                            </div>
                        </div>

                        {/* Fase */}
                        <div>
                            <h3 className="text-sm font-bold text-utec-dark mb-3 uppercase inline-flex items-center gap-1.5"><Layers size={14} /> Fase</h3>
                            <div className="flex flex-wrap gap-2">
                                <FilterBox active={!faseFilter} onClick={() => setFaseFilter(undefined)}>
                                    Todas
                                </FilterBox>
                                {fases.map((f) => (
                                    <FilterBox
                                        key={f}
                                        active={faseFilter === f}
                                        onClick={() => setFaseFilter(faseFilter === f ? undefined : f)}
                                    >
                                        {f}
                                    </FilterBox>
                                ))}
                            </div>
                        </div>

                        {/* Carrera (solo si hay carreras asignadas) */}
                        {carreras.length > 0 && (
                            <div>
                                <h3 className="text-sm font-bold text-utec-dark mb-3 uppercase inline-flex items-center gap-1.5"><BookOpen size={14} /> Carrera</h3>
                                <div className="flex flex-wrap gap-2">
                                    <FilterBox active={!carreraFilter} onClick={() => setCarreraFilter(undefined)}>
                                        Todas
                                    </FilterBox>
                                    {carreras.map((c) => (
                                        <FilterBox
                                            key={c}
                                            active={carreraFilter === c}
                                            onClick={() => setCarreraFilter(carreraFilter === c ? undefined : c)}
                                        >
                                            {c}
                                        </FilterBox>
                                    ))}
                                </div>
                            </div>
                        )}

                        {servicios.length > 0 && (
                            <div>
                                <h3 className="text-sm font-bold text-utec-dark mb-3 uppercase inline-flex items-center gap-1.5"><Wrench size={14} /> Servicio</h3>
                                <div className="flex flex-wrap gap-2">
                                    <FilterBox active={!servicioFilter} onClick={() => setServicioFilter(undefined)}>
                                        Todos
                                    </FilterBox>
                                    {servicios.map((s) => (
                                        <FilterBox
                                            key={s}
                                            active={servicioFilter === s}
                                            onClick={() => setServicioFilter(servicioFilter === s ? undefined : s)}
                                        >
                                            {s}
                                        </FilterBox>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Disponibilidad */}
                        <div>
                            <h3 className="text-sm font-bold text-utec-dark mb-3 uppercase inline-flex items-center gap-1.5"><Package size={14} /> Disponibilidad</h3>
                            <div className="flex flex-wrap gap-2">
                                <FilterBox active={disponibilidadFilter === 'todos'} onClick={() => setDisponibilidadFilter('todos')}>
                                    Todos
                                </FilterBox>
                                <FilterBox active={disponibilidadFilter === 'ahora'} onClick={() => setDisponibilidadFilter('ahora')}>
                                    Disponibles ahora
                                </FilterBox>
                                <FilterBox active={disponibilidadFilter === 'hoy'} onClick={() => setDisponibilidadFilter('hoy')}>
                                    Con cupo hoy
                                </FilterBox>
                                <FilterBox active={disponibilidadFilter === 'cerrados'} onClick={() => setDisponibilidadFilter('cerrados')}>
                                    Cerrados hoy
                                </FilterBox>
                            </div>
                        </div>

                        {/* Estado administrativo (ACTIVO/INACTIVO) — solo roles de gestión: el
                            alumno solo recibe labs activos, así que el filtro no le aplica. */}
                        {!esEstudiante && (
                            <div>
                                <h3 className="text-sm font-bold text-utec-dark mb-3 uppercase inline-flex items-center gap-1.5"><CircleDot size={14} className="text-utec-green" /> Estado</h3>
                                <div className="flex flex-wrap gap-2">
                                    <FilterBox active={estadoFilter === 'todos'} onClick={() => setEstadoFilter('todos')}>
                                        Todos
                                    </FilterBox>
                                    <FilterBox active={estadoFilter === 'activos'} onClick={() => setEstadoFilter('activos')}>
                                        Activos
                                    </FilterBox>
                                    <FilterBox active={estadoFilter === 'inactivos'} onClick={() => setEstadoFilter('inactivos')}>
                                        Inactivos
                                    </FilterBox>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Resultados */}
            {isLoading ? (
                <div className="text-center py-12 text-gray-500">Cargando laboratorios...</div>
            ) : data.length === 0 ? (
                <div className="text-center py-12">
                    <p className="text-gray-500 mb-3">No hay laboratorios para este filtro</p>
                    {hasFilters && (
                        <button onClick={clearAllFilters} className="text-sm text-utec-cyan hover:text-utec-blue font-medium">
                            Limpiar filtros
                        </button>
                    )}
                </div>
            ) : (
                <>
                    <p className="text-sm text-gray-600 mb-4 font-medium">
                        {data.length} laboratorio{data.length !== 1 ? 's' : ''}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {data.map((lab: Laboratorio) => {
                            const ocupacion = ((lab.totalRecursos - lab.recursosDisponibles) / lab.totalRecursos) * 100;
                            const ocupacionColor =
                                ocupacion === 0 ? 'bg-green-500' : ocupacion < 50 ? 'bg-yellow-500' : 'bg-red-500';
                            // Si hoy no es día de atención, el lab está cerrado: no mostrar "disponible".
                            const atiendeHoy = labAtiende(hoyLocal(), lab.diasAtencion);
                            // Atiende hoy pero ya pasó la hora de cierre → cerrado por hoy (no "disponible").
                            const yaCerroHoy = atiendeHoy && labYaCerroHoy(lab.horaCierre);

                            return (
                                <Link
                                    key={lab.id}
                                    to={`/laboratorios/${lab.id}`}
                                    className="card hover:shadow-lg hover:border-utec-cyan group transition-all"
                                >
                                    {/* Header */}
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex-1">
                                            <h3 className="font-bold text-utec-dark group-hover:text-utec-cyan transition-colors">
                                                {lab.nombre}
                                            </h3>
                                            <p className="text-xs text-gray-500 font-mono">{lab.codigoLab}</p>
                                        </div>
                                        {/* El estado ACTIVO/INACTIVO es administrativo: al alumno lo confunde
                                            (un lab ACTIVO puede estar bloqueado por evento), así que se oculta. */}
                                        {!esEstudiante && (
                                            <Badge variant={lab.estado === 'ACTIVO' ? 'success' : 'danger'}>
                                                {lab.estado}
                                            </Badge>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="text-xs text-gray-500 mb-2 space-y-1">
                                        {/* El alumno NO ve la jerarquía (director); solo los responsables del lab.
                                            Los roles de gestión (responsable+) ven la data COMPLETA: director y
                                            responsables con su cargo y correo. La tarjeta es un <Link>, así que el
                                            correo va como texto (un <a mailto> anidado sería HTML inválido); el
                                            correo clickeable vive en el detalle del lab. */}
                                        {/* Director — solo roles de gestión. Nombre + cargo en una línea; el
                                            correo en su propia línea (break-all) para no deformar la tarjeta. */}
                                        {!esEstudiante && lab.directorNombre && (
                                            <div className="flex items-start gap-1.5">
                                                <Briefcase size={13} className="shrink-0 mt-0.5" />
                                                <div className="min-w-0">
                                                    <span className="text-utec-dark font-medium">{lab.directorNombre}</span>
                                                    {lab.directorCargo && <span className="text-gray-400"> · {lab.directorCargo}</span>}
                                                    {lab.directorCorreo && <div className="text-utec-cyan break-all">{lab.directorCorreo}</div>}
                                                </div>
                                            </div>
                                        )}
                                        {/* Responsables — gestión: cada uno apilado con su cargo y correo. */}
                                        {!esEstudiante && lab.responsablesInfo && lab.responsablesInfo.length > 0 ? (
                                            <div className="space-y-1">
                                                {lab.responsablesInfo.map(r => (
                                                    <div key={r.id} className="flex items-start gap-1.5">
                                                        <Wrench size={13} className="shrink-0 mt-0.5" />
                                                        <div className="min-w-0">
                                                            <span className="text-utec-dark font-medium">{r.nombreCompleto}</span>
                                                            {r.cargo && <span className="text-gray-400"> · {r.cargo}</span>}
                                                            {r.correoUtec && <div className="text-utec-cyan break-all">{r.correoUtec}</div>}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : lab.responsablesInfo && lab.responsablesInfo.length > 0 ? (
                                            /* Estudiante: solo el nombre de cada responsable, uno debajo del otro. */
                                            <div className="space-y-0.5">
                                                {lab.responsablesInfo.map(r => (
                                                    <p key={r.id} className="flex items-center gap-1.5"><Wrench size={13} className="shrink-0" /> <span className="text-utec-dark">{r.nombreCompleto}</span></p>
                                                ))}
                                            </div>
                                        ) : lab.responsables && lab.responsables.length > 0 ? (
                                            <div className="space-y-0.5">
                                                {lab.responsables.map((n, i) => (
                                                    <p key={i} className="flex items-center gap-1.5"><Wrench size={13} className="shrink-0" /> <span className="text-utec-dark">{n}</span></p>
                                                ))}
                                            </div>
                                        ) : null}
                                        {lab.carreraNombre && (
                                            <p className="flex items-center gap-1.5"><BookOpen size={13} className="shrink-0" /> {lab.carreraNombre}</p>
                                        )}
                                        <p className="inline-flex items-center gap-1.5"><MapPin size={14} /> Piso {lab.piso} • {lab.ubicacionFase}</p>
                                        <p className="inline-flex items-center gap-1.5"><Clock size={14} /> {lab.horaApertura?.slice(0, 5)} — {lab.horaCierre?.slice(0, 5)}</p>
                                        {(lab.servicios?.length ?? 0) > 0 && (
                                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                                <span className="text-[11px] font-semibold text-utec-dark">Ofrece:</span>
                                                {lab.servicios!.slice(0, 3).map((s, i) => (
                                                    <span key={i} className="inline-flex items-center gap-1 text-[11px] font-bold bg-utec-cyan text-white px-2 py-0.5 rounded-full shadow-sm"><Sparkles size={10} /> {s.nombre}</span>
                                                ))}
                                                {lab.servicios!.length > 3 && <span className="text-[11px] text-utec-gray-200">+{lab.servicios!.length - 3}</span>}
                                            </div>
                                        )}
                                    </div>

                                    {/* Recursos */}
                                    <div className="text-sm text-gray-700 mb-2">
                                        <p className="font-medium">
                                            {lab.aforoCantidad} {lab.aforoTipo === 'MESA' ? 'mesas' : 'PCs'}
                                        </p>
                                        <p className="text-xs text-gray-500">{lab.aforoCapacidad} personas c/u</p>
                                    </div>

                                    {/* Ocupación / estado del día */}
                                    <div className="mb-2">
                                        {!atiendeHoy ? (
                                            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                                                <p className="text-xs font-semibold text-amber-800 inline-flex items-center gap-1"><Ban size={12} /> Fuera de servicio hoy</p>
                                                <p className="text-[11px] text-amber-700 mt-0.5">No atiende los {nombreDiaEs(hoyLocal()).toLowerCase()}</p>
                                            </div>
                                        ) : yaCerroHoy ? (
                                            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                                                <p className="text-xs font-semibold text-amber-800 inline-flex items-center gap-1"><Ban size={12} /> Cerrado por hoy</p>
                                                <p className="text-[11px] text-amber-700 mt-0.5">Cerró a las {lab.horaCierre?.slice(0, 5)}</p>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-xs font-semibold text-gray-700">Disponibilidad ahora</span>
                                                    <span className="text-xs font-bold text-utec-cyan">
                                                        {lab.recursosDisponibles}/{lab.totalRecursos}
                                                    </span>
                                                </div>
                                                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full transition-all ${ocupacionColor}`}
                                                        style={{ width: `${ocupacion}%` }}
                                                    />
                                                </div>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {ocupacion === 0
                                                        ? 'Todos disponibles'
                                                        : ocupacion < 50
                                                            ? `${Math.round(ocupacion)}% ocupado`
                                                            : 'Muy ocupado'}
                                                </p>
                                                {/* Disponibilidad de HOY (descuenta reservas activas y bloqueos del día) */}
                                                {typeof lab.recursosDisponiblesHoy === 'number' && (
                                                    <p className="text-xs text-gray-500 mt-0.5">
                                                        <Calendar size={12} className="inline align-[-1px]" /> Hoy: <span className="font-semibold text-utec-dark">{lab.recursosDisponiblesHoy}/{lab.totalRecursos}</span> con cupo libre
                                                    </p>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    {/* CTA */}
                                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                                        <span className="text-xs font-medium">
                                            {!atiendeHoy ? 'Cerrado hoy' : yaCerroHoy ? 'Cerrado por hoy' : lab.recursosDisponibles > 0 ? 'Disponible' : 'Sin recursos'}
                                        </span>
                                        <div className="flex items-center gap-3">
                                            {puedeImprimirQr && (
                                                <button onClick={(e) => imprimirQr(e, lab)} title="Imprimir o guardar como PDF los QR de las mesas" className="text-xs text-utec-cyan hover:text-utec-blue font-medium">
                                                    <Printer size={14} className="inline align-[-2px]" /> QR
                                                </button>
                                            )}
                                            <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity text-utec-cyan">
                                                Ver →
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </>
            )}

            {/* Hoja imprimible de QR (oculta; se imprime al pulsar <Printer size={14} className="inline align-[-2px]" /> QR en una tarjeta) */}
            {qrLab && (qrRecursos?.length ?? 0) > 0 && (
                <QrMesasPrint lab={qrLab} recursos={qrRecursos!} />
            )}

            {/* Crear laboratorio en ventana flotante (modal) */}
            {showCrear && <CrearLaboratorioPage onClose={() => setShowCrear(false)} />}
        </div>
    );
}
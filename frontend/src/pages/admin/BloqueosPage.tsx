import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { POLL } from '@/config/polling';
import { CalendarDays, CalendarOff, GraduationCap, LayoutGrid, Table as TableIcon, Calendar, Clock, Trash2, Lock, Unlock, Bell, Ban, ChevronRight, Upload } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import api from '@/services/api';
import Badge from '@/components/ui/Badge';
import DataTable from '@/components/ui/DataTable';
import EmptyState from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';
import PageHeader, { btnOnBanner } from '@/components/ui/PageHeader';
import LiveIndicator from '@/components/ui/LiveIndicator';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import CrearBloqueoPage from './CrearBloqueoPage';
import ImportarBloqueosModal from './ImportarBloqueosModal';
import { hoyLocal } from '@/utils/fecha';
import { mesaOcupada, laboratorioOcupado, slotsLibresMesa, generarHorasMalla, type DispCtx } from '@/utils/disponibilidad';

interface Bloqueo {
    id: number;
    laboratorioCodigo: string;
    laboratorioNombre: string;
    aulaId?: number | null;
    espacioCodigo?: string;   // código del lab o del aula
    espacioNombre?: string;   // nombre del lab o del aula
    espacioTipo?: string;     // "LABORATORIO" o el tipo del aula
    tipo: string;
    motivo: string;
    descripcion?: string;
    fechaInicio: string;
    fechaFin: string;
    horaInicio?: string;
    horaFin?: string;
    activo: boolean;
    recursosAfectados?: number[];
    creadoPorNombre: string;
    createdAt: string;
    // Campos de CLASE (es_clase=true): recurrencia día/hora/frecuencia + curso.
    esClase?: boolean;
    diaSemana?: string;
    frecuencia?: string;
    ciclo?: string;
    seccion?: string;
    cursoCodigo?: string;
    cursoNombre?: string;
}

// Formatea la recurrencia de una clase: "Jueves · 19:00–21:00 · Sem. A"
const frecLabel = (f?: string) => f === 'SEMANA_A' ? 'Sem. A' : f === 'SEMANA_B' ? 'Sem. B' : '';
const capitaliza = (s?: string) => s ? s.charAt(0) + s.slice(1).toLowerCase() : '';

interface Laboratorio {
    id: number;
    nombre: string;
    codigoLab: string;
}

// Reserva mínima para calcular disponibilidad de horas/mesas en el editor.
interface ReservaSlot {
    fecha: string; estado: string; recursoId: number; horaInicio?: string; horaFin?: string;
}

const motivoLabel: Record<string, string> = {
    CLASE: 'Clase', ASESORIA: 'Asesoría', REUNION: 'Reunión',
    EXAMEN: 'Examen', EVENTO: 'Evento', MANTENIMIENTO: 'Mantenimiento',
    ALMUERZO: 'Almuerzo', FERIADO: 'Feriado',
};

const motivoColor = (motivo: string) => {
    switch (motivo) {
        case 'CLASE': return 'bg-blue-100 text-blue-700';
        case 'ASESORIA': return 'bg-sky-100 text-sky-700';
        case 'REUNION': return 'bg-teal-100 text-teal-700';
        case 'EXAMEN': return 'bg-amber-100 text-amber-700';
        case 'EVENTO': return 'bg-green-100 text-green-700';
        case 'MANTENIMIENTO': return 'bg-red-100 text-red-700';
        default: return 'bg-gray-100 text-gray-700';
    }
};

// Malla horaria (07:00–23:00): generarHorasMalla (utils/disponibilidad).
const calcularHoraFin = (horaInicio: string, duracion: string): string => {
    const [hI, mI] = horaInicio.split(':').map(Number);
    const [hD, mD] = duracion.split(':').map(Number);
    let hF = hI + hD, mF = mI + mD;
    if (mF >= 60) { hF += Math.floor(mF / 60); mF %= 60; }
    return `${String(hF).padStart(2, '0')}:${String(mF).padStart(2, '0')}`;
};
const generarDuraciones = (): { valor: string; label: string }[] => {
    const out: { valor: string; label: string }[] = [];
    for (let m = 30; m <= 960; m += 30) {
        const h = Math.floor(m / 60), min = m % 60;
        const label = h === 0 ? `${min} min` : min === 0 ? `${h} ${h === 1 ? 'hora' : 'horas'}` : `${h} ${h === 1 ? 'hora' : 'horas'} ${min} min`;
        out.push({ valor: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`, label });
    }
    return out;
};

const esHoy = (bloqueo: Bloqueo): boolean => {
    const hoy = hoyLocal();
    if (bloqueo.fechaInicio > hoy || bloqueo.fechaFin < hoy) return false;
    if (bloqueo.horaFin) {
        const ahora = new Date();
        const horaActual = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
        if (bloqueo.horaFin.slice(0, 5) <= horaActual) return false;
    }
    return true;
};

const estaVigente = (bloqueo: Bloqueo): boolean => {
    const ahora = new Date();
    const hoy = hoyLocal();
    if (bloqueo.fechaFin > hoy) return true;
    if (bloqueo.fechaFin < hoy) return false;
    if (bloqueo.horaFin) {
        const horaActual = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
        return bloqueo.horaFin.slice(0, 5) > horaActual;
    }
    return true;
};

// Espacio del bloqueo (lab o aula): el backend puebla espacioCodigo/espacioNombre para ambos;
// se cae a los campos de lab por compatibilidad. `esAula` distingue para mostrar/gestionar.
const codigoDe = (b: Bloqueo) => b.espacioCodigo || b.laboratorioCodigo || '';
const nombreDe = (b: Bloqueo) => b.espacioNombre || b.laboratorioNombre || '';
const esAula = (b: Bloqueo) => !!b.aulaId;
// Editable = ni aula (se borra/recrea) ni RETIRO (rango + todo el día: el editor de una sola
// fecha lo corrompería → se gestiona reponiéndolo y recreándolo desde "Retirar mesas" del lab).
const esEditable = (b: Bloqueo) => !esAula(b) && b.motivo !== 'RETIRO';

export default function BloqueosPage() {
    const confirm = useConfirm();
    const { user } = useAuthStore();
    // Los feriados (motivo FERIADO) son ~2.5k bloqueos que inundan la lista; se ocultan
    // por defecto y se muestran con el toggle.
    const [mostrarFeriados, setMostrarFeriados] = useState(false);
    const [mostrarClases, setMostrarClases] = useState(false);   // incluye clases del horario
    const [labFiltro, setLabFiltro] = useState('');   // código de lab; '' = todos
    const [vista, setVista] = useState<'tarjetas' | 'tabla'>('tarjetas');
    const [crearModal, setCrearModal] = useState(false);
    const [importarModal, setImportarModal] = useState(false);
    const [editModal, setEditModal] = useState<Bloqueo | null>(null);
    const [editForm, setEditForm] = useState({
        laboratorioId: '', tipo: 'PARCIAL', motivo: 'CLASE',
        descripcion: '', fechaInicio: '', fechaFin: '',
        horaInicio: '08:00', horaFin: '18:00',
        recursosIds: [] as number[],
    });

    const { data: bloqueos, isLoading, isFetching } = useQuery({
        queryKey: ['bloqueos-activos', mostrarClases],
        queryFn: () => api.get<{ data: Bloqueo[] }>(`/bloqueos/todos?incluirClases=${mostrarClases}`),
        select: (res) => res.data.data,
        refetchInterval: POLL.NORMAL,
    });

    const { data: laboratorios } = useQuery({
        queryKey: ['mis-laboratorios'],
        queryFn: () => api.get('/laboratorios/mis-laboratorios'),
        select: (res) => res.data.data as Laboratorio[],
    });

    // Recursos del lab seleccionado (para editar qué mesas/PCs afecta un bloqueo PARCIAL).
    const { data: recursosEdit } = useQuery({
        queryKey: ['bloqueo-edit-recursos', editForm.laboratorioId],
        queryFn: () => api.get(`/laboratorios/${editForm.laboratorioId}/recursos`),
        select: (res) => res.data.data as { id: number; nombre: string; tipo: string }[],
        enabled: !!editModal && !!editForm.laboratorioId && editForm.tipo === 'PARCIAL',
    });

    // Reservas y bloqueos del lab → para mostrar disponibilidad de horas y mesas en el editor.
    const { data: reservasLabEdit } = useQuery({
        queryKey: ['bloqueo-edit-reservas', editForm.laboratorioId],
        queryFn: () => api.get(`/reservas/laboratorio/${editForm.laboratorioId}`),
        select: (res) => res.data.data as ReservaSlot[],
        enabled: !!editModal && !!editForm.laboratorioId,
    });
    const { data: bloqueosLabEdit } = useQuery({
        queryKey: ['bloqueo-edit-bloqueos', editForm.laboratorioId],
        queryFn: () => api.get(`/bloqueos/laboratorio/${editForm.laboratorioId}`),
        select: (res) => res.data.data as Bloqueo[],
        enabled: !!editModal && !!editForm.laboratorioId,
    });

    const toggleRecursoEdit = (id: number) =>
        setEditForm((prev) => ({
            ...prev,
            recursosIds: prev.recursosIds.includes(id)
                ? prev.recursosIds.filter((r) => r !== id)
                : [...prev.recursosIds, id],
        }));

    // Disponibilidad para el editor: lógica compartida (utils/disponibilidad); excluye el
    // propio bloqueo que se edita (excludeBloqueoId) para que no choque consigo mismo.
    const dispCtxEdit: DispCtx = { fecha: editForm.fechaInicio, reservas: reservasLabEdit, bloqueos: bloqueosLabEdit, excludeBloqueoId: editModal?.id };
    const slotOcupadoEnMesaEdit = (recursoId: number, hora: string) => mesaOcupada(dispCtxEdit, recursoId, hora);
    const slotOcupadoEdit = (hora: string) => laboratorioOcupado(dispCtxEdit, hora, editForm.tipo, editForm.recursosIds, editForm.motivo);
    const slotsMesaEdit = (recursoId: number) => slotsLibresMesa(dispCtxEdit, recursoId);
    // Tope de la duración al editar: primera franja ocupada tras la hora de inicio (§ crear).
    const topeDuracionEdit = editForm.horaInicio
        ? (generarHorasMalla().find((h) => h > editForm.horaInicio && slotOcupadoEdit(h)) ?? '23:00')
        : '23:00';

    const editarMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) => api.put(`/bloqueos/${id}`, data),
        onSuccess: () => { toast.success('Bloqueo actualizado'); setEditModal(null); },
        onError: (error: unknown) => { toast.error((error as { response?: { data?: { message?: string } } }).response?.data?.message || 'Error al actualizar'); },
    });


    const eliminar = useMutation({
        mutationFn: (id: number) => api.delete(`/bloqueos/${id}`),
        onSuccess: () => { toast.success('Bloqueo eliminado'); },
        onError: () => toast.error('Error al eliminar'),
    });

    const handleEliminar = async (bloqueo: Bloqueo) => {
        const ok = await confirm({
            title: 'Eliminar bloqueo',
            message: `¿ELIMINAR definitivamente el bloqueo ${bloqueo.tipo.toLowerCase()} en ${nombreDe(bloqueo)}? Esta acción no se puede deshacer.`,
            confirmText: 'Eliminar',
            variant: 'danger',
        });
        if (ok) eliminar.mutate(bloqueo.id);
    };

    const abrirEdicion = (b: Bloqueo) => {
        const lab = laboratorios?.find((l) => l.codigoLab === b.laboratorioCodigo);
        setEditForm({
            laboratorioId: lab?.id?.toString() || '', tipo: b.tipo, motivo: b.motivo,
            descripcion: b.descripcion || '', fechaInicio: b.fechaInicio, fechaFin: b.fechaFin,
            horaInicio: b.horaInicio?.slice(0, 5) || '08:00', horaFin: b.horaFin?.slice(0, 5) || '18:00',
            recursosIds: b.recursosAfectados ?? [],
        });
        setEditModal(b);
    };

    const guardarEdicion = async () => {
        if (!editModal || !editForm.laboratorioId) return;
        const ok = await confirm({
            title: 'Guardar cambios',
            message: '¿Confirmar guardar los cambios de este bloqueo?',
            confirmText: 'Guardar',
            variant: 'primary',
        });
        if (!ok) return;
        editarMutation.mutate({
            id: editModal.id,
            data: {
                laboratorioId: Number(editForm.laboratorioId), tipo: editForm.tipo, motivo: editForm.motivo,
                descripcion: editForm.descripcion || null, fechaInicio: editForm.fechaInicio, fechaFin: editForm.fechaInicio,
                horaInicio: editForm.horaInicio + ':00', horaFin: editForm.horaFin + ':00',
                recursosIds: editForm.tipo === 'PARCIAL' ? editForm.recursosIds : null,
            },
        });
    };

    const motivosParcial = ['CLASE', 'ASESORIA', 'REUNION', 'EXAMEN', 'MANTENIMIENTO'];
    const motivosTotal = ['EVENTO', 'MANTENIMIENTO', 'ALMUERZO', 'FERIADO'];

    // Orden cronológico ascendente: por fecha de inicio y, a igual fecha, por hora de inicio.
    // (fechas ISO 'YYYY-MM-DD' y horas 'HH:mm:ss' comparan bien como string.)
    const ordenarPorFechaHora = (a: Bloqueo, b: Bloqueo) =>
        a.fechaInicio !== b.fechaInicio
            ? a.fechaInicio.localeCompare(b.fechaInicio)
            : (a.horaInicio ?? '').localeCompare(b.horaInicio ?? '');

    // Alcance por rol: ADMIN/COORDINADOR ven todos los labs; RESPONSABLE/DIRECTOR solo los suyos.
    // El backend YA filtra en el servidor: /bloqueos/todos (listarTodosActivos) devuelve solo los
    // labs del usuario, y crear/editar/eliminar validan pertenencia (asegurarAccesoAlLab → 403).
    // Este filtro cliente es defensa en profundidad/UX redundante, no el control de seguridad.
    const esGlobal = user?.rol === 'ADMIN' || user?.rol === 'COORDINADOR';
    const misCodigos = new Set((laboratorios ?? []).map((l) => l.codigoLab));
    const alcance = esGlobal ? (bloqueos ?? []) : (bloqueos ?? []).filter((b) => misCodigos.has(codigoDe(b)));

    // Opciones del filtro por ambiente: labs/aulas con bloqueos dentro del alcance. Únicos y
    // ordenados por código (numérico: L107<L108).
    const labsConBloqueos = [...new Map(alcance.map((b) => [codigoDe(b), nombreDe(b)])).entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true }));
    // Filtro por ambiente elegido (si el código ya no está en el alcance, se ignora → muestra todos).
    const alcanceLab = labFiltro && labsConBloqueos.some(([c]) => c === labFiltro)
        ? alcance.filter((b) => codigoDe(b) === labFiltro)
        : alcance;

    // Feriados ocultos por defecto (son miles y tapan el resto). El toggle los muestra.
    const numFeriados = alcanceLab.filter((b) => b.motivo === 'FERIADO').length;
    const visibles = alcanceLab.filter((b) => mostrarFeriados || b.motivo !== 'FERIADO');

    // Separar en 3 secciones (cada una ordenada de la primera fecha/hora a la última)
    const hoy = hoyLocal();
    // Las clases (recurrentes, todo el ciclo) NO encajan en Hoy/Programados/Pasados → sección aparte.
    const clases = visibles.filter((b) => b.esClase)
        .sort((a, b) => (a.diaSemana ?? '').localeCompare(b.diaSemana ?? '') || (a.horaInicio ?? '').localeCompare(b.horaInicio ?? ''));
    const eventos = visibles.filter((b) => !b.esClase);
    const bloqueoHoy = eventos.filter((b) => esHoy(b)).sort(ordenarPorFechaHora);
    const futuras = eventos.filter((b) => estaVigente(b) && b.fechaInicio > hoy).sort(ordenarPorFechaHora);
    const pasadas = eventos.filter((b) => !estaVigente(b)).sort(ordenarPorFechaHora);

    if (isLoading) return <div className="py-4"><SkeletonRows rows={6} /></div>;

    const BloqueoCard = ({ b, mostrarAcciones = true }: { b: Bloqueo; mostrarAcciones?: boolean }) => (
        <div className={`card border-l-4 ${b.esClase ? 'border-l-indigo-500' : b.tipo === 'TOTAL' ? 'border-l-red-500' : 'border-l-amber-500'}`}>
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                        <h3 className="font-bold text-utec-dark">{nombreDe(b)}</h3>
                        <span className="text-xs text-utec-gray-200 font-medium">{codigoDe(b)}</span>
                        {esAula(b) && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">Aula</span>}
                        {/* El badge TOTAL/PARCIAL no aplica a una clase (siempre ocupa su ambiente). */}
                        {!b.esClase && (
                            <Badge variant={b.tipo === 'TOTAL' ? 'danger' : 'warning'}>
                                <span className="inline-flex items-center gap-1">{b.tipo === 'TOTAL' ? <Lock size={12} /> : <Unlock size={12} />}{b.tipo}</span>
                            </Badge>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${motivoColor(b.motivo)}`}>
                            {motivoLabel[b.motivo] || b.motivo}
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-utec-gray-200 mb-2 items-center">
                        {b.esClase ? (
                            <span className="inline-flex items-center gap-1.5"><Calendar size={14} /> {capitaliza(b.diaSemana) || 'Recurrente'}
                                {frecLabel(b.frecuencia) && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">{frecLabel(b.frecuencia)}</span>}
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1"><Calendar size={14} /> {b.fechaInicio === b.fechaFin ? b.fechaInicio : `${b.fechaInicio} al ${b.fechaFin}`}</span>
                        )}
                        {b.horaInicio && b.horaFin ? (
                            <span className="inline-flex items-center gap-1"><Clock size={14} /> {b.horaInicio.slice(0, 5)} — {b.horaFin.slice(0, 5)}</span>
                        ) : (
                            <span className="inline-flex items-center gap-1"><Clock size={14} /> Todo el día</span>
                        )}
                        {b.esClase && b.ciclo && <span className="text-xs text-utec-gray-200">Ciclo {b.ciclo}</span>}
                    </div>
                    {b.esClase ? (
                        (b.cursoCodigo || b.descripcion) && (
                            <p className="text-sm text-utec-gray-200 mb-2 bg-indigo-50 rounded-lg p-2">
                                {b.cursoCodigo && <strong>{b.cursoCodigo} </strong>}{b.cursoNombre || b.descripcion}{b.seccion ? ` · Secc. ${b.seccion}` : ''}
                            </p>
                        )
                    ) : b.descripcion && (
                        <p className="text-sm text-utec-gray-200 mb-2 bg-gray-50 rounded-lg p-2">{b.descripcion}</p>
                    )}
                    <div className="flex flex-wrap gap-3 text-xs text-utec-gray-200">
                        <span>Creado por: <strong>{b.creadoPorNombre}</strong></span>
                        <span>{new Date(b.createdAt).toLocaleDateString('es-PE')}</span>
                    </div>
                </div>
                {mostrarAcciones && (
                    <div className="flex flex-col gap-2 ml-4">
                        {/* Aulas y retiros de mesas se gestionan borrando/recreando (no editables). */}
                        {esEditable(b) && <button onClick={() => abrirEdicion(b)} className="text-sm text-utec-cyan hover:text-utec-blue font-medium bg-utec-cyan/10 hover:bg-utec-cyan/20 px-3 py-1.5 rounded-lg transition-colors">Editar</button>}
                        <button onClick={() => handleEliminar(b)} disabled={eliminar.isPending} className="text-sm text-white font-medium bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg transition-colors"><span className="inline-flex items-center gap-1"><Trash2 size={14} /> Eliminar</span></button>
                    </div>
                )}
            </div>
        </div>
    );

    const cols: ColumnDef<Bloqueo, unknown>[] = [
        {
            id: 'espacio', accessorFn: (b) => nombreDe(b), header: 'Ambiente',
            cell: ({ row }) => (
                <div><span className="font-medium">{nombreDe(row.original)}</span> <span className="text-ink-muted text-xs">{codigoDe(row.original)}{esAula(row.original) ? ' · Aula' : ''}</span></div>
            ),
        },
        {
            accessorKey: 'motivo', header: 'Motivo',
            cell: ({ getValue }) => {
                const m = getValue() as string;
                return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${motivoColor(m)}`}>{motivoLabel[m] || m}</span>;
            },
        },
        {
            accessorKey: 'tipo', header: 'Tipo',
            cell: ({ getValue }) => <Badge variant={(getValue() as string) === 'TOTAL' ? 'danger' : 'warning'}>{getValue() as string}</Badge>,
        },
        {
            accessorKey: 'fechaInicio', header: 'Fecha',
            cell: ({ row }) => (row.original.fechaInicio === row.original.fechaFin ? row.original.fechaInicio : `${row.original.fechaInicio} → ${row.original.fechaFin}`),
        },
        {
            id: 'horario', header: 'Horario',
            accessorFn: (b) => (b.horaInicio ? `${b.horaInicio.slice(0, 5)}–${b.horaFin?.slice(0, 5)}` : 'Todo el día'),
        },
        { accessorKey: 'creadoPorNombre', header: 'Creado por' },
        {
            id: 'acciones', header: '', enableSorting: false,
            cell: ({ row }) => (
                <div className="flex gap-3">
                    {esEditable(row.original) && <button onClick={() => abrirEdicion(row.original)} className="text-utec-blue hover:underline text-xs font-medium">Editar</button>}
                    <button onClick={() => handleEliminar(row.original)} disabled={eliminar.isPending} className="text-danger hover:underline text-xs font-medium">Eliminar</button>
                </div>
            ),
        },
    ];

    const toggleVista = (
        <div className="inline-flex rounded-lg border border-line overflow-hidden">
            <button onClick={() => setVista('tarjetas')} title="Tarjetas" className={`p-2 ${vista === 'tarjetas' ? 'bg-utec-cyan/10 text-utec-blue' : 'text-ink-muted hover:bg-utec-cyan/5'}`}><LayoutGrid size={16} /></button>
            <button onClick={() => setVista('tabla')} title="Tabla" className={`p-2 ${vista === 'tabla' ? 'bg-utec-cyan/10 text-utec-blue' : 'text-ink-muted hover:bg-utec-cyan/5'}`}><TableIcon size={16} /></button>
        </div>
    );

    return (
        <div>
            <PageHeader
                title="Bloqueos"
                subtitle={`${bloqueoHoy.length} hoy · ${futuras.length} programado(s) · ${pasadas.length} pasado(s)`}
                actions={
                    <div className="flex items-center gap-2 flex-wrap">
                        <LiveIndicator fetching={isFetching} />
                        {toggleVista}
                        {labsConBloqueos.length > 1 && (
                            <select
                                value={labFiltro}
                                onChange={(e) => setLabFiltro(e.target.value)}
                                title="Filtrar por laboratorio"
                                className="input-field text-sm py-2 max-w-[240px]"
                            >
                                <option value="">{esGlobal ? '🏢 Todos los labs' : '🏢 Todos mis labs'}</option>
                                {labsConBloqueos.map(([codigo, nombre]) => (
                                    <option key={codigo} value={codigo}>{codigo} · {nombre}</option>
                                ))}
                            </select>
                        )}
                        {numFeriados > 0 && (
                            <button
                                onClick={() => setMostrarFeriados((v) => !v)}
                                aria-pressed={mostrarFeriados}
                                title={mostrarFeriados ? 'Ocultar feriados' : `Mostrar ${numFeriados} feriados`}
                                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                                    mostrarFeriados
                                        ? 'bg-utec-cyan/10 border-utec-cyan text-utec-blue'
                                        : 'border-line text-ink hover:bg-utec-cyan/10'
                                }`}
                            >
                                {mostrarFeriados ? <CalendarOff size={16} /> : <CalendarDays size={16} />}
                                {mostrarFeriados ? 'Ocultar feriados' : `Feriados (${numFeriados})`}
                            </button>
                        )}
                        <button
                            onClick={() => setMostrarClases((v) => !v)}
                            aria-pressed={mostrarClases}
                            title={mostrarClases ? 'Ocultar las clases del horario' : 'Mostrar también las clases del horario académico (elige un lab para acotarlas)'}
                            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                                mostrarClases
                                    ? 'bg-utec-cyan/10 border-utec-cyan text-utec-blue'
                                    : 'border-line text-ink hover:bg-utec-cyan/10'
                            }`}
                        >
                            <GraduationCap size={16} />
                            {mostrarClases ? 'Ocultar clases' : 'Mostrar clases'}
                        </button>
                        <button onClick={() => setImportarModal(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-line text-ink hover:bg-utec-cyan/10 transition-colors">
                            <Upload size={16} /> Importar
                        </button>
                        <button onClick={() => setCrearModal(true)} className={btnOnBanner}>+ Crear Bloqueo</button>
                    </div>
                }
            />

            {/* KPIs */}
            {(bloqueoHoy.length > 0 || futuras.length > 0) && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <div className="card text-center py-3">
                        <p className="text-2xl font-bold text-green-600">{bloqueoHoy.length}</p>
                        <p className="text-xs text-green-500 font-medium">Hoy</p>
                    </div>
                    <div className="card text-center py-3">
                        <p className="text-2xl font-bold text-blue-600">{futuras.length}</p>
                        <p className="text-xs text-blue-500 font-medium">Programados</p>
                    </div>
                    <div className="card text-center py-3">
                        <p className="text-2xl font-bold text-red-600">{alcanceLab.filter((b) => b.tipo === 'TOTAL').length}</p>
                        <p className="text-xs text-utec-gray-200">Totales</p>
                    </div>
                    <div className="card text-center py-3">
                        <p className="text-2xl font-bold text-amber-600">{alcanceLab.filter((b) => b.tipo === 'PARCIAL').length}</p>
                        <p className="text-xs text-utec-gray-200">Parciales</p>
                    </div>
                </div>
            )}

            {/* VISTA TABLA */}
            {vista === 'tabla' && (
                <DataTable data={visibles} columns={cols} filename="bloqueos" searchPlaceholder="Buscar lab, motivo, responsable…" canExport={esGlobal}
                    filters={[{ id: 'motivo', label: 'Motivo' }, { id: 'tipo', label: 'Tipo' }, { id: 'espacio', label: 'Ambiente' }]} />
            )}

            {/* VISTA TARJETAS */}
            {vista === 'tarjetas' && (<>
            {/* HOY */}
            {bloqueoHoy.length > 0 && (
                <div className="mb-6">
                    <h2 className="text-lg font-display font-bold text-utec-dark mb-3">
                        <span className="inline-flex items-center gap-2"><Bell size={18} className="text-utec-cyan" /> Hoy</span> <span className="text-sm font-normal text-utec-gray-200">({bloqueoHoy.length})</span>
                    </h2>
                    <div className="space-y-3">
                        {bloqueoHoy.map((b) => <BloqueoCard key={b.id} b={b} />)}
                    </div>
                </div>
            )}

            {/* PROGRAMADOS */}
            {futuras.length > 0 && (
                <div className="mb-6">
                    <h2 className="text-lg font-display font-bold text-utec-dark mb-3">
                        <span className="inline-flex items-center gap-2"><CalendarDays size={18} className="text-utec-cyan" /> Programados</span> <span className="text-sm font-normal text-utec-gray-200">({futuras.length})</span>
                    </h2>
                    <div className="space-y-3">
                        {futuras.map((b) => <BloqueoCard key={b.id} b={b} />)}
                    </div>
                </div>
            )}

            {/* SIN BLOQUEOS */}
            {bloqueoHoy.length === 0 && futuras.length === 0 && (
                <div className="card mb-6">
                    <EmptyState icon={Ban} title="No hay bloqueos activos" description="Crea un bloqueo para restringir el acceso a un laboratorio." />
                </div>
            )}

            {/* PASADOS */}
            {pasadas.length > 0 && (
                <details className="mb-6 group">
                    <summary className="cursor-pointer p-4 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2">
                        <ChevronRight size={18} className="text-utec-gray-200 group-open:rotate-90 transition-transform" />
                        <h2 className="text-lg font-display font-bold text-utec-gray-200 flex-1">Bloqueos Pasados</h2>
                        <span className="text-sm font-medium text-utec-gray-200">{pasadas.length}</span>
                    </summary>
                    <div className="space-y-3 mt-3">
                        {pasadas.map((b) => <BloqueoCard key={b.id} b={b} mostrarAcciones={false} />)}
                    </div>
                </details>
            )}

            {/* CLASES DEL HORARIO (solo con el toggle "Mostrar clases"; recurrentes → sección aparte) */}
            {clases.length > 0 && (
                <details className="mb-6 group" open={clases.length <= 40}>
                    <summary className="cursor-pointer p-4 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-2">
                        <ChevronRight size={18} className="text-indigo-500 group-open:rotate-90 transition-transform" />
                        <h2 className="text-lg font-display font-bold text-indigo-700 flex-1">
                            <span className="inline-flex items-center gap-2"><GraduationCap size={18} /> Clases del horario</span>
                        </h2>
                        <span className="text-sm font-medium text-indigo-700">{clases.length}</span>
                    </summary>
                    {!labFiltro && clases.length > 40 && (
                        <p className="text-xs text-utec-gray-200 mt-2 mb-1">💡 Filtra por un laboratorio arriba para ver solo sus clases.</p>
                    )}
                    <div className="space-y-3 mt-3">
                        {clases.map((b) => <BloqueoCard key={b.id} b={b} mostrarAcciones={false} />)}
                    </div>
                </details>
            )}
            </>)}

            {/* MODAL CREAR (misma UX que editar) */}
            {crearModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 overflow-y-auto p-4">
                    <div className="max-w-3xl mx-auto my-4" onClick={(e) => e.stopPropagation()}>
                        <CrearBloqueoPage onClose={() => setCrearModal(false)} />
                    </div>
                </div>
            )}

            {/* MODAL IMPORTAR */}
            {importarModal && <ImportarBloqueosModal onClose={() => setImportarModal(false)} />}

            {/* MODAL EDITAR */}
            {editModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                        {/* Encabezado con color según el tipo */}
                        <div className={`px-6 py-4 flex items-center gap-3 ${editForm.tipo === 'TOTAL' ? 'bg-red-50 border-b border-red-100' : 'bg-utec-cyan/10 border-b border-utec-cyan/20'}`}>
                            <span className="text-2xl">{editForm.tipo === 'TOTAL' ? <Lock size={20} /> : <Unlock size={20} />}</span>
                            <div>
                                <h3 className="text-lg font-bold text-utec-dark leading-tight">Editar bloqueo</h3>
                                <p className="text-xs text-utec-gray-200">{editForm.tipo === 'TOTAL' ? 'Cierra todo el laboratorio' : 'Bloquea mesas específicas'}</p>
                            </div>
                            <button onClick={() => setEditModal(null)} className="ml-auto text-utec-gray-200 hover:text-utec-dark text-xl leading-none" aria-label="Cerrar">×</button>
                        </div>
                        <div className="space-y-4 p-6 overflow-y-auto">
                            <div>
                                <label className="block text-sm font-medium text-utec-dark mb-1">Laboratorio</label>
                                <select value={editForm.laboratorioId} onChange={(e) => setEditForm({ ...editForm, laboratorioId: e.target.value })} className="input-field">
                                    <option value="">Seleccionar</option>
                                    {laboratorios?.map((lab) => <option key={lab.id} value={lab.id}>{lab.codigoLab} — {lab.nombre}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-utec-dark mb-1">Tipo</label>
                                    <select value={editForm.tipo} onChange={(e) => setEditForm({ ...editForm, tipo: e.target.value, motivo: e.target.value === 'TOTAL' ? 'EVENTO' : 'CLASE' })} className="input-field">
                                        <option value="PARCIAL">Parcial</option>
                                        <option value="TOTAL">Total</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-utec-dark mb-1">Motivo</label>
                                    <select value={editForm.motivo} onChange={(e) => setEditForm({ ...editForm, motivo: e.target.value })} className="input-field">
                                        {(editForm.tipo === 'PARCIAL' ? motivosParcial : motivosTotal).map((m) => <option key={m} value={m}>{m.charAt(0) + m.slice(1).toLowerCase()}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-utec-dark mb-1">Descripción</label>
                                <textarea value={editForm.descripcion} onChange={(e) => setEditForm({ ...editForm, descripcion: e.target.value })} placeholder="Descripción (opcional)" className="input-field" rows={2} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-utec-dark mb-1"><Calendar size={13} className="inline align-[-2px]" /> Fecha <span className="text-xs text-utec-gray-200 font-normal">(el bloqueo es de un solo día)</span></label>
                                <input type="date" value={editForm.fechaInicio} onChange={(e) => setEditForm({ ...editForm, fechaInicio: e.target.value, fechaFin: e.target.value })} className="input-field" />
                            </div>
                            {/* Mesas con disponibilidad (PARCIAL) o aviso de bloqueo TOTAL */}
                            {editForm.tipo === 'TOTAL' ? (
                                <div className="rounded-xl bg-red-50 border border-red-200 p-3 flex items-center gap-2">
                                    <Lock size={18} />
                                    <p className="text-sm text-red-800"><strong>Bloqueo total:</strong> se cierra <strong>todo el laboratorio</strong> en la franja elegida.</p>
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-sm font-medium text-utec-dark mb-1">
                                        Mesas a bloquear <span className="text-xs text-utec-gray-200 font-normal">({editForm.recursosIds.length} seleccionadas)</span>
                                    </label>
                                    {recursosEdit && recursosEdit.length > 0 ? (
                                        <>
                                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                                {recursosEdit.map((r) => {
                                                    const sel = editForm.recursosIds.includes(r.id);
                                                    const { libres, total } = slotsMesaEdit(r.id);
                                                    const estado = libres === total ? 'libre' : libres === 0 ? 'lleno' : 'parcial';
                                                    const color = estado === 'lleno' ? 'bg-slate-200 border-slate-400 text-slate-600' : estado === 'parcial' ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-emerald-50 border-emerald-300 text-emerald-800';
                                                    const barColor = estado === 'lleno' ? 'bg-slate-400' : estado === 'parcial' ? 'bg-amber-400' : 'bg-emerald-500';
                                                    const pct = total > 0 ? Math.round((libres / total) * 100) : 0;
                                                    return (
                                                        <button key={r.id} type="button" onClick={() => toggleRecursoEdit(r.id)} title={`${libres} de ${total} franjas libres`}
                                                                className={`p-2 rounded-lg text-xs font-medium text-center transition-all border flex flex-col gap-1 ${sel ? 'bg-red-100 border-red-400 text-red-800' : color}`}>
                                                            <span>{r.nombre}</span>
                                                            <span className="h-1.5 rounded-full bg-black/10 overflow-hidden"><span className={`block h-full rounded-full ${sel ? 'bg-red-400' : barColor}`} style={{ width: `${pct}%` }} /></span>
                                                            <span className="text-[10px] opacity-80">{libres === 0 ? 'sin huecos' : `${libres} libres`}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-utec-dark">
                                                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-300"></span>Libre</span>
                                                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-50 border border-amber-300"></span>Parcial</span>
                                                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-200 border border-slate-400"></span>Ocupada</span>
                                                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-400"></span>Seleccionada</span>
                                            </div>
                                        </>
                                    ) : (
                                        <p className="text-xs text-utec-gray-200 italic">Cargando recursos…</p>
                                    )}
                                </div>
                            )}

                            {/* Hora inicio (grilla con disponibilidad) + duración — en PARCIAL requiere elegir mesa */}
                            {(editForm.tipo === 'TOTAL' || editForm.recursosIds.length > 0) ? (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-utec-dark mb-1">Hora inicio <span className="text-xs text-utec-gray-200 font-normal">(7:00 — 11:00 PM)</span></label>
                                        <div className="grid grid-cols-6 gap-2 max-h-32 overflow-y-auto">
                                            {generarHorasMalla().map((hora) => {
                                                const ocupado = slotOcupadoEdit(hora);
                                                const sel = editForm.horaInicio === hora;
                                                return (
                                                    <button key={hora} type="button" disabled={ocupado}
                                                            title={ocupado ? 'Ya hay una reserva o bloqueo en esa franja' : 'Disponible'}
                                                            onClick={() => setEditForm({ ...editForm, horaInicio: hora, horaFin: '' })}
                                                            className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all border ${sel ? 'bg-utec-cyan text-white border-utec-cyan' : ocupado ? 'bg-amber-100 text-amber-700 border-amber-300 cursor-not-allowed opacity-70' : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'}`}>
                                                        {hora}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-utec-dark">
                                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-300"></span>Disponible</span>
                                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-300"></span>Ocupado (reserva/bloqueo)</span>
                                        </div>
                                    </div>
                                    {editForm.horaInicio && (
                                        <div>
                                            <label className="block text-sm font-medium text-utec-dark mb-1">Duración</label>
                                            <div className="grid grid-cols-3 gap-2">
                                                {generarDuraciones().filter((d) => calcularHoraFin(editForm.horaInicio, d.valor) <= topeDuracionEdit).map((d) => {
                                                    const fin = calcularHoraFin(editForm.horaInicio, d.valor);
                                                    return (
                                                        <button key={d.valor} type="button" onClick={() => setEditForm({ ...editForm, horaFin: fin })}
                                                                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${editForm.horaFin === fin ? 'bg-utec-cyan text-white' : 'bg-gray-100 text-utec-dark hover:bg-gray-200'}`}>
                                                            {d.label}<span className="block text-[10px] opacity-70">{editForm.horaInicio} — {fin}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <p className="text-sm text-utec-gray-200 bg-gray-50 border border-gray-200 rounded-lg p-3">Selecciona al menos una mesa para ver sus horarios disponibles.</p>
                            )}
                            {editForm.fechaInicio && editForm.horaInicio && (
                                <div className={`rounded-xl p-3 ${editForm.tipo === 'TOTAL' ? 'bg-red-50' : 'bg-utec-cyan/10'}`}>
                                    <p className="text-sm text-utec-dark">
                                        <strong>Resumen:</strong> Bloqueo {editForm.tipo.toLowerCase()} por {editForm.motivo.toLowerCase()} el {editForm.fechaInicio} de {editForm.horaInicio} a {editForm.horaFin}
                                        {editForm.tipo === 'PARCIAL' && ` · ${editForm.recursosIds.length} recurso(s)`}
                                    </p>
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-line bg-utec-gray-50">
                            <button onClick={() => setEditModal(null)} className="btn-secondary text-sm">Cancelar</button>
                            <button onClick={guardarEdicion} disabled={editarMutation.isPending || !editForm.laboratorioId || !editForm.horaInicio || !editForm.horaFin || (editForm.tipo === 'PARCIAL' && editForm.recursosIds.length === 0)} className="btn-primary text-sm disabled:opacity-50">
                                {editarMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Unlock, Calendar, Clock, User, Mail } from 'lucide-react';
import api from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { hoyLocal } from '@/utils/fecha';
import { mesaOcupada, laboratorioOcupado, slotsLibresMesa, generarHorasMalla, type DispCtx } from '@/utils/disponibilidad';
import SelectorFecha from '@/components/ui/SelectorFecha';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import toast from 'react-hot-toast';

interface Laboratorio { id: number; nombre: string; codigoLab: string; }
interface Recurso { id: number; nombre: string; tipo: string; estado: string; capacidadPersonas: number; }
interface Usuario { id: number; nombreCompleto: string; rol: string; cargo?: string; correoUtec: string; }
interface Aula { id: number; codigo: string; nombre?: string; tipo: string; }

// Tipos de ambiente para el filtro (mismo agrupamiento que el Calendario). El laboratorio usa
// el flujo completo (parcial/mesas); los demás (aulas) se bloquean SIEMPRE en su totalidad.
const TIPOS_AMBIENTE: { k: string; label: string; aulaTipos?: string[]; esLab?: boolean }[] = [
    { k: 'LABORATORIO', label: 'Laboratorio', esLab: true },
    { k: 'AULA', label: 'Aula', aulaTipos: ['AULA'] },
    { k: 'AULA_MIXTA', label: 'Aula Mixta', aulaTipos: ['AULA_MIXTA'] },
    { k: 'AUDITORIO', label: 'Auditorio', aulaTipos: ['AUDITORIO', 'AULA_MAGNA'] },
    { k: 'SALA', label: 'Sala', aulaTipos: ['SALA_ESTUDIO_SUM'] },
];

// Malla horaria (07:00–23:00): generarHorasMalla (utils/disponibilidad).

const calcularHoraFin = (horaInicio: string, duracion: string): string => {
    const [hI, mI] = horaInicio.split(':').map(Number);
    const [hD, mD] = duracion.split(':').map(Number);
    let horaFinal = hI + hD;
    let minFinal = mI + mD;
    if (minFinal >= 60) { horaFinal += Math.floor(minFinal / 60); minFinal = minFinal % 60; }
    return `${String(horaFinal).padStart(2, '0')}:${String(minFinal).padStart(2, '0')}`;
};

// Duraciones cada 30 minutos (30 min .. 16 horas = ventana institucional 07:00–23:00)
// con etiqueta legible: "30 min", "1 hora", "1 hora 30 min", "2 horas", ...
// El selector luego filtra las que excederían las 23:00 según la hora de inicio.
const generarDuraciones = (): { valor: string; label: string }[] => {
    const out: { valor: string; label: string }[] = [];
    for (let m = 30; m <= 960; m += 30) {
        const h = Math.floor(m / 60), min = m % 60;
        const valor = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
        const label = h === 0
            ? `${min} min`
            : min === 0
                ? `${h} ${h === 1 ? 'hora' : 'horas'}`
                : `${h} ${h === 1 ? 'hora' : 'horas'} ${min} min`;
        out.push({ valor, label });
    }
    return out;
};

const rolesResponsables = ['ADMIN', 'COORDINADOR', 'DIRECTOR', 'RESPONSABLE_LAB'];

export default function CrearBloqueoPage({ onClose, prefill }: {
    onClose?: () => void;
    // Pre-llenado por PROPS (modo modal, p. ej. clic en un hueco del Calendario) — tiene
    // prioridad sobre los searchParams (modo página, p. ej. CTA de Buscar libres).
    prefill?: { lab?: string; fecha?: string; horaInicio?: string; horaFin?: string };
} = {}) {
    const navigate = useNavigate();
    // En modo modal (onClose) cierra la ventana; como página, navega a la lista.
    const cerrar = () => (onClose ? onClose() : navigate('/admin/bloqueos'));
    const confirm = useConfirm();
    const user = useAuthStore((s) => s.user);

    // Tipos de ambiente SEGÚN ROL: bloquear AULAS (y demás espacios no-lab) es solo del ADMIN y
    // del Counter de Docencia (DOCENCIA). COORDINADOR/DIRECTOR/RESPONSABLE_LAB solo bloquean
    // LABORATORIOS (con su alcance de siempre). DOCENCIA no gestiona labs → solo ve aulas.
    const puedeAulas = user?.rol === 'ADMIN' || user?.rol === 'DOCENCIA';
    const tiposVisibles = TIPOS_AMBIENTE.filter((t) =>
        t.esLab ? user?.rol !== 'DOCENCIA' : puedeAulas);

    // Pre-llenado desde "Buscar libres" (?aula&aulaTipo&fecha&horaInicio&horaFin) o desde el
    // CALENDARIO con clic en un hueco libre (?lab&fecha&horaInicio&horaFin): el gestor llega
    // con el ambiente, la fecha y la franja ya elegidos — solo pone título y confirma.
    const [params] = useSearchParams();
    const preAula = params.get('aula');
    const preLab = prefill?.lab ?? params.get('lab');
    const preTipoAmbiente = preAula && puedeAulas
        ? TIPOS_AMBIENTE.find((t) => t.aulaTipos?.includes(params.get('aulaTipo') ?? ''))?.k
        : undefined;

    const [tipoAmbiente, setTipoAmbiente] = useState(
        preTipoAmbiente ?? (user?.rol === 'DOCENCIA' ? 'AULA' : 'LABORATORIO'));
    const tipoCfg = TIPOS_AMBIENTE.find((t) => t.k === tipoAmbiente);
    const esLab = !!tipoCfg?.esLab;

    const [form, setForm] = useState({
        laboratorioId: (user?.rol !== 'DOCENCIA' && preLab) ? preLab : '',
        aulaId: preTipoAmbiente ? (preAula ?? '') : '',
        tipo: 'TOTAL',
        motivo: 'EVENTO',
        titulo: '',
        fecha: prefill?.fecha ?? params.get('fecha') ?? hoyLocal(),
        horaInicio: prefill?.horaInicio ?? params.get('horaInicio') ?? '',
        horaFin: prefill?.horaFin ?? params.get('horaFin') ?? '',
        responsableNombre: '',
        responsableCorreo: '',
        recursosIds: [] as number[],
    });
    // Espacio elegido (lab o aula). Cuando hay uno, se muestra el resto del formulario.
    const espacioSel = esLab ? form.laboratorioId : form.aulaId;

    const { data: laboratorios } = useQuery({
        queryKey: ['mis-laboratorios'],
        queryFn: () => api.get('/laboratorios/mis-laboratorios'),
        select: (res) => res.data.data as Laboratorio[],
    });

    // Aulas (todas activas) → se filtran en cliente por el tipo de ambiente elegido.
    const { data: aulasTodas } = useQuery({
        queryKey: ['aulas-activas'],
        queryFn: () => api.get('/aulas'),
        select: (res) => res.data.data as Aula[],
        enabled: !esLab,
    });
    const aulasDelTipo = (aulasTodas ?? []).filter((a) => tipoCfg?.aulaTipos?.includes(a.tipo));

    // Bloqueos del aula elegida → para colorear las horas ocupadas (como TOTAL).
    const { data: aulaBloqueos } = useQuery({
        queryKey: ['bloqueo-bloqueos-aula', form.aulaId],
        queryFn: () => api.get(`/bloqueos/aula/${form.aulaId}`),
        select: (res) => res.data.data as any[],
        enabled: !esLab && !!form.aulaId,
    });

    const { data: usuarios } = useQuery({
        queryKey: ['usuarios-responsables'],
        queryFn: () => api.get('/usuarios/administrativos'),
        select: (res) => (res.data.data as Usuario[]).filter(u => rolesResponsables.includes(u.rol)),
    });

    const { data: recursos } = useQuery({
        queryKey: ['recursos-lab', form.laboratorioId],
        queryFn: () => api.get(`/laboratorios/${form.laboratorioId}/recursos`),
        select: (res) => (res.data.data as Recurso[]).sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { numeric: true })),
        enabled: !!form.laboratorioId,
    });

    // Reservas y bloqueos del lab → para mostrar las horas ocupadas/disponibles (sin abrir el calendario).
    const { data: reservasLab } = useQuery({
        queryKey: ['bloqueo-reservas-lab', form.laboratorioId],
        queryFn: () => api.get(`/reservas/laboratorio/${form.laboratorioId}`),
        select: (res) => res.data.data as any[],
        enabled: !!form.laboratorioId,
    });
    const { data: bloqueosLab } = useQuery({
        queryKey: ['bloqueo-bloqueos-lab', form.laboratorioId],
        queryFn: () => api.get(`/bloqueos/laboratorio/${form.laboratorioId}`),
        select: (res) => res.data.data as any[],
        enabled: !!form.laboratorioId,
    });

    // Motivos OPERATIVOS (almuerzo/mantenimiento): los gestiona el propio responsable del lab,
    // así que autocompletamos responsable + título con el usuario logeado. En EVENTO (y los
    // motivos parciales) NO se autocompleta: el responsable y el título son los DEL evento,
    // los ingresa quien crea el bloqueo. Deja siempre fecha y horario manuales.
    const MOTIVOS_OPERATIVOS = ['ALMUERZO', 'MANTENIMIENTO', 'FERIADO'];
    const datosPorMotivo = (m: string) => {
        const operativo = MOTIVOS_OPERATIVOS.includes(m);
        return {
            titulo: operativo ? `${m.charAt(0)}${m.slice(1).toLowerCase()}` : '',
            responsableNombre: operativo ? (user?.nombreCompleto ?? '') : '',
            responsableCorreo: operativo ? ((user as any)?.correoUtec ?? '') : '',
        };
    };

    // Disponibilidad de horas/mesas: lógica compartida en utils/disponibilidad (ver ese módulo).
    const dispCtx: DispCtx = esLab
        ? { fecha: form.fecha, reservas: reservasLab, bloqueos: bloqueosLab }
        : { fecha: form.fecha, reservas: [], bloqueos: aulaBloqueos };
    const slotOcupadoEnMesa = (recursoId: number, hora: string) => mesaOcupada(dispCtx, recursoId, hora);
    const slotsMesaEnFecha = (recursoId: number) => slotsLibresMesa(dispCtx, recursoId);
    const slotOcupado = (hora: string) => laboratorioOcupado(dispCtx, hora, form.tipo, form.recursosIds, form.motivo);
    // Tope de la duración: la PRIMERA franja ocupada DESPUÉS de la hora de inicio (no se puede
    // extender el bloqueo sobre una reserva/bloqueo/clase existente). Sin ocupadas → hasta 23:00.
    const topeDuracion = form.horaInicio
        ? (generarHorasMalla().find((h) => h > form.horaInicio && slotOcupado(h)) ?? '23:00')
        : '23:00';

    const crearMutation = useMutation({
        mutationFn: (data: Record<string, unknown>) => api.post('/bloqueos', data),
        onSuccess: () => {
            toast.success('Bloqueo creado exitosamente. Se enviará confirmación por correo.');
            cerrar();
        },
        onError: (error: unknown) => {
            const err = error as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message || 'Error al crear bloqueo');
        },
    });

    // En aulas el bloqueo es SIEMPRE total (no tienen mesas); en labs respeta lo elegido.
    const tipoEfectivo = esLab ? form.tipo : 'TOTAL';

    const handleSubmit = async () => {
        if (!espacioSel) { toast.error(esLab ? 'Selecciona un laboratorio' : 'Selecciona un ambiente'); return; }
        if (!form.horaInicio || !form.horaFin) { toast.error('Selecciona hora inicio y duración'); return; }
        if (!form.responsableNombre.trim()) { toast.error('Ingresa el nombre del responsable'); return; }
        if (!form.responsableCorreo.trim()) { toast.error('Ingresa el correo del responsable'); return; }
        if (esLab && form.tipo === 'PARCIAL' && form.recursosIds.length === 0) {
            toast.error('Selecciona al menos un recurso para bloqueo parcial');
            return;
        }
        const ok = await confirm({
            title: 'Crear bloqueo',
            message: `¿Confirmar crear el bloqueo ${tipoEfectivo.toLowerCase()} "${form.titulo}" el ${form.fecha} de ${form.horaInicio} a ${form.horaFin}?`,
            confirmText: 'Crear',
            variant: 'primary',
        });
        if (!ok) return;
        crearMutation.mutate({
            laboratorioId: esLab ? Number(form.laboratorioId) : null,
            aulaId: esLab ? null : Number(form.aulaId),
            tipo: tipoEfectivo,
            motivo: form.motivo,
            descripcion: form.titulo,
            fechaInicio: form.fecha,
            fechaFin: form.fecha,
            horaInicio: form.horaInicio + ':00',
            horaFin: form.horaFin + ':00',
            recursosIds: esLab && form.tipo === 'PARCIAL' ? form.recursosIds : null,
            responsableNombre: form.responsableNombre || null,
            responsableCorreo: form.responsableCorreo || null,
        });
    };

    // Al cambiar las mesas, reseteamos hora inicio/fin para re-elegir sobre la malla ya precisa.
    const toggleRecurso = (id: number) => {
        setForm((prev) => ({
            ...prev,
            recursosIds: prev.recursosIds.includes(id)
                ? prev.recursosIds.filter((r) => r !== id)
                : [...prev.recursosIds, id],
            horaInicio: '',
            horaFin: '',
        }));
    };

    const seleccionarTodos = () => {
        if (recursos) {
            const todosIds = recursos.map((r) => r.id);
            const todosSeleccionados = todosIds.every((id) => form.recursosIds.includes(id));
            setForm((prev) => ({ ...prev, recursosIds: todosSeleccionados ? [] : todosIds, horaInicio: '', horaFin: '' }));
        }
    };

    // Cambiar de tipo de ambiente resetea el espacio, mesas y horas (y fuerza TOTAL en aulas).
    const cambiarTipoAmbiente = (k: string) => {
        setTipoAmbiente(k);
        setForm((prev) => ({
            ...prev, laboratorioId: '', aulaId: '', recursosIds: [], horaInicio: '', horaFin: '',
            tipo: 'TOTAL', motivo: 'EVENTO', ...datosPorMotivo('EVENTO'),
        }));
    };

    const motivosParcial = ['CLASE', 'ASESORIA', 'REUNION', 'EXAMEN', 'MANTENIMIENTO'];
    // ALMUERZO y FERIADO cierran el lab (operativos); el dashboard los excluye de las estadísticas.
    const motivosTotal = ['EVENTO', 'MANTENIMIENTO', 'ALMUERZO', 'FERIADO'];
    const selectedLab = laboratorios?.find((l) => l.id === Number(form.laboratorioId));
    const selectedAula = aulasDelTipo.find((a) => a.id === Number(form.aulaId));
    const nombreEspacio = esLab ? selectedLab?.nombre : (selectedAula?.nombre || selectedAula?.codigo);
    const recursosMesas = recursos?.filter((r) => r.tipo !== 'EQUIPO') || [];
    const recursosEquipos = recursos?.filter((r) => r.tipo === 'EQUIPO') || [];

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-display font-bold text-utec-dark">Crear Bloqueo</h1>
                <button type="button" onClick={() => cerrar()} className="btn-secondary text-sm">Cancelar</button>
            </div>

            <div className="card max-w-3xl">
                <div className="space-y-6">

                    {/* 1. Tipo de ambiente + ambiente concreto */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-utec-dark mb-1">1. Tipo de ambiente *</label>
                            <select value={tipoAmbiente} onChange={(e) => cambiarTipoAmbiente(e.target.value)} className="input-field"
                                disabled={tiposVisibles.length <= 1}
                                title={tiposVisibles.length <= 1 ? 'Los espacios no-laboratorio los gestiona el Counter de Docencia o el Admin' : undefined}>
                                {tiposVisibles.map((t) => <option key={t.k} value={t.k}>{t.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-utec-dark mb-1">{esLab ? 'Laboratorio' : tipoCfg?.label} *</label>
                            {esLab ? (
                                <select value={form.laboratorioId}
                                        onChange={(e) => setForm({ ...form, laboratorioId: e.target.value, recursosIds: [], horaInicio: '', horaFin: '' })}
                                        className="input-field">
                                    <option value="">Seleccionar laboratorio</option>
                                    {laboratorios?.map((lab) => <option key={lab.id} value={lab.id}>{lab.codigoLab} — {lab.nombre}</option>)}
                                </select>
                            ) : (
                                <select value={form.aulaId}
                                        onChange={(e) => setForm({ ...form, aulaId: e.target.value, horaInicio: '', horaFin: '' })}
                                        className="input-field">
                                    <option value="">Seleccionar {tipoCfg?.label.toLowerCase()}</option>
                                    {aulasDelTipo.map((a) => <option key={a.id} value={a.id}>{a.codigo}{a.nombre ? ` — ${a.nombre}` : ''}</option>)}
                                </select>
                            )}
                        </div>
                    </div>

                    {espacioSel && (
                        <>
                            {/* 2. Tipo (solo lab) y Motivo. Las aulas se bloquean SIEMPRE completas. */}
                            <div className={esLab ? 'grid grid-cols-2 gap-4' : ''}>
                                {esLab && (
                                    <div>
                                        <label className="block text-sm font-medium text-utec-dark mb-1">2. Tipo de bloqueo *</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button type="button" onClick={() => setForm({ ...form, tipo: 'TOTAL', motivo: 'EVENTO', recursosIds: [], ...datosPorMotivo('EVENTO') })}
                                                    className={`p-3 rounded-lg text-sm font-medium text-center transition-all border ${form.tipo === 'TOTAL' ? 'bg-red-100 border-red-400 text-red-800' : 'bg-white border-gray-200 text-utec-dark hover:border-red-300'}`}>
                                                <Lock size={14} className="inline align-[-2px]" /> Total
                                                <p className="text-[10px] font-normal mt-1">Todo el laboratorio</p>
                                            </button>
                                            <button type="button" onClick={() => setForm({ ...form, tipo: 'PARCIAL', motivo: 'CLASE', recursosIds: [], ...datosPorMotivo('CLASE') })}
                                                    className={`p-3 rounded-lg text-sm font-medium text-center transition-all border ${form.tipo === 'PARCIAL' ? 'bg-amber-100 border-amber-400 text-amber-800' : 'bg-white border-gray-200 text-utec-dark hover:border-amber-300'}`}>
                                                <Unlock size={14} className="inline align-[-2px]" /> Parcial
                                                <p className="text-[10px] font-normal mt-1">Mesas específicas</p>
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <label className="block text-sm font-medium text-utec-dark mb-1">{esLab ? 'Motivo *' : '2. Motivo *'}</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {(esLab ? (form.tipo === 'TOTAL' ? motivosTotal : motivosParcial) : motivosTotal).map((m) => (
                                            <button key={m} type="button" onClick={() => setForm({ ...form, motivo: m, ...datosPorMotivo(m) })}
                                                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-all border ${form.motivo === m ? 'bg-utec-cyan text-white border-utec-cyan' : 'bg-white border-gray-200 text-utec-dark hover:border-utec-cyan'}`}>
                                                {m.charAt(0) + m.slice(1).toLowerCase()}
                                            </button>
                                        ))}
                                    </div>
                                    {!esLab && <p className="text-[11px] text-utec-gray-200 mt-1">El ambiente se reserva completo (bloqueo total).</p>}
                                </div>
                            </div>

                            {/* 3. Título */}
                            <div>
                                <label className="block text-sm font-medium text-utec-dark mb-1">3. Título del {form.tipo === 'TOTAL' ? 'evento' : 'bloqueo'} *</label>
                                <input
                                    type="text"
                                    value={form.titulo}
                                    onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                                    placeholder={form.tipo === 'TOTAL' ? 'Ej: Taller de Innovación, Conferencia de IA...' : 'Ej: Clase de Física, Asesoría grupal...'}
                                    className="input-field"
                                />
                            </div>

                            {/* 4. Responsable */}
                            <div>
                                <label className="block text-sm font-medium text-utec-dark mb-1">4. Responsable *</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs text-utec-gray-200 mb-1">Nombre completo</label>
                                        <input
                                            type="text"
                                            value={form.responsableNombre}
                                            onChange={(e) => setForm({ ...form, responsableNombre: e.target.value })}
                                            placeholder="Ej: Juan Pérez García"
                                            className="input-field"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-utec-gray-200 mb-1">Correo electrónico</label>
                                        <input
                                            type="email"
                                            value={form.responsableCorreo}
                                            onChange={(e) => setForm({ ...form, responsableCorreo: e.target.value })}
                                            placeholder="Ej: jperez@utec.edu.pe"
                                            className="input-field"
                                        />
                                    </div>
                                </div>
                                <p className="text-xs text-utec-gray-200 mt-1">Se enviará confirmación e invitación de Google Calendar a este correo</p>
                            </div>

            {/* 5. Fecha */}
                            <div>
                                <label className="block text-sm font-medium text-utec-dark mb-1">5. Fecha *</label>
                                <SelectorFecha
                                    value={form.fecha}
                                    onChange={(f) => setForm({ ...form, fecha: f, horaInicio: '', horaFin: '' })}
                                />
                            </div>

                            {/* 6. Mesas a bloquear (solo PARCIAL) — antes del horario, con su color según la fecha */}
                            {form.tipo === 'PARCIAL' && (
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <label className="block text-sm font-medium text-utec-dark">
                                            6. Mesas / recursos a bloquear * ({form.recursosIds.length} seleccionados)
                                        </label>
                                        <button type="button" onClick={seleccionarTodos} className="text-xs text-utec-cyan hover:text-utec-blue font-medium">
                                            {recursos && form.recursosIds.length === recursos.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                                        </button>
                                    </div>
                                    {recursosMesas.length > 0 && (
                                        <div className="mb-3">
                                            <p className="text-xs text-utec-gray-200 font-medium mb-2 uppercase">Mesas / PCs <span className="normal-case font-normal">— elige la que más franjas libres tenga</span></p>
                                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                                {recursosMesas.map((recurso) => {
                                                    const seleccionada = form.recursosIds.includes(recurso.id);
                                                    const { libres, total } = slotsMesaEnFecha(recurso.id);
                                                    const estado = libres === total ? 'libre' : libres === 0 ? 'lleno' : 'parcial';
                                                    const colorLibre = estado === 'lleno'
                                                        ? 'bg-slate-200 border-slate-400 text-slate-600'
                                                        : estado === 'parcial'
                                                            ? 'bg-amber-50 border-amber-300 text-amber-800 hover:border-amber-400'
                                                            : 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:border-emerald-400';
                                                    const barColor = estado === 'lleno' ? 'bg-slate-400' : estado === 'parcial' ? 'bg-amber-400' : 'bg-emerald-500';
                                                    const pct = total > 0 ? Math.round((libres / total) * 100) : 0;
                                                    return (
                                                        <button key={recurso.id} type="button" onClick={() => toggleRecurso(recurso.id)}
                                                                title={`${libres} de ${total} franjas libres`}
                                                                className={`p-2 rounded-lg text-xs font-medium text-center transition-all border flex flex-col gap-1 ${seleccionada ? 'bg-red-100 border-red-400 text-red-800' : colorLibre}`}>
                                                            <span>{recurso.nombre}</span>
                                                            <span className="h-1.5 rounded-full bg-black/10 overflow-hidden">
                                                                <span className={`block h-full rounded-full ${seleccionada ? 'bg-red-400' : barColor}`} style={{ width: `${pct}%` }} />
                                                            </span>
                                                            <span className="text-[10px] opacity-80">{libres === 0 ? 'sin huecos' : `${libres} libres`}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                    {recursosEquipos.length > 0 && (
                                        <div>
                                            <p className="text-xs text-utec-gray-200 font-medium mb-2 uppercase">Equipos</p>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                {recursosEquipos.map((recurso) => (
                                                    <button key={recurso.id} type="button" onClick={() => toggleRecurso(recurso.id)}
                                                            className={`p-3 rounded-lg text-sm font-medium text-left transition-all border ${form.recursosIds.includes(recurso.id) ? 'bg-red-100 border-red-400 text-red-800' : 'bg-white border-gray-200 text-utec-dark hover:border-red-300'}`}>
                                                        {recurso.nombre}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-utec-dark font-medium">
                                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-300"></span>Libre</span>
                                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-50 border border-amber-300"></span>Parcialmente ocupada</span>
                                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-200 border border-slate-400"></span>Ocupada todo el día</span>
                                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-400"></span>Seleccionada (se bloqueará)</span>
                                    </div>
                                </div>
                            )}

                            {/* Hora inicio — en PARCIAL requiere haber elegido mesa(s); la malla refleja esas mesas */}
                            {(form.tipo === 'TOTAL' || form.recursosIds.length > 0) ? (
                                <div>
                                    <label className="block text-sm font-medium text-utec-dark mb-2">{form.tipo === 'PARCIAL' ? '7' : '6'}. Hora inicio * <span className="text-xs text-utec-gray-200 font-normal">(7:00 AM — 11:00 PM)</span></label>
                                    <div className="grid grid-cols-6 gap-2 max-h-36 overflow-y-auto">
                                        {generarHorasMalla().map((hora) => {
                                            const ocupado = slotOcupado(hora);
                                            const seleccionada = form.horaInicio === hora;
                                            return (
                                                <button key={hora} type="button" disabled={ocupado}
                                                        title={ocupado ? (form.tipo === 'PARCIAL' ? 'Alguna mesa seleccionada está ocupada en esa franja' : 'Ya hay una reserva o bloqueo en esa franja') : 'Disponible'}
                                                        onClick={() => setForm({ ...form, horaInicio: hora, horaFin: '' })}
                                                        className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                                                            seleccionada ? 'bg-utec-cyan text-white border-utec-cyan'
                                                                : ocupado ? 'bg-amber-100 text-amber-700 border-amber-300 cursor-not-allowed opacity-70'
                                                                    : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                                                        }`}>
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
                            ) : (
                                <p className="text-sm text-utec-gray-200 bg-gray-50 border border-gray-200 rounded-lg p-3">Selecciona al menos una mesa para ver sus horarios disponibles.</p>
                            )}

                            {/* Duración */}
                            {form.horaInicio && (
                                <div>
                                    <label className="block text-sm font-medium text-utec-dark mb-2">{form.tipo === 'PARCIAL' ? '8' : '7'}. Duración *</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {generarDuraciones()
                                            .filter((d) => {
                                                const fin = calcularHoraFin(form.horaInicio, d.valor);
                                                return fin <= topeDuracion;
                                            })
                                            .map((duracion) => {
                                                const fin = calcularHoraFin(form.horaInicio, duracion.valor);
                                                return (
                                                    <button key={duracion.valor} type="button"
                                                            onClick={() => setForm({ ...form, horaFin: fin })}
                                                            className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${form.horaFin === fin ? 'bg-utec-cyan text-white' : 'bg-gray-100 text-utec-dark hover:bg-gray-200'}`}>
                                                        {duracion.label}
                                                        <span className="block text-[10px] opacity-70">{form.horaInicio} — {fin}</span>
                                                    </button>
                                                );
                                            })}
                                    </div>
                                </div>
                            )}

                            {/* Resumen */}
                            {form.horaInicio && form.horaFin && form.titulo && (
                                <div className={`rounded-xl p-4 ${form.tipo === 'TOTAL' ? 'bg-red-50 border border-red-200' : 'bg-utec-cyan/10 border border-utec-cyan/20'}`}>
                                    <p className="text-sm font-bold text-utec-dark mb-1">{form.titulo}</p>
                                    <p className="text-sm text-utec-dark">
                                        Bloqueo {tipoEfectivo.toLowerCase()} por {form.motivo.toLowerCase()}
                                        {nombreEspacio && <> en <strong>{nombreEspacio}</strong></>}
                                    </p>
                                    <p className="text-sm text-utec-dark mt-1">
                                        <Calendar size={13} className="inline align-[-1px]" /> {form.fecha} · <Clock size={13} className="inline align-[-1px]" /> {form.horaInicio} — {form.horaFin}
                                    </p>
                                    {form.responsableNombre && (
                                        <p className="text-sm text-utec-dark mt-1">
                                            <User size={13} className="inline align-[-1px]" /> {form.responsableNombre} · <Mail size={13} className="inline align-[-1px]" /> {form.responsableCorreo}
                                        </p>
                                    )}
                                    {form.tipo === 'PARCIAL' && form.recursosIds.length > 0 && (
                                        <p className="text-xs text-utec-gray-200 mt-1">{form.recursosIds.length} recurso(s) bloqueados</p>
                                    )}
                                    {tipoEfectivo === 'TOTAL' && (
                                        <p className="text-xs text-red-600 mt-1">Todo el {esLab ? 'laboratorio' : 'ambiente'} quedará no disponible</p>
                                    )}
                                </div>
                            )}

                            {/* Botones */}
                            <div className="flex justify-end gap-4 pt-4 border-t border-gray-200">
                                <button type="button" onClick={() => cerrar()} className="btn-secondary">Cancelar</button>
                                <button type="button" onClick={handleSubmit}
                                        disabled={crearMutation.isPending || !espacioSel || !form.horaInicio || !form.horaFin || !form.titulo.trim()}
                                        className={`${tipoEfectivo === 'TOTAL' ? 'bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-medium' : 'btn-primary'} disabled:opacity-50`}>
                                    {crearMutation.isPending ? 'Creando...' : 'Crear Bloqueo'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
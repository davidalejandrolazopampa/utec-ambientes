import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { format, startOfWeek, addDays, getISOWeek, getDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarDays, Search, DoorOpen, GraduationCap, ChevronLeft, ChevronRight, Users, Clock, Lock } from 'lucide-react';
import api from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import PageHeader from '@/components/ui/PageHeader';
import { nombreCarrera } from '@/utils/carreras';
import { colorBloqueo, etiquetaBloqueo, COLOR, estiloBloque } from '@/utils/calendarColors';
import { cicloVigentePorFecha } from '@/utils/ciclos';
import CrearBloqueoPage from '@/pages/admin/CrearBloqueoPage';

// Ciclo académico vigente según la fecha de HOY, para que el calendario avance solo cada periodo
// sin editar código. Las fechas exactas del ciclo salen de /ciclos (BD, configurables).
const CICLO = cicloVigentePorFecha();
// Calendario académico real (para anclar las fechas del horario). 2026-1: clases 23mar–4jul 2026.
const CICLO_RANGO: Record<string, { inicio: Date; fin: Date }> = {
    '2026-0': { inicio: new Date(2026, 0, 5), fin: new Date(2026, 1, 28) },   // 5 ene – 28 feb 2026
    '2026-1': { inicio: new Date(2026, 2, 23), fin: new Date(2026, 6, 4) },   // 23 mar – 4 jul 2026
    '2026-2': { inicio: new Date(2026, 7, 10), fin: new Date(2026, 10, 21) }, // 10 ago – 21 nov 2026
};
interface Excepcion { fechaInicio: string; fechaFin: string; tipo: string; descripcion?: string }
interface CicloCfg { codigo: string; fechaInicio: string; fechaFin: string; excepciones?: Excepcion[] }
// Excepción (examen/feriado) que cubre una fecha, o null.
const excepcionDe = (excepciones: Excepcion[], fechaIso: string): Excepcion | null =>
    excepciones.find((e) => fechaIso >= e.fechaInicio && fechaIso <= e.fechaFin) ?? null;

const lunesDe = (d: Date) => startOfWeek(d, { weekStartsOn: 1 });
const fechaLocal = (iso: string) => new Date(`${iso}T00:00:00`); // ISO (YYYY-MM-DD) → fecha local, sin corrimiento de zona

const TIPO_LABEL: Record<string, string> = {
    AULA: 'Aula', AULA_MIXTA: 'Aula mixta', AULA_POSGRADO: 'Aula posgrado', AUDITORIO: 'Auditorio',
    AULA_MAGNA: 'Aula magna', ESTUDIO_GRABACION: 'Estudio de grabación', SALA_ESTUDIO_SUM: 'Sala SUM',
    LOSA_DEPORTIVA: 'Losa deportiva', LABORATORIO: 'Laboratorio',
};
const DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
const DIA_LABEL: Record<string, string> = { LUNES: 'Lunes', MARTES: 'Martes', MIERCOLES: 'Miércoles', JUEVES: 'Jueves', VIERNES: 'Viernes', SABADO: 'Sábado', DOMINGO: 'Domingo' };

// El horario NO tiene fechas: es un patrón semanal (día + hora). Se muestra como una grilla fija.
const DIAS_GRID = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
const PX_MIN = 0.8;                              // píxeles por minuto en la grilla
const toMin = (h: string) => { const [hh, mm] = h.split(':').map(Number); return hh * 60 + mm; };

interface Aula { id: number; codigo: string; nombre?: string; tipo: string; capacidad?: number; piso?: number; esLab?: boolean; }
interface Clase {
    id: number; espacioCodigo: string; espacioTipo: string; esLab: boolean;
    diaSemana: string; horaInicio: string; horaFin: string;
    cursoCodigo?: string; cursoNombre?: string; area?: string; seccion?: string;
    tipoSesion?: string; modalidad?: string; frecuencia?: string; docente?: string;
}

// ¿La clase se dicta en la semana de esa fecha? A = semanas ISO impares, B = pares (convención;
// invertir aquí y en el backend si UTEC la usa al revés). GENERAL = todas.
const claseAplica = (frecuencia: string | undefined, fecha: Date): boolean => {
    if (!frecuencia || frecuencia === 'SEMANA_GENERAL') return true;
    const impar = getISOWeek(fecha) % 2 === 1;
    return frecuencia === 'SEMANA_A' ? impar : !impar;
};
const etiquetaSemana = (frecuencia?: string) =>
    frecuencia === 'SEMANA_A' ? ' (A)' : frecuencia === 'SEMANA_B' ? ' (B)' : '';
interface Franja { horaInicio: string; horaFin: string; etiqueta?: string; parcial?: boolean; }
interface Ocupacion { id: number; codigo: string; tipo: string; capacidad?: number; piso?: number; esLab?: boolean; ocupado: Franja[]; atencionInicio?: string; atencionFin?: string; atiende?: boolean; }
// Ventana de atención de un lab en la barra del día (fuera de ella el alumno no reserva).
interface AtencionBarra { inicio?: string; fin?: string; atiende?: boolean; }

// Orden institucional de ambientes: por PISO (sótanos primero) y luego por código.
const porPiso = (a: { piso?: number; codigo: string }, b: { piso?: number; codigo: string }) =>
    (a.piso ?? 999) - (b.piso ?? 999) || a.codigo.localeCompare(b.codigo, 'es', { numeric: true });

// Todas las clases del horario van en ÍNDIGO (COLOR.clase), igual que en el calendario del lab,
// para no chocar con los colores de eventos/reservas (el tipo de sesión va en el texto/tooltip).
const colorClase = (_c: Clase) => COLOR.clase;

export default function AulasPage() {
    const [tab, setTab] = useState<'calendario' | 'libres'>('calendario');

    return (
        <div>
            <PageHeader title="Calendario" subtitle="Horario de clases y ambientes libres" />
            <div className="flex gap-2 mb-5">
                <button onClick={() => setTab('calendario')} className={tabBtn(tab === 'calendario')}>
                    <CalendarDays size={16} /> Calendario
                </button>
                <button onClick={() => setTab('libres')} className={tabBtn(tab === 'libres')}>
                    <Search size={16} /> Buscar libres
                </button>
            </div>
            {tab === 'calendario' ? <TabCalendario /> : <TabLibres />}
        </div>
    );
}

const tabBtn = (active: boolean) =>
    `inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
        active ? 'bg-utec-cyan/10 border-utec-cyan text-utec-blue' : 'border-line text-ink hover:bg-utec-cyan/10'
    }`;

// ─────────────────────────────── CALENDARIO ───────────────────────────────

// Tipos de ambiente del selector (estilo UTEC: primero el tipo, luego el ambiente concreto).
const TIPOS_AMBIENTE: { k: string; label: string; aulaTipos?: string[]; esLab?: boolean }[] = [
    { k: 'AULA', label: 'Aula', aulaTipos: ['AULA'] },
    { k: 'AULA_MIXTA', label: 'Aula Mixta', aulaTipos: ['AULA_MIXTA'] },
    { k: 'AUDITORIO', label: 'Auditorio', aulaTipos: ['AUDITORIO', 'AULA_MAGNA'] },
    { k: 'SALA', label: 'Sala', aulaTipos: ['SALA_ESTUDIO_SUM'] },
    { k: 'LABORATORIO', label: 'Laboratorio', esLab: true },
];

interface Evento { id: number; motivo: string; tipo?: string; descripcion?: string; fechaInicio: string; fechaFin: string; horaInicio?: string; horaFin?: string; }
interface Reserva { id: number; recursoNombre: string; usuarioNombre?: string; fecha: string; horaInicio: string; horaFin: string; estado: string; }
const colorReserva = (estado: string) =>
    estado === 'EN_CURSO' ? COLOR.checkin : estado === 'COMPLETADA' ? COLOR.completada : COLOR.reserva;

function TabCalendario() {
    // "Ver calendario" del laboratorio llega aquí con ?lab=<id> → el lab queda preseleccionado
    // (un solo calendario para toda la app; el viejo por-lab se retiró).
    const [params] = useSearchParams();
    const labParam = params.get('lab');
    const [area, setArea] = useState('');
    const [tipoAmbiente, setTipoAmbiente] = useState(labParam ? 'LABORATORIO' : ''); // AULA | ... | LABORATORIO
    const [espacio, setEspacio] = useState(labParam ? `lab:${labParam}` : ''); // "aula:<id>" | "lab:<id>"
    const [q, setQ] = useState('');
    // Leyenda del calendario: colapsada por defecto, pero recuerda tu preferencia (localStorage).
    const [leyendaAbierta, setLeyendaAbierta] = useState<boolean>(() => {
        try { return localStorage.getItem('cal-leyenda') === '1'; } catch { return false; }
    });
    const [sel, setSel] = useState<Clase | null>(null);
    // Detalle al clicar un EVENTO (bloqueo) o una RESERVA en la grilla (las clases usan `sel`).
    const [detalle, setDetalle] = useState<{ kind: 'evento'; e: Evento } | { kind: 'reserva'; r: Reserva } | null>(null);
    const navigate = useNavigate();
    const aulaId = espacio.startsWith('aula:') ? espacio.slice(5) : '';
    const labId = espacio.startsWith('lab:') ? espacio.slice(4) : '';
    const tipoCfg = TIPOS_AMBIENTE.find((t) => t.k === tipoAmbiente);

    // Fechas del ciclo desde la BD (configurables en "Ciclos académicos"); fallback al hardcode.
    const { data: ciclos } = useQuery({ queryKey: ['ciclos'], queryFn: () => api.get('/ciclos'), select: (r) => r.data.data as CicloCfg[] });
    const cfg = ciclos?.find((c) => c.codigo === CICLO);
    const excepciones = cfg?.excepciones ?? [];
    const rango = cfg ? { inicio: fechaLocal(cfg.fechaInicio), fin: fechaLocal(cfg.fechaFin) } : CICLO_RANGO[CICLO];
    // Abre en la SEMANA ACTUAL (aunque las clases ya hayan terminado: verás exámenes/rezagados);
    // la navegación es libre.
    const [ancla, setAncla] = useState(() => lunesDe(new Date()));
    const mover = (dias: number) => setAncla((a) => addDays(a, dias));

    // Feriados operativos del año visible (fuente única = bloqueos motivo=FERIADO). Se marcan en el
    // calendario INDEPENDIENTE del ciclo, para que también aparezcan los de RECESO (fuera del rango
    // de cualquier ciclo, p. ej. 6-ago), que la derivación académica por-ciclo no cubre.
    const anioVisible = ancla.getFullYear();
    const { data: feriados } = useQuery({
        queryKey: ['feriados-anio', anioVisible],
        queryFn: () => api.get('/bloqueos/feriados', { params: { anio: anioVisible } }),
        select: (r) => r.data.data as { fecha: string; descripcion?: string }[],
    });
    // Excepciones del ciclo + feriados globales aún no cubiertos por una excepción (dedup por fecha).
    const excepcionesCal: Excepcion[] = [
        ...excepciones,
        ...(feriados ?? [])
            .filter((f) => !excepcionDe(excepciones, f.fecha))
            .map((f) => ({ fechaInicio: f.fecha, fechaFin: f.fecha, tipo: 'FERIADO', descripcion: f.descripcion })),
    ];

    const { data: areas } = useQuery({ queryKey: ['aulas-areas'], queryFn: () => api.get('/aulas/areas', { params: { ciclo: CICLO } }), select: (r) => r.data.data as string[] });
    const { data: aulas } = useQuery({ queryKey: ['aulas-list'], queryFn: () => api.get('/aulas'), select: (r) => r.data.data as Aula[] });
    const { data: labs } = useQuery({ queryKey: ['labs-con-ocupacion', CICLO], queryFn: () => api.get('/aulas/laboratorios-con-ocupacion', { params: { ciclo: CICLO } }), select: (r) => r.data.data as { id: number; codigo: string; nombre: string }[] });

    const hayFiltro = !!area || !!espacio || q.trim().length >= 2;
    const { data: clases, isFetching } = useQuery({
        queryKey: ['aulas-clases', area, espacio, q],
        queryFn: () => api.get('/aulas/clases', { params: { ciclo: CICLO, area: area || undefined, aulaId: aulaId || undefined, labId: labId || undefined, q: q.trim() || undefined } }),
        select: (r) => r.data.data as Clase[],
        enabled: hayFiltro,
    });
    // Eventos/bloqueos del ambiente elegido (lab O aula) → capa extra en la grilla.
    const { data: eventosLab } = useQuery({
        queryKey: ['eventos-lab-cal', labId],
        queryFn: () => api.get(`/bloqueos/laboratorio/${labId}`),
        select: (r) => r.data.data as Evento[],
        enabled: !!labId,
    });
    const { data: eventosAula } = useQuery({
        queryKey: ['eventos-aula-cal', aulaId],
        queryFn: () => api.get(`/bloqueos/aula/${aulaId}`),
        select: (r) => r.data.data as Evento[],
        enabled: !!aulaId,
    });
    const eventos = labId ? eventosLab : aulaId ? eventosAula : [];
    // Reservas del laboratorio (por fecha real) → paridad con el antiguo calendario por-lab:
    // el alumno/responsable ve también las mesas reservadas, con su estado por color.
    const { data: reservas } = useQuery({
        queryKey: ['reservas-lab-cal', labId],
        queryFn: () => api.get(`/reservas/laboratorio/${labId}`),
        select: (r) => (r.data.data as Reserva[]).filter((x) => x.estado !== 'CANCELADA' && x.estado !== 'NO_SHOW'),
        enabled: !!labId,
    });
    // Horario de ATENCIÓN del lab (p. ej. 9am–6pm L–V): fuera de esa ventana el alumno no
    // reserva (aunque sí puedan caer clases/eventos) → la grilla lo sombrea como "sin atención".
    const { data: labDetalle } = useQuery({
        queryKey: ['lab-detalle-cal', labId],
        queryFn: () => api.get(`/laboratorios/${labId}`),
        select: (r) => r.data.data as { horaApertura?: string; horaCierre?: string; diasAtencion?: string[] },
        enabled: !!labId,
    });
    // Clic en un hueco libre de la grilla → Crear Bloqueo pre-llenado en un MODAL FLOTANTE
    // (sin cambiar de página: el gestor no pierde el calendario de vista). Solo gestores de labs.
    const rol = useAuthStore((s) => s.user?.rol);
    const puedeBloquearLab = !!labId && ['ADMIN', 'COORDINADOR', 'DIRECTOR', 'RESPONSABLE_LAB'].includes(rol ?? '');
    const [crearEvento, setCrearEvento] = useState<{ fecha: string; horaInicio: string; horaFin: string } | null>(null);
    const crearEventoEn = puedeBloquearLab ? (fechaIso: string, minuto: number) => {
        const ini = Math.max(7 * 60, Math.min(22 * 60, Math.floor(minuto / 30) * 30)); // redondea a :00/:30, ventana 07–23
        const fin = Math.min(23 * 60, ini + 60);
        const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        setCrearEvento({ fecha: fechaIso, horaInicio: hhmm(ini), horaFin: hhmm(fin) });
    } : undefined;

    return (
        <div>
            <div className="card mb-4 flex flex-wrap items-end gap-3">
                <Field label="Área">
                    <select value={area} onChange={(e) => { setArea(e.target.value); setTipoAmbiente(''); setEspacio(''); }} className="input-field text-sm py-2 min-w-[220px]">
                        <option value="">— Todas las áreas —</option>
                        {(areas ?? []).map((a) => <option key={a} value={a}>{nombreCarrera(a)}</option>)}
                    </select>
                </Field>
                <Field label="Tipo de ambiente">
                    <select value={tipoAmbiente} onChange={(e) => { setTipoAmbiente(e.target.value); setEspacio(''); setArea(''); }} className="input-field text-sm py-2 min-w-[150px]">
                        <option value="">— Todos —</option>
                        {TIPOS_AMBIENTE.map((t) => <option key={t.k} value={t.k}>{t.label}</option>)}
                    </select>
                </Field>
                <Field label="Ambiente">
                    <select value={espacio} onChange={(e) => { setEspacio(e.target.value); setArea(''); }} disabled={!tipoAmbiente} className="input-field text-sm py-2 min-w-[170px] disabled:opacity-50">
                        <option value="">{tipoAmbiente ? '— Cualquiera —' : '(elige un tipo)'}</option>
                        {tipoCfg?.esLab
                            ? (labs ?? []).map((l) => <option key={l.id} value={`lab:${l.id}`}>{l.codigo} · {l.nombre}</option>)
                            : (aulas ?? []).filter((a) => tipoCfg?.aulaTipos?.includes(a.tipo)).sort(porPiso).map((a) => <option key={a.id} value={`aula:${a.id}`}>{a.codigo}</option>)}
                    </select>
                </Field>
                <Field label="Buscar curso">
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="código o nombre…" className="input-field text-sm py-2 min-w-[180px]" />
                </Field>
                {isFetching && <span className="text-xs text-utec-gray-200 pb-2">Cargando…</span>}
            </div>

            {!hayFiltro ? (
                <div className="card text-center py-12 text-utec-gray-200">
                    <GraduationCap size={40} className="mx-auto mb-3 opacity-40" />
                    Elige un <strong>área</strong>, un <strong>ambiente</strong> o busca un <strong>curso</strong> para ver su horario de clases.
                </div>
            ) : (clases && clases.length === 0 && (eventos ?? []).length === 0 && (reservas ?? []).length === 0) ? (
                <div className="card text-center py-12 text-utec-gray-200">No hay clases ni eventos para ese filtro.</div>
            ) : (
                <>
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                        <div className="inline-flex items-center gap-1">
                            <button onClick={() => mover(-7)} className="p-1.5 rounded-lg border border-line hover:bg-utec-cyan/10" aria-label="Semana anterior"><ChevronLeft size={16} /></button>
                            <button onClick={() => setAncla(lunesDe(new Date()))} className="px-3 py-1.5 rounded-lg border border-line text-sm hover:bg-utec-cyan/10">Hoy</button>
                            <button onClick={() => mover(7)} className="p-1.5 rounded-lg border border-line hover:bg-utec-cyan/10" aria-label="Semana siguiente"><ChevronRight size={16} /></button>
                        </div>
                        <span className="text-sm font-medium text-ink capitalize">
                            {format(ancla, "d 'de' MMMM", { locale: es })} – {format(addDays(ancla, 5), "d 'de' MMMM yyyy", { locale: es })}
                        </span>
                    </div>
                    <details className="mb-2 group" open={leyendaAbierta}
                        onToggle={(e) => { const abierta = e.currentTarget.open; setLeyendaAbierta(abierta); try { localStorage.setItem('cal-leyenda', abierta ? '1' : '0'); } catch { /* ignore */ } }}>
                        <summary className="text-[11px] text-utec-blue cursor-pointer select-none inline-flex items-center gap-1 list-none [&::-webkit-details-marker]:hidden">
                            <span className="inline-block transition-transform group-open:rotate-90">▸</span> Leyenda de colores
                        </summary>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[11px] text-utec-gray-200">
                            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={estiloBloque(COLOR.clase)} />Clase</span>
                            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={estiloBloque(COLOR.eventoTotal)} />Evento total</span>
                            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={estiloBloque(COLOR.eventoParcial)} />Evento parcial</span>
                            {labId && (<>
                                <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={estiloBloque(COLOR.reserva)} />Reserva de alumno</span>
                                <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={estiloBloque(COLOR.checkin)} />Check-in hecho</span>
                                <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={estiloBloque(COLOR.completada)} />Completada</span>
                            </>)}
                            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={estiloBloque(COLOR.mantenimiento)} />Mantenimiento</span>
                            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={estiloBloque(COLOR.almuerzo)} />Almuerzo</span>
                            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border border-black/10" style={{ background: fondoMarca('FERIADO') }} />Feriado</span>
                            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border border-black/10" style={{ background: fondoMarca('EXAMEN') }} />Exámenes</span>
                            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border border-black/10" style={{ background: fondoMarca('CIERRE') }} />Cierre UTEC</span>
                            {labId && <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'repeating-linear-gradient(135deg, rgba(107,114,128,0.15) 0 3px, rgba(107,114,128,0.35) 3px 6px)' }} />Sin atención al alumno (no se reserva; puede haber clases)</span>}
                        </div>
                    </details>
                    {crearEventoEn && (
                        <p className="mb-2 text-[11px] text-utec-blue">💡 Haz <strong>clic en un hueco libre</strong> de la grilla para crear un evento en ese día y hora (se abre una ventana flotante, sin salir del calendario).</p>
                    )}
                    <HorarioGrid clases={clases ?? []} eventos={eventos ?? []} reservas={reservas ?? []} ancla={ancla} cicloInicio={rango.inicio} cicloFin={rango.fin} excepciones={excepcionesCal} onSelect={setSel} onSelectEvento={(e) => setDetalle({ kind: 'evento', e })} onSelectReserva={(r) => setDetalle({ kind: 'reserva', r })} atencion={labId ? labDetalle : undefined} onSlotClick={crearEventoEn} />
                </>
            )}

            {sel && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSel(null)}>
                    <div className="bg-surface rounded-2xl shadow-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-ink mb-1">{sel.cursoNombre ?? 'Clase'}</h3>
                        <p className="text-sm text-utec-gray-200 mb-3">{sel.cursoCodigo}{sel.seccion ? ` · ${sel.seccion}` : ''}</p>
                        <dl className="space-y-2 text-sm">
                            <Row k="Ambiente" v={`${sel.espacioCodigo} (${TIPO_LABEL[sel.espacioTipo] ?? sel.espacioTipo})`} />
                            <Row k="Día" v={DIA_LABEL[sel.diaSemana] ?? sel.diaSemana} />
                            <Row k="Hora" v={`${sel.horaInicio?.slice(0, 5)} — ${sel.horaFin?.slice(0, 5)}`} />
                            {sel.tipoSesion && <Row k="Sesión" v={sel.tipoSesion} />}
                            {sel.frecuencia && sel.frecuencia !== 'SEMANA_GENERAL' && <Row k="Frecuencia" v={sel.frecuencia === 'SEMANA_A' ? 'Quincenal · Semana A' : 'Quincenal · Semana B'} />}
                            {sel.docente && <Row k="Docente" v={sel.docente} />}
                            {sel.modalidad && <Row k="Modalidad" v={sel.modalidad} />}
                        </dl>
                        <div className="flex justify-end mt-5"><button onClick={() => setSel(null)} className="btn-secondary text-sm">Cerrar</button></div>
                    </div>
                </div>
            )}

            {/* Detalle de un EVENTO (bloqueo) o una RESERVA al clicar su bloque en la grilla. */}
            {detalle && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDetalle(null)}>
                    <div className="bg-surface rounded-2xl shadow-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
                        {detalle.kind === 'evento' ? (
                            <>
                                <h3 className="text-lg font-bold text-ink mb-1">{(detalle.e.descripcion || '').trim() || detalle.e.motivo}</h3>
                                <p className="text-sm text-utec-gray-200 mb-3">{etiquetaBloqueo(detalle.e.motivo, detalle.e.tipo)}</p>
                                <dl className="space-y-2 text-sm">
                                    <Row k="Fecha" v={detalle.e.fechaInicio === detalle.e.fechaFin ? detalle.e.fechaInicio : `${detalle.e.fechaInicio} — ${detalle.e.fechaFin}`} />
                                    <Row k="Hora" v={detalle.e.horaInicio ? `${detalle.e.horaInicio.slice(0, 5)} — ${detalle.e.horaFin?.slice(0, 5)}` : 'Todo el día'} />
                                    <Row k="Tipo" v={detalle.e.tipo === 'PARCIAL' ? 'Parcial (mesas)' : 'Total (todo el lab)'} />
                                    <Row k="Motivo" v={detalle.e.motivo} />
                                </dl>
                                <div className="flex justify-end gap-2 mt-5">
                                    {puedeBloquearLab && (
                                        <button onClick={() => { setDetalle(null); navigate('/admin/bloqueos'); }} className="btn-primary text-sm">Editar en Bloqueos</button>
                                    )}
                                    <button onClick={() => setDetalle(null)} className="btn-secondary text-sm">Cerrar</button>
                                </div>
                            </>
                        ) : (
                            <>
                                <h3 className="text-lg font-bold text-ink mb-1">Reserva</h3>
                                <p className="text-sm text-utec-gray-200 mb-3">{detalle.r.recursoNombre}</p>
                                <dl className="space-y-2 text-sm">
                                    <Row k="Fecha" v={detalle.r.fecha} />
                                    <Row k="Hora" v={`${detalle.r.horaInicio.slice(0, 5)} — ${detalle.r.horaFin.slice(0, 5)}`} />
                                    <Row k="Estado" v={detalle.r.estado} />
                                    {detalle.r.usuarioNombre && <Row k="Reservado por" v={detalle.r.usuarioNombre} />}
                                </dl>
                                <div className="flex justify-end mt-5"><button onClick={() => setDetalle(null)} className="btn-secondary text-sm">Cerrar</button></div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* MODAL FLOTANTE: crear evento desde el clic en un hueco libre (sin salir del calendario). */}
            {crearEvento && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 overflow-y-auto p-4">
                    <div className="max-w-3xl mx-auto my-4" onClick={(e) => e.stopPropagation()}>
                        <CrearBloqueoPage onClose={() => setCrearEvento(null)} prefill={{ lab: labId, ...crearEvento }} />
                    </div>
                </div>
            )}
        </div>
    );
}

// Reparte en columnas las franjas que se cruzan (misma hora) para que no se tapen. Genérico:
// sirve para clases y para reservas.
function layoutFranjas<T extends { horaInicio: string; horaFin: string }>(items: T[]) {
    const sorted = [...items].sort((a, b) => toMin(a.horaInicio) - toMin(b.horaInicio));
    const finCol: number[] = [];
    const placed = sorted.map((it) => {
        const s = toMin(it.horaInicio), e = toMin(it.horaFin);
        let col = finCol.findIndex((f) => f <= s);
        if (col === -1) { col = finCol.length; finCol.push(e); } else finCol[col] = e;
        return { it, s, e, col };
    });
    return { placed, cols: Math.max(1, finCol.length) };
}

// Franja "sin atención al alumno" (rayada gris): el lab no atiende reservas en esas horas,
// aunque sí puedan caer clases o eventos encima. pointer-events-none: el clic pasa a la columna.
const RAYADO_NO_ATENCION = 'repeating-linear-gradient(135deg, rgba(100,116,139,0.22) 0 6px, rgba(100,116,139,0.38) 6px 12px)';
// Fondo de una MARCA DE DÍA (excepción). MISMO valor en la celda del calendario y en la leyenda,
// para que nunca difieran. FERIADO y CIERRE (todo UTEC) comparten el MISMO color (ambos = día
// sin actividad / cerrado); se distinguen por la etiqueta, no por el color. Exámenes/Sin clases en ámbar.
const fondoMarca = (tipo?: string): string =>
    (tipo === 'FERIADO' || tipo === 'CIERRE') ? '#ffe4e6'  // rose-100
        : '#fef3c7';                                        // amber-100 (Exámenes / Sin clases)

// ─── Grilla de horario semanal (día × hora), con las fechas reales de la semana anclada ───
function HorarioGrid({ clases, eventos, reservas, ancla, cicloInicio, cicloFin, excepciones, onSelect, onSelectEvento, onSelectReserva, atencion, onSlotClick }: { clases: Clase[]; eventos: Evento[]; reservas: Reserva[]; ancla: Date; cicloInicio: Date; cicloFin: Date; excepciones: Excepcion[]; onSelect: (c: Clase) => void; onSelectEvento?: (e: Evento) => void; onSelectReserva?: (r: Reserva) => void; atencion?: { horaApertura?: string; horaCierre?: string; diasAtencion?: string[] }; onSlotClick?: (fechaIso: string, minuto: number) => void }) {
    const conDia = clases.filter((c) => DIAS_GRID.includes(c.diaSemana));
    // El rango horario considera clases, eventos con hora Y reservas.
    const horasEv = eventos.flatMap((e) => (e.horaInicio && e.horaFin) ? [toMin(e.horaInicio), toMin(e.horaFin)] : []);
    const horasRes = reservas.flatMap((r) => [toMin(r.horaInicio), toMin(r.horaFin)]);
    const mins = [...conDia.flatMap((c) => [toMin(c.horaInicio), toMin(c.horaFin)]), ...horasEv, ...horasRes];
    const hIni = mins.length ? Math.min(7, Math.floor(Math.min(...mins) / 60)) : 7;
    const hFin = mins.length ? Math.max(19, Math.ceil(Math.max(...mins) / 60)) : 19;
    const alto = (hFin - hIni) * 60 * PX_MIN;
    const horas = Array.from({ length: hFin - hIni + 1 }, (_, i) => hIni + i);

    // Clases del día, filtradas por la SEMANA de la fecha (A/B quincenal), en columnas.
    const layout = (dia: string, fecha: Date) => {
        const { placed, cols } = layoutFranjas(conDia.filter((c) => c.diaSemana === dia && claseAplica(c.frecuencia, fecha)));
        return { placed: placed.map(({ it, s, e, col }) => ({ c: it, s, e, col })), cols };
    };

    const hoyIso = format(new Date(), 'yyyy-MM-dd'); // para resaltar la columna de HOY

    return (
        <div className="card overflow-x-auto">
            <div className="flex min-w-[720px]">
                {/* Eje de horas */}
                <div className="shrink-0 w-12">
                    <div className="h-6" />
                    <div className="relative" style={{ height: alto }}>
                        {horas.map((h) => (
                            <div key={h} className="absolute -translate-y-1/2 right-1 text-[10px] text-utec-gray-200" style={{ top: (h - hIni) * 60 * PX_MIN }}>{h}:00</div>
                        ))}
                    </div>
                </div>
                {/* Una columna por día (con su fecha real de la semana anclada) */}
                {DIAS_GRID.map((dia, idx) => {
                    const fecha = addDays(ancla, idx);
                    const fechaIso = format(fecha, 'yyyy-MM-dd');
                    const esHoy = fechaIso === hoyIso;
                    const dentroCiclo = fecha >= cicloInicio && fecha <= cicloFin;
                    // Las marcas de examen/feriado se muestran SIEMPRE (incluso finales/rezagados,
                    // que caen después del último día de clases); las clases solo dentro del ciclo.
                    const exc = excepcionDe(excepciones, fechaIso);
                    const { placed, cols } = (dentroCiclo && !exc) ? layout(dia, fecha) : { placed: [], cols: 1 };
                    // Eventos del lab que caen en esa fecha (independiente del ciclo).
                    // Los FERIADO NO se pintan como evento: ya se muestran como la marca rosa
                    // "Feriado" (excepción académica derivada de la misma fuente) → sin duplicado.
                    // Y en un día feriado el ALMUERZO tampoco se pinta (el lab no atiende: nadie viene).
                    const esFeriado = exc?.tipo === 'FERIADO';
                    // Se excluyen del calendario los bloqueos que NO son eventos de horario:
                    //  · FERIADO → ya se muestra como la marca del día.
                    //  · RETIRO → es "mesa fuera de servicio" TODO EL DÍA por todo un periodo; pintarlo
                    //    como bloque taparía la columna entera cada día ("todo oculto"). Su efecto se
                    //    ve en la cuadrícula de reserva del lab (mesa RETIRADA), no aquí.
                    const eventosDelDia = eventos.filter((e) => e.motivo !== 'FERIADO' && e.motivo !== 'RETIRO'
                        && !(esFeriado && e.motivo === 'ALMUERZO')
                        && fechaIso >= e.fechaInicio && fechaIso <= e.fechaFin);
                    // Reservas de mesas del lab en esa fecha, repartidas en columnas si se cruzan.
                    const resDia = layoutFranjas(reservas.filter((r) => r.fecha === fechaIso));
                    // Ventana de ATENCIÓN del lab: fuera de ella (o en días que no atiende) el
                    // alumno no reserva → banda rayada gris "sin atención".
                    const atiendeDia = !atencion?.diasAtencion?.length || atencion.diasAtencion.includes(DIA_LABEL[dia]);
                    const apert = atencion?.horaApertura ? toMin(atencion.horaApertura) : null;
                    const cierre = atencion?.horaCierre ? toMin(atencion.horaCierre) : null;
                    return (
                        <div key={dia} className={`flex-1 min-w-[110px] ${esHoy ? 'ring-2 ring-inset ring-utec-cyan/70 rounded-md' : ''}`}>
                            <div className="text-center h-6">
                                <span className={`text-xs font-semibold ${esHoy ? 'text-utec-blue' : 'text-ink'}`}>{DIA_LABEL[dia]}</span>
                                <span className={`text-[10px] ml-1 ${esHoy ? 'text-utec-blue font-bold bg-utec-cyan/20 rounded-full px-1.5 py-0.5' : 'text-utec-gray-200'}`}>{esHoy ? `${format(fecha, 'dd/MM')} · hoy` : format(fecha, 'dd/MM')}</span>
                            </div>
                            <div className={`relative border-l border-line ${onSlotClick ? 'cursor-pointer' : ''}`} style={{ height: alto, background: exc ? fondoMarca(exc.tipo) : undefined }}
                                title={onSlotClick ? 'Clic en un hueco libre para crear un evento' : undefined}
                                onClick={onSlotClick ? (ev) => {
                                    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                                    onSlotClick(fechaIso, hIni * 60 + (ev.clientY - rect.top) / PX_MIN);
                                } : undefined}>
                                {horas.map((h) => <div key={h} className="absolute w-full border-t border-line/50" style={{ top: (h - hIni) * 60 * PX_MIN }} />)}
                                {/* Bandas "sin atención": SIEMPRE que hay lab elegido (también en semanas de
                                    exámenes — el lab igual atiende 9–6); solo en FERIADO no (día cerrado entero). */}
                                {atencion && exc?.tipo !== 'FERIADO' && exc?.tipo !== 'CIERRE' && (atiendeDia ? (
                                    <>
                                        {apert != null && apert > hIni * 60 && (
                                            <div className="absolute w-full pointer-events-none flex items-end justify-center border-b border-dashed border-slate-400/70" style={{ top: 0, height: (apert - hIni * 60) * PX_MIN, background: RAYADO_NO_ATENCION }}>
                                                {(apert - hIni * 60) * PX_MIN > 26 && <span className="text-[9px] font-medium text-slate-600 bg-white/80 rounded px-1 mb-0.5">No atiende</span>}
                                            </div>
                                        )}
                                        {cierre != null && cierre < hFin * 60 && (
                                            <div className="absolute w-full pointer-events-none flex items-start justify-center border-t border-dashed border-slate-400/70" style={{ top: (cierre - hIni * 60) * PX_MIN, height: (hFin * 60 - cierre) * PX_MIN, background: RAYADO_NO_ATENCION }}>
                                                {(hFin * 60 - cierre) * PX_MIN > 26 && <span className="text-[9px] font-medium text-slate-600 bg-white/80 rounded px-1 mt-0.5">No atiende</span>}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="absolute inset-0 pointer-events-none flex items-start justify-center pt-2" style={{ background: RAYADO_NO_ATENCION }}>
                                        <span className="text-[10px] font-medium text-slate-600 bg-white/80 rounded px-1">No atiende este día</span>
                                    </div>
                                ))}
                                {exc && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-1 pointer-events-none">
                                        <span className={`text-[11px] font-semibold ${(exc.tipo === 'CIERRE' || exc.tipo === 'FERIADO') ? 'text-rose-700' : 'text-amber-700'}`}>{exc.tipo === 'CIERRE' ? 'Cerrado (UTEC)' : exc.tipo === 'FERIADO' ? 'Feriado' : exc.tipo === 'EXAMEN' ? 'Exámenes' : 'Sin clases'}</span>
                                        {exc.descripcion && <span className="text-[9px] text-utec-gray-200">{exc.descripcion}</span>}
                                    </div>
                                )}
                                {placed.map(({ c, s, e, col }) => (
                                    <button key={c.id} onClick={(ev) => { ev.stopPropagation(); onSelect(c); }}
                                        title={`${c.cursoNombre ?? ''} · ${c.espacioCodigo}`}
                                        className="absolute rounded leading-tight px-1 py-0.5 overflow-hidden text-left shadow-sm"
                                        style={{ top: (s - hIni * 60) * PX_MIN, height: Math.max(14, (e - s) * PX_MIN - 2), left: `${(col * 100) / cols}%`, width: `calc(${100 / cols}% - 2px)`, fontSize: 10, ...estiloBloque(colorClase(c)) }}>
                                        <div className="font-semibold truncate">{c.cursoCodigo ?? c.cursoNombre}{etiquetaSemana(c.frecuencia)}</div>
                                        <div className="truncate opacity-90">{c.espacioCodigo}</div>
                                        <div className="opacity-80">{c.horaInicio.slice(0, 5)}–{c.horaFin.slice(0, 5)}</div>
                                    </button>
                                ))}
                                {eventosDelDia.map((e) => {
                                    const s = e.horaInicio ? toMin(e.horaInicio) : hIni * 60;
                                    const en = e.horaFin ? toMin(e.horaFin) : hFin * 60;
                                    return (
                                        <div key={`ev${e.id}`} title={`${etiquetaBloqueo(e.motivo, e.tipo)} · ${e.descripcion ?? e.motivo}`}
                                            onClick={(ev) => { ev.stopPropagation(); onSelectEvento?.(e); }}
                                            className="absolute rounded leading-tight px-1 py-0.5 overflow-hidden text-left shadow-sm cursor-pointer"
                                            style={{ top: (s - hIni * 60) * PX_MIN, height: Math.max(14, (en - s) * PX_MIN - 2), left: 0, width: 'calc(100% - 2px)', fontSize: 10, ...estiloBloque(colorBloqueo(e.motivo, e.tipo)) }}>
                                            <div className="font-semibold truncate">{(e.descripcion || '').trim() || e.motivo}</div>
                                            <div className="opacity-80">{e.horaInicio ? `${e.horaInicio.slice(0, 5)}–${e.horaFin?.slice(0, 5)}` : 'Todo el día'}</div>
                                        </div>
                                    );
                                })}
                                {resDia.placed.map(({ it: r, s, e, col }) => (
                                    <div key={`res${r.id}`} title={`Reserva · ${r.recursoNombre}${r.usuarioNombre ? ' · ' + r.usuarioNombre : ''}`}
                                        onClick={(ev) => { ev.stopPropagation(); onSelectReserva?.(r); }}
                                        className="absolute rounded leading-tight px-1 py-0.5 overflow-hidden text-left shadow-sm cursor-pointer"
                                        style={{ top: (s - hIni * 60) * PX_MIN, height: Math.max(14, (e - s) * PX_MIN - 2), left: `${(col * 100) / resDia.cols}%`, width: `calc(${100 / resDia.cols}% - 2px)`, fontSize: 10, ...estiloBloque(colorReserva(r.estado)) }}>
                                        <div className="font-semibold truncate">{r.recursoNombre}</div>
                                        {r.usuarioNombre && <div className="truncate opacity-90">{r.usuarioNombre}</div>}
                                        <div className="opacity-80">{r.horaInicio.slice(0, 5)}–{r.horaFin.slice(0, 5)}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─────────────────────────────── BUSCAR LIBRES ───────────────────────────────

// Ventana visual del día para las barras de disponibilidad (07:00–22:00).
const DIA_INI_MIN = 7 * 60, DIA_FIN_MIN = 22 * 60;
const pctDia = (m: number) => Math.max(0, Math.min(100, ((m - DIA_INI_MIN) * 100) / (DIA_FIN_MIN - DIA_INI_MIN)));

// Pista de disponibilidad del día (solo la barra): verde = libre, gris = ocupado (tooltip con
// el curso/evento) y un marco cyan sobre la franja buscada. Se usa en las cards Y en la grilla,
// para que toda la pestaña hable el MISMO lenguaje visual. En LABS, `atencion` raya las horas
// fuera de su ventana de atención (ahí el alumno NO reserva, aunque puedan caer eventos/clases).
function PistaDia({ ocupado, hi, hf, atencion }: { ocupado: Franja[]; hi: string; hf: string; atencion?: AtencionBarra }) {
    return (
        <div className="relative h-3 rounded-full bg-green-100 overflow-hidden" role="img"
            aria-label={`Ocupación del día: ${ocupado.length} franja(s) ocupada(s)`}>
            {atencion && (atencion.atiende === false ? (
                <div className="absolute inset-0" style={{ background: RAYADO_NO_ATENCION }} title="El laboratorio no atiende este día (no se reserva; solo eventos)" />
            ) : (<>
                {atencion.inicio && toMin(atencion.inicio) > DIA_INI_MIN && (
                    <div className="absolute top-0 h-full" style={{ left: 0, width: `${pctDia(toMin(atencion.inicio))}%`, background: RAYADO_NO_ATENCION }}
                        title={`No atiende antes de las ${atencion.inicio.slice(0, 5)} (no se reserva)`} />
                )}
                {atencion.fin && toMin(atencion.fin) < DIA_FIN_MIN && (
                    <div className="absolute top-0 h-full" style={{ left: `${pctDia(toMin(atencion.fin))}%`, width: `${100 - pctDia(toMin(atencion.fin))}%`, background: RAYADO_NO_ATENCION }}
                        title={`No atiende después de las ${atencion.fin.slice(0, 5)} (no se reserva)`} />
                )}
            </>))}
            {ocupado.map((f, i) => {
                const s = pctDia(toMin(f.horaInicio)), e = pctDia(toMin(f.horaFin));
                // Parcial (bloqueo parcial / reserva de mesa) = ámbar: el ambiente sigue usable.
                return <div key={i} className={`absolute top-0 h-full ${f.parcial ? 'bg-amber-300' : 'bg-slate-400'}`} style={{ left: `${s}%`, width: `${Math.max(1, e - s)}%` }} title={f.etiqueta ?? 'Ocupado'} />;
            })}
            <div className="absolute top-0 h-full rounded-sm ring-2 ring-inset ring-utec-cyan pointer-events-none"
                style={{ left: `${pctDia(toMin(hi))}%`, width: `${Math.max(2, pctDia(toMin(hf)) - pctDia(toMin(hi)))}%` }} />
        </div>
    );
}

// Pista + eje de horas (para las cards, donde la barra va sola).
function BarraDia({ ocupado, hi, hf, atencion }: { ocupado: Franja[]; hi: string; hf: string; atencion?: AtencionBarra }) {
    return (
        <div>
            <PistaDia ocupado={ocupado} hi={hi} hf={hf} atencion={atencion} />
            <div className="flex justify-between text-[9px] text-utec-gray-200 mt-0.5"><span>7:00</span><span>14:00</span><span>22:00</span></div>
        </div>
    );
}

/** "Libre hasta las 18:00" / "Libre el resto del día": la próxima ocupación desde la hora buscada. */
function libreHasta(ocupado: Franja[], desdeHora: string): string {
    const desde = toMin(desdeHora);
    const prox = ocupado.map((f) => toMin(f.horaInicio)).filter((m) => m >= desde).sort((a, b) => a - b)[0];
    if (prox === undefined) return 'Libre el resto del día';
    return `Libre hasta las ${String(Math.floor(prox / 60)).padStart(2, '0')}:${String(prox % 60).padStart(2, '0')}`;
}

// Tipos de aula que se pueden bloquear desde Crear Bloqueo (mismo agrupamiento que esa página).
const TIPOS_BLOQUEABLES = new Set(['AULA', 'AULA_MIXTA', 'AUDITORIO', 'AULA_MAGNA', 'SALA_ESTUDIO_SUM']);
// Bloquear aulas/espacios no-lab: SOLO el Admin y el Counter de Docencia. El coordinador,
// director y responsable administran laboratorios, no los demás espacios.
const ROLES_BLOQUEO = ['ADMIN', 'DOCENCIA'];

const JS_A_DIA: Record<number, string> = { 1: 'LUNES', 2: 'MARTES', 3: 'MIERCOLES', 4: 'JUEVES', 5: 'VIERNES', 6: 'SABADO' };
const DURACIONES = [1, 2, 3, 4, 5]; // horas seleccionables (petición de producto: solo 1..5)

function TabLibres() {
    // Semana ACTUAL con fechas reales (Lun 13 · Mar 14 · …); HOY va resaltado y es el default.
    // La hora de inicio parte de la hora actual (15:33 → 15:00) y se elige una DURACIÓN (1–5 h),
    // no una hora de fin: así el alumno piensa "necesito 2 horas", como en la vida real.
    const lunesSemana = lunesDe(new Date());
    const semana = DIAS.map((d, i) => ({ dia: d, fecha: addDays(lunesSemana, i) }));
    const hoyDia = JS_A_DIA[getDay(new Date())];
    const [dia, setDia] = useState(() => hoyDia ?? 'LUNES');
    const [hi, setHi] = useState(() => `${String(Math.min(Math.max(new Date().getHours(), 7), 19)).padStart(2, '0')}:00`);
    const [dur, setDur] = useState(2);
    const [tipo, setTipo] = useState('');
    const [capMin, setCapMin] = useState('');
    // Fin = inicio + duración (tope 23:00, la ventana institucional).
    const finMin = Math.min(toMin(hi) + dur * 60, 23 * 60);
    const hf = `${String(Math.floor(finMin / 60)).padStart(2, '0')}:${String(finMin % 60).padStart(2, '0')}`;
    const fechaSel = semana.find((s) => s.dia === dia)?.fecha ?? new Date();
    const fechaIso = format(fechaSel, 'yyyy-MM-dd');
    const valido = hi < hf;

    // Búsqueda EN VIVO: sin botón "Buscar" — cualquier cambio re-consulta (debounce 300ms).
    const [filtros, setFiltros] = useState({ dia, hi, hf, tipo, capMin, fechaIso });
    useEffect(() => {
        const t = setTimeout(() => setFiltros({ dia, hi, hf, tipo, capMin, fechaIso }), 300);
        return () => clearTimeout(t);
    }, [dia, hi, hf, tipo, capMin, fechaIso]);

    const { data: libres, isFetching, isLoading } = useQuery({
        queryKey: ['aulas-libres', filtros],
        // fecha → búsqueda consciente de fecha: los eventos de administrativos ocupan y en días
        // de excepción (feriado/exámenes) las clases no cuentan. El alumno ve la realidad del día.
        queryFn: () => api.get('/aulas/libres', { params: { ciclo: CICLO, dia: filtros.dia, horaInicio: filtros.hi, horaFin: filtros.hf, tipo: filtros.tipo || undefined, capacidadMin: filtros.capMin || undefined, fecha: filtros.fechaIso } }),
        select: (r) => r.data.data as Aula[],
        enabled: filtros.hi < filtros.hf,
        placeholderData: keepPreviousData,   // no parpadea al cambiar filtros
    });
    // Ocupación del día completo (todas las aulas del tipo): alimenta las barras de cada card
    // y la grilla integrada de abajo.
    const { data: grilla } = useQuery({
        queryKey: ['aulas-ocupacion', filtros.dia, filtros.tipo, filtros.fechaIso],
        queryFn: () => api.get('/aulas/ocupacion', { params: { ciclo: CICLO, dia: filtros.dia, tipo: filtros.tipo || undefined, fecha: filtros.fechaIso } }),
        select: (r) => r.data.data as Ocupacion[],
        placeholderData: keepPreviousData,
    });
    // Los ids de labs y aulas pueden coincidir → se distingue por esLab.
    const ocupadoDe = (a: Aula): Franja[] =>
        grilla?.find((o) => o.id === a.id && !!o.esLab === !!a.esLab)?.ocupado ?? [];
    // Ventana de atención (solo labs): raya en la barra las horas donde no se reserva.
    const atencionDe = (a: Aula): AtencionBarra | undefined => {
        const o = grilla?.find((x) => x.id === a.id && !!x.esLab === !!a.esLab);
        return o?.esLab ? { inicio: o.atencionInicio, fin: o.atencionFin, atiende: o.atiende } : undefined;
    };

    // CTA "Bloquear" solo para roles de gestión de aulas (el alumno no lo ve) y solo en tipos
    // que Crear Bloqueo sabe manejar.
    const navigate = useNavigate();
    const rol = useAuthStore((s) => s.user?.rol);
    const puedeBloquear = ROLES_BLOQUEO.includes(rol ?? '');

    // Orden institucional: por PISO (sótanos primero) y luego código — igual que Laboratorios.
    const cards = [...(libres ?? [])].sort(porPiso);

    // Las franjas PARCIALES (bloqueo parcial / reserva de mesa) no cuentan como "ocupado".
    const ocupadaEnFranja = (o: Ocupacion) =>
        o.ocupado.some((f) => !f.parcial && toMin(f.horaInicio) < toMin(filtros.hf) && toMin(f.horaFin) > toMin(filtros.hi));
    const filas = [...(grilla ?? [])].sort(porPiso);

    const chip = (active: boolean) =>
        `px-3 py-1.5 rounded-full text-sm font-medium border transition-colors cursor-pointer ${
            active ? 'bg-utec-cyan text-utec-dark border-utec-cyan font-semibold' : 'border-line text-ink hover:bg-utec-cyan/10'
        }`;

    return (
        <div>
            {/* Filtros: días de la SEMANA ACTUAL con fecha (hoy resaltado), hora de inicio y
                DURACIÓN 1–5 h. Búsqueda en vivo. */}
            <div className="card mb-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-utec-gray-200 w-14">Día</span>
                    {semana.map(({ dia: d, fecha }) => (
                        <button key={d} onClick={() => setDia(d)} aria-pressed={dia === d} className={chip(dia === d)}>
                            {DIA_LABEL[d].slice(0, 3)} {format(fecha, 'dd')}
                            {d === hoyDia && <span className={`ml-1 text-[9px] font-bold uppercase ${dia === d ? 'text-utec-dark/70' : 'text-utec-blue'}`}>hoy</span>}
                        </button>
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-utec-gray-200 w-14 inline-flex items-center gap-1"><Clock size={12} /> Desde</span>
                    <input type="time" aria-label="Hora de inicio" value={hi} onChange={(e) => setHi(e.target.value)} className="input-field text-sm py-1.5 w-28" />
                    <span className="text-xs text-utec-gray-200 ml-1">durante</span>
                    {DURACIONES.map((d) => (
                        <button key={d} onClick={() => setDur(d)} aria-pressed={dur === d} className={chip(dur === d)}>
                            {d} h
                        </button>
                    ))}
                    <span className="mx-2 h-5 border-l border-line" />
                    <select aria-label="Tipo de ambiente" value={tipo} onChange={(e) => setTipo(e.target.value)} className="input-field text-sm py-1.5 w-40">
                        <option value="">Todos los tipos</option>
                        {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <input type="number" min={0} aria-label="Capacidad mínima" value={capMin} onChange={(e) => setCapMin(e.target.value)} placeholder="Cap. mín" className="input-field text-sm py-1.5 w-24" />
                    {!valido && <span className="text-xs text-danger">Elige una hora de inicio antes de las 23:00.</span>}
                </div>
            </div>

            {/* Resumen del resultado, en vivo */}
            <h3 className="font-semibold text-ink mb-3 flex items-center gap-2" aria-live="polite">
                <DoorOpen size={18} className="text-utec-cyan" />
                {isFetching ? 'Buscando…' : `${libres?.length ?? 0} ambiente(s) libre(s)`}
                <span className="text-sm font-normal text-utec-gray-200">· {DIA_LABEL[dia]} {format(fechaSel, 'dd/MM')} · {filtros.hi}–{filtros.hf}</span>
            </h3>

            {/* Resultados como CARDS con barra visual del día */}
            {isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mb-5">
                    {Array.from({ length: 6 }).map((_, i) => <div key={i} className="card h-24 animate-pulse bg-utec-cyan/5" />)}
                </div>
            ) : (libres ?? []).length === 0 ? (
                <div className="card text-center py-10 text-utec-gray-200 mb-5">
                    <DoorOpen size={36} className="mx-auto mb-2 opacity-40" />
                    No hay ambientes libres {DIA_LABEL[dia]?.toLowerCase()} de {filtros.hi} a {filtros.hf}.
                    <div className="text-xs mt-1">Prueba <strong>otra franja</strong>, otro <strong>día</strong> o quita la capacidad mínima — la grilla de abajo muestra los huecos del día.</div>
                </div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mb-5">
                    {cards.map((a) => (
                        <div key={`${a.esLab ? 'l' : 'a'}${a.id}`} className="card !p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between mb-1">
                                <span className="font-bold text-ink">{a.codigo}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${a.esLab ? 'bg-utec-cyan/20 text-utec-blue' : 'bg-utec-cyan/10 text-utec-blue'}`}>{TIPO_LABEL[a.tipo] ?? a.tipo}</span>
                            </div>
                            <div className="text-xs text-utec-gray-200 mb-1 inline-flex items-center gap-2">
                                {a.capacidad ? <span className="inline-flex items-center gap-1"><Users size={12} /> {a.capacidad}</span> : null}
                                {a.piso != null && <span>Piso {a.piso}</span>}
                            </div>
                            {/* La lectura clave, en palabras: hasta cuándo está libre desde la hora buscada. */}
                            <div className="text-xs font-medium text-green-700 mb-2 inline-flex items-center gap-1">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />
                                {libreHasta(ocupadoDe(a), filtros.hi)}
                            </div>
                            <BarraDia ocupado={ocupadoDe(a)} hi={filtros.hi} hf={filtros.hf} atencion={atencionDe(a)} />
                            {a.esLab ? (
                                /* En un lab la acción natural (para TODOS) es ir a reservar una mesa. */
                                <button
                                    onClick={() => navigate(`/laboratorios/${a.id}`)}
                                    className="mt-2 w-full text-xs font-medium text-utec-blue bg-utec-cyan/10 hover:bg-utec-cyan/20 rounded-lg py-1.5 inline-flex items-center justify-center gap-1 transition-colors">
                                    <DoorOpen size={12} /> Reservar mesa
                                </button>
                            ) : puedeBloquear && TIPOS_BLOQUEABLES.has(a.tipo) && (
                                <button
                                    onClick={() => navigate(`/admin/bloqueos/crear?aula=${a.id}&aulaTipo=${a.tipo}&fecha=${filtros.fechaIso}&horaInicio=${filtros.hi}&horaFin=${filtros.hf}`)}
                                    className="mt-2 w-full text-xs font-medium text-utec-blue bg-utec-cyan/10 hover:bg-utec-cyan/20 rounded-lg py-1.5 inline-flex items-center justify-center gap-1 transition-colors">
                                    <Lock size={12} /> Bloquear este ambiente
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Ocupación del día como TIMELINE continuo: cada fila usa la MISMA pista que las
                cards (un solo lenguaje visual), con eje común y los ambientes LIBRES primero. */}
            <div className="card overflow-x-auto">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h4 className="font-semibold text-ink text-sm">Ocupación del día · {DIA_LABEL[dia]} {format(fechaSel, 'dd/MM')}</h4>
                    <div className="flex items-center gap-3 text-[11px] text-utec-gray-200 flex-wrap">
                        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-green-100 border border-green-300" /> Libre</span>
                        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-amber-300" /> Parcial (mesas/reserva)</span>
                        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-slate-400" /> Ocupado</span>
                        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: RAYADO_NO_ATENCION }} /> No atiende (labs: sin reservas, solo eventos)</span>
                        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm ring-2 ring-inset ring-utec-cyan bg-green-100" /> Franja buscada</span>
                    </div>
                </div>
                <div className="min-w-[640px]">
                    {/* Eje de horas compartido */}
                    <div className="flex items-center gap-2 mb-1.5">
                        <span className="w-24 shrink-0" />
                        <div className="relative flex-1 h-4 text-[9px] text-utec-gray-200">
                            {[7, 10, 13, 16, 19, 22].map((h) => (
                                <span key={h} className="absolute -translate-x-1/2" style={{ left: `${pctDia(h * 60)}%` }}>{h}:00</span>
                            ))}
                        </div>
                    </div>
                    {filas.map((a) => (
                        <div key={`${a.esLab ? 'l' : 'a'}${a.id}`} className="flex items-center gap-2 py-1">
                            <span className="w-24 shrink-0 text-[11px] font-semibold text-ink truncate inline-flex items-center gap-1.5">
                                <span className={`inline-block w-1.5 h-1.5 rounded-full ${ocupadaEnFranja(a) ? 'bg-slate-400' : 'bg-green-500'}`} />
                                {a.codigo}
                            </span>
                            <div className="flex-1"><PistaDia ocupado={a.ocupado} hi={filtros.hi} hf={filtros.hf} atencion={a.esLab ? { inicio: a.atencionInicio, fin: a.atencionFin, atiende: a.atiende } : undefined} /></div>
                        </div>
                    ))}
                    {grilla && grilla.length === 0 && (
                        <div className="text-center py-6 text-utec-gray-200 text-sm">No hay ambientes de ese tipo con actividad este día.</div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─────────── helpers ───────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <div><label className="block text-xs font-medium text-utec-gray-200 mb-1">{label}</label>{children}</div>;
}
function Row({ k, v }: { k: string; v: string }) {
    return <div className="flex gap-2"><dt className="text-ink-muted w-24 shrink-0">{k}</dt><dd className="text-ink font-medium">{v}</dd></div>;
}

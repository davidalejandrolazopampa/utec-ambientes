import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, Plus, Save, BookOpen, ChevronRight, Lock } from 'lucide-react';
import api from '@/services/api';
import toast from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader';
import { nombreCarrera } from '@/utils/carreras';

const CICLO_LABEL: Record<number, string> = { 0: 'Ciclo 0 · Verano', 1: 'Ciclo 1 · Mar–Jul', 2: 'Ciclo 2 · Ago–Nov' };

interface Excepcion { id: number; fechaInicio: string; fechaFin: string; tipo: string; descripcion?: string; }
interface Ciclo { id: number; anio: number; ciclo: number; codigo: string; fechaInicio: string; fechaFin: string; excepciones?: Excepcion[]; }
interface Curso { id: number; codCurso: string; nombre: string; area?: string; }

// Reestructura (jul-2026): antes la página tenía 3 secciones separadas (tabla de fechas,
// excepciones de TODOS los ciclos, cursos de TODOS los ciclos) y la info de un mismo ciclo
// quedaba dispersa. Ahora: selector de AÑO arriba y UNA TARJETA POR CICLO que reúne todo lo
// suyo — fechas editables + exámenes/feriados + cursos (desplegable).
export default function CiclosPage() {
    const qc = useQueryClient();
    const [anio, setAnio] = useState('');
    const { data: ciclos } = useQuery({ queryKey: ['ciclos'], queryFn: () => api.get('/ciclos'), select: (r) => r.data.data as Ciclo[] });

    // Años disponibles (desc). Por defecto el año en curso si existe; si no, el más reciente.
    const anios = useMemo(() => [...new Set((ciclos ?? []).map((c) => c.anio))].sort((a, b) => b - a), [ciclos]);
    const [anioSel, setAnioSel] = useState<number | null>(null);
    const anioActivo = anioSel ?? (anios.includes(new Date().getFullYear()) ? new Date().getFullYear() : anios[0] ?? null);
    const ciclosDelAnio = useMemo(
        () => (ciclos ?? []).filter((c) => c.anio === anioActivo).sort((a, b) => a.ciclo - b.ciclo),
        [ciclos, anioActivo]);

    const invalidar = () => qc.invalidateQueries({ queryKey: ['ciclos'] });

    const agregarAnio = async () => {
        const n = Number(anio);
        if (!n || n < 2000 || n > 2100) { toast.error('Año inválido'); return; }
        try {
            await api.post(`/ciclos/anio/${n}`);
            toast.success(`Año ${n} agregado (ciclos 0, 1 y 2)`);
            setAnio('');
            setAnioSel(n);   // salta al año recién creado para editarlo de una
            invalidar();
        } catch (e) {
            const err = e as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message ?? 'No se pudo agregar');
        }
    };

    return (
        <div>
            <PageHeader title="Ciclos académicos" subtitle="Todo el calendario de cada ciclo en un solo lugar: fechas, exámenes/feriados y cursos" />

            {/* ── Barra superior: selector de año + agregar año ── */}
            <div className="card mb-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <label className="block text-[10px] font-semibold text-utec-gray-200 uppercase tracking-wide mb-1.5">Año</label>
                    <div className="flex flex-wrap gap-1.5">
                        {anios.map((a) => (
                            <button key={a} onClick={() => setAnioSel(a)}
                                    className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${a === anioActivo ? 'bg-utec-cyan text-white border-utec-cyan' : 'bg-white text-utec-dark border-utec-gray-100 hover:border-utec-cyan'}`}>
                                {a}
                            </button>
                        ))}
                        {anios.length === 0 && <span className="text-sm text-utec-gray-200 py-1.5">Aún no hay ciclos: agrega un año →</span>}
                    </div>
                </div>
                <div className="flex items-end gap-2">
                    <div>
                        <label className="block text-[10px] font-semibold text-utec-gray-200 uppercase tracking-wide mb-1.5">Agregar año</label>
                        <input type="number" min={2000} max={2100} value={anio} onChange={(e) => setAnio(e.target.value)} placeholder="p. ej. 2027" className="input-field text-sm py-2 w-32" />
                    </div>
                    <button onClick={agregarAnio} className="btn-primary text-sm inline-flex items-center gap-1.5"><Plus size={15} /> Agregar año</button>
                </div>
            </div>
            {anios.length > 0 && (
                <p className="text-xs text-utec-gray-200 mb-4 -mt-2">Agregar un año crea sus ciclos 0, 1 y 2 con fechas por defecto (patrón UTEC), que editas en las tarjetas de abajo. Las fechas y excepciones se reflejan al instante en el Calendario del alumno y en la cuadrícula de reserva.</p>
            )}

            {/* ── Una tarjeta por ciclo del año elegido: fechas + excepciones + cursos ── */}
            <div className="space-y-4">
                {ciclosDelAnio.map((c) => <CicloCard key={c.id} c={c} onChange={invalidar} />)}
                {ciclos && ciclosDelAnio.length === 0 && (
                    <div className="card text-center py-10 text-utec-gray-200">Aún no hay ciclos. Agrega un año arriba.</div>
                )}
            </div>
        </div>
    );
}

/* ── Tarjeta unificada de un ciclo: cabecera + fechas + excepciones + cursos ── */
function CicloCard({ c, onChange }: { c: Ciclo; onChange: () => void }) {
    return (
        <div className="card !p-0 overflow-hidden">
            {/* Cabecera del ciclo */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-utec-cyan/5 border-b border-utec-gray-100">
                <div className="flex items-center gap-2">
                    <CalendarRange size={16} className="text-utec-cyan" />
                    <span className="font-display font-bold text-utec-dark">{CICLO_LABEL[c.ciclo]}</span>
                    <span className="text-xs font-mono text-utec-gray-200 bg-white border border-utec-gray-100 rounded px-1.5 py-0.5">{c.codigo}</span>
                </div>
                <span className="text-xs text-utec-gray-200">{c.fechaInicio} → {c.fechaFin}</span>
            </div>
            <div className="px-4 py-3 space-y-4">
                <FechasCiclo c={c} onSaved={onChange} />
                <ExcepcionesDeCiclo ciclo={c} onChange={onChange} />
                <CursosDeCiclo codigo={c.codigo} />
            </div>
        </div>
    );
}

/* Fechas de inicio/fin de clases del ciclo (editable, Guardar solo si cambió). */
function FechasCiclo({ c, onSaved }: { c: Ciclo; onSaved: () => void }) {
    const [ini, setIni] = useState(c.fechaInicio);
    const [fin, setFin] = useState(c.fechaFin);
    const [saving, setSaving] = useState(false);
    const cambiado = ini !== c.fechaInicio || fin !== c.fechaFin;

    const guardar = async () => {
        setSaving(true);
        try {
            await api.put(`/ciclos/${c.id}`, { fechaInicio: ini, fechaFin: fin });
            toast.success(`Fechas de ${c.codigo} actualizadas`);
            onSaved();
        } catch (e) {
            const err = e as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message ?? 'No se pudo guardar');
        } finally { setSaving(false); }
    };

    return (
        <div>
            <p className="text-[10px] font-semibold text-utec-gray-200 uppercase tracking-wide mb-1.5">Fechas de clases</p>
            <div className="flex flex-wrap items-end gap-2">
                <label className="block text-[10px] text-utec-gray-200">Inicio de clases<input type="date" value={ini} onChange={(e) => setIni(e.target.value)} className="input-field text-sm py-1.5 block" /></label>
                <label className="block text-[10px] text-utec-gray-200">Último día<input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="input-field text-sm py-1.5 block" /></label>
                <button onClick={guardar} disabled={!cambiado || saving} className="btn-primary text-xs inline-flex items-center gap-1 disabled:opacity-40 mb-0.5"><Save size={12} /> {saving ? '…' : 'Guardar'}</button>
            </div>
        </div>
    );
}

/* Exámenes y feriados (días SIN clases) del ciclo: chips + alta inline. */
function ExcepcionesDeCiclo({ ciclo, onChange }: { ciclo: Ciclo; onChange: () => void }) {
    const [ini, setIni] = useState('');
    const [fin, setFin] = useState('');
    const [tipo, setTipo] = useState('FERIADO');
    const [desc, setDesc] = useState('');

    const agregar = async () => {
        if (!ini || !fin) { toast.error('Indica las fechas'); return; }
        try {
            await api.post(`/ciclos/${ciclo.codigo}/excepciones`, { fechaInicio: ini, fechaFin: fin, tipo, descripcion: desc });
            toast.success('Excepción agregada'); setIni(''); setFin(''); setDesc(''); onChange();
        } catch (e) { const err = e as { response?: { data?: { message?: string } } }; toast.error(err.response?.data?.message ?? 'No se pudo agregar'); }
    };
    const eliminar = async (id: number) => {
        try { await api.delete(`/ciclos/excepciones/${id}`); toast.success('Eliminada'); onChange(); }
        catch { toast.error('No se pudo eliminar'); }
    };

    // Color de la chip por tipo. El CIERRE institucional (rojo fuerte) se distingue porque,
    // además de no haber clases, cierra las reservas de labs.
    const chipClase = (t: string) => t === 'CIERRE' ? 'bg-red-100 border-red-300 text-red-800 font-semibold'
        : t === 'FERIADO' ? 'bg-rose-50 border-rose-200 text-rose-700'
        : 'bg-amber-50 border-amber-200 text-amber-700';

    return (
        <div className="border-t border-utec-gray-100 pt-3">
            <p className="text-[10px] font-semibold text-utec-gray-200 uppercase tracking-wide mb-1.5">Exámenes, feriados y cierres (días sin clases)</p>
            <div className="flex flex-wrap gap-2 mb-3">
                {(ciclo.excepciones ?? []).map((e) => (
                    <span key={e.id} className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs border ${chipClase(e.tipo)}`}>
                        {e.tipo === 'CIERRE' && <Lock size={11} className="inline" />}
                        {e.descripcion ?? e.tipo} · {e.fechaInicio}{e.fechaFin !== e.fechaInicio ? `–${e.fechaFin}` : ''}
                        <button onClick={() => eliminar(e.id)} className="ml-1 hover:text-red-600" aria-label="Eliminar">×</button>
                    </span>
                ))}
                {(ciclo.excepciones ?? []).length === 0 && <span className="text-xs text-utec-gray-200">Sin excepciones.</span>}
            </div>
            <div className="flex flex-wrap items-end gap-2">
                <label className="block text-[10px] text-utec-gray-200">Desde<input type="date" value={ini} onChange={(e) => setIni(e.target.value)} className="input-field text-xs py-1 block" /></label>
                <label className="block text-[10px] text-utec-gray-200">Hasta<input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="input-field text-xs py-1 block" /></label>
                <label className="block text-[10px] text-utec-gray-200">Tipo<select value={tipo} onChange={(e) => setTipo(e.target.value)} className="input-field text-xs py-1 block"><option value="FERIADO">Feriado</option><option value="EXAMEN">Exámenes</option><option value="CIERRE">Cierre institucional (todo UTEC)</option><option value="OTRO">Otro</option></select></label>
                <label className="block text-[10px] text-utec-gray-200 flex-1 min-w-[120px]">Descripción<input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="opcional" className="input-field text-xs py-1 w-full block" /></label>
                <button onClick={agregar} className="btn-primary text-xs inline-flex items-center gap-1"><Plus size={12} /> Agregar</button>
            </div>
            {tipo === 'CIERRE' && (
                <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5 mt-2">
                    <Lock size={11} className="inline align-[-1px]" /> Un <b>cierre institucional</b> cierra <b>todo UTEC</b> ese periodo: no hay clases (labs y aulas), <b>no se puede reservar ningún laboratorio</b> y esos días no cuentan en la capacidad del dashboard.
                </p>
            )}
        </div>
    );
}

/* Cursos del ciclo (desplegable, se cargan al abrir). */
function CursosDeCiclo({ codigo }: { codigo: string }) {
    const [abierto, setAbierto] = useState(false);
    const { data: cursos } = useQuery({
        queryKey: ['cursos-ciclo', codigo],
        queryFn: () => api.get('/aulas/cursos', { params: { ciclo: codigo } }),
        select: (r) => r.data.data as Curso[],
        enabled: abierto,
    });

    return (
        <details className="border-t border-utec-gray-100 pt-3" open={abierto} onToggle={(e) => setAbierto((e.target as HTMLDetailsElement).open)}>
            <summary className="cursor-pointer flex items-center gap-2 text-[10px] font-semibold text-utec-gray-200 uppercase tracking-wide select-none list-none [&::-webkit-details-marker]:hidden">
                <ChevronRight size={14} className={`transition-transform ${abierto ? 'rotate-90' : ''}`} />
                <BookOpen size={14} className="text-utec-cyan" /> Cursos del ciclo
                {cursos && <span className="normal-case font-normal">· {cursos.length} curso(s)</span>}
            </summary>
            {abierto && (
                <div className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                    {(cursos ?? []).map((cu) => (
                        <div key={cu.id} className="text-sm text-ink border border-line rounded px-2 py-1">
                            <span className="font-medium">{cu.codCurso}</span> · {cu.nombre}
                            {cu.area && <span className="block text-xs text-utec-gray-200">{nombreCarrera(cu.area)}</span>}
                        </div>
                    ))}
                    {cursos && cursos.length === 0 && <p className="text-sm text-utec-gray-200 col-span-full">Sin cursos cargados en este ciclo.</p>}
                </div>
            )}
        </details>
    );
}

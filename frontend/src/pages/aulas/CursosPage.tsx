import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Search, MapPin, Clock, User } from 'lucide-react';
import api from '@/services/api';
import PageHeader from '@/components/ui/PageHeader';
import { nombreCarrera } from '@/utils/carreras';
import { cicloActualDe, etiquetaCiclo, type CicloCfg } from '@/utils/ciclos';

const DIA_LABEL: Record<string, string> = { LUNES: 'Lun', MARTES: 'Mar', MIERCOLES: 'Mié', JUEVES: 'Jue', VIERNES: 'Vie', SABADO: 'Sáb', DOMINGO: 'Dom' };
const DIA_ORDEN: Record<string, number> = { LUNES: 1, MARTES: 2, MIERCOLES: 3, JUEVES: 4, VIERNES: 5, SABADO: 6, DOMINGO: 7 };

interface Curso { id: number; codCurso: string; nombre: string; area?: string; }
interface Clase {
    id: number; espacioCodigo: string; espacioTipo: string; esLab: boolean;
    diaSemana: string; horaInicio: string; horaFin: string;
    seccion?: string; tipoSesion?: string; modalidad?: string; docente?: string;
}

export default function CursosPage() {
    const [area, setArea] = useState('');
    const [q, setQ] = useState('');
    const [sel, setSel] = useState<Curso | null>(null);
    const [ciclo, setCiclo] = useState('');   // '' = usa el ciclo actual

    // Ciclos académicos creados (2026-0/-1/-2…) → selector + default al ciclo actual.
    const { data: ciclos } = useQuery({ queryKey: ['ciclos'], queryFn: () => api.get('/ciclos'), select: (r) => r.data.data as CicloCfg[] });
    const cicloActivo = ciclo || cicloActualDe(ciclos);
    const opcionesCiclo = useMemo(
        () => [...(ciclos ?? [])].sort((a, b) => b.codigo.localeCompare(a.codigo)).map((c) => c.codigo),
        [ciclos]);

    const { data: areas } = useQuery({ queryKey: ['aulas-areas', cicloActivo], queryFn: () => api.get('/aulas/areas', { params: { ciclo: cicloActivo } }), select: (r) => r.data.data as string[] });
    const { data: cursos, isFetching } = useQuery({
        queryKey: ['cursos', cicloActivo, area, q],
        queryFn: () => api.get('/aulas/cursos', { params: { ciclo: cicloActivo, area: area || undefined, q: q.trim() || undefined } }),
        select: (r) => r.data.data as Curso[],
    });

    return (
        <div>
            <PageHeader title="Cursos" subtitle="Consulta el horario de cada curso por carrera y ciclo" />

            <div className="card mb-4 flex flex-wrap items-end gap-3">
                <div>
                    <label className="block text-xs font-medium text-utec-gray-200 mb-1">Ciclo</label>
                    <select value={cicloActivo} onChange={(e) => { setCiclo(e.target.value); setArea(''); }} className="input-field text-sm py-2 min-w-[150px]">
                        {(opcionesCiclo.length ? opcionesCiclo : [cicloActivo]).map((c) => <option key={c} value={c}>{etiquetaCiclo(c)}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-utec-gray-200 mb-1">Carrera / Área</label>
                    <select value={area} onChange={(e) => setArea(e.target.value)} className="input-field text-sm py-2 min-w-[220px]">
                        <option value="">— Todas las carreras —</option>
                        {(areas ?? []).map((a) => <option key={a} value={a}>{nombreCarrera(a)}</option>)}
                    </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-medium text-utec-gray-200 mb-1">Buscar curso</label>
                    <div className="relative">
                        <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-utec-gray-200" />
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="código o nombre…" className="input-field text-sm py-2 pl-8 w-full" />
                    </div>
                </div>
                {isFetching && <span className="text-xs text-utec-gray-200 pb-2">Cargando…</span>}
            </div>

            <p className="text-sm text-utec-gray-200 mb-3">{cursos?.length ?? 0} curso(s)</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(cursos ?? []).map((c) => (
                    <button key={c.id} onClick={() => setSel(c)} className="card text-left hover:border-utec-cyan transition-colors py-3">
                        <div className="flex items-start gap-2">
                            <BookOpen size={16} className="text-utec-cyan mt-0.5 shrink-0" />
                            <div className="min-w-0">
                                <p className="font-semibold text-ink text-sm truncate">{c.nombre}</p>
                                <p className="text-xs text-utec-gray-200">{c.codCurso}{c.area ? ` · ${nombreCarrera(c.area)}` : ''}</p>
                            </div>
                        </div>
                    </button>
                ))}
                {cursos && cursos.length === 0 && <p className="text-sm text-utec-gray-200 col-span-full">No hay cursos para ese filtro.</p>}
            </div>

            {sel && <CursoDetalle curso={sel} ciclo={cicloActivo} onClose={() => setSel(null)} />}
        </div>
    );
}

function CursoDetalle({ curso, ciclo, onClose }: { curso: Curso; ciclo: string; onClose: () => void }) {
    const { data: clases, isLoading } = useQuery({
        queryKey: ['curso-clases', curso.id, ciclo],
        queryFn: () => api.get(`/aulas/cursos/${curso.id}/clases`, { params: { ciclo } }),
        select: (r) => r.data.data as Clase[],
    });
    const ordenadas = [...(clases ?? [])].sort((a, b) =>
        (DIA_ORDEN[a.diaSemana] ?? 9) - (DIA_ORDEN[b.diaSemana] ?? 9) || a.horaInicio.localeCompare(b.horaInicio));

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-surface rounded-2xl shadow-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-ink">{curso.nombre}</h3>
                <p className="text-sm text-utec-gray-200 mb-4">{curso.codCurso}{curso.area ? ` · ${nombreCarrera(curso.area)}` : ''}</p>
                {isLoading ? <p className="text-sm text-utec-gray-200">Cargando horario…</p> : (
                    <div className="space-y-2">
                        {ordenadas.map((c) => (
                            <div key={c.id} className="border border-line rounded-lg p-3 text-sm">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="inline-flex items-center gap-1 font-semibold text-utec-blue"><Clock size={13} /> {DIA_LABEL[c.diaSemana] ?? c.diaSemana} {c.horaInicio?.slice(0, 5)}–{c.horaFin?.slice(0, 5)}</span>
                                    {c.tipoSesion && <span className="text-xs px-1.5 py-0.5 rounded bg-utec-cyan/10 text-utec-blue">{c.tipoSesion}</span>}
                                    {c.seccion && <span className="text-xs text-utec-gray-200">{c.seccion}</span>}
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink">
                                    <span className="inline-flex items-center gap-1"><MapPin size={12} className="text-utec-gray-200" /> {c.espacioCodigo}{c.esLab ? ' (lab)' : ''}</span>
                                    {c.docente && <span className="inline-flex items-center gap-1"><User size={12} className="text-utec-gray-200" /> {c.docente}</span>}
                                    {c.modalidad && <span className="text-utec-gray-200">{c.modalidad}</span>}
                                </div>
                            </div>
                        ))}
                        {ordenadas.length === 0 && <p className="text-sm text-utec-gray-200">Sin sesiones registradas.</p>}
                    </div>
                )}
                <div className="flex justify-end mt-5"><button onClick={onClose} className="btn-secondary text-sm">Cerrar</button></div>
            </div>
        </div>
    );
}

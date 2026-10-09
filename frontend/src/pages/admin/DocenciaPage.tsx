import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, DoorOpen, Plus, Pencil, Ban, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import api from '@/services/api';
import toast from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader';
import { useConfirm } from '@/components/ui/ConfirmDialog';

const TIPOS: { k: string; v: string }[] = [
    { k: 'AULA', v: 'Aula' }, { k: 'AULA_MIXTA', v: 'Aula mixta' }, { k: 'AULA_POSGRADO', v: 'Aula posgrado' },
    { k: 'AUDITORIO', v: 'Auditorio' }, { k: 'AULA_MAGNA', v: 'Aula magna' }, { k: 'ESTUDIO_GRABACION', v: 'Estudio de grabación' },
    { k: 'SALA_ESTUDIO_SUM', v: 'Sala SUM' }, { k: 'LOSA_DEPORTIVA', v: 'Losa deportiva' },
];
const tipoLabel = (t: string) => TIPOS.find((x) => x.k === t)?.v ?? t;

interface Aula { id: number; codigo: string; nombre?: string; tipo: string; capacidad?: number; piso?: number; activo?: boolean; }
interface ImportRes { ciclo: string; filasLeidas: number; virtualesDescartadas: number; aulasCreadas: number; cursosCreados: number; docentesCreados: number; clasesCreadas: number; clasesExistentes: number; clasesEliminadas: number; clasesOmitidas: number; errores: number; problemas: string[]; }

export default function DocenciaPage() {
    const qc = useQueryClient();
    const { data: aulas } = useQuery({ queryKey: ['aulas-todas'], queryFn: () => api.get('/aulas', { params: { todas: true } }), select: (r) => r.data.data as Aula[] });
    const [editar, setEditar] = useState<Aula | null>(null);
    const [crear, setCrear] = useState(false);

    // Ambientes AGRUPADOS por tipo (no una tabla plana que mezcla aulas/mixtas/auditorios/salas),
    // cada grupo en orden institucional: piso ascendente (sin piso al final) y luego código.
    // AULA_MAGNA se agrupa CON los auditorios (ambos son auditorios; el aula magna es el chico).
    const grupos = useMemo(() => {
        const GRUPO_DE: Record<string, string> = { AULA_MAGNA: 'AUDITORIO' };
        const porTipo = new Map<string, Aula[]>();
        (aulas ?? []).forEach((a) => {
            const k = GRUPO_DE[a.tipo] ?? a.tipo;
            (porTipo.get(k) ?? porTipo.set(k, []).get(k)!).push(a);
        });
        const ordenar = (arr: Aula[]) => [...arr].sort((x, y) => {
            const px = x.piso ?? 99, py = y.piso ?? 99;
            return px !== py ? px - py : x.codigo.localeCompare(y.codigo, undefined, { numeric: true });
        });
        // Orden de grupos = catálogo TIPOS; algún tipo no catalogado va al final.
        const keys = [...TIPOS.map((t) => t.k), ...[...porTipo.keys()].filter((k) => !TIPOS.some((t) => t.k === k))];
        return keys.filter((k) => porTipo.has(k)).map((k) => ({ tipo: k, lista: ordenar(porTipo.get(k)!) }));
    }, [aulas]);

    // Nota: hoy el nombre de las aulas es igual a su código (así viene del horario), por eso
    // no hay columna "Nombre"; si algún día se bautizan (p. ej. "Auditorio Central"), agregarla.
    const filaAula = (a: Aula, grupoTipo: string) => (
        <tr key={a.id} className="border-b border-line/60">
            <td className="py-1.5 pr-3 font-medium text-ink">{a.codigo}
                {a.tipo !== grupoTipo && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-utec-cyan/10 text-utec-blue align-middle">{tipoLabel(a.tipo)}</span>}
            </td>
            <td className="pr-3 text-ink">{a.capacidad ?? '—'}</td>
            <td className="pr-3 text-ink">{a.piso ?? '—'}</td>
            <td className="pr-3">{a.activo === false ? <span className="text-xs text-utec-gray-200">Inactiva</span> : <span className="text-xs text-green-600">Activa</span>}</td>
            <td className="text-right"><button onClick={() => setEditar(a)} className="text-utec-blue hover:underline inline-flex items-center gap-1 text-xs"><Pencil size={12} /> Editar</button></td>
        </tr>
    );

    return (
        <div>
            <PageHeader title="Programación Académica" subtitle="Importa horarios de clase y gestiona los ambientes (aulas, auditorios, salas)" />
            <ImportarHorarios onDone={() => qc.invalidateQueries({ queryKey: ['aulas-todas'] })} />

            <div className="flex items-center justify-between mt-8 mb-3">
                <h2 className="text-lg font-display font-bold text-ink flex items-center gap-2"><DoorOpen size={18} className="text-utec-cyan" /> Ambientes ({aulas?.length ?? 0})</h2>
                <button onClick={() => setCrear(true)} className="btn-primary text-sm inline-flex items-center gap-1.5"><Plus size={15} /> Nueva aula</button>
            </div>
            <div className="space-y-2">
                {grupos.map((g) => (
                    <details key={g.tipo} open className="group card !p-0 overflow-hidden">
                        <summary className="flex items-center gap-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden px-4 py-2.5">
                            <span className="text-utec-gray-200 text-xs transition-transform group-open:rotate-90">▶</span>
                            <span className="text-sm font-semibold text-ink">{g.tipo === 'AUDITORIO' ? 'Auditorios (incluye Aula magna)' : tipoLabel(g.tipo)}</span>
                            <span className="text-xs text-utec-gray-200">{g.lista.length}</span>
                            <span className="flex-1 h-px bg-line" />
                        </summary>
                        <div className="overflow-x-auto px-4 pb-3">
                            <table className="w-full text-sm">
                                <thead><tr className="text-left text-utec-gray-200 border-b border-line"><th className="py-2 pr-3">Código</th><th className="pr-3">Cap.</th><th className="pr-3">Piso</th><th className="pr-3">Estado</th><th></th></tr></thead>
                                <tbody>{g.lista.map((a) => filaAula(a, g.tipo))}</tbody>
                            </table>
                        </div>
                    </details>
                ))}
            </div>

            {(crear || editar) && <AulaModal aula={editar} onClose={() => { setCrear(false); setEditar(null); }} onSaved={() => qc.invalidateQueries({ queryKey: ['aulas-todas'] })} />}
        </div>
    );
}

function ImportarHorarios({ onDone }: { onDone: () => void }) {
    const [archivo, setArchivo] = useState<File | null>(null);
    const [cargando, setCargando] = useState(false);
    const [sincronizar, setSincronizar] = useState(false);
    const [res, setRes] = useState<ImportRes | null>(null);

    const importar = async () => {
        if (!archivo) { toast.error('Elige el Excel/CSV de horarios'); return; }
        setCargando(true); setRes(null);
        try {
            const fd = new FormData();
            fd.append('archivo', archivo);
            fd.append('sincronizar', String(sincronizar));
            const r = await api.post('/aulas/horarios/importar', fd);
            setRes(r.data.data as ImportRes);
            toast.success('Horario importado');
            onDone();
        } catch (e) {
            const err = e as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message ?? 'No se pudo importar');
        } finally { setCargando(false); }
    };

    return (
        <div className="card">
            <h2 className="text-lg font-display font-bold text-ink flex items-center gap-2 mb-2"><Upload size={18} className="text-utec-cyan" /> Importar horarios (Excel/CSV)</h2>
            <div className="bg-utec-cyan/5 border border-utec-cyan/30 rounded-lg p-3 mb-3 text-sm text-ink">
                <p className="mb-1.5">Sube el Excel/CSV oficial de horarios del ciclo (recomendado: <strong>INF_HORARIOS &lt;ciclo&gt;.xlsx</strong>, la versión limpia sin reservas de ambiente).</p>
                <p className="text-xs text-utec-gray-200 mb-1"><strong>Columnas:</strong> <span className="font-mono">Periodo, Cod_Curso, Curso, Cod_Aula, Dia_Semana, Hora_Inicio, Hora_Fin, Seccion, Docente, Modalidad, Frecuencia…</span> (la cabecera tolera acentos/mayúsculas y sinónimos).</p>
                <ul className="list-disc pl-5 space-y-0.5 text-xs text-utec-gray-200">
                    <li>El <strong>ciclo</strong> se detecta de la columna «Periodo» (p. ej. 2026-1) y las fechas se proyectan sobre el calendario académico.</li>
                    <li>Crea las <strong>aulas y cursos</strong> que falten y una <strong>clase</strong> por sesión; los laboratorios se enlazan por su código.</li>
                    <li><strong>Frecuencia</strong> quincenal: <span className="font-mono">SEMANA_A</span> / <span className="font-mono">SEMANA_B</span> / <span className="font-mono">SEMANA_GENERAL</span> (A y B se dictan en semanas alternas).</li>
                    <li>Descarta filas <strong>Virtual/Ficticio</strong> y <strong>RESV*</strong> (reservas de ambiente, no clases) y omite los solapes.</li>
                    <li><strong>Re-subir un archivo NO duplica</strong>: las clases que ya existen se conservan (y se refresca su docente); puedes subir un archivo parcial con solo cursos nuevos.</li>
                </ul>
            </div>
            <input type="file" accept=".xlsx,.csv" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="block text-sm file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border file:border-line file:bg-utec-cyan/10 file:text-utec-blue file:font-medium mb-2" />
            {archivo && <p className="text-xs text-utec-gray-200 mb-2 inline-flex items-center gap-1"><FileSpreadsheet size={13} /> {archivo.name}</p>}
            <label className="flex items-start gap-2 mb-3 text-sm text-ink cursor-pointer select-none">
                <input type="checkbox" checked={sincronizar} onChange={(e) => setSincronizar(e.target.checked)} className="mt-0.5 accent-[#00BFFF]" />
                <span><strong>Sincronizar el ciclo completo</strong> — además de agregar lo nuevo, <span className="text-red-600 font-medium">elimina</span> las clases del ciclo que ya no estén en este archivo (úsalo solo con el horario COMPLETO del ciclo, no con archivos parciales).</span>
            </label>
            <div><button onClick={importar} disabled={cargando || !archivo} className="btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-50"><Upload size={15} /> {cargando ? 'Importando…' : 'Importar'}</button></div>

            {res && (
                <div className="mt-4 border-t border-line pt-4">
                    <p className="text-sm font-medium text-ink mb-2 inline-flex items-center gap-1.5"><CheckCircle2 size={16} className="text-green-600" /> Ciclo {res.ciclo}</p>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                        <Kpi n={res.filasLeidas} l="Filas" /><Kpi n={res.clasesCreadas} l="Clases nuevas" c="text-green-600" /><Kpi n={res.clasesExistentes} l="Ya existían" /><Kpi n={res.clasesEliminadas} l="Eliminadas" c="text-red-600" /><Kpi n={res.aulasCreadas} l="Aulas nuevas" /><Kpi n={res.cursosCreados} l="Cursos" /><Kpi n={res.docentesCreados} l="Docentes" c="text-teal-600" /><Kpi n={res.clasesOmitidas} l="Omitidas" c="text-amber-600" /><Kpi n={res.errores} l="Errores" c="text-red-600" />
                    </div>
                    {res.problemas?.length > 0 && <details className="mt-3 text-xs text-utec-gray-200"><summary className="cursor-pointer">Ver {res.problemas.length} incidencia(s)</summary><ul className="list-disc pl-5 mt-1">{res.problemas.map((p, i) => <li key={i}>{p}</li>)}</ul></details>}
                </div>
            )}
        </div>
    );
}
const Kpi = ({ n, l, c }: { n: number; l: string; c?: string }) => (<div><p className={`text-xl font-bold ${c ?? 'text-ink'}`}>{n}</p><p className="text-xs text-utec-gray-200">{l}</p></div>);

function AulaModal({ aula, onClose, onSaved }: { aula: Aula | null; onClose: () => void; onSaved: () => void }) {
    const confirm = useConfirm();
    const [f, setF] = useState<Aula>(aula ?? { id: 0, codigo: '', tipo: 'AULA', capacidad: undefined, piso: undefined, activo: true });
    const [saving, setSaving] = useState(false);

    const guardar = async () => {
        if (!f.codigo.trim()) { toast.error('El código es obligatorio'); return; }
        setSaving(true);
        try {
            const body = { codigo: f.codigo.trim(), nombre: f.nombre, tipo: f.tipo, capacidad: f.capacidad ?? null, piso: f.piso ?? null, activo: f.activo };
            if (aula) await api.put(`/aulas/${aula.id}`, body); else await api.post('/aulas', body);
            toast.success(aula ? 'Aula actualizada' : 'Aula creada');
            onSaved(); onClose();
        } catch (e) {
            const err = e as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message ?? 'No se pudo guardar');
        } finally { setSaving(false); }
    };

    const desactivar = async () => {
        if (!aula) return;
        if (!(await confirm({ title: 'Desactivar aula', message: `¿Desactivar ${aula.codigo}? No se borran sus clases.`, confirmText: 'Desactivar', variant: 'danger' }))) return;
        try { await api.delete(`/aulas/${aula.id}`); toast.success('Aula desactivada'); onSaved(); onClose(); }
        catch { toast.error('No se pudo desactivar'); }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-surface rounded-2xl shadow-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-ink mb-4">{aula ? `Editar ${aula.codigo}` : 'Nueva aula'}</h3>
                <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm col-span-2">Código<input value={f.codigo} disabled={!!aula} onChange={(e) => setF({ ...f, codigo: e.target.value })} className="input-field text-sm py-2 mt-1 w-full disabled:opacity-60" /></label>
                    <label className="text-sm col-span-2">Nombre<input value={f.nombre ?? ''} onChange={(e) => setF({ ...f, nombre: e.target.value })} className="input-field text-sm py-2 mt-1 w-full" /></label>
                    <label className="text-sm col-span-2">Tipo<select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} className="input-field text-sm py-2 mt-1 w-full">{TIPOS.map((t) => <option key={t.k} value={t.k}>{t.v}</option>)}</select></label>
                    <label className="text-sm">Capacidad<input type="number" min={0} value={f.capacidad ?? ''} onChange={(e) => setF({ ...f, capacidad: e.target.value ? Number(e.target.value) : undefined })} className="input-field text-sm py-2 mt-1 w-full" /></label>
                    <label className="text-sm">Piso<input type="number" value={f.piso ?? ''} onChange={(e) => setF({ ...f, piso: e.target.value ? Number(e.target.value) : undefined })} className="input-field text-sm py-2 mt-1 w-full" /></label>
                </div>
                <div className="flex justify-between items-center mt-5">
                    {aula ? <button onClick={desactivar} className="text-danger hover:underline text-sm inline-flex items-center gap-1"><Ban size={14} /> Desactivar</button> : <span />}
                    <div className="flex gap-2">
                        <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
                        <button onClick={guardar} disabled={saving} className="btn-primary text-sm disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar'}</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

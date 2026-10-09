import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, Mail } from 'lucide-react';
import api from '@/services/api';
import toast from 'react-hot-toast';

interface Laboratorio { id: number; nombre: string; codigoLab: string; }

type EstadoFila = 'CREADO' | 'OMITIDO' | 'ERROR';
interface FilaResultado { fila: number; titulo: string; estado: EstadoFila; mensaje: string; bloqueoId?: number; }
interface ImportResultado { total: number; creados: number; omitidos: number; errores: number; detalle: FilaResultado[]; }

const estadoUI: Record<EstadoFila, { icon: typeof CheckCircle2; color: string; label: string }> = {
    CREADO: { icon: CheckCircle2, color: 'text-green-600', label: 'Creado' },
    OMITIDO: { icon: AlertTriangle, color: 'text-amber-600', label: 'Omitido' },
    ERROR: { icon: XCircle, color: 'text-red-600', label: 'Error' },
};

export default function ImportarBloqueosModal({ onClose }: { onClose: () => void }) {
    const qc = useQueryClient();
    const { data: labs } = useQuery({
        queryKey: ['mis-laboratorios'],
        queryFn: () => api.get('/laboratorios/mis-laboratorios'),
        select: (r) => r.data.data as Laboratorio[],
    });

    const [labId, setLabId] = useState('');
    const [enviarCorreos, setEnviarCorreos] = useState(false);
    const [archivo, setArchivo] = useState<File | null>(null);
    const [cargando, setCargando] = useState(false);
    const [resultado, setResultado] = useState<ImportResultado | null>(null);

    // Preselecciona L108 (Concept Lab) si está, si no el primero.
    useEffect(() => {
        if (labId || !labs?.length) return;
        const l108 = labs.find((l) => l.codigoLab === 'L108');
        setLabId(String((l108 ?? labs[0]).id));
    }, [labs, labId]);

    const descargarPlantilla = async (formato: 'xlsx' | 'csv') => {
        try {
            const res = await api.get('/bloqueos/importar/plantilla', { params: { formato }, responseType: 'blob' });
            const url = URL.createObjectURL(res.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = `plantilla-bloqueos.${formato}`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            toast.error('No se pudo descargar la plantilla');
        }
    };

    const importar = async () => {
        if (!archivo) { toast.error('Elige un archivo .xlsx o .csv'); return; }
        setCargando(true);
        setResultado(null);
        try {
            const fd = new FormData();
            fd.append('archivo', archivo);
            if (labId) fd.append('laboratorioId', labId);
            fd.append('enviarCorreos', String(enviarCorreos));
            const res = await api.post('/bloqueos/importar', fd);
            const r = res.data.data as ImportResultado;
            setResultado(r);
            toast.success(`${r.creados} creado(s) · ${r.omitidos} omitido(s) · ${r.errores} con error`);
            qc.invalidateQueries({ queryKey: ['bloqueos-activos'] });
        } catch (e) {
            const err = e as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message ?? 'No se pudo importar el archivo');
        } finally {
            setCargando(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 overflow-y-auto p-4">
            <div className="max-w-3xl mx-auto my-4 card" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2 mb-4">
                    <Upload size={20} className="text-utec-cyan" />
                    <h2 className="text-lg font-display font-bold text-utec-dark">Importar bloqueos desde Excel/CSV</h2>
                    <button onClick={onClose} className="ml-auto text-utec-gray-200 hover:text-utec-dark text-xl leading-none" aria-label="Cerrar">×</button>
                </div>

                {/* Instrucciones + plantilla */}
                <div className="bg-utec-cyan/5 border border-utec-cyan/30 rounded-lg p-4 mb-4 text-sm text-ink">
                    <p className="mb-2">
                        Sube un <strong>.xlsx</strong> o <strong>.csv</strong> con <strong>una fila por evento</strong> y
                        una sola fila de cabecera. Columnas:
                    </p>
                    <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2 text-xs mb-3">
                        <div>
                            <p className="font-semibold text-utec-dark mb-0.5">✅ Requeridas</p>
                            <ul className="list-disc pl-4 space-y-0.5 text-utec-gray-200">
                                <li><strong>Titulo</strong> — nombre del evento</li>
                                <li><strong>Fecha</strong> — <span className="font-mono">2026-08-15</span>, <span className="font-mono">15/08/2026</span> o <span className="font-mono">15/8/26</span></li>
                                <li><strong>Hora inicio</strong> y <strong>Hora fin</strong> — <span className="font-mono">HH:MM</span> (24h), entre 07:00 y 23:00</li>
                            </ul>
                        </div>
                        <div>
                            <p className="font-semibold text-utec-dark mb-0.5">➕ Opcionales</p>
                            <ul className="list-disc pl-4 space-y-0.5 text-utec-gray-200">
                                <li><strong>Codigo Lab</strong> — si va vacío, usa el lab de abajo</li>
                                <li><strong>Tipo</strong> — <span className="font-mono">TOTAL</span> (def.) o <span className="font-mono">PARCIAL</span></li>
                                <li><strong>Motivo</strong> — <span className="font-mono">EVENTO</span> (def.), CLASE, EXAMEN, MANTENIMIENTO, ALMUERZO, FERIADO</li>
                                <li><strong>Responsable</strong> y <strong>Correo</strong> — para el aviso por correo</li>
                            </ul>
                        </div>
                    </div>
                    <p className="text-xs text-utec-gray-200 mb-0.5"><strong>Ejemplo de una fila:</strong></p>
                    <p className="font-mono text-[11px] bg-white/70 rounded px-2 py-1 mb-2 overflow-x-auto">
                        L108 · Feria de proyectos · 2026-08-15 · 09:00 · 13:00 · TOTAL · Ana Pérez · aperez@utec.edu.pe · EVENTO
                    </p>
                    <p className="text-xs text-utec-gray-200 mb-2">
                        💡 También acepta <strong>tal cual</strong> el export de Concept Lab (Titulo, Fecha de inicio, Hora inicio,
                        Hora fin, Nombres, Correos…). La cabecera tolera acentos y mayúsculas.
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                        <button onClick={() => descargarPlantilla('xlsx')} className="inline-flex items-center gap-1.5 text-utec-blue hover:underline text-sm font-medium">
                            <Download size={15} /> Plantilla Excel
                        </button>
                        <button onClick={() => descargarPlantilla('csv')} className="inline-flex items-center gap-1.5 text-utec-blue hover:underline text-sm font-medium">
                            <Download size={15} /> Plantilla CSV
                        </button>
                    </div>
                </div>

                {/* Laboratorio por defecto */}
                <label className="block text-sm font-medium text-utec-dark mb-1">Laboratorio por defecto</label>
                <select value={labId} onChange={(e) => setLabId(e.target.value)} className="input-field text-sm py-2 w-full mb-1">
                    <option value="">— Usar la columna «Codigo Lab» del archivo —</option>
                    {labs?.map((l) => <option key={l.id} value={l.id}>{l.codigoLab} — {l.nombre}</option>)}
                </select>
                <p className="text-xs text-utec-gray-200 mb-4">Se aplica a las filas que no traigan código de laboratorio.</p>

                {/* Enviar correos */}
                <label className="flex items-start gap-2 mb-4 cursor-pointer">
                    <input type="checkbox" checked={enviarCorreos} onChange={(e) => setEnviarCorreos(e.target.checked)} className="mt-1" />
                    <span className="text-sm text-ink">
                        <span className="inline-flex items-center gap-1 font-medium"><Mail size={14} /> Enviar correo a cada responsable</span>
                        <span className="block text-xs text-utec-gray-200">Manda el correo «Bloqueo registrado» a los correos del archivo (los motivos operativos —mantenimiento/almuerzo/feriado— nunca notifican).</span>
                    </span>
                </label>

                {/* Archivo */}
                <label className="block text-sm font-medium text-utec-dark mb-1">Archivo (.xlsx o .csv)</label>
                <input
                    type="file"
                    accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                    onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-ink file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border file:border-line file:bg-utec-cyan/10 file:text-utec-blue file:font-medium hover:file:bg-utec-cyan/20 mb-1"
                />
                {archivo && <p className="text-xs text-utec-gray-200 mb-4 inline-flex items-center gap-1"><FileSpreadsheet size={13} /> {archivo.name}</p>}

                {/* Resultado */}
                {resultado && (
                    <div className="mt-4 border-t border-line pt-4">
                        <div className="grid grid-cols-4 gap-2 mb-3 text-center">
                            <div><p className="text-xl font-bold text-utec-dark">{resultado.total}</p><p className="text-xs text-utec-gray-200">Filas</p></div>
                            <div><p className="text-xl font-bold text-green-600">{resultado.creados}</p><p className="text-xs text-utec-gray-200">Creados</p></div>
                            <div><p className="text-xl font-bold text-amber-600">{resultado.omitidos}</p><p className="text-xs text-utec-gray-200">Omitidos</p></div>
                            <div><p className="text-xl font-bold text-red-600">{resultado.errores}</p><p className="text-xs text-utec-gray-200">Errores</p></div>
                        </div>
                        <div className="max-h-64 overflow-y-auto border border-line rounded-lg divide-y divide-line">
                            {resultado.detalle.map((f) => {
                                const ui = estadoUI[f.estado];
                                const Icon = ui.icon;
                                return (
                                    <div key={f.fila} className="flex items-start gap-2 px-3 py-2 text-sm">
                                        <Icon size={16} className={`${ui.color} mt-0.5 shrink-0`} />
                                        <div className="min-w-0">
                                            <p className="text-ink truncate"><span className="text-utec-gray-200">Fila {f.fila}:</span> {f.titulo || '(sin título)'}</p>
                                            {f.estado !== 'CREADO' && <p className={`text-xs ${ui.color}`}>{f.mensaje}</p>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Acciones */}
                <div className="flex justify-end gap-2 mt-5">
                    <button onClick={onClose} className="btn-secondary text-sm">{resultado ? 'Cerrar' : 'Cancelar'}</button>
                    <button onClick={importar} disabled={cargando || !archivo} className="btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-50">
                        <Upload size={15} /> {cargando ? 'Importando…' : 'Importar'}
                    </button>
                </div>
            </div>
        </div>
    );
}

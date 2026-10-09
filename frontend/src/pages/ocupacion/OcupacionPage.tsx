import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import api from '@/services/api';
import PageHeader from '@/components/ui/PageHeader';
import { hoyLocal } from '@/utils/fecha';

// ── Tipos ──
interface LabInfo { id: number; codigoLab: string; nombre: string; diasAtencion?: string[]; horaApertura?: string; horaCierre?: string; }
interface RecursoItem { id: number; nombre: string; tipo?: string; }
interface ReservaItem { recursoId: number; estado: string; tipoReserva: string; fecha: string; horaInicio?: string; horaFin?: string; }
interface BloqueoItem { tipo: string; motivo: string; fechaInicio: string; fechaFin: string; horaInicio?: string; horaFin?: string; recursosAfectados?: number[]; }
interface CierreItem { fechaInicio: string; fechaFin: string; }
export interface MesaOcupacion { id: number; nombre: string; disponibles: number; ocupadas: number; pct: number; nivel: number; sinDisponibilidad: boolean; retirada: boolean; }
export interface OcupacionResult { perMesa: MesaOcupacion[]; totalDisponibles: number; totalOcupadas: number; pct: number; nivel: number; cerradoInstitucional: number; }

const ESTADOS_ACTIVOS = ['PENDIENTE', 'CONFIRMADA', 'EN_CURSO', 'COMPLETADA'];
const round = (n: number) => Math.round(n * 10) / 10;

// Mapeo de nombres de día en español (con/sin tilde) → getDay() (0=Dom .. 6=Sáb).
const normaliza = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const DIA_NUM: Record<string, number> = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };

export const diaAtiende = (d: Date, dias?: string[]): boolean => {
    if (!dias || dias.length === 0) return d.getDay() >= 1 && d.getDay() <= 5; // fallback L-V
    return dias.map((x) => DIA_NUM[normaliza(x)]).includes(d.getDay());
};

// Slots de 30 min desde apertura (incl.) hasta cierre (excl.).
export const slotsDelDia = (apertura: string, cierre: string): string[] => {
    const out: string[] = [];
    const [ah, am] = apertura.slice(0, 5).split(':').map(Number);
    const [ch, cm] = cierre.slice(0, 5).split(':').map(Number);
    let t = ah * 60 + am; const end = ch * 60 + cm;
    while (t < end) { out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`); t += 30; }
    return out;
};

// Rúbrico de niveles (objetivo: ≥60% = Nivel 4).
export const nivelDeOcupacion = (pct: number): number => (pct < 40 ? 1 : pct < 50 ? 2 : pct < 60 ? 3 : 4);
export const NIVEL_LABEL: Record<number, string> = {
    1: 'Nivel 1 · < 40%', 2: 'Nivel 2 · 40–50%', 3: 'Nivel 3 · 50–60%', 4: 'Nivel 4 · ≥ 60% (objetivo cumplido)',
};

const toDate = (s: string): Date => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmt = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Hora "HH:mm" → minutos desde medianoche (sin hora → NaN).
const toMin = (hhmm?: string): number => {
    if (!hhmm) return NaN;
    const [h, m] = hhmm.slice(0, 5).split(':').map(Number);
    return h * 60 + m;
};
// Intervalo [ini, fin) en minutos de un bloqueo/reserva; sin horas = todo el horario abierto.
const intervalo = (ini: string | undefined, fin: string | undefined, ap: number, ci: number): [number, number] => {
    const a = toMin(ini), b = toMin(fin);
    return [Number.isNaN(a) ? ap : a, Number.isNaN(b) ? ci : b];
};
// Minutos de la UNIÓN de intervalos, recortada a [lo, hi) (evita doble conteo de solapes).
const unionMin = (ivs: [number, number][], lo: number, hi: number): number => {
    const cl = ivs.map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)] as [number, number])
        .filter(([a, b]) => a < b).sort((x, y) => x[0] - y[0]);
    let total = 0, cs: number | null = null, ce = 0;
    for (const [a, b] of cl) {
        if (cs === null) { cs = a; ce = b; }
        else if (a <= ce) { ce = Math.max(ce, b); }
        else { total += ce - cs; cs = a; ce = b; }
    }
    if (cs !== null) total += ce - cs;
    return total;
};

/**
 * Ocupación POR MESA en [inicio, fin], medida en MINUTOS REALES (acumulativos), no en franjas:
 *  - DISPONIBLE = minutos del horario del lab (días de atención) menos almuerzo, eventos TOTALES,
 *    asesorías/eventos PARCIALES de la mesa y MANTENIMIENTO de la mesa.
 *  - OCUPADA = minutos reales reservados por alumnos en la mesa (un inicio tardío 15:03 cuenta sus
 *    27 min; reservar 5 min cuenta 5 min — ni se pierde ni se redondea a 30).
 *  - CIERRE institucional (todo UTEC, `ciclo_excepciones`): el lab NO estaba disponible ese día →
 *    esos minutos se EXCLUYEN de "disponible" (no son horas ociosas) y se reportan aparte
 *    (`cerradoInstitucional`), coherente con el modelo del dashboard (cerrado ≠ ocioso).
 *  % por mesa = ocupadas/disponibles. Una mesa con 0 min disponibles Y 0 ocupadas NO es "100%":
 *  se marca `sinDisponibilidad` (y `retirada` si la cubre un RETIRO) para etiquetarla aparte y
 *  excluirla del promedio. El cruce reserva↔evento (0 disponible con ocupadas) sigue dando >100%
 *  (uso real sobre franja bloqueada). Promedio = Σocup / Σdisp (las sin-disponibilidad no pesan).
 */
export function calcularOcupacionPorMesa(lab: LabInfo, recursos: RecursoItem[], reservas: ReservaItem[], bloqueos: BloqueoItem[], inicio: string, fin: string, cierres: CierreItem[] = []): OcupacionResult {
    const ap = toMin(lab.horaApertura || '09:00');
    const ci = toMin(lab.horaCierre || '18:00');
    const openMin = Math.max(0, ci - ap);
    const acc: Record<number, { disp: number; ocup: number }> = {};
    recursos.forEach((m) => { acc[m.id] = { disp: 0, ocup: 0 }; });
    let diasAtencion = 0;
    let cerradoInstitucional = 0; // minutos-mesa cerrados por CIERRE institucional (todo UTEC)
    const end = toDate(fin);
    for (let d = toDate(inicio); d <= end; d.setDate(d.getDate() + 1)) {
        if (!diaAtiende(d, lab.diasAtencion)) continue;
        const fecha = fmt(d);
        // Día de CIERRE institucional: el lab estuvo cerrado → no aporta capacidad disponible (no es
        // tiempo ocioso). Se contabiliza aparte y no cuenta como día de atención.
        if (cierres.some((c) => fecha >= c.fechaInicio && fecha <= c.fechaFin)) {
            cerradoInstitucional += openMin * recursos.length;
            continue;
        }
        diasAtencion++;
        const bloqDia = bloqueos.filter((b) => fecha >= b.fechaInicio && fecha <= b.fechaFin);
        const resDia = reservas.filter((r) => r.fecha === fecha && r.tipoReserva === 'ALUMNO' && ESTADOS_ACTIVOS.includes(r.estado));
        // Cierres que afectan a TODAS las mesas: almuerzo y eventos TOTALES (no mantenimiento).
        const cierreLab = bloqDia.filter((b) => b.motivo === 'ALMUERZO' || (b.tipo === 'TOTAL' && b.motivo !== 'MANTENIMIENTO'))
            .map((b) => intervalo(b.horaInicio, b.horaFin, ap, ci));
        for (const m of recursos) {
            // Bloqueos que afectan solo a esta mesa: mantenimiento de la mesa, asesoría/evento PARCIAL de la mesa.
            const bloqMesa = bloqDia.filter((b) => {
                if (b.motivo === 'MANTENIMIENTO') return b.tipo === 'TOTAL' || (b.recursosAfectados || []).includes(m.id);
                if (b.tipo === 'PARCIAL') return (b.recursosAfectados || []).includes(m.id);
                return false;
            }).map((b) => intervalo(b.horaInicio, b.horaFin, ap, ci));
            const noDispMin = unionMin([...cierreLab, ...bloqMesa], ap, ci);
            acc[m.id].disp += openMin - noDispMin;
            // Reservas de alumno SIEMPRE suman minutos (aunque crucen un evento → cruce; puede dar >100%).
            const resMesa = resDia.filter((r) => r.recursoId === m.id).map((r) => intervalo(r.horaInicio, r.horaFin, ap, ci));
            acc[m.id].ocup += unionMin(resMesa, ap, ci);
        }
    }
    // % de ocupación (minutos). 0 disponibles + 0 ocupadas → 100% (nada que llenar);
    // 0 disponibles + ocupadas (cruce en día 100% evento) → 100% + lo usado vs el horario nominal → >100%.
    const calcPct = (ocup: number, disp: number, nominal: number): number =>
        disp > 0 ? round((ocup * 100) / disp)
            : (ocup > 0 ? 100 + round((ocup * 100) / Math.max(nominal, 1)) : 100);

    // Mesas retiradas del servicio (RETIRO) que solapan el rango → se etiquetan como "Retirada"
    // en vez de "100%" cuando quedan con 0 h disponibles (una mesa retirada no es una mesa exprimida).
    const retiradas = new Set<number>();
    for (const b of bloqueos) {
        if (b.motivo === 'RETIRO' && b.fechaInicio <= fin && b.fechaFin >= inicio)
            (b.recursosAfectados || []).forEach((id) => retiradas.add(id));
    }

    const nominalMesa = diasAtencion * openMin; // minutos-mesa del horario nominal en el rango
    const perMesa: MesaOcupacion[] = recursos
        .map((m) => {
            const { disp, ocup } = acc[m.id];
            const pct = calcPct(ocup, disp, nominalMesa);
            // Una mesa con 0 h disponibles NO es "100% usada": o está retirada o cerrada todo el rango.
            const sinDisponibilidad = disp <= 0 && ocup <= 0;
            return { id: m.id, nombre: m.nombre, disponibles: disp, ocupadas: ocup, pct, nivel: nivelDeOcupacion(pct), sinDisponibilidad, retirada: sinDisponibilidad && retiradas.has(m.id) };
        })
        // Activas primero (por uso desc); las sin disponibilidad (retiradas/cerradas) al final.
        .sort((a, b) => (a.sinDisponibilidad === b.sinDisponibilidad) ? b.pct - a.pct : (a.sinDisponibilidad ? 1 : -1));
    const totalDisponibles = perMesa.reduce((s, m) => s + m.disponibles, 0);
    const totalOcupadas = perMesa.reduce((s, m) => s + m.ocupadas, 0);
    const pct = calcPct(totalOcupadas, totalDisponibles, nominalMesa * recursos.length);
    return { perMesa, totalDisponibles, totalOcupadas, pct, nivel: nivelDeOcupacion(pct), cerradoInstitucional };
}

// ── Heatmap de ocupación por DÍA DE LA SEMANA × HORA (para ver dónde promover) ──
export interface HeatCell { dow: number; hora: number; ocupadas: number; disponibles: number; pct: number | null; }
/**
 * Ocupación por (día de semana × hora) en el rango: reserva-min ÷ min disponibles de esa celda,
 * agregando todas las mesas y todas las fechas del rango. Misma base que calcularOcupacionPorMesa
 * (descuenta almuerzo/eventos/mantenimiento y excluye los días de cierre institucional).
 */
export function calcularHeatmap(lab: LabInfo, recursos: RecursoItem[], reservas: ReservaItem[], bloqueos: BloqueoItem[], inicio: string, fin: string, cierres: CierreItem[] = []): HeatCell[] {
    const ap = toMin(lab.horaApertura || '09:00');
    const ci = toMin(lab.horaCierre || '18:00');
    const hIni = Math.floor(ap / 60), hFin = Math.ceil(ci / 60);
    const acc: Record<string, { disp: number; ocup: number }> = {};
    const end = toDate(fin);
    for (let d = toDate(inicio); d <= end; d.setDate(d.getDate() + 1)) {
        if (!diaAtiende(d, lab.diasAtencion)) continue;
        const fecha = fmt(d);
        if (cierres.some((c) => fecha >= c.fechaInicio && fecha <= c.fechaFin)) continue;
        const dow = d.getDay();
        const bloqDia = bloqueos.filter((b) => fecha >= b.fechaInicio && fecha <= b.fechaFin);
        const resDia = reservas.filter((r) => r.fecha === fecha && r.tipoReserva === 'ALUMNO' && ESTADOS_ACTIVOS.includes(r.estado));
        const cierreLab = bloqDia.filter((b) => b.motivo === 'ALMUERZO' || (b.tipo === 'TOTAL' && b.motivo !== 'MANTENIMIENTO'))
            .map((b) => intervalo(b.horaInicio, b.horaFin, ap, ci));
        for (const m of recursos) {
            const bloqMesa = bloqDia.filter((b) => {
                if (b.motivo === 'MANTENIMIENTO') return b.tipo === 'TOTAL' || (b.recursosAfectados || []).includes(m.id);
                if (b.tipo === 'PARCIAL') return (b.recursosAfectados || []).includes(m.id);
                return false;
            }).map((b) => intervalo(b.horaInicio, b.horaFin, ap, ci));
            const noDisp = [...cierreLab, ...bloqMesa];
            const resMesa = resDia.filter((r) => r.recursoId === m.id).map((r) => intervalo(r.horaInicio, r.horaFin, ap, ci));
            for (let h = hIni; h < hFin; h++) {
                const lo = Math.max(h * 60, ap), hi = Math.min((h + 1) * 60, ci);
                if (lo >= hi) continue;
                const k = `${dow}:${h}`;
                if (!acc[k]) acc[k] = { disp: 0, ocup: 0 };
                acc[k].disp += (hi - lo) - unionMin(noDisp, lo, hi);
                acc[k].ocup += unionMin(resMesa, lo, hi);
            }
        }
    }
    return Object.keys(acc).map((k) => {
        const [dow, hora] = k.split(':').map(Number);
        const { disp, ocup } = acc[k];
        return { dow, hora, ocupadas: ocup, disponibles: disp, pct: disp > 0 ? round((ocup * 100) / disp) : null };
    });
}

// ── Calculadora de meta: qué mover para llegar a un % objetivo ──
export interface SugerenciaMeta { objetivo: number; pctActual: number; mesasActuales: number; mesasNecesarias: number | null; factorUso: number | null; }
/**
 * Dado el uso y la capacidad NETA actuales (de calcularOcupacionPorMesa) y el n° de mesas activas,
 * calcula para un % objetivo: (a) con cuántas mesas se llegaría manteniendo el uso, y (b) cuántas
 * veces más reservas harían falta manteniendo las mesas. La capacidad se asume ~lineal en mesas.
 */
export function sugerenciaCapacidad(totalOcupadas: number, totalDisponibles: number, mesasActivas: number, objetivo: number): SugerenciaMeta {
    const pctActual = totalDisponibles > 0 ? round((totalOcupadas * 100) / totalDisponibles) : 0;
    if (totalDisponibles <= 0 || mesasActivas <= 0 || totalOcupadas <= 0) {
        return { objetivo, pctActual, mesasActuales: mesasActivas, mesasNecesarias: null, factorUso: null };
    }
    const target = objetivo / 100;
    const dispPorMesa = totalDisponibles / mesasActivas;
    const mesasNecesarias = Math.max(1, Math.ceil((totalOcupadas / target) / dispPorMesa));
    const factorUso = Math.round(((target * totalDisponibles) / totalOcupadas) * 10) / 10;
    return { objetivo, pctActual, mesasActuales: mesasActivas, mesasNecesarias, factorUso };
}

// Formatea minutos como "Xh Ymin" (ej. 117 → "1h 57min"; 480 → "8h"; 27 → "27 min"; 0 → "0 min").
const fmtHM = (minutos: number): string => {
    const min = Math.round(minutos);
    const h = Math.floor(min / 60), m = min % 60;
    if (h === 0) return `${m} min`;
    return m === 0 ? `${h}h` : `${h}h ${m}min`;
};

export default function OcupacionPage() {
    const [labId, setLabId] = useState<string>('');
    const [inicio, setInicio] = useState<string>(`${hoyLocal().slice(0, 7)}-01`);
    const [fin, setFin] = useState<string>(hoyLocal());

    const { data: labs } = useQuery({
        queryKey: ['labs-ocupacion'],
        queryFn: () => api.get('/laboratorios'),
        select: (res) => res.data.data as LabInfo[],
    });

    const labSel = labs?.find((l) => String(l.id) === labId) ?? labs?.[0];
    const labIdActivo = labSel?.id;

    const { data: recursos } = useQuery({
        queryKey: ['ocupacion-recursos', labIdActivo],
        queryFn: () => api.get(`/laboratorios/${labIdActivo}/recursos`),
        select: (res) => res.data.data as RecursoItem[],
        enabled: !!labIdActivo,
    });
    const { data: reservas } = useQuery({
        queryKey: ['ocupacion-reservas', labIdActivo],
        queryFn: () => api.get(`/reservas/laboratorio/${labIdActivo}`),
        select: (res) => res.data.data as ReservaItem[],
        enabled: !!labIdActivo,
    });
    const { data: bloqueos } = useQuery({
        queryKey: ['ocupacion-bloqueos', labIdActivo],
        queryFn: () => api.get(`/bloqueos/laboratorio/${labIdActivo}`),
        select: (res) => res.data.data as BloqueoItem[],
        enabled: !!labIdActivo,
    });
    // CIERRES institucionales (todo UTEC) — viven en las excepciones de los ciclos, no en bloqueos.
    const { data: cierres } = useQuery({
        queryKey: ['ocupacion-cierres'],
        queryFn: () => api.get('/ciclos'),
        select: (res) => (res.data.data as { excepciones?: { fechaInicio: string; fechaFin: string; tipo: string }[] }[])
            .flatMap((c) => c.excepciones ?? [])
            .filter((e) => e.tipo === 'CIERRE')
            .map((e) => ({ fechaInicio: e.fechaInicio, fechaFin: e.fechaFin })),
    });

    const resultado = useMemo(() => {
        if (!labSel || !recursos || !reservas || !bloqueos || inicio > fin) return null;
        return calcularOcupacionPorMesa(labSel, recursos, reservas, bloqueos, inicio, fin, cierres ?? []);
    }, [labSel, recursos, reservas, bloqueos, cierres, inicio, fin]);

    const heatmap = useMemo(() => {
        if (!labSel || !recursos || !reservas || !bloqueos || inicio > fin) return [];
        return calcularHeatmap(labSel, recursos, reservas, bloqueos, inicio, fin, cierres ?? []);
    }, [labSel, recursos, reservas, bloqueos, cierres, inicio, fin]);

    // Meta de ocupación: mesas activas (disponible > 0) y sugerencia para 40/50/60%.
    const mesasActivas = resultado ? resultado.perMesa.filter((m) => !m.sinDisponibilidad).length : 0;
    const sugerencias = useMemo(() => {
        if (!resultado) return [];
        return [40, 50, 60].map((obj) => sugerenciaCapacidad(resultado.totalOcupadas, resultado.totalDisponibles, mesasActivas, obj));
    }, [resultado, mesasActivas]);

    // Heatmap: ejes (días con datos, domingo al final) y color por intensidad de uso.
    const DOW_LABEL = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const heatDows = [...new Set(heatmap.map((c) => c.dow))].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
    const heatHoras = [...new Set(heatmap.map((c) => c.hora))].sort((a, b) => a - b);
    const heatCell = (d: number, h: number) => heatmap.find((c) => c.dow === d && c.hora === h);
    const heatColor = (pct: number | null) => pct === null ? '#f3f4f6' : `rgba(1,94,234,${0.06 + 0.85 * Math.min(pct, 100) / 100})`;

    const cumple = (resultado?.pct ?? 0) >= 60;
    const nivelColor = (n: number) => n >= 4 ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
        : n === 3 ? 'bg-amber-100 text-amber-800 border-amber-300'
            : n === 2 ? 'bg-orange-100 text-orange-800 border-orange-300'
                : 'bg-red-100 text-red-800 border-red-300';

    return (
        <div>
            <PageHeader
                title="Objetivo de Ocupación"
                subtitle="Uso por mesa según reservas de alumnos (sin asesorías ni eventos) — objetivo ≥ 60%"
            />

            {/* Controles */}
            <div className="card mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-utec-dark mb-1">Laboratorio</label>
                        <select value={String(labIdActivo ?? '')} onChange={(e) => setLabId(e.target.value)} className="input-field">
                            {labs?.map((l) => <option key={l.id} value={l.id}>{l.codigoLab} — {l.nombre}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-utec-dark mb-1">Desde</label>
                        <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="input-field" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-utec-dark mb-1">Hasta</label>
                        <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="input-field" />
                    </div>
                </div>
                {inicio > fin && <p className="text-xs text-red-600 mt-2">El rango es inválido: "Desde" es posterior a "Hasta".</p>}
            </div>

            {resultado && (
                <>
                    {/* Promedio del lab */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                        <div className={`card flex flex-col items-center justify-center text-center border-2 ${cumple ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200'}`}>
                            <p className="text-sm text-utec-gray-200 mb-1">Ocupación promedio por mesa</p>
                            <p className={`text-5xl font-display font-extrabold ${cumple ? 'text-emerald-600' : 'text-utec-dark'}`}>{resultado.pct}%</p>
                            <span className={`mt-3 px-3 py-1 rounded-full text-xs font-bold border ${nivelColor(resultado.nivel)}`}>{NIVEL_LABEL[resultado.nivel]}</span>
                            <p className="text-xs text-utec-gray-200 mt-2">Promedio de {resultado.perMesa.filter((m) => !m.sinDisponibilidad).length} mesa(s) activa(s){(() => { const r = resultado.perMesa.filter((m) => m.sinDisponibilidad).length; return r > 0 ? ` · ${r} retirada(s)/cerrada(s)` : ''; })()}{cumple && <span className="text-emerald-600"> · <CheckCircle2 size={12} className="inline align-[-1px]" /> objetivo cumplido</span>}</p>
                        </div>
                        <div className="lg:col-span-2 card">
                            <h2 className="font-display font-bold text-utec-dark mb-4">Desglose del rango</h2>
                            <div className="grid grid-cols-3 gap-4 text-center">
                                <div className="p-3 rounded-lg bg-gray-50">
                                    <p className="text-2xl font-bold text-utec-dark">{fmtHM(resultado.totalDisponibles)}</p>
                                    <p className="text-xs text-utec-gray-200">Disponibles (mesa·hora)</p>
                                </div>
                                <div className="p-3 rounded-lg bg-emerald-50">
                                    <p className="text-2xl font-bold text-emerald-700">{fmtHM(resultado.totalOcupadas)}</p>
                                    <p className="text-xs text-utec-gray-200">Ocupadas (mesa·hora)</p>
                                </div>
                                <div className="p-3 rounded-lg bg-amber-50">
                                    <p className="text-2xl font-bold text-amber-700">{fmtHM(Math.max(0, resultado.totalDisponibles - resultado.totalOcupadas))}</p>
                                    <p className="text-xs text-utec-gray-200">Libres (mesa·hora)</p>
                                </div>
                            </div>
                            {resultado.cerradoInstitucional > 0 && (
                                <div className="mt-4 flex items-center justify-between rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
                                    <p className="text-xs text-violet-800"><strong>Cerrado por cierre institucional</strong> (todo UTEC): no cuenta como disponible ni como libre.</p>
                                    <p className="text-lg font-bold text-violet-700 whitespace-nowrap ml-3">{fmtHM(resultado.cerradoInstitucional)}</p>
                                </div>
                            )}
                            <p className="text-xs text-utec-gray-200 mt-4">Disponible = horario del lab en sus días de atención, menos almuerzo, eventos totales, asesorías/eventos parciales y mantenimiento de cada mesa (no es tiempo usable por alumnos). Ocupada = mesa con reserva de alumno. Una mesa con 0 h disponibles todo el rango se marca como <strong>Retirada</strong> (sacada de servicio) o <strong>Sin disponibilidad</strong> (cerrada por mantenimiento/eventos) y NO entra en el promedio. Los días de <strong>cierre institucional</strong> (todo UTEC) se excluyen de "disponible" (el lab estuvo cerrado) y se muestran aparte.</p>
                            {resultado.perMesa.some((m) => m.pct > 100) && (
                                <p className="text-xs text-amber-700 mt-2"><AlertTriangle size={12} className="inline align-[-1px] mr-1" />Un % <strong>mayor a 100</strong> indica un <strong>cruce</strong>: hubo reservas de alumno durante un evento total (la franja estaba bloqueada pero igual se usó). Cuentan como ocupadas pero no como disponibles.</p>
                            )}
                        </div>
                    </div>

                    {/* Tabla por mesa */}
                    <div className="card mb-6">
                        <h2 className="font-display font-bold text-utec-dark mb-4">Ocupación por mesa <span className="text-sm font-normal text-utec-gray-200">— ordenadas de mayor a menor uso</span></h2>
                        {resultado.perMesa.length === 0 ? (
                            <p className="text-sm text-utec-gray-200 py-4 text-center">El laboratorio no tiene mesas/recursos.</p>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-utec-gray-200 border-b border-gray-200">
                                        <th className="py-2">Mesa</th><th className="py-2 text-right">Disponibles</th><th className="py-2 text-right">Ocupadas</th><th className="py-2 text-right">Ocupación</th><th className="py-2 text-center">Nivel</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {resultado.perMesa.map((m) => (
                                        <tr key={m.id} className={`border-b border-gray-100 ${m.sinDisponibilidad ? 'text-utec-gray-200' : ''}`}>
                                            <td className={`py-2 font-medium ${m.sinDisponibilidad ? 'text-utec-gray-200' : 'text-utec-dark'}`}>{m.nombre}</td>
                                            <td className="py-2 text-right">{m.sinDisponibilidad ? '—' : fmtHM(m.disponibles)}</td>
                                            <td className="py-2 text-right">{m.sinDisponibilidad ? '—' : fmtHM(m.ocupadas)}</td>
                                            {m.sinDisponibilidad ? (
                                                <>
                                                    <td className="py-2 text-right"><span className="px-2 py-0.5 rounded-full text-[11px] font-medium border bg-gray-100 text-gray-500 border-gray-300">{m.retirada ? 'Retirada' : 'Sin disponibilidad'}</span></td>
                                                    <td className="py-2 text-center text-gray-400">—</td>
                                                </>
                                            ) : (
                                                <>
                                                    <td className={`py-2 text-right font-bold ${m.pct >= 60 ? 'text-emerald-600' : 'text-utec-dark'}`}>{m.pct}%</td>
                                                    <td className="py-2 text-center"><span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${nivelColor(m.nivel)}`}>{m.nivel}</span></td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Calculadora de meta: qué mover para llegar al objetivo */}
                    {resultado.totalOcupadas > 0 && mesasActivas > 0 && (
                        <div className="card mb-6">
                            <h2 className="font-display font-bold text-utec-dark mb-1">¿Cómo llegar a la meta?</h2>
                            <p className="text-xs text-utec-gray-200 mb-3">Estás en <b>{sugerencias[0]?.pctActual ?? 0}%</b> con <b>{mesasActivas}</b> mesa(s) activa(s). Para cada meta hay dos caminos: operar con menos mesas <b>o</b> conseguir más reservas.</p>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-utec-gray-200 border-b border-gray-200">
                                        <th className="py-2">Meta</th><th className="py-2 text-center">Con menos mesas</th><th className="py-2 text-center">…o con más reservas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sugerencias.map((s) => (
                                        <tr key={s.objetivo} className="border-b border-gray-100">
                                            <td className="py-2 font-medium text-utec-dark">{s.objetivo}%</td>
                                            {s.pctActual >= s.objetivo ? (
                                                <td colSpan={2} className="py-2 text-center text-emerald-600 font-medium">✓ Ya lo cumples</td>
                                            ) : (
                                                <>
                                                    <td className="py-2 text-center">{s.mesasNecesarias} mesa(s) activa(s)</td>
                                                    <td className="py-2 text-center">{s.factorUso}× las reservas actuales</td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <p className="text-xs text-utec-gray-200 mt-3">Supone que la demanda se mantiene. Reducir mesas sube el % <b>solo si</b> la misma demanda se concentra en menos mesas (no si pierdes esas reservas). La estimación de mesas asume capacidad proporcional al n° de mesas.</p>
                        </div>
                    )}

                    {/* Heatmap: ocupación por día × hora (dónde promover) */}
                    {heatmap.length > 0 && (
                        <div className="card mb-6">
                            <h2 className="font-display font-bold text-utec-dark mb-1">¿Cuándo se usa el lab? <span className="text-sm font-normal text-utec-gray-200">— ocupación por día y hora</span></h2>
                            <p className="text-xs text-utec-gray-200 mb-3">Cada celda es el <b>% de ocupación</b> de esa franja en el rango. Las celdas <b>más claras</b> son las <b>franjas muertas</b>: ahí hay cupo desaprovechado (candidatas a promover o a consolidar).</p>
                            <div className="overflow-x-auto">
                                <table className="text-xs border-collapse">
                                    <thead>
                                        <tr>
                                            <th className="p-1 text-utec-gray-200 font-normal text-right pr-2">Hora</th>
                                            {heatDows.map((d) => <th key={d} className="p-1 text-utec-gray-200 font-medium text-center min-w-[52px]">{DOW_LABEL[d]}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {heatHoras.map((h) => (
                                            <tr key={h}>
                                                <td className="p-1 text-utec-gray-200 text-right pr-2 whitespace-nowrap">{String(h).padStart(2, '0')}–{String(h + 1).padStart(2, '0')}</td>
                                                {heatDows.map((d) => {
                                                    const c = heatCell(d, h);
                                                    const pct = c?.pct ?? null;
                                                    return (
                                                        <td key={d} className="p-0.5">
                                                            <div className="rounded text-center py-1 font-medium" title={c ? `${DOW_LABEL[d]} ${h}:00 · ${pct ?? 0}%` : 'sin atención'}
                                                                style={{ background: heatColor(pct), color: (pct ?? 0) >= 55 ? '#fff' : '#231F20' }}>
                                                                {pct === null ? '—' : `${pct}%`}
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Cómo se calcula */}
            <details className="card text-sm text-utec-dark">
                <summary className="cursor-pointer font-display font-bold text-utec-dark">¿Cómo se calcula?</summary>
                <div className="mt-3 space-y-2 text-utec-gray-200">
                    <p><strong className="text-utec-dark">Ocupación de una mesa = minutos ocupados ÷ minutos disponibles</strong> (tiempo real acumulado, no por franjas), sobre el rango elegido.</p>
                    <p><strong className="text-utec-dark">Disponible (por mesa):</strong> el horario del lab en sus días de atención, descontando <strong>almuerzo</strong> (de su franja real ese día), <strong>eventos totales</strong>, las <strong>asesorías/eventos parciales</strong> y el <strong>mantenimiento</strong> de esa mesa (no es tiempo usable por un alumno).</p>
                    <p><strong className="text-utec-dark">Ocupada:</strong> franja disponible con una <strong>reserva de alumno</strong> activa en esa mesa. Si una mesa queda con <strong>0 h disponibles</strong> todo el rango se marca como <strong>Retirada</strong> (sacada de servicio con un RETIRO) o <strong>Sin disponibilidad</strong> (cerrada por mantenimiento/eventos) y <strong>no entra en el promedio</strong> — ya no se toma como 100%.</p>
                    <p><strong className="text-utec-dark">Cierre institucional:</strong> los días en que <strong>todo UTEC</strong> está cerrado (gestionados en Ciclos) se <strong>excluyen</strong> del cálculo — no son horas disponibles ni ociosas. Se reportan aparte en el desglose.</p>
                    <p><strong className="text-utec-dark">Promedio del lab</strong> = suma de horas ocupadas ÷ suma de horas disponibles de todas las mesas.</p>
                    <p><strong className="text-utec-dark">Niveles:</strong> &lt;40% = 1 · 40–50% = 2 · 50–60% = 3 · ≥60% = 4 (objetivo).</p>
                </div>
            </details>
        </div>
    );
}

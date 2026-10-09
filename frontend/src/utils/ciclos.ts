// Utilidades de ciclos académicos (ciclos_academicos, endpoint /ciclos). Un solo origen para
// derivar el ciclo actual y sus etiquetas, usado por el dashboard, cursos y calendario.
export interface CicloCfg { codigo: string; anio: number; ciclo: number; fechaInicio: string; fechaFin: string; }

/**
 * Código "YYYY-C" del ciclo vigente según SOLO la fecha (0=Ene–Feb · 1=Mar–Jul · 2=Ago–Dic).
 * Sirve como valor por defecto SÍNCRONO (constante de módulo) cuando aún no se cargó /ciclos;
 * las fechas exactas de cada ciclo salen luego de la BD (configurables en Ciclos académicos).
 */
export function cicloVigentePorFecha(d = new Date()): string {
    const m = d.getMonth() + 1; // 1–12
    const c = m <= 2 ? 0 : m <= 7 ? 1 : 2;
    return `${d.getFullYear()}-${c}`;
}

/**
 * Código "YYYY-C" del ciclo académico ACTUAL: el que contiene HOY, o —si estamos en un hueco
 * (vacaciones/exámenes fuera del rango de clases)— el más reciente ya iniciado.
 */
export function cicloActualDe(ciclos: CicloCfg[] | undefined, fallback = cicloVigentePorFecha()): string {
    const hoy = new Date().toISOString().slice(0, 10);
    const cs = ciclos ?? [];
    const dentro = cs.find((c) => hoy >= c.fechaInicio && hoy <= c.fechaFin);
    if (dentro) return dentro.codigo;
    return [...cs].filter((c) => c.fechaInicio <= hoy)
        .sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio))[0]?.codigo ?? fallback;
}

const RANGO_LABEL: Record<string, string> = { '0': 'Ene–Feb', '1': 'Mar–Jul', '2': 'Ago–Dic' };
/** Etiqueta legible de un código de ciclo, p. ej. "2026-1 (Mar–Jul)". */
export function etiquetaCiclo(codigo: string): string {
    const c = codigo.split('-')[1];
    return `${codigo}${RANGO_LABEL[c] ? ` (${RANGO_LABEL[c]})` : ''}`;
}

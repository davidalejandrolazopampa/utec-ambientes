/**
 * Fecha de HOY en formato YYYY-MM-DD usando la hora **LOCAL** (no UTC).
 *
 * Evita el bug de `new Date().toISOString().split('T')[0]`, que devuelve la fecha
 * en UTC: de noche, en zonas con offset negativo (Lima = UTC-5), ya marca el día
 * siguiente. Eso descuadraba la categorización Hoy/Programados/Pasados de bloqueos
 * y los valores por defecto / `min` de los selectores de fecha.
 */
export const hoyLocal = (): string => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Nombres de día en español, alineados con los que guarda el backend en diasAtencion.
const DIAS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Nombre del día (en español) de una fecha YYYY-MM-DD, interpretada en hora local. */
export const nombreDiaEs = (fecha: string): string => {
    if (!fecha) return '';
    // 'T00:00:00' fuerza hora local (evita el corrimiento de día por UTC).
    return DIAS_ES[new Date(fecha + 'T00:00:00').getDay()] ?? '';
};

/** ¿El laboratorio atiende ese día? Sin diasAtencion configurado → atiende todos. */
export const labAtiende = (fecha: string, diasAtencion?: string[]): boolean => {
    if (!fecha || !diasAtencion || diasAtencion.length === 0) return true;
    return diasAtencion.includes(nombreDiaEs(fecha));
};

/**
 * ¿El lab ya CERRÓ hoy? = la hora local actual ya pasó `horaCierre`.
 * Solo mira la hora (no el día): úsalo junto con labAtiende. Sirve para que, pasado el
 * cierre, un día que sí atiende no siga mostrándose como "disponible".
 */
export const labYaCerroHoy = (horaCierre?: string): boolean => {
    if (!horaCierre) return false;
    const [h, m] = horaCierre.split(':').map(Number);
    if (Number.isNaN(h)) return false;
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
};

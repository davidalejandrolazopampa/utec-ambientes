// Paleta ÚNICA de los calendarios de la app (Calendario /aulas — clases, eventos y reservas).
// Tener un solo origen garantiza la misma sincronía visual (UX) en todas las vistas: un
// mantenimiento se ve igual en el calendario del lab y en el calendario del alumno.
export const COLOR = {
    reserva: '#f97316',        // naranja — reserva de alumno
    checkin: '#dc2626',        // rojo — check-in hecho (En curso)
    completada: '#16a34a',     // verde — reserva completada
    cancelada: '#cbd5e1',      // gris claro — cancelada / no-show
    eventoTotal: '#7c3aed',    // violeta — evento que toma todo el lab
    eventoParcial: '#0d9488',  // teal — evento parcial (solo algunos recursos)
    mantenimiento: '#64748b',  // slate — mantenimiento
    almuerzo: '#a8a29e',       // beige — almuerzo
    feriado: '#fb7185',        // rosa (rose-400) — feriado; se muestra como MARCA/sombreado de día (no bloque), igual en ambos calendarios
    examen: '#f59e0b',         // ámbar — semana de exámenes (día sin clases), igual que AulasPage
    clase: '#2563eb',          // azul (blue-600) — clase del horario; distinto del violeta de evento total
} as const;

/**
 * Color de un bloqueo/evento según su motivo y tipo (TOTAL/PARCIAL). Misma lógica que usa
 * el Calendario, para que el color sea idéntico en toda la app. Los motivos operativos
 * (mantenimiento/almuerzo/feriado) tienen su color; el resto (EVENTO/ASESORIA/REUNION…) se
 * pinta según ocupe todo el lab (violeta) o solo parte (teal).
 */
export function colorBloqueo(motivo?: string, tipo?: string): string {
    if (motivo === 'MANTENIMIENTO') return COLOR.mantenimiento;
    if (motivo === 'ALMUERZO') return COLOR.almuerzo;
    if (motivo === 'FERIADO') return COLOR.feriado;
    return tipo === 'TOTAL' ? COLOR.eventoTotal : COLOR.eventoParcial;
}

// Paleta de EVENTOS "por actividad": tonos morado/magenta/rosa (leen como "evento") pero cada
// uno distinto, para que el alumno ubique cada actividad. Son 10 colores diferenciables.
export const EVENTO_PALETA = [
    '#7c3aed', '#9333ea', '#a21caf', '#c026d3', '#db2777',
    '#be185d', '#6d28d9', '#7e22ce', '#86198f', '#d6249f',
] as const;

function hashStr(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
}

/**
 * Color de un evento POR ACTIVIDAD: los operativos (mantenimiento/almuerzo/feriado) conservan su
 * color fijo; el resto (EVENTO/ASESORIA/REUNION…) toma un color de {@link EVENTO_PALETA} según su
 * título → la misma actividad siempre el mismo color, actividades distintas colores distintos.
 * Así se evita el "muro morado" cuando hay muchos eventos totales.
 */
export function colorEvento(motivo?: string, tipo?: string, titulo?: string): string {
    if (motivo === 'MANTENIMIENTO') return COLOR.mantenimiento;
    if (motivo === 'ALMUERZO') return COLOR.almuerzo;
    if (motivo === 'FERIADO') return COLOR.feriado;
    const clave = (titulo || motivo || '').trim().toLowerCase();
    return EVENTO_PALETA[hashStr(clave) % EVENTO_PALETA.length];
}

// ── Estilo "suave" de los bloques del calendario ──────────────────────────────
// Los bloques (clase/evento/reserva) se pintan con FONDO CLARO + barra lateral de color +
// texto oscuro (estilo Google/Notion Calendar), en vez de relleno saturado con texto blanco.
// Así el calendario "pega" menos (azul/violeta menos intensos) sin perder identidad de color.
function hexRgb(hex: string): { r: number; g: number; b: number } {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
/** Aclara un color mezclándolo con blanco (amt=0.86 → ~14% del color). Fondo suave. */
export function aclarar(hex: string, amt = 0.86): string {
    const { r, g, b } = hexRgb(hex);
    const m = (c: number) => Math.round(c + (255 - c) * amt);
    return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
}
/** Oscurece un color mezclándolo con negro (amt=0.5). Texto legible sobre el fondo suave. */
export function oscurecer(hex: string, amt = 0.5): string {
    const { r, g, b } = hexRgb(hex);
    const m = (c: number) => Math.round(c * (1 - amt));
    return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
}
/** Estilo suave de un bloque: fondo claro + barra lateral de color + texto oscuro (mismo color). */
export function estiloBloque(color: string): { background: string; borderLeft: string; color: string } {
    return { background: aclarar(color), borderLeft: `3px solid ${color}`, color: oscurecer(color) };
}

/** Etiqueta legible del motivo/tipo, para leyendas y tooltips consistentes. */
export function etiquetaBloqueo(motivo?: string, tipo?: string): string {
    if (motivo === 'MANTENIMIENTO') return 'Mantenimiento';
    if (motivo === 'ALMUERZO') return 'Almuerzo';
    if (motivo === 'FERIADO') return 'Feriado';
    if (motivo === 'ASESORIA') return 'Asesoría';
    if (motivo === 'REUNION') return 'Reunión';
    return tipo === 'TOTAL' ? 'Evento (todo el lab)' : 'Evento (parcial)';
}

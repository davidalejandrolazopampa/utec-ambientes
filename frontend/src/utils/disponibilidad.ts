// Lógica compartida de disponibilidad de horas/mesas para crear y editar bloqueos.
// Antes estaba DUPLICADA en CrearBloqueoPage (bloqueo nuevo) y en el editor de
// BloqueosPage (que además excluye el propio bloqueo que se edita). Se unifica aquí
// como funciones puras y testeables; la única diferencia se parametriza con
// `excludeBloqueoId`.

export interface SlotReserva {
    fecha: string; estado: string; recursoId: number; horaInicio?: string; horaFin?: string;
}
export interface SlotBloqueo {
    id?: number; tipo: string; fechaInicio: string; fechaFin: string;
    horaInicio?: string; horaFin?: string; recursosAfectados?: number[];
    motivo?: string;
}

// Un RETIRO (mesas fuera físicamente por un periodo) es una REDUCCIÓN DE CAPACIDAD,
// no un ocupante que reserva horario: NO compite con los eventos/bloqueos que se crean
// (igual que el backend, BloqueoService.validarBloqueosSolapados lo salta). Como es un
// parcial de TODO EL DÍA, si no se excluyera marcaría toda la franja como ocupada y no
// dejaría crear un TOTAL ni elegir horas. Su efecto (mesa no reservable por el alumno)
// vive en la cuadrícula de reserva del lab, no aquí.
const esRetiro = (b: SlotBloqueo) => (b.motivo ?? '').toUpperCase() === 'RETIRO';

// El ALMUERZO es el bloqueo de MÁS BAJA PRIORIDAD: un evento TOTAL nuevo que cae encima
// lo REEMPLAZA en el backend (BloqueoService.liberarAlmuerzosSolapados) en vez de rechazarlo.
// Por eso, al armar un TOTAL (menos otro ALMUERZO), no debe contar como ocupante — si no,
// el tope de duración se detendría en el almuerzo y nunca dejaría crear un evento que lo cruce
// (ni, por tanto, "eliminar" el almuerzo). En PARCIAL sí cuenta (el backend no lo borra).
const esAlmuerzo = (b: SlotBloqueo) => (b.motivo ?? '').toUpperCase() === 'ALMUERZO';

/** Contexto de disponibilidad para una fecha (reservas + bloqueos del lab). */
export interface DispCtx {
    fecha: string;
    reservas?: SlotReserva[];
    bloqueos?: SlotBloqueo[];
    /** Al editar, se ignora el bloqueo con este id (no debe chocar consigo mismo). */
    excludeBloqueoId?: number;
}

const ESTADOS_ACTIVOS = ['PENDIENTE', 'CONFIRMADA', 'EN_CURSO'];
const hhmm = (t?: string) => (t ?? '').slice(0, 5);

/** Malla de la ventana institucional 07:00–23:00 (misma que usan crear y editar). */
export const generarHorasMalla = (): string[] => {
    const horas: string[] = [];
    for (let h = 7; h <= 22; h++) {
        horas.push(`${String(h).padStart(2, '0')}:00`);
        horas.push(`${String(h).padStart(2, '0')}:30`);
    }
    horas.push('23:00');
    return horas;
};

/** ¿La franja `hora` está ocupada en UNA mesa concreta (reserva activa o bloqueo) esa fecha? */
export function mesaOcupada(ctx: DispCtx, recursoId: number, hora: string): boolean {
    const { fecha, reservas, bloqueos, excludeBloqueoId } = ctx;
    const reservaConf = (reservas ?? []).some((r) =>
        r.fecha === fecha && ESTADOS_ACTIVOS.includes(r.estado) && r.recursoId === recursoId
        && hora >= hhmm(r.horaInicio) && hora < hhmm(r.horaFin));
    if (reservaConf) return true;
    return (bloqueos ?? []).some((b) => {
        if (excludeBloqueoId != null && b.id === excludeBloqueoId) return false;
        if (esRetiro(b)) return false; // el retiro no compite con eventos (ver nota arriba)
        if (fecha < b.fechaInicio || fecha > b.fechaFin) return false;
        if (b.tipo === 'PARCIAL' && !(b.recursosAfectados || []).includes(recursoId)) return false;
        const ini = hhmm(b.horaInicio), fin = hhmm(b.horaFin);
        if (!ini || !fin) return true; // bloqueo de todo el día
        return hora >= ini && hora < fin;
    });
}

/**
 * ¿La franja `hora` está ocupada a nivel del bloqueo que se arma? PARCIAL con mesas
 * elegidas → solo esas mesas; TOTAL (o PARCIAL aún sin mesas) → todo el laboratorio.
 */
export function laboratorioOcupado(ctx: DispCtx, hora: string, tipo: string, recursosIds: number[], motivoNuevo?: string): boolean {
    if (tipo === 'PARCIAL' && recursosIds.length > 0) {
        return recursosIds.some((id) => mesaOcupada(ctx, id, hora));
    }
    const { fecha, reservas, bloqueos, excludeBloqueoId } = ctx;
    // Un evento TOTAL nuevo reemplaza al almuerzo → no lo tratamos como ocupante (ver esAlmuerzo).
    const reemplazaAlmuerzo = tipo === 'TOTAL' && (motivoNuevo ?? '').toUpperCase() !== 'ALMUERZO';
    const reservaConf = (reservas ?? []).some((r) =>
        r.fecha === fecha && ESTADOS_ACTIVOS.includes(r.estado)
        && hora >= hhmm(r.horaInicio) && hora < hhmm(r.horaFin));
    if (reservaConf) return true;
    return (bloqueos ?? []).some((b) => {
        if (excludeBloqueoId != null && b.id === excludeBloqueoId) return false;
        if (esRetiro(b)) return false; // el retiro no compite con eventos (ver nota arriba)
        if (reemplazaAlmuerzo && esAlmuerzo(b)) return false; // el TOTAL lo reemplaza en el backend
        if (fecha < b.fechaInicio || fecha > b.fechaFin) return false;
        const ini = hhmm(b.horaInicio), fin = hhmm(b.horaFin);
        if (!ini || !fin) return true; // bloqueo de todo el día
        return hora >= ini && hora < fin;
    });
}

/** Franjas libres/totales de una mesa en la fecha (para la barra de ocupación). */
export function slotsLibresMesa(ctx: DispCtx, recursoId: number): { libres: number; total: number } {
    const horas = generarHorasMalla();
    const ocup = horas.filter((h) => mesaOcupada(ctx, recursoId, h)).length;
    return { libres: horas.length - ocup, total: horas.length };
}

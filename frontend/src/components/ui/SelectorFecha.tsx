import { CalendarDays } from 'lucide-react';
import { hoyLocal } from '@/utils/fecha';

// getDay(): 0=Domingo..6=Sábado. Nombres alineados con diasAtencion del backend.
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Fecha (YYYY-MM-DD, hora local) sumando n días a hoy.
const fechaConOffset = (n: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const diaDe = (fecha: string): string => DIAS[new Date(`${fecha}T00:00:00`).getDay()];

// "Domingo, 15 de junio de 2026" a partir de "2026-06-15".
export const formatoFechaLarga = (fecha: string): string => {
    if (!fecha) return '';
    const s = new Date(`${fecha}T00:00:00`).toLocaleDateString('es-PE', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    return s.charAt(0).toUpperCase() + s.slice(1);
};

interface Props {
    value: string;
    onChange: (fecha: string) => void;
    /** Fecha mínima seleccionable (por defecto, hoy). */
    min?: string;
    /** Anticipación máxima en días (chips y `max` del input). Por defecto sin límite (3 chips). */
    maxOffsetDias?: number;
    /** Solo permite estos días (nombres ES de diasAtencion); filtra chips y el input nativo. */
    diasPermitidos?: string[];
    /** Oculta el calendario nativo y deja solo los chips (p. ej. reserva de alumno). */
    ocultarInput?: boolean;
}

/**
 * Selector de fecha amigable: chips rápidos (Hoy / Mañana / …) + el input nativo,
 * y debajo la fecha escrita en español.
 *
 * Para reservas de alumno se pasa `maxOffsetDias` (anticipación, p. ej. 1) y
 * `diasPermitidos` (diasAtencion del lab): así solo aparecen días reservables
 * (ej.: viernes → solo "Hoy"; sábado → ninguno; domingo → solo "Mañana").
 */
export default function SelectorFecha({ value, onChange, min = hoyLocal(), maxOffsetDias, diasPermitidos, ocultarInput }: Props) {
    const tope = maxOffsetDias ?? 2;
    const filtra = !!diasPermitidos && diasPermitidos.length > 0;

    const chips: { label: string; fecha: string }[] = [];
    for (let n = 0; n <= tope; n++) {
        const fecha = fechaConOffset(n);
        if (filtra && !diasPermitidos!.includes(diaDe(fecha))) continue;
        const label = n === 0 ? 'Hoy' : n === 1 ? 'Mañana' : n === 2 ? 'Pasado' : diaDe(fecha);
        chips.push({ label, fecha });
    }

    const max = maxOffsetDias != null ? fechaConOffset(maxOffsetDias) : undefined;

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                {chips.map((c) => (
                    <button
                        key={c.fecha}
                        type="button"
                        onClick={() => onChange(c.fecha)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            value === c.fecha
                                ? 'bg-utec-cyan text-white border-utec-cyan'
                                : 'bg-white text-utec-dark border-gray-200 hover:border-utec-cyan'
                        }`}
                    >
                        {c.label}
                    </button>
                ))}
                {!ocultarInput && (
                    <input
                        type="date"
                        value={value}
                        min={min}
                        max={max}
                        onChange={(e) => onChange(e.target.value)}
                        className="input-field text-sm w-auto"
                        aria-label="Elegir otra fecha"
                    />
                )}
            </div>
            {filtra && chips.length === 0 && (
                <p className="text-xs text-amber-600">No hay días disponibles para reservar en el rango permitido.</p>
            )}
            {value && <p className="text-xs text-utec-gray-200"><CalendarDays size={12} className="inline align-[-1px] mr-1" />{formatoFechaLarga(value)}</p>}
        </div>
    );
}

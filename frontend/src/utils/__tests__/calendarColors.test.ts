import { describe, it, expect } from 'vitest';
import { colorEvento, colorBloqueo, etiquetaBloqueo, COLOR, EVENTO_PALETA, aclarar, oscurecer, estiloBloque } from '../calendarColors';

describe('calendarColors', () => {
    it('colorEvento: los operativos conservan su color fijo', () => {
        expect(colorEvento('MANTENIMIENTO')).toBe(COLOR.mantenimiento);
        expect(colorEvento('ALMUERZO')).toBe(COLOR.almuerzo);
        expect(colorEvento('FERIADO')).toBe(COLOR.feriado);
    });

    it('colorEvento: color por actividad — misma actividad siempre el mismo color, de la paleta', () => {
        const c1 = colorEvento('EVENTO', 'TOTAL', 'Hackathon');
        expect(colorEvento('EVENTO', 'TOTAL', 'Hackathon')).toBe(c1); // determinista
        expect(EVENTO_PALETA as readonly string[]).toContain(c1);
        // otra actividad también resuelve a un color de la paleta
        expect(EVENTO_PALETA as readonly string[]).toContain(colorEvento('ASESORIA', 'PARCIAL', 'DGA Reunión'));
        // sin título cae al motivo (sigue en la paleta, no rompe)
        expect(EVENTO_PALETA as readonly string[]).toContain(colorEvento('REUNION'));
    });

    it('colorBloqueo: total violeta, parcial teal, operativos fijos', () => {
        expect(colorBloqueo('EVENTO', 'TOTAL')).toBe(COLOR.eventoTotal);
        expect(colorBloqueo('EVENTO', 'PARCIAL')).toBe(COLOR.eventoParcial);
        expect(colorBloqueo('MANTENIMIENTO')).toBe(COLOR.mantenimiento);
        expect(colorBloqueo('ALMUERZO')).toBe(COLOR.almuerzo);
        expect(colorBloqueo('FERIADO')).toBe(COLOR.feriado);
    });

    it('etiquetaBloqueo: rótulos legibles por motivo/tipo', () => {
        expect(etiquetaBloqueo('MANTENIMIENTO')).toBe('Mantenimiento');
        expect(etiquetaBloqueo('ALMUERZO')).toBe('Almuerzo');
        expect(etiquetaBloqueo('FERIADO')).toBe('Feriado');
        expect(etiquetaBloqueo('ASESORIA')).toBe('Asesoría');
        expect(etiquetaBloqueo('REUNION')).toBe('Reunión');
        expect(etiquetaBloqueo('EVENTO', 'TOTAL')).toMatch(/todo el lab/);
        expect(etiquetaBloqueo('EVENTO', 'PARCIAL')).toMatch(/parcial/i);
    });

    it('estilo suave: aclarar acerca a blanco, oscurecer acerca a negro, estiloBloque compone los 3', () => {
        // aclarar #000000 al 86% → gris muy claro (cada canal ≈ 219)
        expect(aclarar('#000000', 0.86)).toBe('rgb(219, 219, 219)');
        // oscurecer #ffffff al 50% → gris medio (cada canal ≈ 128)
        expect(oscurecer('#ffffff', 0.5)).toBe('rgb(128, 128, 128)');
        const s = estiloBloque(COLOR.clase); // azul #2563eb
        expect(s.borderLeft).toBe(`3px solid ${COLOR.clase}`); // barra lateral = color puro
        expect(s.background).toMatch(/^rgb\(/);                 // fondo claro
        expect(s.color).toMatch(/^rgb\(/);                     // texto oscuro
        expect(s.background).not.toBe(s.color);                // fondo y texto distintos
    });
});

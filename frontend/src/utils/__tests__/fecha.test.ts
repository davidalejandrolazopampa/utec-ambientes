import { describe, it, expect, afterEach, vi } from 'vitest';
import { labAtiende, labYaCerroHoy } from '../fecha';

describe('labAtiende', () => {
    it('sin diasAtencion configurado atiende cualquier día', () => {
        expect(labAtiende('2026-07-20', undefined)).toBe(true);
        expect(labAtiende('2026-07-20', [])).toBe(true);
    });
    it('respeta los días configurados (2026-07-20 es lunes)', () => {
        expect(labAtiende('2026-07-20', ['Lunes', 'Martes'])).toBe(true);
        expect(labAtiende('2026-07-20', ['Sábado', 'Domingo'])).toBe(false);
    });
});

describe('labYaCerroHoy', () => {
    afterEach(() => vi.useRealTimers());

    it('true si la hora local actual ya pasó la hora de cierre', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 6, 20, 19, 0, 0)); // 19:00 local
        expect(labYaCerroHoy('18:00')).toBe(true);   // cerró a las 18, son las 19
        expect(labYaCerroHoy('19:00')).toBe(true);   // borde: 19:00 >= 19:00
        expect(labYaCerroHoy('20:00')).toBe(false);  // aún abierto
    });

    it('false antes del cierre y cuando no hay horaCierre', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 6, 20, 10, 30, 0)); // 10:30 local
        expect(labYaCerroHoy('18:00')).toBe(false);
        expect(labYaCerroHoy(undefined)).toBe(false);
        expect(labYaCerroHoy('')).toBe(false);
    });
});

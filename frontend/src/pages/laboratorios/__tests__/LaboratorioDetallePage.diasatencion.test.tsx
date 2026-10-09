import { describe, it, expect } from 'vitest';
import { labAtiende, nombreDiaEs } from '../LaboratorioDetallePage';

describe('labAtiende / nombreDiaEs (día de atención del lab)', () => {
    it('nombreDiaEs mapea la fecha al día en español (hora local, sin corrimiento UTC)', () => {
        expect(nombreDiaEs('2026-06-14')).toBe('Domingo'); // 14-jun-2026 = domingo
        expect(nombreDiaEs('2026-06-15')).toBe('Lunes');
        expect(nombreDiaEs('2026-06-20')).toBe('Sábado');
    });

    it('sin diasAtencion configurado, atiende todos los días', () => {
        expect(labAtiende('2026-06-14', undefined)).toBe(true);
        expect(labAtiende('2026-06-14', [])).toBe(true);
    });

    it('un lab Lunes–Viernes NO atiende sábado ni domingo, sí entre semana', () => {
        const lunesAViernes = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
        expect(labAtiende('2026-06-15', lunesAViernes)).toBe(true);  // lunes
        expect(labAtiende('2026-06-19', lunesAViernes)).toBe(true);  // viernes
        expect(labAtiende('2026-06-20', lunesAViernes)).toBe(false); // sábado
        expect(labAtiende('2026-06-14', lunesAViernes)).toBe(false); // domingo
    });
});

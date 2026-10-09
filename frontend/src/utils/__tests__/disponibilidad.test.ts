import { describe, it, expect } from 'vitest';
import { generarHorasMalla, mesaOcupada, laboratorioOcupado, slotsLibresMesa, type DispCtx } from '../disponibilidad';

const FECHA = '2026-07-10';

const reservas = [
    { fecha: FECHA, estado: 'CONFIRMADA', recursoId: 1, horaInicio: '09:00:00', horaFin: '10:00:00' },
    { fecha: FECHA, estado: 'CANCELADA', recursoId: 2, horaInicio: '09:00:00', horaFin: '10:00:00' }, // no cuenta
    { fecha: '2026-07-11', estado: 'CONFIRMADA', recursoId: 1, horaInicio: '09:00:00', horaFin: '10:00:00' }, // otra fecha
];
const bloqueos = [
    { id: 50, tipo: 'PARCIAL', fechaInicio: FECHA, fechaFin: FECHA, horaInicio: '12:00:00', horaFin: '13:00:00', recursosAfectados: [3] },
    { id: 51, tipo: 'TOTAL', fechaInicio: FECHA, fechaFin: FECHA }, // todo el día, todo el lab
];

describe('disponibilidad', () => {
    it('generarHorasMalla cubre 07:00–23:00 cada 30 min', () => {
        const h = generarHorasMalla();
        expect(h[0]).toBe('07:00');
        expect(h).toContain('12:30');
        expect(h[h.length - 1]).toBe('23:00');
        expect(h).toHaveLength(33); // 16h*2 + 1
    });

    it('mesaOcupada detecta reserva activa solo en su mesa/fecha/franja', () => {
        const ctx: DispCtx = { fecha: FECHA, reservas, bloqueos: [] };
        expect(mesaOcupada(ctx, 1, '09:00')).toBe(true);
        expect(mesaOcupada(ctx, 1, '10:00')).toBe(false); // borde: fin exclusivo
        expect(mesaOcupada(ctx, 2, '09:00')).toBe(false); // reserva CANCELADA no cuenta
        expect(mesaOcupada(ctx, 1, '08:00')).toBe(false);
    });

    it('bloqueo PARCIAL solo ocupa sus mesas; TOTAL ocupa todas', () => {
        const ctxParcial: DispCtx = { fecha: FECHA, bloqueos: [bloqueos[0]] };
        expect(mesaOcupada(ctxParcial, 3, '12:00')).toBe(true);
        expect(mesaOcupada(ctxParcial, 4, '12:00')).toBe(false);
        const ctxTotal: DispCtx = { fecha: FECHA, bloqueos: [bloqueos[1]] };
        expect(mesaOcupada(ctxTotal, 99, '07:00')).toBe(true); // bloqueo total de todo el día
    });

    it('excludeBloqueoId ignora el bloqueo que se edita', () => {
        const ctx: DispCtx = { fecha: FECHA, bloqueos: [bloqueos[1]], excludeBloqueoId: 51 };
        expect(mesaOcupada(ctx, 1, '09:00')).toBe(false);
        expect(laboratorioOcupado(ctx, '09:00', 'TOTAL', [])).toBe(false);
    });

    it('laboratorioOcupado: PARCIAL con mesas mira solo esas; TOTAL mira todo el lab', () => {
        const ctx: DispCtx = { fecha: FECHA, reservas, bloqueos: [bloqueos[0]] };
        // PARCIAL con mesa 4 (libre) → no ocupado; con mesa 3 (bloqueada 12–13) → ocupado a las 12
        expect(laboratorioOcupado(ctx, '12:00', 'PARCIAL', [4])).toBe(false);
        expect(laboratorioOcupado(ctx, '12:00', 'PARCIAL', [3])).toBe(true);
        // TOTAL mira todo el lab: la reserva de la mesa 1 a las 09:00 ocupa
        expect(laboratorioOcupado(ctx, '09:00', 'TOTAL', [])).toBe(true);
    });

    it('un RETIRO (todo el día) NO ocupa: no compite con eventos, deja crear TOTAL', () => {
        const retiro = { id: 60, tipo: 'PARCIAL', motivo: 'RETIRO', fechaInicio: FECHA, fechaFin: FECHA, recursosAfectados: [5] };
        const ctx: DispCtx = { fecha: FECHA, bloqueos: [retiro] };
        // La mesa retirada NO se marca ocupada para un bloqueo/evento
        expect(mesaOcupada(ctx, 5, '10:00')).toBe(false);
        // Un TOTAL puede crearse en cualquier hora pese al retiro vigente
        expect(laboratorioOcupado(ctx, '10:00', 'TOTAL', [])).toBe(false);
        expect(laboratorioOcupado(ctx, '14:00', 'TOTAL', [])).toBe(false);
    });

    it('un ALMUERZO NO ocupa para un evento TOTAL (lo reemplaza el backend), pero sí para otro ALMUERZO', () => {
        const almuerzo = { id: 70, tipo: 'TOTAL', motivo: 'ALMUERZO', fechaInicio: FECHA, fechaFin: FECHA, horaInicio: '13:00', horaFin: '14:00' };
        const ctx: DispCtx = { fecha: FECHA, bloqueos: [almuerzo] };
        // Un evento TOTAL puede cruzar el almuerzo → no lo cuenta como ocupante
        expect(laboratorioOcupado(ctx, '13:00', 'TOTAL', [], 'EVENTO')).toBe(false);
        // Sin motivo asumimos evento (comportamiento por defecto de crear TOTAL)
        expect(laboratorioOcupado(ctx, '13:00', 'TOTAL', [])).toBe(false);
        // Pero crear OTRO almuerzo sí choca con el existente (el backend no lo reemplaza)
        expect(laboratorioOcupado(ctx, '13:00', 'TOTAL', [], 'ALMUERZO')).toBe(true);
        // Un PARCIAL tampoco lo reemplaza: la mesa sigue ocupada por el almuerzo (total)
        expect(mesaOcupada(ctx, 1, '13:00')).toBe(true);
    });

    it('slotsLibresMesa cuenta franjas libres de la malla', () => {
        const ctx: DispCtx = { fecha: FECHA, reservas, bloqueos: [] };
        const { libres, total } = slotsLibresMesa(ctx, 1);
        expect(total).toBe(33);
        expect(libres).toBe(31); // 09:00 y 09:30 ocupadas por la reserva 09–10
    });
});

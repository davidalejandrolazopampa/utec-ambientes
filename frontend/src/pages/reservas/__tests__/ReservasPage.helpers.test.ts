import { describe, it, expect } from 'vitest';
import { estadoVariant, generarDuraciones, generarHoras, calcularHoraFin }
  from '../ReservasPage';

describe('estadoVariant', () => {
  it('mapea cada estado de reserva', () => {
    expect(estadoVariant('PENDIENTE')).toBe('warning');
    expect(estadoVariant('CONFIRMADA')).toBe('info');
    expect(estadoVariant('EN_CURSO')).toBe('success');
    expect(estadoVariant('COMPLETADA')).toBe('default');
    expect(estadoVariant('CANCELADA')).toBe('danger');
    expect(estadoVariant('NO_SHOW')).toBe('danger');
    expect(estadoVariant('RARO')).toBe('default');
  });
});

describe('generarHoras (malla simple de 30 min)', () => {
  it('genera de apertura a antes de cierre', () => {
    expect(generarHoras('08:00', '10:00')).toEqual(['08:00', '08:30', '09:00', '09:30']);
  });
  it('respeta minutos de apertura', () => {
    expect(generarHoras('08:30', '09:30')).toEqual(['08:30', '09:00']);
  });
});

describe('calcularHoraFin', () => {
  it('suma duración con acarreo', () => {
    expect(calcularHoraFin('10:00', '01:30')).toBe('11:30');
    expect(calcularHoraFin('10:45', '00:30')).toBe('11:15');
  });
});

describe('generarDuraciones', () => {
  it('vacío sin inicio', () => {
    expect(generarDuraciones('', '18:00')).toEqual([]);
  });
  it('desde 10:05 los fines caen en la malla', () => {
    expect(generarDuraciones('10:05', '11:00').map((x) => x.fin)).toEqual(['10:30', '11:00']);
  });
  it('cap de 12 entradas', () => {
    expect(generarDuraciones('08:00', '23:00').length).toBeLessThanOrEqual(12);
  });
});

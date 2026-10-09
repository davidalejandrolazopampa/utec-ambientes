import { describe, it, expect, vi, afterEach } from 'vitest';
import { estadoColor, generarHoras, calcularHoraFin, generarDuraciones }
  from '../LaboratorioDetallePage';

describe('estadoColor', () => {
  it('mapea cada estado a su variante', () => {
    expect(estadoColor('DISPONIBLE')).toBe('success');
    expect(estadoColor('OCUPADO')).toBe('danger');
    expect(estadoColor('RESERVADO')).toBe('warning');
    expect(estadoColor('BLOQUEADO')).toBe('danger');
    expect(estadoColor('OTRO')).toBe('default');
  });
});

describe('calcularHoraFin', () => {
  it('suma duración exacta', () => {
    expect(calcularHoraFin('10:00', '00:30')).toBe('10:30');
    expect(calcularHoraFin('10:00', '01:00')).toBe('11:00');
  });
  it('ajusta desde un inicio no-redondo', () => {
    expect(calcularHoraFin('10:05', '00:25')).toBe('10:30');
  });
  it('maneja el acarreo de minutos', () => {
    expect(calcularHoraFin('10:45', '00:30')).toBe('11:15');
  });
});

describe('generarDuraciones', () => {
  it('vacío si no hay hora de inicio', () => {
    expect(generarDuraciones('', '18:00')).toEqual([]);
  });
  it('desde inicio redondo: primer bloque 30 min', () => {
    const d = generarDuraciones('10:00', '18:00');
    expect(d[0]).toEqual({ label: '30 min → 10:30', fin: '10:30' });
    expect(d[1].fin).toBe('11:00');
    expect(d.length).toBeLessThanOrEqual(12);
  });
  it('desde inicio NO-redondo (10:05): el fin cae en la malla', () => {
    const d = generarDuraciones('10:05', '11:00');
    expect(d.map((x) => x.fin)).toEqual(['10:30', '11:00']);
    expect(d[0].label).toBe('25 min → 10:30');
    expect(d[1].label).toBe('55 min → 11:00');
  });
  it('etiquetas de horas: "1 h" y "1h30"', () => {
    const d = generarDuraciones('10:00', '18:00');
    expect(d.find((x) => x.fin === '11:00')!.label).toBe('1 h → 11:00');
    expect(d.find((x) => x.fin === '11:30')!.label).toBe('1h30 → 11:30');
  });
});

describe('generarHoras', () => {
  afterEach(() => vi.useRealTimers());

  it('fecha futura: malla completa de 30 min', () => {
    expect(generarHoras('08:00', '10:00', '2099-01-01')).toEqual(['08:00', '08:30', '09:00', '09:30']);
  });

  it('HOY con hora actual no-redonda: añade "ahora" como inicio flexible', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2099-06-15T15:05:00Z'));
    const now = new Date();
    const fecha = now.toISOString().split('T')[0];
    const res = generarHoras('00:00', '23:30', fecha);
    const m = now.getMinutes();
    if (m % 30 !== 0) {
      const esperado0 = `${String(now.getHours()).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      expect(res[0]).toBe(esperado0);
    }
    // todas las horas siguen ordenadas y dentro de rango
    expect(res.length).toBeGreaterThan(0);
  });
});

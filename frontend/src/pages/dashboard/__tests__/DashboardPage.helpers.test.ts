import { describe, it, expect } from 'vitest';
import { buildCiclos, buildAnios, buildHeatmapMatrix } from '../DashboardPage';

describe('buildCiclos', () => {
  it('genera 3 ciclos por año en 3 años (9 entradas)', () => {
    const c = buildCiclos();
    expect(c).toHaveLength(9);
    const year = new Date().getFullYear();
    expect(c[0].value).toBe(`${year}-2`);
    expect(c[0].label).toMatch(/Ago–Dic/);
    expect(c.some((x) => x.value === `${year - 2}-0`)).toBe(true);
  });
});

describe('buildAnios', () => {
  it('devuelve 5 años descendentes desde el actual', () => {
    const a = buildAnios();
    const year = new Date().getFullYear();
    expect(a).toEqual([year, year - 1, year - 2, year - 3, year - 4]);
  });
});

describe('buildHeatmapMatrix', () => {
  it('inicializa los 7 días y coloca las celdas en su día/hora', () => {
    const m = buildHeatmapMatrix([
      { dia: 'Lunes', hora: 8, cantidad: 3 },
      { dia: 'Viernes', hora: 14, cantidad: 5 },
      { dia: 'DiaInexistente', hora: 9, cantidad: 1 }, // se ignora
    ] as never);
    expect(Object.keys(m)).toHaveLength(7);
    expect(m['Lunes'][8]).toBe(3);
    expect(m['Viernes'][14]).toBe(5);
    expect(m['DiaInexistente']).toBeUndefined();
    expect(m['Martes']).toEqual({});
  });
});

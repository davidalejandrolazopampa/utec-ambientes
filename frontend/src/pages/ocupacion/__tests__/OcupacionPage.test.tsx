import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

const LAB = { id: 1, codigoLab: 'L108', nombre: 'Concept Lab', diasAtencion: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'], horaApertura: '09:00:00', horaCierre: '18:00:00' };
const RECURSOS = [{ id: 90, nombre: 'MESA 1' }, { id: 91, nombre: 'MESA 2' }];
const RESERVAS = [{ recursoId: 90, estado: 'COMPLETADA', tipoReserva: 'ALUMNO', fecha: '2026-04-13', horaInicio: '09:00:00', horaFin: '13:00:00' }];
const BLOQUEOS = [{ tipo: 'TOTAL', motivo: 'ALMUERZO', fechaInicio: '2026-04-13', fechaFin: '2026-04-13', horaInicio: '13:00:00', horaFin: '14:00:00' }];

const apiGet = vi.fn((url: string) => {
    if (url.includes('/recursos')) return Promise.resolve({ data: { data: RECURSOS } });
    if (url.includes('/reservas/laboratorio/')) return Promise.resolve({ data: { data: RESERVAS } });
    if (url.includes('/bloqueos/laboratorio/')) return Promise.resolve({ data: { data: BLOQUEOS } });
    if (url.includes('/laboratorios')) return Promise.resolve({ data: { data: [LAB] } });
    return Promise.resolve({ data: { data: [] } });
});
vi.mock('@/services/api', () => ({ default: { get: (url: string) => apiGet(url) } }));

import OcupacionPage, { calcularOcupacionPorMesa, slotsDelDia, diaAtiende, nivelDeOcupacion, calcularHeatmap, sugerenciaCapacidad } from '../OcupacionPage';

const renderPage = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={qc}><BrowserRouter><OcupacionPage /></BrowserRouter></QueryClientProvider>);
};

describe('OcupacionPage — cálculo por mesa', () => {
    it('slotsDelDia genera franjas de 30 min (9–18 = 18 franjas)', () => {
        const s = slotsDelDia('09:00:00', '18:00:00');
        expect(s.length).toBe(18);
        expect(s[0]).toBe('09:00');
        expect(s[s.length - 1]).toBe('17:30');
    });

    it('diaAtiende respeta días con tilde y normaliza', () => {
        expect(diaAtiende(new Date(2026, 3, 15), ['Miércoles'])).toBe(true);
        expect(diaAtiende(new Date(2026, 3, 15), ['Lunes'])).toBe(false);
        expect(diaAtiende(new Date(2026, 3, 18), LAB.diasAtencion)).toBe(false); // sábado
    });

    it('nivelDeOcupacion aplica el rúbrico', () => {
        expect(nivelDeOcupacion(39.9)).toBe(1);
        expect(nivelDeOcupacion(45)).toBe(2);
        expect(nivelDeOcupacion(55)).toBe(3);
        expect(nivelDeOcupacion(60)).toBe(4);
    });

    it('por mesa (minutos): almuerzo 13–14 → 480 min disp c/mesa; MESA 1 reserva 9–13 → 240 min ocup (50%)', () => {
        const r = calcularOcupacionPorMesa(LAB, RECURSOS, RESERVAS, BLOQUEOS, '2026-04-13', '2026-04-13');
        const m1 = r.perMesa.find((m) => m.id === 90)!;
        const m2 = r.perMesa.find((m) => m.id === 91)!;
        expect(m1.disponibles).toBe(480); // 540 (9-18) - 60 (almuerzo)
        expect(m1.ocupadas).toBe(240);    // 9-13 = 240 min
        expect(m1.pct).toBe(50);
        expect(m2.disponibles).toBe(480);
        expect(m2.ocupadas).toBe(0); // mesa 2 sin reservas
        // promedio: 240 / 960 = 25%
        expect(r.totalDisponibles).toBe(960);
        expect(r.totalOcupadas).toBe(240);
        expect(r.pct).toBe(25);
    });

    it('una asesoría PARCIAL en MESA 1 le descuenta esas franjas del denominador (solo a esa mesa)', () => {
        const bloqueos = [
            { tipo: 'TOTAL', motivo: 'ALMUERZO', fechaInicio: '2026-04-13', fechaFin: '2026-04-13', horaInicio: '13:00:00', horaFin: '14:00:00' },
            { tipo: 'PARCIAL', motivo: 'ASESORIA', fechaInicio: '2026-04-13', fechaFin: '2026-04-13', horaInicio: '15:00:00', horaFin: '17:00:00', recursosAfectados: [90] },
        ];
        const r = calcularOcupacionPorMesa(LAB, RECURSOS, [], bloqueos, '2026-04-13', '2026-04-13');
        const m1 = r.perMesa.find((m) => m.id === 90)!;
        const m2 = r.perMesa.find((m) => m.id === 91)!;
        expect(m1.disponibles).toBe(360); // 540 - 60 (almuerzo) - 120 (asesoría 15-17)
        expect(m2.disponibles).toBe(480); // 540 - 60 (almuerzo); la asesoría NO le afecta
    });

    it('un evento TOTAL recorta el denominador de TODAS las mesas', () => {
        const bloqueos = [{ tipo: 'TOTAL', motivo: 'EVENTO', fechaInicio: '2026-04-13', fechaFin: '2026-04-13', horaInicio: '09:00:00', horaFin: '13:00:00' }];
        const r = calcularOcupacionPorMesa(LAB, RECURSOS, [], bloqueos, '2026-04-13', '2026-04-13');
        expect(r.perMesa.every((m) => m.disponibles === 300)).toBe(true); // 540 - 240 (evento 9-13)
    });

    it('mantenimiento PARCIAL en MESA 1 SALE del denominador de esa mesa (no cierra el lab)', () => {
        const bloqueos = [{ tipo: 'PARCIAL', motivo: 'MANTENIMIENTO', fechaInicio: '2026-04-13', fechaFin: '2026-04-13', horaInicio: '09:00:00', horaFin: '13:00:00', recursosAfectados: [90] }];
        const r = calcularOcupacionPorMesa(LAB, RECURSOS, [], bloqueos, '2026-04-13', '2026-04-13');
        const m1 = r.perMesa.find((m) => m.id === 90)!;
        const m2 = r.perMesa.find((m) => m.id === 91)!;
        expect(m1.disponibles).toBe(300);  // 540 - 240 (mantenimiento 09-13 sale del denominador)
        expect(m1.ocupadas).toBe(0);
        expect(m2.disponibles).toBe(540);   // mesa 2 intacta: el mantenimiento de mesa 1 NO cierra el lab
    });

    it('una mesa SOLO con mantenimiento (0 h disponibles) se marca "Sin disponibilidad", NO 100%', () => {
        const bloqueos = [{ tipo: 'PARCIAL', motivo: 'MANTENIMIENTO', fechaInicio: '2026-04-13', fechaFin: '2026-04-13', horaInicio: '09:00:00', horaFin: '18:00:00', recursosAfectados: [90] }];
        const r = calcularOcupacionPorMesa(LAB, RECURSOS, [], bloqueos, '2026-04-13', '2026-04-13');
        const m1 = r.perMesa.find((m) => m.id === 90)!;
        expect(m1.disponibles).toBe(0);
        expect(m1.sinDisponibilidad).toBe(true);
        expect(m1.retirada).toBe(false); // cerrada por mantenimiento, no retirada
    });

    it('una mesa RETIRADA (bloqueo RETIRO) se marca como retirada y NO cuenta como 100%/activa', () => {
        const bloqueos = [{ tipo: 'PARCIAL', motivo: 'RETIRO', fechaInicio: '2026-04-01', fechaFin: '2026-12-31', recursosAfectados: [90] }];
        const r = calcularOcupacionPorMesa(LAB, RECURSOS, [], bloqueos, '2026-04-13', '2026-04-13');
        const m1 = r.perMesa.find((m) => m.id === 90)!;
        const m2 = r.perMesa.find((m) => m.id === 91)!;
        expect(m1.disponibles).toBe(0);
        expect(m1.sinDisponibilidad).toBe(true);
        expect(m1.retirada).toBe(true);          // etiqueta "Retirada"
        expect(m2.sinDisponibilidad).toBe(false); // la otra mesa sigue activa
        // Las sin-disponibilidad van al final del orden.
        expect(r.perMesa[r.perMesa.length - 1].id).toBe(90);
    });

    it('CRUCE: reserva de alumno durante un evento TOTAL cuenta como ocupada (0 disp → % NÚMERO >100)', () => {
        const bloqueos = [{ tipo: 'TOTAL', motivo: 'EVENTO', fechaInicio: '2026-04-13', fechaFin: '2026-04-13', horaInicio: '09:00:00', horaFin: '18:00:00', descripcion: 'Graduación UTEC' }];
        const reservas = [{ recursoId: 90, estado: 'COMPLETADA', tipoReserva: 'ALUMNO', fecha: '2026-04-13', horaInicio: '10:00:00', horaFin: '12:00:00' }];
        const r = calcularOcupacionPorMesa(LAB, RECURSOS, reservas, bloqueos, '2026-04-13', '2026-04-13');
        const m1 = r.perMesa.find((m) => m.id === 90)!;
        expect(m1.disponibles).toBe(0);          // evento total cubre todo el día → 0 disponibles
        expect(m1.ocupadas).toBe(120);           // reserva 10-12 = 120 min, SÍ cuenta como ocupada (cruce)
        // 0 disp + ocup>0 → 100% (bloqueado) + uso nominal: 100 + round(120*100/540) = 122.2 (NÚMERO, sin signo)
        expect(m1.pct).toBe(122.2);
        expect(Number.isFinite(m1.pct)).toBe(true);
    });

    it('CRUCE parcial: ocupadas pueden superar disponibles → % > 100 sin división por cero', () => {
        const bloqueos = [{ tipo: 'TOTAL', motivo: 'EVENTO', fechaInicio: '2026-04-13', fechaFin: '2026-04-13', horaInicio: '14:00:00', horaFin: '18:00:00' }];
        const reservas = [
            { recursoId: 90, estado: 'COMPLETADA', tipoReserva: 'ALUMNO', fecha: '2026-04-13', horaInicio: '09:00:00', horaFin: '13:00:00' }, // 240 min, disponibles
            { recursoId: 90, estado: 'COMPLETADA', tipoReserva: 'ALUMNO', fecha: '2026-04-13', horaInicio: '15:00:00', horaFin: '17:00:00' }, // 120 min, CRUCE (en evento)
        ];
        const r = calcularOcupacionPorMesa(LAB, RECURSOS, reservas, bloqueos, '2026-04-13', '2026-04-13');
        const m1 = r.perMesa.find((m) => m.id === 90)!;
        expect(m1.disponibles).toBe(300);        // 540 - 240 (evento 14-18) = 300 min
        expect(m1.ocupadas).toBe(360);           // 240 (mañana) + 120 (cruce) = 360 min
        expect(m1.pct).toBe(120);                // 360/300 = 120%
    });

    it('cuenta minutos REALES de un inicio tardío: 15:03–17:00 = 117 min (no se pierden los 27 ni se redondea)', () => {
        const reservas = [{ recursoId: 90, estado: 'EN_CURSO', tipoReserva: 'ALUMNO', fecha: '2026-04-13', horaInicio: '15:03:00', horaFin: '17:00:00' }];
        const r = calcularOcupacionPorMesa(LAB, RECURSOS, reservas, [], '2026-04-13', '2026-04-13');
        const m1 = r.perMesa.find((m) => m.id === 90)!;
        expect(m1.ocupadas).toBe(117);     // 15:03 → 17:00 = 117 min (antes, por franjas, contaba 90)
        expect(m1.disponibles).toBe(540);  // sin almuerzo ni eventos en este test
    });

    it('un CIERRE institucional excluye ese día de "disponible" y se reporta aparte (no cuenta como libre)', () => {
        // Lun 13 abierto + Mar 14 en CIERRE (todo UTEC). Solo el 13 aporta capacidad.
        const cierres = [{ fechaInicio: '2026-04-14', fechaFin: '2026-04-14' }];
        const r = calcularOcupacionPorMesa(LAB, RECURSOS, [], [], '2026-04-13', '2026-04-14', cierres);
        expect(r.totalDisponibles).toBe(1080);            // 540 × 2 mesas, SOLO el día 13 (el 14 no cuenta)
        expect(r.cerradoInstitucional).toBe(1080);        // 540 × 2 mesas del día cerrado (visible aparte)
        // Sin el cierre, el 14 sumaría otras 1080 min de "libres"; con el cierre no infla lo ocioso.
        const sinCierre = calcularOcupacionPorMesa(LAB, RECURSOS, [], [], '2026-04-13', '2026-04-14');
        expect(sinCierre.totalDisponibles).toBe(2160);    // 540 × 2 mesas × 2 días
        expect(sinCierre.cerradoInstitucional).toBe(0);
    });

    it('calcularHeatmap: reserva 9-13 el lunes → 09h al 50%; almuerzo 13-14 sin disponibilidad', () => {
        const h = calcularHeatmap(LAB, RECURSOS, RESERVAS, BLOQUEOS, '2026-04-13', '2026-04-13');
        const c9 = h.find((x) => x.dow === 1 && x.hora === 9)!; // lunes 09–10
        expect(c9.pct).toBe(50);          // 60 min ocupados / 120 disp (2 mesas × 60)
        const c13 = h.find((x) => x.dow === 1 && x.hora === 13)!; // franja de almuerzo
        expect(c13.disponibles).toBe(0);
        expect(c13.pct).toBeNull();
    });

    it('sugerenciaCapacidad: 10% con 10 mesas → 40% = 3 mesas o 4× reservas; detecta "ya cumple"', () => {
        const s = sugerenciaCapacidad(100, 1000, 10, 40);
        expect(s.pctActual).toBe(10);
        expect(s.mesasNecesarias).toBe(3);   // 100/0.4=250 disp objetivo ÷ 100 por mesa → ceil 2.5
        expect(s.factorUso).toBe(4);         // 0.4×1000 / 100
        expect(sugerenciaCapacidad(500, 1000, 10, 40).pctActual).toBe(50); // ya supera el 40%
    });
});

describe('OcupacionPage — render', () => {
    beforeEach(() => vi.clearAllMocks());

    it('renderiza y, al fijar el rango, muestra la tabla por mesa', async () => {
        const { container } = renderPage();
        expect(screen.getByText('Objetivo de Ocupación')).toBeInTheDocument();
        await screen.findByRole('option', { name: /L108/ });
        const fechas = container.querySelectorAll('input[type="date"]');
        fireEvent.change(fechas[0], { target: { value: '2026-04-13' } });
        fireEvent.change(fechas[1], { target: { value: '2026-04-13' } });
        // MESA 1 al 50%, MESA 2 al 0%; promedio 25%
        expect(await screen.findByText('MESA 1')).toBeInTheDocument();
        expect((await screen.findAllByText('50%')).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('MESA 2')).toBeInTheDocument();
    });

    it('avisa cuando el rango es inválido (Desde > Hasta)', async () => {
        const { container } = renderPage();
        await screen.findByRole('option', { name: /L108/ });
        const fechas = container.querySelectorAll('input[type="date"]');
        fireEvent.change(fechas[0], { target: { value: '2026-05-10' } });
        fireEvent.change(fechas[1], { target: { value: '2026-05-01' } });
        await waitFor(() => expect(screen.getByText(/rango es inválido/i)).toBeInTheDocument());
    });
});

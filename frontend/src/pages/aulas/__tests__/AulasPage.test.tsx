import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { format, startOfWeek } from 'date-fns';

// Lunes de la semana actual: SIEMPRE visible en la grilla (lun–sáb), corra el test el día que corra.
const HOY_ISO = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

// useNavigate espiado (el clic en un hueco libre navega a Crear Bloqueo pre-llenado).
const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => mockNavigate }));

// Feriados operativos globales devueltos por /bloqueos/feriados (mutable por test).
let feriadosMock: { fecha: string; descripcion?: string }[] = [];

const apiGet = vi.fn((url: string, _cfg?: unknown) => {
    if (url.includes('/bloqueos/feriados')) return Promise.resolve({ data: { data: feriadosMock } });
    if (url.includes('/aulas/areas')) return Promise.resolve({ data: { data: ['CS', 'AD'] } });
    // Horario de ATENCIÓN del lab (9am–6pm, L–V) → bandas "sin atención" en la grilla.
    if (url.includes('/laboratorios/5')) return Promise.resolve({ data: { data: { id: 5, codigoLab: 'L108', horaApertura: '09:00:00', horaCierre: '18:00:00', diasAtencion: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'] } } });
    if (url.includes('/aulas/laboratorios-con-ocupacion')) return Promise.resolve({ data: { data: [{ id: 5, codigo: 'L108', nombre: 'Concept Lab' }] } });
    if (url.includes('/reservas/laboratorio/5')) return Promise.resolve({ data: { data: [
        { id: 9, recursoNombre: 'MESA 3', usuarioNombre: 'Ana', fecha: HOY_ISO, horaInicio: '10:00:00', horaFin: '11:00:00', estado: 'CONFIRMADA' },
        { id: 10, recursoNombre: 'MESA 4', fecha: HOY_ISO, horaInicio: '10:00:00', horaFin: '11:00:00', estado: 'CANCELADA' },
    ] } });
    if (url.includes('/bloqueos/laboratorio/5')) return Promise.resolve({ data: { data: [
        // Rango amplio (todo el ciclo) para que caiga en la semana visible sea cual sea la fecha del runner.
        { id: 1, motivo: 'EVENTO', descripcion: 'Charla X', fechaInicio: '2026-03-01', fechaFin: '2026-08-01', horaInicio: '10:00:00', horaFin: '12:00:00' },
    ] } });
    if (url.includes('/aulas/clases') && url.includes('labId=5')) return Promise.resolve({ data: { data: [] } });
    if (url.includes('/aulas/clases')) return Promise.resolve({ data: { data: [
        { id: 1, espacioCodigo: 'A501', espacioTipo: 'AULA', esLab: false, diaSemana: 'LUNES', horaInicio: '09:00:00', horaFin: '11:00:00', cursoCodigo: 'CS100', cursoNombre: 'Algoritmos', tipoSesion: 'TEORICO' },
    ] } });
    if (url.includes('/aulas/libres')) return Promise.resolve({ data: { data: [
        { id: 2, codigo: 'A203', tipo: 'AULA', capacidad: 40 },
        // Un LABORATORIO libre (con mesas): su CTA es "Reservar mesa" para todos.
        { id: 2, codigo: 'L108', nombre: 'Concept Lab', tipo: 'LABORATORIO', capacidad: 48, esLab: true },
    ] } });
    if (url.includes('/aulas/ocupacion')) return Promise.resolve({ data: { data: [
        { id: 1, codigo: 'A501', tipo: 'AULA', capacidad: 30, ocupado: [{ horaInicio: '09:00:00', horaFin: '11:00:00', etiqueta: 'CS100' }] },
        { id: 2, codigo: 'A203', tipo: 'AULA', capacidad: 40, ocupado: [] },
        // El lab (mismo id que A203 a propósito: se distingue por esLab) con una reserva PARCIAL
        // y su ventana de ATENCIÓN (9–18): fuera de ella la barra se raya como "no atiende".
        { id: 2, codigo: 'L108', tipo: 'LABORATORIO', esLab: true, atencionInicio: '09:00:00', atencionFin: '18:00:00', atiende: true, ocupado: [{ horaInicio: '10:00:00', horaFin: '11:00:00', etiqueta: 'Reserva · MESA 1', parcial: true }] },
    ] } });
    if (url.includes('/aulas')) return Promise.resolve({ data: { data: [
        { id: 1, codigo: 'A501', tipo: 'AULA', capacidad: 30 },
    ] } });
    return Promise.resolve({ data: { data: [] } });
});

vi.mock('@/services/api', () => ({ default: { get: (url: string, cfg?: unknown) => apiGet(url, cfg) } }));
// Rol de gestión → el CTA "Bloquear este ambiente" es visible en Buscar libres.
vi.mock('@/store/authStore', () => ({
    useAuthStore: (selector: (s: { user: { rol: string } }) => unknown) => selector({ user: { rol: 'ADMIN' } }),
}));

import AulasPage from '../AulasPage';

const renderPage = (ruta = '/aulas') => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <MemoryRouter initialEntries={[ruta]}>
            <QueryClientProvider client={qc}><AulasPage /></QueryClientProvider>
        </MemoryRouter>,
    );
};

describe('AulasPage', () => {
    beforeEach(() => { vi.clearAllMocks(); feriadosMock = []; });

    it('muestra el título y las dos pestañas', () => {
        renderPage();
        expect(screen.getByRole('heading', { name: 'Calendario' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Calendario/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Buscar libres/ })).toBeInTheDocument();
    });

    it('el calendario pide un filtro antes de mostrar clases', () => {
        renderPage();
        expect(screen.getByText(/para ver su horario de clases/)).toBeInTheDocument();
    });

    it('al elegir una carrera muestra la grilla con la clase', async () => {
        renderPage();
        await screen.findByRole('option', { name: /Computer Science/ }); // áreas cargadas (nombre oficial)
        const combos = screen.getAllByRole('combobox');
        fireEvent.change(combos[0], { target: { value: 'CS' } }); // "Carrera / Área"
        // La grilla semanal muestra el bloque de la clase (código de curso + ambiente).
        expect(await screen.findByText('CS100')).toBeInTheDocument();
        expect(screen.getAllByText('A501').length).toBeGreaterThan(0); // en la grilla (y también como opción del selector)
    });

    it('la pestaña Buscar libres busca EN VIVO (sin botón) y muestra cards con barra del día', async () => {
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: /Buscar libres/ }));
        // Sin pulsar nada: la búsqueda corre sola con los filtros por defecto (hoy + próxima franja).
        expect(await screen.findByText(/2 ambiente\(s\) libre\(s\)/)).toBeInTheDocument();
        // A203 sale como card libre y también como fila de la grilla integrada.
        expect(screen.getAllByText('A203').length).toBeGreaterThan(0);
        // La card trae la barra de disponibilidad del día (accesible por aria-label).
        expect(screen.getAllByRole('img', { name: /Ocupación del día/ }).length).toBeGreaterThan(0);
        // Los chips de día muestran la FECHA real de la semana (Lun 13…) y responden al tap.
        const lunes = screen.getAllByRole('button', { name: /^Lun \d{2}/ })[0];
        fireEvent.click(lunes);
        expect(lunes).toHaveAttribute('aria-pressed', 'true');
        // La duración se elige en chips de 1–5 horas (no una hora de fin).
        const dos = screen.getByRole('button', { name: '2 h' });
        expect(dos).toHaveAttribute('aria-pressed', 'true'); // default 2 h
        fireEvent.click(screen.getByRole('button', { name: '3 h' }));
        expect(screen.getByRole('button', { name: '3 h' })).toHaveAttribute('aria-pressed', 'true');
        // Lectura en palabras + CTA de gestión (rol ADMIN mockeado): cierra el loop hacia Crear Bloqueo.
        expect(screen.getAllByText(/Libre (hasta las|el resto del día)/).length).toBeGreaterThan(0);
        expect(screen.getAllByRole('button', { name: /Bloquear este ambiente/ }).length).toBeGreaterThan(0);
        // Los LABORATORIOS también aparecen, con su propio CTA "Reservar mesa" y leyenda Parcial.
        expect(screen.getAllByText('L108').length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: /Reservar mesa/ })).toBeInTheDocument();
        expect(screen.getByText(/Parcial \(mesas\/reserva\)/)).toBeInTheDocument();
    });

    it('al elegir un laboratorio con eventos, los muestra en la grilla', async () => {
        renderPage();
        const combos = await screen.findAllByRole('combobox');
        fireEvent.change(combos[1], { target: { value: 'LABORATORIO' } }); // Tipo de ambiente
        await screen.findByRole('option', { name: /L108/ });
        fireEvent.change(combos[2], { target: { value: 'lab:5' } }); // Ambiente
        expect((await screen.findAllByText('Charla X')).length).toBeGreaterThan(0);
    });

    it('la leyenda recuerda su estado: cal-leyenda=1 → abierta', async () => {
        localStorage.setItem('cal-leyenda', '1');
        renderPage();
        const combos = await screen.findAllByRole('combobox');
        fireEvent.change(combos[1], { target: { value: 'LABORATORIO' } });
        await screen.findByRole('option', { name: /L108/ });
        fireEvent.change(combos[2], { target: { value: 'lab:5' } });
        const summary = await screen.findByText(/Leyenda de colores/);
        expect(summary.closest('details')).toHaveAttribute('open');
        localStorage.removeItem('cal-leyenda');
    });

    it('marca como Feriado un día de RECESO (feriado operativo global, sin excepción de ciclo)', async () => {
        // Feriado el lunes visible (p. ej. 6-ago): viene de /bloqueos/feriados, no del ciclo.
        feriadosMock = [{ fecha: HOY_ISO, descripcion: 'Batalla de Junín' }];
        renderPage();
        const combos = await screen.findAllByRole('combobox');
        fireEvent.change(combos[1], { target: { value: 'LABORATORIO' } });
        await screen.findByRole('option', { name: /L108/ });
        fireEvent.change(combos[2], { target: { value: 'lab:5' } });
        expect((await screen.findAllByText('Feriado')).length).toBeGreaterThan(0);
        expect(screen.getAllByText('Batalla de Junín').length).toBeGreaterThan(0);
    });

    it('clic en un evento de la grilla abre su detalle (fecha/hora/tipo/motivo)', async () => {
        renderPage('/aulas?lab=5');
        const evento = (await screen.findAllByText('Charla X'))[0];
        fireEvent.click(evento);
        // El modal de detalle muestra el horario y el motivo del bloqueo.
        expect(await screen.findByText('10:00 — 12:00')).toBeInTheDocument();
        expect(screen.getByText('EVENTO')).toBeInTheDocument();
    });

    it('?lab= preselecciona el laboratorio y muestra sus reservas (sin canceladas)', async () => {
        renderPage('/aulas?lab=5');
        // El selector queda preseleccionado en el lab → carga eventos + reservas sin clicks.
        expect((await screen.findAllByText('Charla X')).length).toBeGreaterThan(0);
        // La reserva CONFIRMADA se pinta (mesa + usuario); la CANCELADA no.
        expect(await screen.findByText('MESA 3')).toBeInTheDocument();
        expect(screen.getByText('Ana')).toBeInTheDocument();
        expect(screen.queryByText('MESA 4')).not.toBeInTheDocument();
        // La leyenda del lab incluye los estados de reserva.
        expect(screen.getByText('Reserva de alumno')).toBeInTheDocument();
        expect(screen.getByText('Check-in hecho')).toBeInTheDocument();
    });

    it('con un lab elegido: leyenda "sin atención" y clic en hueco libre → MODAL Crear Bloqueo pre-llenado', async () => {
        renderPage('/aulas?lab=5');
        await screen.findAllByText('Charla X');
        // Leyenda de la franja rayada (fuera del horario de atención del lab no se reserva).
        expect(await screen.findByText(/Sin atención al alumno/)).toBeInTheDocument();
        // Las bandas se pintan con su etiqueta: antes de las 9am / después de las 6pm y el
        // sábado completo (el lab del mock atiende L–V 9–18). También en semanas de exámenes.
        expect((await screen.findAllByText(/No atiende/)).length).toBeGreaterThan(0);
        // Hint del clic (rol de gestión ADMIN).
        expect(screen.getByText(/clic en un hueco libre/i)).toBeInTheDocument();
        // Clic sobre una columna de día → se abre el MODAL flotante de Crear Bloqueo (sin navegar),
        // con la fecha del día clicado pre-llenada (columna 1 = lunes de la semana visible).
        const columnas = document.querySelectorAll('[title="Clic en un hueco libre para crear un evento"]');
        expect(columnas.length).toBeGreaterThan(0);
        fireEvent.click(columnas[0]);
        expect(await screen.findByRole('heading', { name: 'Crear Bloqueo' })).toBeInTheDocument();
        expect(screen.getByDisplayValue(HOY_ISO)).toBeInTheDocument();
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('la grilla de ocupación del día está integrada (sin toggle) con la franja buscada resaltada', async () => {
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: /Buscar libres/ }));
        // La grilla ya no está detrás de un enlace: se muestra siempre, con leyenda.
        expect(await screen.findByText(/Ocupación del día/)).toBeInTheDocument();
        expect(screen.getByText('Franja buscada')).toBeInTheDocument();
        // El aula ocupada aparece como fila
        const filas = await screen.findAllByText('A501');
        expect(filas.length).toBeGreaterThan(0);
        // El LAB raya sus horas fuera de la ventana de atención (9–18 en el mock) con tooltip
        // y la leyenda lo explica; las aulas no llevan esa banda.
        expect(screen.getByText(/No atiende \(labs/)).toBeInTheDocument();
        expect(document.querySelector('[title="No atiende antes de las 09:00 (no se reserva)"]')).toBeTruthy();
        expect(document.querySelector('[title="No atiende después de las 18:00 (no se reserva)"]')).toBeTruthy();
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import ReservasPage from '../ReservasPage';

// Mock del store - soporta selector
let mockUser = { rol: 'ESTUDIANTE' };
vi.mock('@/store/authStore', () => ({
    useAuthStore: (selector: any) => selector({ user: mockUser }),
}));

// Fecha LOCAL (igual que hoyLocal() del componente), no UTC: si no, pasadas las 19:00 en
// zonas UTC-negativas el "HOY" del test caería en otro día y el agrupado no coincidiría.
const localISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const HOY = localISO(new Date());
const MANANA = localISO(new Date(Date.now() + 86400000));
const AYER = localISO(new Date(Date.now() - 86400000));

const RESERVAS = [
    { id: 1, laboratorioCodigo: 'L108', laboratorioNombre: 'Concept Lab', recursoId: 5, recursoNombre: 'Mesa 1', participantes: 2, fecha: HOY, horaInicio: '08:00:00', horaFin: '09:00:00', estado: 'PENDIENTE', usuarioNombre: 'David Lazo' },
    { id: 2, laboratorioCodigo: 'L108', laboratorioNombre: 'Concept Lab', recursoId: 6, recursoNombre: 'PC 2', participantes: 1, fecha: MANANA, horaInicio: '10:00:00', horaFin: '11:00:00', estado: 'CONFIRMADA' },
    { id: 3, laboratorioCodigo: 'L108', laboratorioNombre: 'Concept Lab', recursoId: 7, recursoNombre: 'PC 3', participantes: 1, fecha: AYER, horaInicio: '12:00:00', horaFin: '13:00:00', estado: 'COMPLETADA' },
    // CANCELADA de HOY → revertible (botón Reactivar) solo para roles de gestión
    { id: 4, laboratorioCodigo: 'L108', laboratorioNombre: 'Concept Lab', recursoId: 8, recursoNombre: 'Mesa 4', participantes: 1, fecha: HOY, horaInicio: '14:00:00', horaFin: '15:00:00', estado: 'CANCELADA' },
    // CANCELADA de AYER → NO revertible (día pasado)
    { id: 5, laboratorioCodigo: 'L108', laboratorioNombre: 'Concept Lab', recursoId: 9, recursoNombre: 'Mesa 5', participantes: 1, fecha: AYER, horaInicio: '14:00:00', horaFin: '15:00:00', estado: 'CANCELADA' },
];

const cancelarMock = vi.fn((_id: number) => Promise.resolve({ data: { data: {} } }));
const reactivarMock = vi.fn((_id: number) => Promise.resolve({ data: { data: {} } }));
const completarMock = vi.fn((_id: number) => Promise.resolve({ data: { data: {} } }));
const noShowMock = vi.fn((_id: number) => Promise.resolve({ data: { data: {} } }));
// Gestión de Reservas ahora usa el endpoint PAGINADO: filtra por `q` en el cliente del
// test para simular el servidor y envuelve en la forma { content, total, page, size, totalPages }.
const buscarMock = vi.fn((q: string, page: number, size: number) => {
    const filtradas = q
        ? RESERVAS.filter((r) => JSON.stringify(r).toLowerCase().includes(q.toLowerCase()))
        : RESERVAS;
    const content = filtradas.slice(page * size, page * size + size);
    return Promise.resolve({ data: { data: {
        content, total: filtradas.length, page, size, totalPages: Math.max(1, Math.ceil(filtradas.length / size)),
    } } });
});

vi.mock('@/services/reservas', () => ({
    reservasApi: {
        misReservas: () => Promise.resolve({ data: { data: RESERVAS } }),
        buscarMisReservas: (q: string, page: number, size: number) => buscarMock(q, page, size),
        cancelar: (id: number) => cancelarMock(id),
        reactivar: (id: number) => reactivarMock(id),
        completar: (id: number) => completarMock(id),
        noShow: (id: number) => noShowMock(id),
    },
}));

const apiGet = vi.fn((url: string) => {
    if (url.includes('/laboratorios/codigo/')) return Promise.resolve({ data: { data: { id: 99, horaApertura: '08:00:00', horaCierre: '18:00:00' } } });
    if (url.includes('/recursos')) return Promise.resolve({ data: { data: [{ id: 5, nombre: 'Mesa 1', estado: 'DISPONIBLE', capacidadPersonas: 4 }] } });
    return Promise.resolve({ data: { data: [] } });
});
const apiPost = vi.fn((_url: string) => Promise.resolve({ data: { data: { mensaje: 'Check-in confirmado' } } }));
const apiPut = vi.fn((_url: string, _body?: unknown) => Promise.resolve({ data: { data: {} } }));

vi.mock('@/services/api', () => ({
    default: {
        get: (url: string) => apiGet(url),
        post: (url: string) => apiPost(url),
        put: (url: string, body: unknown) => apiPut(url, body),
    },
}));

// Holder mutable para controlar qué devuelve el decode del QR en cada test.
const zx = vi.hoisted(() => ({ decode: () => new Promise<{ getText: () => string }>(() => {}) }));
vi.mock('@zxing/library', () => ({
    BrowserQRCodeReader: class {
        decodeFromVideoElement() { return zx.decode(); }
        reset() { return Promise.resolve(); }
    },
}));

const renderPage = () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={queryClient}>
            <BrowserRouter><ReservasPage /></BrowserRouter>
        </QueryClientProvider>
    );
};

describe('ReservasPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUser = { rol: 'ESTUDIANTE' };
        window.confirm = vi.fn(() => true) as never;
        Object.defineProperty(navigator, 'mediaDevices', {
            writable: true, configurable: true,
            value: { getUserMedia: vi.fn(() => Promise.reject(new Error('no cam'))) },
        });
    });

    it('estudiante: agrupa reservas en Hoy / Próximas / Pasadas', async () => {
        renderPage();
        expect(screen.getByText('Mis Reservas')).toBeInTheDocument();
        expect(await screen.findByRole('heading', { name: 'Hoy' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Próximas Reservas' })).toBeInTheDocument();
        expect(screen.getByText('Reservas Pasadas')).toBeInTheDocument();
        expect(screen.getAllByText('Concept Lab').length).toBeGreaterThanOrEqual(3);
    });

    it('estudiante: colapsa/expande la sección Hoy', async () => {
        renderPage();
        const toggle = await screen.findByRole('heading', { name: 'Hoy' });
        expect(screen.getByText(/Mesa 1/)).toBeInTheDocument();
        fireEvent.click(toggle);
        await waitFor(() => expect(screen.queryByText(/Mesa 1/)).not.toBeInTheDocument());
    });

    it('estudiante: abre el modal de check-in y maneja el error de cámara', async () => {
        renderPage();
        const btn = await screen.findByRole('button', { name: /Check-in/i });
        fireEvent.click(btn);
        expect(await screen.findByText(/Check-in: Mesa 1/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Abrir cámara/i }));
        expect(await screen.findByText(/No se pudo acceder a la cámara/i)).toBeInTheDocument();
    });

    it('estudiante: cancela una reserva', async () => {
        renderPage();
        await screen.findByRole('heading', { name: 'Hoy' });
        const cancelarBtns = screen.getAllByText('Cancelar');
        fireEvent.click(cancelarBtns[0]);
        await waitFor(() => expect(cancelarMock).toHaveBeenCalledWith(1));
    });

    it('admin: "✓ Confirmar" confirma la reserva (CONFIRMADA, no check-in)', async () => {
        mockUser = { rol: 'ADMIN' };
        renderPage();
        expect(screen.getByText('Gestión de Reservas')).toBeInTheDocument();
        const confirmar = await screen.findByRole('button', { name: /Confirmar/i });
        fireEvent.click(confirmar);
        await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/reservas/1/confirmar'));
    });

    it('admin: "Completar" cierra la reserva como COMPLETADA', async () => {
        mockUser = { rol: 'ADMIN' };
        renderPage();
        const btn = (await screen.findAllByRole('button', { name: 'Completar' }))[0];
        fireEvent.click(btn);
        await waitFor(() => expect(completarMock).toHaveBeenCalled());
    });

    it('admin: "No-show" marca la reserva como NO_SHOW', async () => {
        mockUser = { rol: 'ADMIN' };
        renderPage();
        const btn = (await screen.findAllByRole('button', { name: 'No-show' }))[0];
        fireEvent.click(btn);
        await waitFor(() => expect(noShowMock).toHaveBeenCalled());
    });

    it('admin: "📷 Check-in" registra asistencia (POST /checkin/manual)', async () => {
        mockUser = { rol: 'ADMIN' };
        renderPage();
        const checkin = await screen.findByRole('button', { name: /Check-in/i });
        fireEvent.click(checkin);
        await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/checkin/manual/1'));
    });

    it('estudiante: escanea un QR válido y hace check-in (POST /checkin/qr)', async () => {
        zx.decode = () => Promise.resolve({ getText: () => 'https://utec/checkin/L108-MESA-001' });
        Object.defineProperty(navigator, 'mediaDevices', {
            writable: true, configurable: true,
            value: { getUserMedia: vi.fn(() => Promise.resolve({ getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream)) },
        });
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: /Check-in/i }));
        await screen.findByText(/Check-in: Mesa 1/i);
        fireEvent.click(screen.getByRole('button', { name: /Abrir cámara/i }));
        await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/checkin/qr/L108-MESA-001'));
    });

    it('estudiante: el escáner mapea el error NotFoundError a un mensaje claro', async () => {
        zx.decode = () => Promise.reject(Object.assign(new Error('x'), { name: 'NotFoundError' }));
        Object.defineProperty(navigator, 'mediaDevices', {
            writable: true, configurable: true,
            value: { getUserMedia: vi.fn(() => Promise.resolve({ getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream)) },
        });
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: /Check-in/i }));
        await screen.findByText(/Check-in: Mesa 1/i);
        fireEvent.click(screen.getByRole('button', { name: /Abrir cámara/i }));
        expect(await screen.findByText(/No se encontró cámara/i)).toBeInTheDocument();
    });

    it('admin: abre el modal de edición y guarda los cambios', async () => {
        mockUser = { rol: 'ADMIN' };
        renderPage();
        const editar = (await screen.findAllByRole('button', { name: 'Editar' }))[0];
        fireEvent.click(editar);
        expect(await screen.findByText('Editar Reserva')).toBeInTheDocument();
        // la hora de inicio ahora es una cuadrícula de botones coloreada por disponibilidad
        fireEvent.click(await screen.findByRole('button', { name: '08:00' }));
        // duración dinámica: el fin cae en la malla (ej. "1 h → 09:00")
        fireEvent.click(await screen.findByRole('button', { name: /1 h →/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
        await waitFor(() => expect(apiPut).toHaveBeenCalledWith('/reservas/1', expect.objectContaining({ recursoId: 5 })));
    });

    it('admin: al cambiar participantes en el modal envía participantesEmails', async () => {
        mockUser = { rol: 'ADMIN' };
        renderPage();
        fireEvent.click((await screen.findAllByRole('button', { name: 'Editar' }))[0]);
        await screen.findByText('Editar Reserva');
        fireEvent.click(await screen.findByRole('button', { name: '08:00' }));
        fireEvent.click(await screen.findByRole('button', { name: /1 h →/ }));

        // El titular se muestra como no editable (su nombre, no su correo).
        expect(screen.getByDisplayValue('David Lazo (titular)')).toBeDisabled();

        // Bajar a 1 participante → sin casillas adicionales; luego subir a 2 y escribir el correo.
        fireEvent.click(screen.getByRole('button', { name: '1' }));
        fireEvent.click(screen.getByRole('button', { name: '2' }));
        fireEvent.change(screen.getByPlaceholderText('nombre.apellido@utec.edu.pe'), { target: { value: 'amigo@utec.edu.pe' } });
        fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

        await waitFor(() => expect(apiPut).toHaveBeenCalledWith('/reservas/1', expect.objectContaining({
            participantes: 2, participantesEmails: ['amigo@utec.edu.pe'],
        })));
    });

    it('admin: reactiva una reserva CANCELADA de hoy', async () => {
        mockUser = { rol: 'RESPONSABLE_LAB' };
        renderPage();
        const reactivar = await screen.findByRole('button', { name: /↩ Reactivar/i });
        fireEvent.click(reactivar);
        await waitFor(() => expect(reactivarMock).toHaveBeenCalledWith(4));
    });

    it('estudiante: NO ve el botón Reactivar', async () => {
        mockUser = { rol: 'ESTUDIANTE' };
        renderPage();
        await screen.findByRole('heading', { name: 'Hoy' });
        expect(screen.queryByRole('button', { name: /Reactivar/i })).not.toBeInTheDocument();
    });

    it('admin: una reserva CANCELADA de un día pasado NO muestra Reactivar', async () => {
        mockUser = { rol: 'ADMIN' };
        renderPage();
        // solo hay UN botón Reactivar (el de hoy, id 4); el de ayer (id 5) no aparece
        await screen.findByRole('button', { name: /↩ Reactivar/i });
        expect(screen.getAllByRole('button', { name: /↩ Reactivar/i })).toHaveLength(1);
    });

    it('admin: vista Tabla usa paginación de servidor (buscarMisReservas)', async () => {
        mockUser = { rol: 'ADMIN' };
        renderPage();
        await screen.findByRole('heading', { name: /Gestión de Reservas/i });
        // el endpoint paginado se llamó (no el listado completo)
        await waitFor(() => expect(buscarMock).toHaveBeenCalled());
        // cambiar a Tabla y verificar que la tabla muestra el total del servidor (5 filas)
        fireEvent.click(screen.getByRole('tab', { name: /Tabla/i }));
        expect(await screen.findByText('5 filas', { exact: false })).toBeInTheDocument();
    });

    it('admin: la búsqueda (debounce) llama al backend con el término', async () => {
        mockUser = { rol: 'ADMIN' };
        renderPage();
        const input = (await screen.findAllByPlaceholderText(/Buscar/i))[0];
        fireEvent.change(input, { target: { value: 'PC 3' } });
        await waitFor(() => expect(buscarMock).toHaveBeenCalledWith('PC 3', 0, 20), { timeout: 1000 });
    });

    it('admin: el botón Actualizar refresca la lista', async () => {
        mockUser = { rol: 'ADMIN' };
        renderPage();
        await screen.findByRole('heading', { name: /Gestión de Reservas/i });
        buscarMock.mockClear();
        fireEvent.click(screen.getByRole('button', { name: /Actualizar/i }));
        await waitFor(() => expect(buscarMock).toHaveBeenCalled());
    });
});

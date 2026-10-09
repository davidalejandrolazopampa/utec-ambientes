import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';


// Mock del store
let mockUser = { rol: 'ESTUDIANTE' };
vi.mock('@/store/authStore', () => ({
    useAuthStore: (selector: any) => selector({ user: mockUser }),
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useParams: () => ({ id: '1' }) };
});

vi.mock('@/services/laboratorios', () => ({
    laboratoriosApi: {
        obtener: vi.fn(() => Promise.resolve({ data: { data: {
            id: 1, nombre: 'Concept Lab', codigoLab: 'L108', estado: 'ACTIVO',
            piso: 1, ubicacionFase: 'Fase 1', horaApertura: '08:00:00', horaCierre: '18:00:00',
            recursosDisponibles: 10, totalRecursos: 12, aforoCantidad: 12,
            aforoTipo: 'MESA', aforoCapacidad: 4,
        }}})),
        recursos: vi.fn(() => Promise.resolve({ data: { data: [
            { id: 1, nombre: 'MESA 1', tipo: 'MESA', estado: 'DISPONIBLE', capacidadPersonas: 4, qrCode: 'L108-MESA-001' },
            { id: 2, nombre: 'MESA 2', tipo: 'MESA', estado: 'DISPONIBLE', capacidadPersonas: 4, qrCode: 'L108-MESA-002' },
            { id: 3, nombre: 'MESA 3', tipo: 'MESA', estado: 'OCUPADO', capacidadPersonas: 4, qrCode: 'L108-MESA-003' },
        ]}})),
    },
}));

vi.mock('@/services/reservas', () => ({
    reservasApi: {
        crear: vi.fn(() => Promise.resolve({ data: { data: {} } })),
    },
}));

vi.mock('@/services/api', () => ({
    default: {
        get: vi.fn(() => Promise.resolve({ data: { data: [] } })),
        post: vi.fn(() => Promise.resolve({ data: { data: {} } })),
        put: vi.fn(() => Promise.resolve({ data: { data: {} } })),
        delete: vi.fn(() => Promise.resolve({ data: { data: {} } })),
    },
}));

const renderWithProviders = (component: React.ReactElement) => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>{component}</BrowserRouter>
        </QueryClientProvider>
    );
};

// Importar DESPUÉS de los mocks
import LaboratorioDetallePage from '../LaboratorioDetallePage';
import { reservasApi } from '@/services/reservas';
import { laboratoriosApi } from '@/services/laboratorios';
import api from '@/services/api';

describe('LaboratorioDetallePage', () => {
    it('debe renderizar el nombre del laboratorio', async () => {
        renderWithProviders(<LaboratorioDetallePage />);
        await new Promise((r) => setTimeout(r, 200));
        expect(screen.getByText('Concept Lab')).toBeInTheDocument();
    });

    it('debe mostrar código y ubicación', async () => {
        renderWithProviders(<LaboratorioDetallePage />);
        await new Promise((r) => setTimeout(r, 200));
        expect(screen.getByText(/L108/)).toBeInTheDocument();
    });

    it('debe mostrar recursos disponibles', async () => {
        renderWithProviders(<LaboratorioDetallePage />);
        await new Promise((r) => setTimeout(r, 200));
        expect(screen.getByText('MESA 1')).toBeInTheDocument();
        expect(screen.getByText('MESA 2')).toBeInTheDocument();
    });

    it('debe mostrar estado EN USO para mesa 3 (OCUPADO)', async () => {
        renderWithProviders(<LaboratorioDetallePage />);
        await new Promise((r) => setTimeout(r, 200));
        expect(screen.getByText('MESA 3')).toBeInTheDocument();
        const badges = screen.getAllByText('EN USO');
        expect(badges.length).toBeGreaterThan(0);
    });

    it('mesa OCUPADA hoy (foto del momento) se ve DISPONIBLE al elegir mañana, NO ocupada', async () => {
        mockUser = { rol: 'ESTUDIANTE' };
        renderWithProviders(<LaboratorioDetallePage />);
        // Hoy: la mesa 3 (estado OCUPADO en vivo) sale EN USO.
        expect(await screen.findByText('EN USO')).toBeInTheDocument();
        // Al elegir Mañana, ese estado de HOY no aplica → ninguna mesa queda EN USO ni OCUPADO.
        fireEvent.click(await screen.findByRole('button', { name: 'Mañana' }));
        await waitFor(() => expect(screen.queryByText('EN USO')).not.toBeInTheDocument());
        expect(screen.queryByText('OCUPADO')).not.toBeInTheDocument();
        // Las 3 mesas quedan DISPONIBLE para mañana.
        expect(screen.getAllByText('DISPONIBLE').length).toBe(3);
    });

    it('debe mostrar panel de reserva', async () => {
        renderWithProviders(<LaboratorioDetallePage />);
        await new Promise((r) => setTimeout(r, 200));
        expect(screen.getByText('Reservar')).toBeInTheDocument();
    });

    it('debe mostrar mensaje para seleccionar recurso', async () => {
        renderWithProviders(<LaboratorioDetallePage />);
        await new Promise((r) => setTimeout(r, 200));
        expect(screen.getByText(/Selecciona un recurso/i)).toBeInTheDocument();
    });

    it('no debe mostrar botón agregar recurso para estudiante', async () => {
        mockUser = { rol: 'ESTUDIANTE' };
        renderWithProviders(<LaboratorioDetallePage />);
        await new Promise((r) => setTimeout(r, 200));
        expect(screen.queryByText('+ Agregar recurso')).not.toBeInTheDocument();
    });

    it('debe mostrar botón agregar recurso para admin', async () => {
        mockUser = { rol: 'ADMIN' };
        renderWithProviders(<LaboratorioDetallePage />);
        await new Promise((r) => setTimeout(r, 200));
        expect(screen.getByText('+ Agregar recurso')).toBeInTheDocument();
    });

    it('estudiante: flujo de reserva completo (selecciona recurso, hora, duración, confirma)', async () => {
        mockUser = { rol: 'ESTUDIANTE' };
        renderWithProviders(<LaboratorioDetallePage />);
        // fecha futura PRIMERO (chip "Mañana", arriba de la grilla) para que todas las horas estén disponibles
        fireEvent.click(await screen.findByRole('button', { name: 'Mañana' }));
        // seleccionar un recurso disponible
        fireEvent.click(await screen.findByText('MESA 1'));
        // el panel de reserva aparece
        expect(await screen.findByText('Hora inicio')).toBeInTheDocument();
        // elegir hora y duración
        fireEvent.click(await screen.findByRole('button', { name: '08:00' }));
        // duraciones dinámicas: el fin cae en la malla de 30 min (ej. "1 h → 09:00")
        fireEvent.click(await screen.findByRole('button', { name: /1 h →/ }));
        // confirmar
        const confirmar = screen.getByRole('button', { name: /Confirmar reserva/i });
        expect(confirmar).not.toBeDisabled();
        fireEvent.click(confirmar);
        await waitFor(() => expect(reservasApi.crear).toHaveBeenCalled());
    });

    it('estudiante: cancela la selección de recurso', async () => {
        mockUser = { rol: 'ESTUDIANTE' };
        renderWithProviders(<LaboratorioDetallePage />);
        fireEvent.click(await screen.findByText('MESA 2'));
        await screen.findByText('Hora inicio');
        fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
        await waitFor(() => expect(screen.getByText(/Selecciona un recurso/i)).toBeInTheDocument());
    });

    it('admin: abre y cierra el modal de QR de un recurso', async () => {
        mockUser = { rol: 'ADMIN' };
        renderWithProviders(<LaboratorioDetallePage />);
        await screen.findAllByText('MESA 1');
        // los thumbnails de QR son botones "Ver QR grande"
        fireEvent.click(screen.getAllByTitle('Ver QR grande')[0]);
        expect(await screen.findByRole('button', { name: /Descargar QR/i })).toBeInTheDocument();
    });

    it('admin: abre el modal de editar capacidad', async () => {
        mockUser = { rol: 'ADMIN' };
        renderWithProviders(<LaboratorioDetallePage />);
        await screen.findAllByText('MESA 1');
        fireEvent.click(screen.getAllByText('Editar capacidad')[0]);
        // el modal de capacidad tiene como título "Editar <recurso>"
        expect(await screen.findByText('Editar MESA 1')).toBeInTheDocument();
    });

    it('admin: guarda la nueva capacidad de un recurso (PUT)', async () => {
        mockUser = { rol: 'ADMIN' };
        renderWithProviders(<LaboratorioDetallePage />);
        await screen.findAllByText('MESA 1');
        fireEvent.click(screen.getAllByText('Editar capacidad')[0]);
        await screen.findByText('Editar MESA 1');
        fireEvent.click(screen.getByRole('button', { name: '6' }));
        fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
        await waitFor(() => expect(api.put).toHaveBeenCalledWith(
            '/laboratorios/1/recursos/1', { capacidadPersonas: 6 }));
    });

    it('admin: agrega un recurso (POST)', async () => {
        mockUser = { rol: 'ADMIN' };
        renderWithProviders(<LaboratorioDetallePage />);
        fireEvent.click(await screen.findByText('+ Agregar recurso'));
        await screen.findByText(/Agregar Recurso a/i);
        fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
        await waitFor(() => expect(api.post).toHaveBeenCalledWith(
            '/laboratorios/1/recursos', expect.objectContaining({ tipo: 'MESA' })));
    });

    it('admin: elimina un recurso individual (DELETE)', async () => {
        mockUser = { rol: 'ADMIN' };
        window.confirm = vi.fn(() => true) as never;
        renderWithProviders(<LaboratorioDetallePage />);
        await screen.findAllByText('MESA 1');
        fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[0]);
        await waitFor(() => expect(api.delete).toHaveBeenCalledWith(
            expect.stringMatching(/^\/laboratorios\/1\/recursos\/\d+$/)));
    });

    it('admin: elimina el laboratorio (DELETE) tras confirmar', async () => {
        mockUser = { rol: 'ADMIN' };
        window.confirm = vi.fn(() => true) as never;
        renderWithProviders(<LaboratorioDetallePage />);
        fireEvent.click(await screen.findByText('Eliminar laboratorio'));
        await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/laboratorios/1'));
    });

    it('admin: edita el laboratorio (toggle día + Guardar → PUT)', async () => {
        mockUser = { rol: 'ADMIN' };
        renderWithProviders(<LaboratorioDetallePage />);
        fireEvent.click(await screen.findByText('Editar laboratorio'));
        // el modal de edición muestra el nombre editable
        await screen.findByDisplayValue('Concept Lab');
        // alterna un día de atención
        fireEvent.click(screen.getByRole('button', { name: 'Sábado' }));
        fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
        await waitFor(() => expect(api.put).toHaveBeenCalledWith(
            '/laboratorios/1', expect.objectContaining({ nombre: 'Concept Lab', codigoLab: 'L108' })));
    });

    it('muestra los servicios del lab como enlaces externos', async () => {
        mockUser = { rol: 'ESTUDIANTE' };
        (laboratoriosApi.obtener as any).mockResolvedValueOnce({ data: { data: {
            id: 1, nombre: 'Concept Lab', codigoLab: 'L108', estado: 'ACTIVO', piso: 1, ubicacionFase: 'Fase 1',
            horaApertura: '08:00:00', horaCierre: '18:00:00', recursosDisponibles: 10, totalRecursos: 12,
            aforoCantidad: 12, aforoTipo: 'MESA', aforoCapacidad: 4,
            servicios: [{ nombre: 'Impresiones 3D', url: 'https://fablab.utec.edu.pe/3d', descripcion: 'Solicita tu impresión' }],
        } } });
        renderWithProviders(<LaboratorioDetallePage />);
        const link = await screen.findByRole('link', { name: /Impresiones 3D/ });
        expect(link).toHaveAttribute('href', 'https://fablab.utec.edu.pe/3d');
    });

    it('admin: agrega un servicio en el modal de editar (PUT incluye servicios)', async () => {
        mockUser = { rol: 'ADMIN' };
        renderWithProviders(<LaboratorioDetallePage />);
        fireEvent.click(await screen.findByText('Editar laboratorio'));
        await screen.findByDisplayValue('Concept Lab');
        fireEvent.click(screen.getByRole('button', { name: /Agregar servicio/ }));
        fireEvent.change(screen.getByPlaceholderText(/Impresiones 3D/), { target: { value: 'Corte láser' } });
        fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
        await waitFor(() => expect(api.put).toHaveBeenCalledWith('/laboratorios/1',
            expect.objectContaining({ servicios: [expect.objectContaining({ nombre: 'Corte láser' })] })));
    });

    it('día cubierto por un evento TOTAL → mesas BLOQUEADO de una y contador "0 disponibles ese día"', async () => {
        mockUser = { rol: 'ESTUDIANTE' };
        // "Mañana" en fecha local (igual que el chip del SelectorFecha).
        const d = new Date(); d.setDate(d.getDate() + 1);
        const MANANA = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        // Evento TOTAL que cubre TODO el horario del lab (08:00–18:00) ese día.
        const EVENTO = { id: 1, tipo: 'TOTAL', motivo: 'EVENTO', descripcion: 'Hackathon',
            fechaInicio: MANANA, fechaFin: MANANA, horaInicio: '08:00:00', horaFin: '18:00:00', recursosAfectados: [] };
        (api.get as any).mockImplementation((url: string) =>
            url.includes('/bloqueos/laboratorio/')
                ? Promise.resolve({ data: { data: [EVENTO] } })
                : Promise.resolve({ data: { data: [] } }));

        renderWithProviders(<LaboratorioDetallePage />);
        fireEvent.click(await screen.findByRole('button', { name: 'Mañana' }));
        // Las 3 mesas salen BLOQUEADO SIN necesidad de elegir hora (día entero tomado).
        await waitFor(() => expect(screen.getAllByText('BLOQUEADO').length).toBe(3));
        // El contador refleja la FECHA elegida: 0 de 3 disponibles ese día.
        expect(screen.getByText('de 3 disponibles ese día')).toBeInTheDocument();

        (api.get as any).mockImplementation(() => Promise.resolve({ data: { data: [] } })); // reset
    });

    it('admin: retira mesas por un periodo (POST /bloqueos motivo RETIRO, todo el día)', async () => {
        mockUser = { rol: 'ADMIN' };
        (api.get as any).mockImplementation((url: string) =>
            url.includes('/ciclos')
                ? Promise.resolve({ data: { data: [{ codigo: '2026-1', fechaInicio: '2026-03-23', fechaFin: '2026-07-04' }] } })
                : Promise.resolve({ data: { data: [] } }));
        renderWithProviders(<LaboratorioDetallePage />);
        // Abre el modal de retiro
        fireEvent.click(await screen.findByRole('button', { name: /Retirar mesas/i }));
        // Selecciona MESA 1 (dentro del modal aparece la grilla de mesas)
        const mesa1 = (await screen.findAllByRole('button', { name: 'MESA 1' }))[0];
        fireEvent.click(mesa1);
        // Atajo de ciclo autocompleta el rango de fechas
        fireEvent.click(screen.getByRole('button', { name: /Ciclo 2026-1/ }));
        // Confirma el retiro
        fireEvent.click(screen.getByRole('button', { name: /Retirar 1 mesa/ }));
        await waitFor(() => expect(api.post).toHaveBeenCalledWith('/bloqueos', expect.objectContaining({
            motivo: 'RETIRO', tipo: 'PARCIAL', horaInicio: null, fechaInicio: '2026-03-23', fechaFin: '2026-07-04',
            recursosIds: [1],
        })));
        (api.get as any).mockImplementation(() => Promise.resolve({ data: { data: [] } })); // reset
    });

    it('admin: repone mesas retiradas (DELETE del bloqueo RETIRO)', async () => {
        mockUser = { rol: 'ADMIN' };
        const RETIRO = { id: 55, tipo: 'PARCIAL', motivo: 'RETIRO', fechaInicio: '2026-03-23', fechaFin: '2026-07-04', recursosAfectados: [1] };
        (api.get as any).mockImplementation((url: string) =>
            url.includes('/bloqueos/laboratorio/')
                ? Promise.resolve({ data: { data: [RETIRO] } })
                : Promise.resolve({ data: { data: [] } }));
        renderWithProviders(<LaboratorioDetallePage />);
        // La tira de "Mesas retiradas" aparece con su botón Reponer
        fireEvent.click(await screen.findByRole('button', { name: 'Reponer' }));
        await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/bloqueos/55'));
        (api.get as any).mockImplementation(() => Promise.resolve({ data: { data: [] } })); // reset
    });

    it('admin: un retiro VENCIDO va al historial (modal), no a la tira con Reponer', async () => {
        mockUser = { rol: 'ADMIN' };
        // Fechas de 2020 → vencido con cualquier reloj de la máquina de test.
        const VENCIDO = { id: 77, tipo: 'PARCIAL', motivo: 'RETIRO', fechaInicio: '2019-01-01', fechaFin: '2020-01-05', recursosAfectados: [1] };
        (api.get as any).mockImplementation((url: string) =>
            url.includes('/bloqueos/laboratorio/')
                ? Promise.resolve({ data: { data: [VENCIDO] } })
                : Promise.resolve({ data: { data: [] } }));
        renderWithProviders(<LaboratorioDetallePage />);
        // Un retiro vencido NO ofrece "Reponer" en la vista; se accede por "Ver historial".
        const verHist = await screen.findByRole('button', { name: /Ver historial/ });
        expect(screen.queryByRole('button', { name: 'Reponer' })).toBeNull();
        fireEvent.click(verHist);
        // El modal de historial muestra el periodo vencido.
        expect(await screen.findByText(/Historial de retiros/)).toBeInTheDocument();
        expect(screen.getByText('2019-01-01 → 2020-01-05')).toBeInTheDocument();
        (api.get as any).mockImplementation(() => Promise.resolve({ data: { data: [] } })); // reset
    });

    it('admin: "Programar almuerzo" genera el almuerzo del rango (POST /bloqueos/laboratorio/{id}/almuerzos)', async () => {
        mockUser = { rol: 'ADMIN' };
        (api.post as any).mockResolvedValueOnce({ data: { data: { creados: 3, reservasCanceladas: 0, omitidos: [] } } });
        const { container } = renderWithProviders(<LaboratorioDetallePage />);
        fireEvent.click(await screen.findByRole('button', { name: /Programar almuerzo/ }));
        expect(await screen.findByText(/Programar almuerzo ·/)).toBeInTheDocument();
        // Los 2 últimos inputs date del DOM son "Desde/Hasta" del modal de almuerzo.
        const dates = container.querySelectorAll('input[type="date"]');
        fireEvent.change(dates[dates.length - 2], { target: { value: '2026-05-01' } });
        fireEvent.change(dates[dates.length - 1], { target: { value: '2026-05-31' } });
        fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
        await waitFor(() => expect(api.post).toHaveBeenCalledWith('/bloqueos/laboratorio/1/almuerzos',
            expect.objectContaining({ fechaInicio: '2026-05-01', fechaFin: '2026-05-31', horaInicio: '13:00:00', horaFin: '14:00:00', forzar: false })));
        (api.post as any).mockReset();
    });

    it('día de CIERRE institucional → aviso "UTEC cerrada" y mesas no reservables', async () => {
        mockUser = { rol: 'ESTUDIANTE' };
        const d = new Date(); d.setDate(d.getDate() + 1);
        const MANANA = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        // /ciclos devuelve un ciclo con una excepción tipo CIERRE que cubre "mañana".
        (api.get as any).mockImplementation((url: string) =>
            url.includes('/ciclos')
                ? Promise.resolve({ data: { data: [{ codigo: '2026-1', fechaInicio: '2026-01-01', fechaFin: '2026-12-31',
                    excepciones: [{ fechaInicio: MANANA, fechaFin: MANANA, tipo: 'CIERRE', descripcion: 'Aniversario' }] }] } })
                : Promise.resolve({ data: { data: [] } }));
        renderWithProviders(<LaboratorioDetallePage />);
        fireEvent.click(await screen.findByRole('button', { name: 'Mañana' }));
        expect(await screen.findByText(/UTEC está cerrada por feriado institucional/i)).toBeInTheDocument();
        // Las mesas salen CERRADO (no reservables) ese día.
        await waitFor(() => expect(screen.getAllByText('CERRADO').length).toBeGreaterThan(0));
        (api.get as any).mockImplementation(() => Promise.resolve({ data: { data: [] } })); // reset
    });

    it('admin: descarga el QR de un recurso (GET blob)', async () => {
        mockUser = { rol: 'ADMIN' };
        (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:x');
        (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
        renderWithProviders(<LaboratorioDetallePage />);
        await screen.findAllByText('MESA 1');
        fireEvent.click(screen.getAllByTitle('Ver QR grande')[0]);
        fireEvent.click(await screen.findByRole('button', { name: /Descargar QR/i }));
        await waitFor(() => expect(api.get).toHaveBeenCalledWith(
            expect.stringContaining('/qr/recurso/'), expect.objectContaining({ responseType: 'blob' })));
    });
});
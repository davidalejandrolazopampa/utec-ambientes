import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import LaboratoriosPage from '../LaboratoriosPage';
import { useAuthStore } from '@/store/authStore';

let mockUser: { rol: string } = { rol: 'ESTUDIANTE' };
vi.mock('@/store/authStore', () => ({
    useAuthStore: vi.fn((selector: (s: unknown) => unknown) => selector({ user: mockUser })),
}));

const LABS = [
    {
        id: 1, nombre: 'Lab Uno', codigoLab: 'L101', estado: 'ACTIVO', piso: 1, ubicacionFase: 'Fase 1',
        recursosDisponibles: 3, totalRecursos: 5, aforoCantidad: 5, aforoTipo: 'MESA', aforoCapacidad: 4,
        horaApertura: '08:00:00', horaCierre: '18:00:00', diasAtencion: [] as string[],
        directorNombre: 'Diego Milanes', directorCargo: 'Director de CS', directorCorreo: 'dmilanes@utec.edu.pe', carreraNombre: 'Computer Science',
        responsablesInfo: [{ id: 10, nombreCompleto: 'David Lazo', cargo: 'Técnico de Lab', correoUtec: 'dlazo@utec.edu.pe' }],
        servicios: [{ nombre: 'Impresiones 3D', url: 'https://fablab.utec.edu.pe/3d' }],
    },
    {
        id: 2, nombre: 'Lab Dos', codigoLab: 'L201', estado: 'INACTIVO', piso: -1, ubicacionFase: 'Fase 2',
        recursosDisponibles: 0, totalRecursos: 4, aforoCantidad: 4, aforoTipo: 'PC', aforoCapacidad: 1,
        horaApertura: '09:00:00', horaCierre: '17:00:00', diasAtencion: [] as string[],
        responsables: ['Ana Torres'],
    },
    {
        id: 3, nombre: 'Lab Tres', codigoLab: 'L301', estado: 'ACTIVO', piso: 2, ubicacionFase: 'Fase 1',
        recursosDisponibles: 5, totalRecursos: 5, aforoCantidad: 5, aforoTipo: 'MESA', aforoCapacidad: 2,
        horaApertura: '07:00:00', horaCierre: '22:00:00', diasAtencion: [] as string[],
        carreraNombre: 'Data Science',
    },
];

const listar = vi.fn(() => Promise.resolve({ data: { data: LABS } }));
const todosAdmin = vi.fn(() => Promise.resolve({ data: { data: LABS } }));
const misLaboratorios = vi.fn(() => Promise.resolve({ data: { data: LABS } }));

vi.mock('@/services/laboratorios', () => ({
    laboratoriosApi: {
        listar: () => listar(),
        todosAdmin: () => todosAdmin(),
        misLaboratorios: () => misLaboratorios(),
    },
}));

const renderPage = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={qc}><BrowserRouter><LaboratoriosPage /></BrowserRouter></QueryClientProvider>
    );
};

describe('LaboratoriosPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUser = { rol: 'ESTUDIANTE' };
    });

    it('estudiante: renderiza las 3 tarjetas con responsables y ocupación, SIN director', async () => {
        renderPage();
        expect(await screen.findByText('Lab Uno')).toBeInTheDocument();
        expect(screen.getByText('Lab Dos')).toBeInTheDocument();
        expect(screen.getByText('Lab Tres')).toBeInTheDocument();
        // El alumno NO ve la jerarquía (director); sí ve responsables.
        expect(screen.queryByText('Diego Milanes')).not.toBeInTheDocument();     // directorNombre oculto
        expect(screen.getByText('David Lazo')).toBeInTheDocument();              // responsablesInfo
        expect(screen.getByText('Ana Torres')).toBeInTheDocument();             // responsables fallback
        expect(screen.getByText('Todos disponibles')).toBeInTheDocument();    // ocupacion 0
        expect(screen.getByText('Muy ocupado')).toBeInTheDocument();          // ocupacion >=50
        expect(listar).toHaveBeenCalled();
    });

    it('estudiante: solo ve el NOMBRE del responsable (sin cargo ni correo) y nada del director', async () => {
        mockUser = { rol: 'ESTUDIANTE' };
        renderPage();
        await screen.findByText('Lab Uno');
        expect(screen.getByText('David Lazo')).toBeInTheDocument();
        // Data completa (cargo/correo del responsable y datos del director) NO se muestra al alumno.
        expect(screen.queryByText(/Técnico de Lab/)).not.toBeInTheDocument();
        expect(screen.queryByText(/dlazo@utec\.edu\.pe/)).not.toBeInTheDocument();
        expect(screen.queryByText(/dmilanes@utec\.edu\.pe/)).not.toBeInTheDocument();
    });

    it('rol de gestión (admin): ve la data COMPLETA del director y responsables (cargo + correo)', async () => {
        mockUser = { rol: 'ADMIN' };
        renderPage();
        await screen.findByText('Lab Uno');
        expect(screen.getByText('David Lazo')).toBeInTheDocument();
        expect(screen.getByText(/Técnico de Lab/)).toBeInTheDocument();
        expect(screen.getByText(/dlazo@utec\.edu\.pe/)).toBeInTheDocument();
        expect(screen.getByText('Diego Milanes')).toBeInTheDocument();
        expect(screen.getByText(/dmilanes@utec\.edu\.pe/)).toBeInTheDocument();
    });

    it('un lab que no atiende hoy se muestra como "Fuera de servicio hoy"', async () => {
        // diasAtencion = solo MAÑANA (un día que nunca es hoy) → cerrado hoy.
        const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const d = new Date(); d.setDate(d.getDate() + 1);
        const manana = DIAS[d.getDay()];
        listar.mockResolvedValueOnce({ data: { data: [
            { ...LABS[0], id: 99, nombre: 'Lab Cerrado', diasAtencion: [manana] },
        ] } });
        renderPage();
        expect(await screen.findByText('Lab Cerrado')).toBeInTheDocument();
        expect(screen.getByText('Fuera de servicio hoy')).toBeInTheDocument();
        expect(screen.getByText('Cerrado hoy')).toBeInTheDocument();
        // No debe pintar "✓ Disponible" ni la barra de "Disponibilidad ahora".
        expect(screen.queryByText('Disponibilidad ahora')).not.toBeInTheDocument();
    });

    it('búsqueda filtra por nombre', async () => {
        renderPage();
        await screen.findByText('Lab Uno');
        fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre/i), { target: { value: 'uno' } });
        await waitFor(() => expect(screen.queryByText('Lab Dos')).not.toBeInTheDocument());
        expect(screen.getByText('Lab Uno')).toBeInTheDocument();
    });

    it('abre filtros y filtra por "Disponibles ahora"', async () => {
        renderPage();
        await screen.findByText('Lab Uno');
        fireEvent.click(screen.getByRole('button', { name: /Filtros/i }));
        fireEvent.click(await screen.findByRole('button', { name: 'Disponibles ahora' }));
        // Lab Dos tiene 0 disponibles → se oculta; Lab Uno (3) sigue visible
        await waitFor(() => expect(screen.queryByText('Lab Dos')).not.toBeInTheDocument());
        expect(screen.getByText('Lab Uno')).toBeInTheDocument();
        // aparece botón limpiar
        fireEvent.click(screen.getByRole('button', { name: /Limpiar/i }));
        await waitFor(() => expect(screen.getByText('Lab Dos')).toBeInTheDocument());
    });

    it('muestra el badge de servicio y filtra por servicio', async () => {
        renderPage();
        await screen.findByText('Lab Uno');
        // La tarjeta de Lab Uno muestra su servicio como badge.
        expect(screen.getAllByText('Impresiones 3D').length).toBeGreaterThan(0);
        // Filtro por servicio: solo queda Lab Uno.
        fireEvent.click(screen.getByRole('button', { name: /Filtros/i }));
        const filtroServicio = (await screen.findAllByRole('button', { name: 'Impresiones 3D' }))
            .find((b) => b.className.includes('rounded'))!;
        fireEvent.click(filtroServicio);
        await waitFor(() => expect(screen.queryByText('Lab Tres')).not.toBeInTheDocument());
        expect(screen.getByText('Lab Uno')).toBeInTheDocument();
    });

    it('filtra por carrera y busca por responsable', async () => {
        renderPage();
        await screen.findByText('Lab Uno');
        // Filtro de carrera (solo Lab Uno tiene carreraNombre 'Computer Science')
        fireEvent.click(screen.getByRole('button', { name: /Filtros/i }));
        fireEvent.click(await screen.findByRole('button', { name: 'Computer Science' }));
        await waitFor(() => expect(screen.queryByText('Lab Dos')).not.toBeInTheDocument());
        expect(screen.getByText('Lab Uno')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Limpiar/i }));
        // Búsqueda por responsable (Ana Torres → Lab Dos)
        await screen.findByText('Lab Dos');
        fireEvent.change(screen.getByPlaceholderText(/Buscar/i), { target: { value: 'Ana Torres' } });
        await waitFor(() => expect(screen.queryByText('Lab Uno')).not.toBeInTheDocument());
        expect(screen.getByText('Lab Dos')).toBeInTheDocument();
    });

    it('alumno: NO ve el badge ACTIVO/INACTIVO', async () => {
        mockUser = { rol: 'ESTUDIANTE' };
        renderPage();
        await screen.findByText('Lab Uno');
        expect(screen.queryByText('ACTIVO')).toBeNull();
        expect(screen.queryByText('INACTIVO')).toBeNull();
    });

    it('filtra por piso (sótano) y por fase', async () => {
        renderPage();
        await screen.findByText('Lab Uno');
        fireEvent.click(screen.getByRole('button', { name: /Filtros/i }));
        fireEvent.click(await screen.findByRole('button', { name: 'Sótano 1' }));
        await waitFor(() => expect(screen.queryByText('Lab Uno')).not.toBeInTheDocument());
        expect(screen.getByText('Lab Dos')).toBeInTheDocument();
    });

    it('las secciones de filtro están SIEMPRE presentes (iguales para todos), aunque haya una sola opción', async () => {
        listar.mockResolvedValueOnce({ data: { data: [
            { ...LABS[0], id: 50, nombre: 'Solo Fase 2', ubicacionFase: 'Fase 2' },
        ] } });
        renderPage();
        await screen.findByText('Solo Fase 2');
        fireEvent.click(screen.getByRole('button', { name: /Filtros/i }));
        // Aunque solo haya una fase/piso, las secciones igual se muestran.
        expect(screen.getByText('Fase')).toBeInTheDocument();
        expect(screen.getByText('Piso')).toBeInTheDocument();
        expect(screen.getByText('Disponibilidad')).toBeInTheDocument();
        // Pero la opción inexistente "Fase 1" NO aparece (opciones derivadas de los datos).
        expect(screen.queryByRole('button', { name: 'Fase 1' })).toBeNull();
    });

    it('cambia el orden a nombre y a piso', async () => {
        renderPage();
        await screen.findByText('Lab Uno');
        const select = screen.getByRole('combobox');
        fireEvent.change(select, { target: { value: 'nombre' } });
        fireEvent.change(select, { target: { value: 'piso' } });
        expect(screen.getByText('Lab Uno')).toBeInTheDocument();
    });

    it('admin: muestra el botón "Crear Lab" y usa todosAdmin', async () => {
        mockUser = { rol: 'ADMIN' };
        renderPage();
        expect(await screen.findByText('Lab Uno')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Crear Lab/i })).toBeInTheDocument();
        expect(todosAdmin).toHaveBeenCalled();
    });

    it('admin: "Crear Lab" abre el modal de creación (ventana flotante)', async () => {
        mockUser = { rol: 'ADMIN' };
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: /Crear Lab/i }));
        expect(await screen.findByRole('heading', { name: /Crear Laboratorio/i })).toBeInTheDocument();
    });

    it('responsable: usa misLaboratorios', async () => {
        mockUser = { rol: 'RESPONSABLE_LAB' };
        renderPage();
        await screen.findByText('Lab Uno');
        expect(misLaboratorios).toHaveBeenCalled();
    });

    it('orden por defecto: ACTIVOS primero, y dentro de cada grupo por PISO ascendente', async () => {
        // Activos: L101 (piso 1, Uno), L301 (piso 2, Tres) → Uno, Tres. Inactivo: L201 (Dos) al final.
        mockUser = { rol: 'ADMIN' };
        renderPage();
        await screen.findByText('Lab Uno');
        const orden = screen.getAllByText(/^Lab (Uno|Dos|Tres)$/).map((n) => n.textContent);
        expect(orden).toEqual(['Lab Uno', 'Lab Tres', 'Lab Dos']);
    });

    it('admin: filtro de Estado (Activos / Inactivos) agrupa por estado', async () => {
        mockUser = { rol: 'ADMIN' };
        renderPage();
        await screen.findByText('Lab Uno');
        fireEvent.click(screen.getByRole('button', { name: /Filtros/i }));
        expect(await screen.findByText('Estado')).toBeInTheDocument();
        // Solo INACTIVOS → queda Lab Dos (L201, INACTIVO)
        fireEvent.click(screen.getByRole('button', { name: 'Inactivos' }));
        await waitFor(() => expect(screen.queryByText('Lab Uno')).not.toBeInTheDocument());
        expect(screen.getByText('Lab Dos')).toBeInTheDocument();
        // Solo ACTIVOS → quedan Lab Uno y Lab Tres, se oculta Lab Dos
        fireEvent.click(screen.getByRole('button', { name: 'Activos' }));
        await waitFor(() => expect(screen.queryByText('Lab Dos')).not.toBeInTheDocument());
        expect(screen.getByText('Lab Uno')).toBeInTheDocument();
        expect(screen.getByText('Lab Tres')).toBeInTheDocument();
    });

    it('estudiante: NO ve el filtro de Estado (solo recibe labs activos)', async () => {
        mockUser = { rol: 'ESTUDIANTE' };
        renderPage();
        await screen.findByText('Lab Uno');
        fireEvent.click(screen.getByRole('button', { name: /Filtros/i }));
        await screen.findByText('Disponibilidad');
        expect(screen.queryByText('Estado')).not.toBeInTheDocument();
    });
});

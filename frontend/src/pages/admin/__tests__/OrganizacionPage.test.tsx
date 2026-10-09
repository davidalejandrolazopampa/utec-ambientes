import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import OrganizacionPage from '../OrganizacionPage';
import api from '@/services/api';

const USUARIOS = [
    { id: 7, correoUtec: 'dlazo@utec.edu.pe', nombres: 'David', apellidos: 'Lazo', nombreCompleto: 'David Lazo', rol: 'RESPONSABLE_LAB', activo: true, departamentoId: null },
    { id: 117, correoUtec: 'dir@utec.edu.pe', nombres: 'Diego', apellidos: 'Milanes', nombreCompleto: 'Diego Milanes', rol: 'DIRECTOR', activo: true, departamentoId: 10 },
    { id: 200, correoUtec: 'inactivo@utec.edu.pe', nombres: 'Carlos', apellidos: 'Inactivo', nombreCompleto: 'Carlos Inactivo', rol: 'ESTUDIANTE', activo: false, departamentoId: null },
    // Counter de Docencia: rol administrativo NUEVO — debe aparecer en su grupo (regresión: el agrupado estaba hardcodeado y lo omitía).
    { id: 300, correoUtec: 'counter_docentes@utec.edu.pe', nombres: 'Counter', apellidos: 'Docentes', nombreCompleto: 'Counter Docentes', rol: 'DOCENCIA', activo: true, departamentoId: null },
];
const LABS = [
    { id: 1, codigoLab: 'L101', nombre: 'Lab Uno', estado: 'ACTIVO', piso: 1, ubicacionFase: 'F1', departamentoId: 10, departamentoNombre: 'DPTO Y', facultadNombre: 'FACULTAD X', directorId: 117, directorNombre: 'Diego Milanes', responsables: ['David Lazo'] },
];
const FACULTADES = [{ id: 5, nombre: 'FACULTAD X', decanoId: null }];
const DEPARTAMENTOS = [{ id: 10, nombre: 'DPTO Y', facultadId: 5, directorId: 117 }];
const CARRERAS = [{ id: 20, nombre: 'Ingeniería de Prueba' }];

// Rol mutable por test (default ADMIN); los tests del modo directorio lo cambian y restauran.
const rolMock = vi.hoisted(() => ({ rol: 'ADMIN' }));
vi.mock('@/store/authStore', () => ({ useAuthStore: (sel: (s: { user: { rol: string } }) => unknown) => sel({ user: { rol: rolMock.rol } }) }));

vi.mock('@/services/api', () => ({
    default: {
        get: vi.fn((url: string) => {
            if (url.includes('/usuarios/por-director')) return Promise.resolve({ data: { data: [] } });
            if (url.includes('/estructura/carreras')) return Promise.resolve({ data: { data: CARRERAS } });
            if (url.includes('/laboratorios/admin/todos')) return Promise.resolve({ data: { data: LABS } });
            if (url.includes('/usuarios/administrativos')) return Promise.resolve({ data: { data: USUARIOS.filter(u => u.rol !== 'ESTUDIANTE') } });
            if (url.includes('/usuarios/conteo-roles')) {
                const m: Record<string, number> = {}; USUARIOS.forEach(u => { m[u.rol] = (m[u.rol] || 0) + 1; });
                return Promise.resolve({ data: { data: m } });
            }
            if (url.includes('/usuarios/buscar')) {
                const usp = new URLSearchParams(url.split('?')[1] || '');
                let list = USUARIOS.filter(u => !usp.get('rol') || u.rol === usp.get('rol'));
                if (usp.get('activo') != null) list = list.filter(u => u.activo === (usp.get('activo') === 'true'));
                const qq = (usp.get('q') || '').toLowerCase();
                if (qq) list = list.filter(u => u.nombreCompleto.toLowerCase().includes(qq) || u.correoUtec.toLowerCase().includes(qq));
                return Promise.resolve({ data: { data: { content: list, total: list.length, page: 0, size: 50, totalPages: 1 } } });
            }
            if (url.includes('/usuarios')) return Promise.resolve({ data: { data: USUARIOS } });
            if (url.includes('/organizacion/facultades')) return Promise.resolve({ data: { data: FACULTADES } });
            if (url.includes('/organizacion/departamentos')) return Promise.resolve({ data: { data: DEPARTAMENTOS } });
            return Promise.resolve({ data: { data: [] } });
        }),
        post: vi.fn(() => Promise.resolve({ data: { data: {} } })),
        put: vi.fn(() => Promise.resolve({ data: { data: {} } })),
        delete: vi.fn(() => Promise.resolve({ data: {} })),
        patch: vi.fn(() => Promise.resolve({ data: { data: {} } })),
    },
}));

const renderPage = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={qc}><BrowserRouter><OrganizacionPage /></BrowserRouter></QueryClientProvider>
    );
};

describe('OrganizacionPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true) as never;
    });

    it('renderiza la estructura con la facultad', async () => {
        renderPage();
        expect(await screen.findByRole('heading', { name: /Organización/i })).toBeInTheDocument();
        expect(await screen.findByText('FACULTAD X')).toBeInTheDocument();
    });

    it('abre el modal de crear facultad', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Organización/i });
        fireEvent.click(screen.getByText('+ Facultad'));
        expect(await screen.findByPlaceholderText(/FACULTAD DE/i)).toBeInTheDocument();
    });

    it('en la pestaña Personas abre el modal de una persona', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Organización/i });
        fireEvent.click(screen.getByRole('button', { name: /Personas/i }));
        const persona = await screen.findByText('David Lazo');
        fireEvent.click(persona);
        // El modal de persona muestra el selector de Rol
        expect(await screen.findByText(/Cargo/i)).toBeInTheDocument();
    });

    it('los administrativos incluyen el grupo DOCENCIA (counter de Docencia)', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Organización/i });
        fireEvent.click(screen.getByRole('button', { name: /Personas/i }));
        // El agrupado por rol se deriva de ROLES_ADMIN: la persona con rol DOCENCIA se lista.
        expect(await screen.findByText('Counter Docentes')).toBeInTheDocument();
        expect(screen.getAllByText('Docencia').length).toBeGreaterThan(0); // encabezado del grupo
    });

    it('los grupos de rol son DESPLEGABLES (details con conteo en el encabezado)', async () => {
        const { container } = renderPage();
        await screen.findByRole('heading', { name: /Organización/i });
        fireEvent.click(screen.getByRole('button', { name: /Personas/i }));
        await screen.findByText('David Lazo');
        const grupos = container.querySelectorAll('details');
        expect(grupos.length).toBeGreaterThan(0);                    // un details por rol con gente
        expect(screen.getAllByText(/persona(s)?$/).length).toBeGreaterThan(0); // conteo en el summary
    });

    it('COORDINADOR/DOCENCIA entran en modo DIRECTORIO: solo Personas, sin gestión', async () => {
        rolMock.rol = 'COORDINADOR';
        try {
            renderPage();
            await screen.findByRole('heading', { name: /Organización/i });
            // Solo la pestaña Personas (sin Estructura/Labs, sin "+ Persona", sin toggle Alumnos).
            expect(screen.queryByRole('button', { name: /Estructura/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /^Labs$/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /\+ Persona/i })).not.toBeInTheDocument();
            expect(screen.queryByText(/Alumnos \(/)).not.toBeInTheDocument();
            expect(screen.getByText(/Directorio de personas de tu ámbito/i)).toBeInTheDocument();
            // La lista viene ya acotada del backend (aquí el mock devuelve administrativos).
            expect(await screen.findByText('David Lazo')).toBeInTheDocument();
            // Solo lectura: clic en la persona NO abre el modal de edición.
            fireEvent.click(screen.getByText('David Lazo'));
            expect(screen.queryByText(/Cargo/i)).not.toBeInTheDocument();
        } finally {
            rolMock.rol = 'ADMIN';
        }
    });

    it('en la pestaña Labs abre el modal de un laboratorio', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Organización/i });
        fireEvent.click(screen.getByRole('button', { name: /Labs/i }));
        const lab = await screen.findByText(/Lab Uno/i);
        fireEvent.click(lab);
        await waitFor(() => expect(screen.getAllByText(/L101/).length).toBeGreaterThan(0));
    });

    it('crea un departamento (POST)', async () => {
        renderPage();
        await screen.findByText('FACULTAD X');
        fireEvent.click(screen.getByText('+ Departamento'));
        const input = await screen.findByPlaceholderText(/DEPARTAMENTO DE/i);
        fireEvent.change(input, { target: { value: 'DEPARTAMENTO DE PRUEBA' } });
        fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
        await waitFor(() => expect(api.post).toHaveBeenCalledWith('/organizacion/departamentos', expect.anything()));
    });

    it('edita una facultad (PUT)', async () => {
        renderPage();
        await screen.findByText('FACULTAD X');
        fireEvent.click(screen.getByTitle('Editar facultad'));
        const input = await screen.findByDisplayValue('FACULTAD X');
        fireEvent.change(input, { target: { value: 'FACULTAD X EDIT' } });
        fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
        await waitFor(() => expect(api.put).toHaveBeenCalledWith('/organizacion/facultades/5', expect.anything()));
    });

    it('elimina una facultad (confirm + DELETE)', async () => {
        renderPage();
        await screen.findByText('FACULTAD X');
        fireEvent.click(screen.getByTitle('Eliminar facultad'));
        await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/organizacion/facultades/5'));
    });

    it('en Labs alterna el estado del laboratorio (PUT estado)', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Organización/i });
        fireEvent.click(screen.getByRole('button', { name: /Labs/i }));
        await screen.findByText('Lab Uno');
        fireEvent.click(screen.getAllByRole('button', { name: /Activo/i })[0]);
        await waitFor(() => expect(api.put).toHaveBeenCalledWith(expect.stringContaining('/laboratorios/1/estado')));
    });

    it('edita el nombre de una persona y guarda (PUT con nombres/apellidos)', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Organización/i });
        fireEvent.click(screen.getByRole('button', { name: /Personas/i }));
        fireEvent.click(await screen.findByText('David Lazo'));
        const nombres = await screen.findByPlaceholderText('Nombres');
        fireEvent.change(nombres, { target: { value: 'Dávid' } });
        fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
        await waitFor(() => expect(api.put).toHaveBeenCalledWith('/usuarios/7', expect.objectContaining({ nombres: 'Dávid', apellidos: 'Lazo' })));
    });

    it('los alumnos se piden PAGINADOS por servidor (rol=ESTUDIANTE), no cargando todos', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Organización/i });
        fireEvent.click(screen.getByRole('button', { name: /Personas/i }));
        await screen.findByText('David Lazo');
        fireEvent.click(await screen.findByRole('button', { name: /Alumnos/ }));
        // Pide el endpoint paginado con rol=ESTUDIANTE (y NO el listado completo /usuarios).
        await waitFor(() => expect((api.get as any).mock.calls.some((c: any[]) => String(c[0]).includes('/usuarios/buscar') && String(c[0]).includes('rol=ESTUDIANTE'))).toBe(true));
        // Nunca se llama al GET /usuarios "a secas" (que traería los ~9500).
        expect((api.get as any).mock.calls.some((c: any[]) => String(c[0]) === '/usuarios')).toBe(false);
    });

    it('filtra los usuarios inactivos (oculto por defecto)', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Organización/i });
        fireEvent.click(screen.getByRole('button', { name: /Personas/i }));
        await screen.findByText('David Lazo');
        // Carlos es alumno (otro grupo del toggle): cambiar a Alumnos
        fireEvent.click(screen.getByRole('button', { name: /Alumnos/ }));
        // por defecto (Activos) el inactivo no aparece
        expect(screen.queryByText('Carlos Inactivo')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Inactivos' }));
        expect(await screen.findByText('Carlos Inactivo')).toBeInTheDocument();
    });

    it('reactiva un usuario inactivo (PUT activo:true)', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Organización/i });
        fireEvent.click(screen.getByRole('button', { name: /Personas/i }));
        fireEvent.click(await screen.findByRole('button', { name: /Alumnos/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Inactivos' }));
        fireEvent.click(await screen.findByText('Carlos Inactivo'));
        fireEvent.click(await screen.findByRole('button', { name: /Reactivar usuario/i }));
        await waitFor(() => expect(api.put).toHaveBeenCalledWith('/usuarios/200', { activo: true }));
    });

    it('crea una persona desde la pestaña Personas (POST /usuarios)', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Organización/i });
        fireEvent.click(screen.getByRole('button', { name: /Personas/i }));
        fireEvent.click(await screen.findByRole('button', { name: '+ Persona' }));
        expect(await screen.findByRole('heading', { name: 'Nueva persona' })).toBeInTheDocument();
        fireEvent.change(screen.getByPlaceholderText('Nombres'), { target: { value: 'Nuevo' } });
        fireEvent.change(screen.getByPlaceholderText('Apellidos'), { target: { value: 'Usuario' } });
        fireEvent.change(screen.getByPlaceholderText(/correo@utec/i), { target: { value: 'nuevo@utec.edu.pe' } });
        // #1: el alumno puede escoger su carrera al crearse
        fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'Ingeniería de Prueba' } });
        fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
        await waitFor(() => expect(api.post).toHaveBeenCalledWith('/usuarios', expect.objectContaining({ correoUtec: 'nuevo@utec.edu.pe', rol: 'ESTUDIANTE', carrera: 'Ingeniería de Prueba' })));
    });

    it('crear Administrativo: el rol enviado NO es ESTUDIANTE', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Organización/i });
        fireEvent.click(screen.getByRole('button', { name: /Personas/i }));
        fireEvent.click(await screen.findByRole('button', { name: '+ Persona' }));
        await screen.findByRole('heading', { name: 'Nueva persona' });
        fireEvent.click(screen.getByRole('button', { name: 'Administrativo' }));
        fireEvent.change(screen.getByPlaceholderText('Nombres'), { target: { value: 'Ana' } });
        fireEvent.change(screen.getByPlaceholderText('Apellidos'), { target: { value: 'Soto' } });
        fireEvent.change(screen.getByPlaceholderText(/correo@utec/i), { target: { value: 'asoto@utec.edu.pe' } });
        fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
        await waitFor(() => expect(api.post).toHaveBeenCalledWith('/usuarios', expect.objectContaining({ rol: 'RESPONSABLE_LAB' })));
    });

    it('crea una carrera (POST /organizacion/carreras)', async () => {
        renderPage();
        await screen.findByText('FACULTAD X');
        fireEvent.click(screen.getByText('+ Carrera'));
        await screen.findByRole('heading', { name: /carrera/i });
        fireEvent.change(screen.getByPlaceholderText(/Ingeniería de/i), { target: { value: 'Ing Nueva' } });
        const facOpt = await screen.findByRole('option', { name: 'FACULTAD X' });
        fireEvent.change(facOpt.closest('select')!, { target: { value: '5' } });
        fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
        await waitFor(() => expect(api.post).toHaveBeenCalledWith('/organizacion/carreras', expect.objectContaining({ nombre: 'Ing Nueva', facultadId: 5 })));
    });

    it('editar un alumno: solo el nombre (sin selector de Rol/Cargo)', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Organización/i });
        fireEvent.click(screen.getByRole('button', { name: /Personas/i }));
        fireEvent.click(await screen.findByRole('button', { name: /Alumnos/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Inactivos' }));
        fireEvent.click(await screen.findByText('Carlos Inactivo'));
        // muestra la nota de alumno y oculta el campo Cargo
        expect(await screen.findByText(/solo puedes corregir su nombre/i)).toBeInTheDocument();
        expect(screen.queryByText('Cargo')).not.toBeInTheDocument();
    });

    it('en Personas la búsqueda filtra la lista', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Organización/i });
        fireEvent.click(screen.getByRole('button', { name: /Personas/i }));
        await screen.findByText('David Lazo');
        fireEvent.change(screen.getByPlaceholderText(/Buscar persona/i), { target: { value: 'Diego' } });
        await waitFor(() => expect(screen.queryByText('David Lazo')).not.toBeInTheDocument());
        expect(screen.getByText('Diego Milanes')).toBeInTheDocument();
    });

    it('asigna un decano a la facultad (PUT decanoId)', async () => {
        renderPage();
        await screen.findByText('FACULTAD X');
        fireEvent.click(screen.getByText(/Asignar decano/i));
        // Modal de asignación con candidatos (líderes)
        await screen.findByRole('heading', { name: /Asignar decano/i });
        fireEvent.click(screen.getAllByRole('button', { name: 'Asignar' })[0]);
        await waitFor(() => expect(api.put).toHaveBeenCalledWith(
            '/organizacion/facultades/5', expect.objectContaining({ decanoId: expect.any(Number) })));
    });

    it('expande la facultad y elimina un departamento (DELETE)', async () => {
        renderPage();
        fireEvent.click(await screen.findByText('FACULTAD X'));
        const delBtn = await screen.findByTitle('Eliminar departamento');
        fireEvent.click(delBtn);
        await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/organizacion/departamentos/10'));
    });

    it('edita un departamento (PUT)', async () => {
        renderPage();
        fireEvent.click(await screen.findByText('FACULTAD X'));
        fireEvent.click(await screen.findByTitle('Editar departamento'));
        const input = await screen.findByDisplayValue('DPTO Y');
        fireEvent.change(input, { target: { value: 'DPTO Y EDIT' } });
        fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
        await waitFor(() => expect(api.put).toHaveBeenCalledWith('/organizacion/departamentos/10', expect.anything()));
    });
});

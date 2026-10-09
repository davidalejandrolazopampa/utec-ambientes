import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import UsuariosPage from '../UsuariosPage';

const USUARIOS = [
    { id: 2, correoUtec: 'admin@utec.edu.pe', nombres: 'Ana', apellidos: 'Diaz', nombreCompleto: 'Ana Diaz', rol: 'ADMIN', activo: true },
    { id: 3, correoUtec: 'coord@utec.edu.pe', nombres: 'Carla', apellidos: 'Ruiz', nombreCompleto: 'Carla Ruiz', rol: 'COORDINADOR', activo: true },
    { id: 4, correoUtec: 'dir@utec.edu.pe', nombres: 'Diego', apellidos: 'Milanes', nombreCompleto: 'Diego Milanes', rol: 'DIRECTOR', activo: true, laboratoriosAsignados: ['L999 - Otro'] },
    { id: 5, correoUtec: 'dlazo@utec.edu.pe', nombres: 'David', apellidos: 'Lazo', nombreCompleto: 'David Lazo', rol: 'RESPONSABLE_LAB', activo: true, laboratoriosAsignados: ['L108 - Concept Lab'] },
    { id: 6, correoUtec: 'eva@utec.edu.pe', nombres: 'Eva', apellidos: 'Soto', nombreCompleto: 'Eva Soto', rol: 'ESTUDIANTE', activo: true },
];
const LABS = [{ id: 1, codigoLab: 'L101', nombre: 'Lab Uno' }];
const RESPONSABLES = [{ id: 5, correoUtec: 'dlazo@utec.edu.pe', nombres: 'David', apellidos: 'Lazo', nombreCompleto: 'David Lazo', rol: 'RESPONSABLE_LAB', activo: true }];

const apiGet = vi.fn((url: string) => {
    if (url.includes('/usuarios/por-director/')) return Promise.resolve({ data: { data: [] } });
    if (url.includes('/usuarios/responsables')) return Promise.resolve({ data: { data: RESPONSABLES } });
    if (url.includes('/usuarios')) return Promise.resolve({ data: { data: USUARIOS } });
    if (url.includes('/laboratorios')) return Promise.resolve({ data: { data: LABS } });
    return Promise.resolve({ data: { data: [] } });
});
const apiPost = vi.fn((_url: string) => Promise.resolve({ data: { data: {} } }));
const apiPut = vi.fn((_url: string, _body?: unknown) => Promise.resolve({ data: { data: {} } }));
const apiPatch = vi.fn((_url: string) => Promise.resolve({ data: { data: {} } }));
const apiDelete = vi.fn((_url: string) => Promise.resolve({ data: {} }));

vi.mock('@/services/api', () => ({
    default: {
        get: (url: string) => apiGet(url),
        post: (url: string) => apiPost(url),
        put: (url: string, body: unknown) => apiPut(url, body),
        patch: (url: string) => apiPatch(url),
        delete: (url: string) => apiDelete(url),
    },
}));

const renderPage = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={qc}><BrowserRouter><UsuariosPage /></BrowserRouter></QueryClientProvider>
    );
};

describe('UsuariosPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true) as never;
    });

    it('renderiza el organigrama con las secciones y usuarios por rol', async () => {
        renderPage();
        expect(await screen.findByRole('heading', { name: /Gestión de Usuarios/i })).toBeInTheDocument();
        expect(screen.getByText('Directores')).toBeInTheDocument();
        expect(screen.getByText('Responsables de Laboratorio')).toBeInTheDocument();
        expect(screen.getByText('Diego Milanes')).toBeInTheDocument();
        // chip de lab que dirige
        expect(screen.getByText('L999 - Otro')).toBeInTheDocument();
    });

    it('cambia a la pestaña Todos y muestra la tabla', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Gestión de Usuarios/i });
        fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
        expect(await screen.findByText('admin@utec.edu.pe')).toBeInTheDocument();
        expect(screen.getByText('eva@utec.edu.pe')).toBeInTheDocument();
    });

    it('desactiva un usuario desde la tabla', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Gestión de Usuarios/i });
        fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
        const fila = (await screen.findByText('admin@utec.edu.pe')).closest('tr')!;
        fireEvent.click(within(fila).getByRole('button', { name: 'Desactivar' }));
        await waitFor(() => expect(apiPatch).toHaveBeenCalledWith('/usuarios/2/desactivar'));
    });

    it('abre la edición de un DIRECTOR, asigna un lab y guarda', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Gestión de Usuarios/i });
        fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
        const fila = (await screen.findByText('dir@utec.edu.pe')).closest('tr')!;
        fireEvent.click(within(fila).getByRole('button', { name: 'Editar' }));

        // El modal de director muestra labs y responsables
        expect(await screen.findByText('Laboratorios que dirige')).toBeInTheDocument();
        expect(screen.getByText('Responsables asignados')).toBeInTheDocument();

        // Asignar el lab L101 (no estaba asignado) → POST a labs-dirige
        fireEvent.click(screen.getByRole('button', { name: /L101/ }));
        await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/usuarios/4/labs-dirige/1'));

        // Guardar cambios → PUT
        fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
        await waitFor(() => expect(apiPut).toHaveBeenCalledWith('/usuarios/4', expect.objectContaining({ rolId: 4 })));
    });

    it('director: vincula un responsable (POST responsables)', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Gestión de Usuarios/i });
        fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
        const fila = (await screen.findByText('dir@utec.edu.pe')).closest('tr')!;
        fireEvent.click(within(fila).getByRole('button', { name: 'Editar' }));
        await screen.findByText('Responsables asignados');
        // el botón del responsable en la sección del modal (último "David Lazo")
        const botones = screen.getAllByRole('button', { name: /David Lazo/ });
        fireEvent.click(botones[botones.length - 1]);
        await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/usuarios/4/responsables/5'));
    });

    it('responsable: asigna un laboratorio (POST laboratorios)', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Gestión de Usuarios/i });
        fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
        const fila = (await screen.findByText('dlazo@utec.edu.pe')).closest('tr')!;
        fireEvent.click(within(fila).getByRole('button', { name: 'Editar' }));
        await screen.findByText('Laboratorios asignados');
        fireEvent.click(screen.getByRole('button', { name: /L101/ }));
        await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/usuarios/5/laboratorios/1'));
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import CrearLaboratorioPage from '../CrearLaboratorioPage';
import api from '@/services/api';

// Departamento que devuelve la cascada director → departamento (null = no autocompleta).
let deptoPorDirector: unknown = null;
// Lista de departamentos (mutable para probar la cascada departamento → director).
let departamentosResp: unknown[] = [{ id: 10, nombre: 'DEP', facultadId: 1 }];

const apiGet = vi.fn((url: string) => {
    if (url.includes('/estructura/departamento-por-director')) return Promise.resolve({ data: { data: deptoPorDirector } });
    if (url.includes('/estructura/facultades')) return Promise.resolve({ data: { data: [{ id: 1, nombre: 'FAC' }] } });
    if (url.includes('/estructura/departamentos')) return Promise.resolve({ data: { data: departamentosResp } });
    if (url.includes('/estructura/carreras')) return Promise.resolve({ data: { data: [{ id: 20, nombre: 'CAR', facultadId: 1 }] } });
    if (url.includes('/usuarios/director-de')) return Promise.resolve({ data: { data: { id: 117, nombreCompleto: 'Diego Milanes', rol: 'DIRECTOR' } } });
    if (url.includes('/usuarios/directores')) return Promise.resolve({ data: { data: [{ id: 117, nombreCompleto: 'Diego Milanes', rol: 'DIRECTOR' }] } });
    if (url.includes('/usuarios/responsables')) return Promise.resolve({ data: { data: [{ id: 7, nombreCompleto: 'David Lazo', rol: 'RESPONSABLE_LAB' }] } });
    if (url.includes('/usuarios/por-director')) return Promise.resolve({ data: { data: [{ id: 7, nombreCompleto: 'David Lazo', rol: 'RESPONSABLE_LAB' }] } });
    if (url.includes('/usuarios')) return Promise.resolve({ data: { data: [] } });
    return Promise.resolve({ data: { data: [] } });
});
const apiPost = vi.fn((_url: string, _body?: unknown) => Promise.resolve({ data: { data: {} } }));

vi.mock('@/services/api', () => ({
    default: { get: (url: string) => apiGet(url), post: (url: string, body: unknown) => apiPost(url, body) },
}));

const renderPage = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={qc}><BrowserRouter><CrearLaboratorioPage /></BrowserRouter></QueryClientProvider>
    );
};

const selectByOption = async (optionName: RegExp | string, value: string) => {
    const opt = await screen.findByRole('option', { name: optionName });
    fireEvent.change(opt.closest('select')!, { target: { value } });
};

describe('CrearLaboratorioPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        deptoPorDirector = null;
        departamentosResp = [{ id: 10, nombre: 'DEP', facultadId: 1 }];
    });

    it('renderiza el formulario de crear laboratorio', async () => {
        renderPage();
        expect(await screen.findByRole('heading', { name: /Crear Laboratorio/i })).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Ej: L301/i)).toBeInTheDocument();
    });

    it('llena el formulario completo (académico, días, equipo, responsables) y crea (POST)', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Crear Laboratorio/i });

        fireEvent.change(screen.getByPlaceholderText(/Ej: L301/i), { target: { value: 'l999' } });
        fireEvent.change(screen.getByPlaceholderText(/Robótica/i), { target: { value: 'Lab Test' } });
        fireEvent.change(screen.getByPlaceholderText(/Descripción breve/i), { target: { value: 'desc' } });

        // académico: facultad → departamento → carrera
        await selectByOption('FAC', '1');
        await selectByOption('DEP', '10');
        await selectByOption('CAR', '20');

        // ubicación / operativa
        await selectByOption(/Sótano 2/, '-2');
        // recursos: además de la mesa por defecto, agrega 2 PCs (mezcla mesas + PCs)
        const pcsInput = screen.getByText(/PCs — cantidad/i).parentElement!.querySelector('input')!;
        fireEvent.change(pcsInput, { target: { value: '2' } });

        // días: quita Lunes, agrega Sábado
        fireEvent.click(screen.getByRole('button', { name: 'Lunes' }));
        fireEvent.click(screen.getByRole('button', { name: 'Sábado' }));

        // equipo especializado: agregar, editar nombre, y agregar otro + eliminar
        fireEvent.click(screen.getByRole('button', { name: /Agregar equipo/i }));
        fireEvent.change(await screen.findByPlaceholderText(/Torno CNC/i), { target: { value: 'Torno CNC' } });
        fireEvent.click(screen.getByRole('button', { name: /Agregar equipo/i }));
        fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar equipo' })[1]); // botón eliminar equipo

        // director → responsables (filtrados por director)
        await selectByOption('Diego Milanes', '117');
        const resp = await screen.findByRole('checkbox');
        fireEvent.click(resp);

        // crear
        fireEvent.click(screen.getByRole('button', { name: /Crear Laboratorio/i }));
        await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/laboratorios', expect.objectContaining({
            codigoLab: 'L999', nombre: 'Lab Test',
            // Mezcla de recursos: 1 mesa (default) + 2 PCs
            recursos: expect.arrayContaining([
                expect.objectContaining({ tipo: 'MESA', cantidad: 1 }),
                expect.objectContaining({ tipo: 'PC', cantidad: 2 }),
            ]),
        })));
    });

    it('cascada: elegir director autocompleta su departamento', async () => {
        deptoPorDirector = { id: 10, nombre: 'DEP', facultadId: 1 };
        renderPage();
        await screen.findByRole('heading', { name: /Crear Laboratorio/i });
        // Elegir director → debe autocompletar el departamento (id 10) vía la cascada.
        await selectByOption('Diego Milanes', '117');
        await waitFor(() => {
            const depSelect = screen.getByRole('option', { name: 'DEP' }).closest('select') as HTMLSelectElement;
            expect(depSelect.value).toBe('10');
        });
    });

    it('cascada inversa: marcar un responsable autocompleta su director y departamento', async () => {
        deptoPorDirector = { id: 10, nombre: 'DEP', facultadId: 1 };
        renderPage();
        await screen.findByRole('heading', { name: /Crear Laboratorio/i });
        // Sin director elegido, marcar el responsable (David) → autocompleta director Diego (117) y depto 10.
        fireEvent.click(await screen.findByRole('checkbox'));
        await waitFor(() => {
            const dirSelect = screen.getByRole('option', { name: 'Diego Milanes' }).closest('select') as HTMLSelectElement;
            expect(dirSelect.value).toBe('117');
        });
        await waitFor(() => {
            const depSelect = screen.getByRole('option', { name: 'DEP' }).closest('select') as HTMLSelectElement;
            expect(depSelect.value).toBe('10');
        });
    });

    it('cascada: elegir departamento autocompleta su director y su facultad', async () => {
        departamentosResp = [{ id: 10, nombre: 'DEP', facultadId: 1, directorId: 117 }];
        renderPage();
        await screen.findByRole('heading', { name: /Crear Laboratorio/i });
        // Elegir facultad para que aparezca el departamento, luego el departamento.
        await selectByOption('FAC', '1');
        await selectByOption('DEP', '10');
        await waitFor(() => {
            const dirSelect = screen.getByRole('option', { name: 'Diego Milanes' }).closest('select') as HTMLSelectElement;
            expect(dirSelect.value).toBe('117');
        });
    });

    it('al elegir facultad, los directores se piden por facultadId', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Crear Laboratorio/i });
        await selectByOption('FAC', '1');
        await waitFor(() =>
            expect(apiGet).toHaveBeenCalledWith(expect.stringContaining('/usuarios/directores?facultadId=1')));
    });

    it('al elegir departamento, las carreras se piden por departamentoId', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Crear Laboratorio/i });
        await selectByOption('FAC', '1');
        await selectByOption('DEP', '10');
        await waitFor(() =>
            expect(apiGet).toHaveBeenCalledWith(expect.stringContaining('/estructura/carreras?departamentoId=10')));
    });

    it('botón Limpiar resetea la selección académica y el director', async () => {
        deptoPorDirector = { id: 10, nombre: 'DEP', facultadId: 1 };
        renderPage();
        await screen.findByRole('heading', { name: /Crear Laboratorio/i });
        await selectByOption('Diego Milanes', '117'); // setea director (+ depto por cascada)
        await waitFor(() => {
            const dirSelect = screen.getByRole('option', { name: 'Diego Milanes' }).closest('select') as HTMLSelectElement;
            expect(dirSelect.value).toBe('117');
        });
        fireEvent.click(screen.getByRole('button', { name: /Limpiar/i }));
        await waitFor(() => {
            const dirSelect = screen.getByRole('option', { name: 'Diego Milanes' }).closest('select') as HTMLSelectElement;
            expect(dirSelect.value).toBe('');
        });
    });

    it('validación: sin código ni nombre no envía el POST', async () => {
        renderPage();
        await screen.findByRole('heading', { name: /Crear Laboratorio/i });
        fireEvent.click(screen.getByRole('button', { name: /Crear Laboratorio/i }));
        await new Promise((r) => setTimeout(r, 30));
        expect(apiPost).not.toHaveBeenCalled();
    });
});

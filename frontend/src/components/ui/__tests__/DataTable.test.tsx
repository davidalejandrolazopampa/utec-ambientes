import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '../DataTable';

interface Row { nombre: string; carrera: string; edad: number; }

const data: Row[] = [
    { nombre: 'Ana', carrera: 'Software', edad: 20 },
    { nombre: 'Beto', carrera: 'Data', edad: 22 },
    { nombre: 'Cira', carrera: 'Software', edad: 19 },
];

const columns: ColumnDef<Row, unknown>[] = [
    { accessorKey: 'nombre', header: 'Nombre' },
    { accessorKey: 'carrera', header: 'Carrera' },
    { accessorKey: 'edad', header: 'Edad' },
];

describe('DataTable', () => {
    it('renderiza las filas y el conteo', () => {
        render(<DataTable data={data} columns={columns} />);
        expect(screen.getByText('Ana')).toBeInTheDocument();
        expect(screen.getByText('Beto')).toBeInTheDocument();
        expect(screen.getByText('3 filas')).toBeInTheDocument();
    });

    it('la búsqueda global filtra las filas', () => {
        render(<DataTable data={data} columns={columns} searchPlaceholder="Buscar" />);
        fireEvent.change(screen.getByPlaceholderText('Buscar'), { target: { value: 'Ana' } });
        expect(screen.getByText('Ana')).toBeInTheDocument();
        expect(screen.queryByText('Beto')).not.toBeInTheDocument();
        expect(screen.getByText('1 filas')).toBeInTheDocument();
    });

    it('ordena al pulsar el encabezado (aria-sort)', () => {
        render(<DataTable data={data} columns={columns} />);
        const th = screen.getByText('Carrera').closest('th')!;
        expect(th).toHaveAttribute('aria-sort', 'none');
        fireEvent.click(screen.getByRole('button', { name: /Carrera/ }));
        expect(th).toHaveAttribute('aria-sort', 'ascending');
    });

    it('respeta initialSort descendente', () => {
        render(<DataTable data={data} columns={columns} initialSort={[{ id: 'edad', desc: true }]} />);
        const th = screen.getByText('Edad').closest('th')!;
        expect(th).toHaveAttribute('aria-sort', 'descending');
    });

    it('el filtro por columna muestra los valores distintos y filtra', () => {
        render(<DataTable data={data} columns={columns} filters={[{ id: 'carrera', label: 'Carrera' }]} />);
        const select = screen.getByLabelText('Filtrar por Carrera');
        // valores distintos: Data, Software (+ opción "todos")
        expect(within(select).getByRole('option', { name: 'Data' })).toBeInTheDocument();
        expect(within(select).getByRole('option', { name: 'Software' })).toBeInTheDocument();
        fireEvent.change(select, { target: { value: 'Data' } });
        expect(screen.getByText('Beto')).toBeInTheDocument();
        expect(screen.queryByText('Ana')).not.toBeInTheDocument();
    });

    it('oculta el botón CSV cuando canExport es false', () => {
        render(<DataTable data={data} columns={columns} canExport={false} />);
        expect(screen.queryByRole('button', { name: /CSV/i })).not.toBeInTheDocument();
    });

    it('exporta CSV al pulsar el botón', () => {
        const createUrl = vi.fn(() => 'blob:x');
        const revokeUrl = vi.fn();
        URL.createObjectURL = createUrl as typeof URL.createObjectURL;
        URL.revokeObjectURL = revokeUrl as typeof URL.revokeObjectURL;
        const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        render(<DataTable data={data} columns={columns} filename="alumnos" />);
        fireEvent.click(screen.getByRole('button', { name: /CSV/i }));
        expect(createUrl).toHaveBeenCalledOnce();
        expect(clickSpy).toHaveBeenCalledOnce();
        clickSpy.mockRestore();
    });

    it('muestra "Sin resultados" cuando no hay filas', () => {
        render(<DataTable data={[]} columns={columns} />);
        expect(screen.getByText('Sin resultados')).toBeInTheDocument();
    });

    it('pagina cuando hay más filas que el tamaño de página', () => {
        const many: Row[] = Array.from({ length: 25 }, (_, i) => ({ nombre: `P${i}`, carrera: 'X', edad: i }));
        render(<DataTable data={many} columns={columns} />);
        // pageSize por defecto 20 → hay una segunda página
        expect(screen.getByRole('button', { name: 'Siguiente' })).toBeInTheDocument();
        expect(screen.getByText('P0')).toBeInTheDocument();
        expect(screen.queryByText('P24')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '2' }));
        expect(screen.getByText('P24')).toBeInTheDocument();
        expect(screen.queryByText('P0')).not.toBeInTheDocument();
    });

    describe('modo servidor', () => {
        const server = (over: Partial<Parameters<typeof DataTable>[0]['server'] & object> = {}) => ({
            total: 45, pageIndex: 0, pageSize: 20,
            onPageChange: vi.fn(), onPageSizeChange: vi.fn(),
            search: '', onSearchChange: vi.fn(), loading: false,
            ...over,
        });

        it('muestra el total del servidor (no la longitud de la página)', () => {
            render(<DataTable data={data} columns={columns} server={server()} />);
            expect(screen.getByText('45 filas')).toBeInTheDocument(); // total, aunque solo hay 3 en pantalla
        });

        it('la búsqueda llama onSearchChange (no filtra en cliente)', () => {
            const s = server();
            render(<DataTable data={data} columns={columns} server={s} searchPlaceholder="Buscar" />);
            fireEvent.change(screen.getByPlaceholderText('Buscar'), { target: { value: 'ana' } });
            expect(s.onSearchChange).toHaveBeenCalledWith('ana');
            // no filtra la página: siguen las 3 filas visibles
            expect(screen.getByText('Beto')).toBeInTheDocument();
        });

        it('la paginación llama onPageChange con el índice del servidor', () => {
            const s = server(); // total 45, size 20 → 3 páginas
            render(<DataTable data={data} columns={columns} server={s} />);
            fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
            expect(s.onPageChange).toHaveBeenCalledWith(1);
            fireEvent.click(screen.getByRole('button', { name: '3' }));
            expect(s.onPageChange).toHaveBeenCalledWith(2);
        });

        it('deshabilita Anterior en la primera página y Siguiente en la última', () => {
            const { rerender } = render(<DataTable data={data} columns={columns} server={server({ pageIndex: 0 })} />);
            expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
            rerender(<DataTable data={data} columns={columns} server={server({ pageIndex: 2 })} />);
            expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
        });

        it('cambiar tamaño de página llama onPageSizeChange', () => {
            const s = server();
            render(<DataTable data={data} columns={columns} server={s} />);
            fireEvent.change(screen.getByDisplayValue('20'), { target: { value: '10' } });
            expect(s.onPageSizeChange).toHaveBeenCalledWith(10);
        });

        it('indica "actualizando…" cuando loading', () => {
            render(<DataTable data={data} columns={columns} server={server({ loading: true })} />);
            expect(screen.getByText(/actualizando/)).toBeInTheDocument();
        });
    });
});

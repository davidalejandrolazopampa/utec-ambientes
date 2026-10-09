import { useState } from 'react';
import {
    flexRender, getCoreRowModel, getSortedRowModel, getFilteredRowModel, getPaginationRowModel,
    useReactTable, type ColumnDef, type SortingState, type ColumnFiltersState,
} from '@tanstack/react-table';
import { ArrowUpDown, ArrowUp, ArrowDown, Search, Download, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Control externo de paginación/búsqueda (modo SERVIDOR). Cuando se pasa `server`,
 * la tabla NO pagina ni filtra en el cliente: el padre trae del backend solo la
 * página visible (page/size) y la búsqueda va como parámetro. Evita descargar miles
 * de filas de golpe (Gestión de Reservas con 8k+). El orden por columna sigue
 * aplicando sobre la página visible.
 */
export interface ServerControls {
    total: number;
    pageIndex: number;
    pageSize: number;
    onPageChange: (i: number) => void;
    onPageSizeChange: (s: number) => void;
    search: string;
    onSearchChange: (q: string) => void;
    loading?: boolean;
}

interface DataTableProps<T> {
    data: T[];
    columns: ColumnDef<T, unknown>[];
    filename?: string;
    searchPlaceholder?: string;
    /** Sin envoltura .card (para usar dentro de una card existente). */
    bare?: boolean;
    /** Mostrar el botón de export CSV (por defecto sí). */
    canExport?: boolean;
    /** Orden inicial (ej. [{ id: 'fecha', desc: true }]). */
    initialSort?: SortingState;
    /** Filtros por columna (dropdown de valores distintos). */
    filters?: { id: string; label: string }[];
    /** Modo servidor: paginación/búsqueda controladas por el padre (ver ServerControls). */
    server?: ServerControls;
}

/**
 * Tabla reutilizable (TanStack Table): orden por columna (aria-sort), búsqueda
 * global, export CSV, header sticky y estilos con tokens (light/dark).
 */
export default function DataTable<T>({ data, columns, filename = 'datos', searchPlaceholder = 'Buscar…', bare = false, canExport = true, initialSort, filters, server }: DataTableProps<T>) {
    const [sorting, setSorting] = useState<SortingState>(initialSort ?? []);
    const [globalFilter, setGlobalFilter] = useState('');
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const esServidor = !!server;

    const table = useReactTable({
        data,
        columns,
        state: { sorting, globalFilter, columnFilters },
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        onColumnFiltersChange: setColumnFilters,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        // En modo servidor el padre ya trae solo la página filtrada; no paginar/filtrar en cliente.
        ...(esServidor ? {} : { getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel() }),
        initialState: { pagination: { pageSize: 20 } },
    });

    // Ventana de números de página a mostrar (máx. 5, centrada en la actual).
    // En modo servidor la paginación viene del padre (total/size); si no, de la tabla.
    const pageCount = esServidor ? Math.max(1, Math.ceil(server.total / server.pageSize)) : table.getPageCount();
    const pageIndex = esServidor ? server.pageIndex : table.getState().pagination.pageIndex;
    const winStart = Math.max(0, Math.min(pageIndex - 2, pageCount - 5));
    const pageWindow = Array.from({ length: Math.min(5, pageCount) }, (_, i) => winStart + i);
    const irAPagina = (p: number) => (esServidor ? server.onPageChange(p) : table.setPageIndex(p));
    const cambiarTamano = (n: number) => (esServidor ? server.onPageSizeChange(n) : table.setPageSize(n));
    const pageSizeActual = esServidor ? server.pageSize : table.getState().pagination.pageSize;
    const puedeAnterior = pageIndex > 0;
    const puedeSiguiente = pageIndex < pageCount - 1;

    const exportCsv = () => {
        // Solo columnas de datos (con accessorKey); ignora la de acciones.
        const cols = table.getAllLeafColumns().filter((c) => 'accessorKey' in (c.columnDef as object));
        const head = cols.map((c) => {
            const h = c.columnDef.header;
            return typeof h === 'string' ? h : c.id;
        });
        const rows = table.getFilteredRowModel().rows.map((r) =>
            cols.map((c) => {
                const v = r.getValue(c.id);
                const s = v == null ? '' : String(v);
                return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            })
        );
        const csv = [head, ...rows].map((r) => r.join(',')).join('\n');
        const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className={bare ? 'rounded-lg border border-line overflow-hidden' : 'card !p-0 overflow-hidden'}>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 p-3 border-b border-line">
                <div className="relative flex-1 min-w-[180px] max-w-xs">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                    <input
                        value={esServidor ? server.search : globalFilter}
                        onChange={(e) => (esServidor ? server.onSearchChange(e.target.value) : setGlobalFilter(e.target.value))}
                        placeholder={searchPlaceholder}
                        className="input-field !pl-9 !py-2 text-sm"
                    />
                </div>
                {!esServidor && filters?.map((f) => {
                    const col = table.getColumn(f.id);
                    const valores = Array.from(new Set(table.getPreFilteredRowModel().rows.map((r) => r.getValue(f.id))))
                        .filter((v) => v != null && v !== '')
                        .map(String)
                        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
                    return (
                        <select
                            key={f.id}
                            value={(col?.getFilterValue() as string) ?? ''}
                            onChange={(e) => col?.setFilterValue(e.target.value || undefined)}
                            className="input-field !py-2 !w-auto text-sm"
                            aria-label={`Filtrar por ${f.label}`}
                        >
                            <option value="">{f.label}: todos</option>
                            {valores.map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                    );
                })}
                <span className="text-xs text-ink-muted tabular">
                    {esServidor ? `${server.total} filas` : `${table.getFilteredRowModel().rows.length} filas`}
                    {esServidor && server.loading && ' · actualizando…'}
                </span>
                {canExport && (
                    <button onClick={exportCsv} title={esServidor ? 'Exporta la página visible' : undefined} className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-line text-ink hover:bg-utec-cyan/10 transition-colors">
                        <Download size={16} /> CSV
                    </button>
                )}
            </div>

            {/* Tabla */}
            <div className="overflow-auto max-h-[70vh]">
                <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-surface">
                        {table.getHeaderGroups().map((hg) => (
                            <tr key={hg.id} className="border-b border-line">
                                {hg.headers.map((header) => {
                                    const canSort = header.column.getCanSort();
                                    const sorted = header.column.getIsSorted();
                                    return (
                                        <th
                                            key={header.id}
                                            aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                                            className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted whitespace-nowrap"
                                        >
                                            {header.isPlaceholder ? null : canSort ? (
                                                <button onClick={header.column.getToggleSortingHandler()} className="inline-flex items-center gap-1 hover:text-ink">
                                                    {flexRender(header.column.columnDef.header, header.getContext())}
                                                    {sorted === 'asc' ? <ArrowUp size={13} /> : sorted === 'desc' ? <ArrowDown size={13} /> : <ArrowUpDown size={13} className="opacity-40" />}
                                                </button>
                                            ) : (
                                                flexRender(header.column.columnDef.header, header.getContext())
                                            )}
                                        </th>
                                    );
                                })}
                            </tr>
                        ))}
                    </thead>
                    <tbody>
                        {table.getRowModel().rows.map((row) => (
                            <tr key={row.id} className="border-b border-line hover:bg-utec-cyan/[0.04] transition-colors">
                                {row.getVisibleCells().map((cell) => (
                                    <td key={cell.id} className="px-4 py-2.5 text-ink align-middle whitespace-nowrap">
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </td>
                                ))}
                            </tr>
                        ))}
                        {table.getRowModel().rows.length === 0 && (
                            <tr>
                                <td colSpan={columns.length} className="px-4 py-10 text-center text-ink-muted">Sin resultados</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Paginación */}
            {pageCount > 1 && (
                <div className="flex flex-wrap items-center gap-2 p-3 border-t border-line text-sm">
                    <label className="text-ink-muted flex items-center gap-1.5">
                        Filas
                        <select
                            value={pageSizeActual}
                            onChange={(e) => cambiarTamano(Number(e.target.value))}
                            className="input-field !py-1 !px-2 !w-auto text-xs"
                        >
                            {[10, 20, 30, 50].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                    </label>
                    <div className="ml-auto flex items-center gap-1">
                        <button onClick={() => irAPagina(pageIndex - 1)} disabled={!puedeAnterior} aria-label="Anterior"
                            className="p-1.5 rounded-md border border-line text-ink disabled:opacity-40 hover:bg-utec-cyan/10 transition-colors">
                            <ChevronLeft size={16} />
                        </button>
                        {pageWindow.map((p) => (
                            <button key={p} onClick={() => irAPagina(p)} aria-current={p === pageIndex ? 'page' : undefined}
                                className={`min-w-[32px] h-8 px-2 rounded-md text-sm font-medium transition-colors ${
                                    p === pageIndex ? 'bg-utec-cyan text-white' : 'border border-line text-ink hover:bg-utec-cyan/10'
                                }`}>
                                {p + 1}
                            </button>
                        ))}
                        <button onClick={() => irAPagina(pageIndex + 1)} disabled={!puedeSiguiente} aria-label="Siguiente"
                            className="p-1.5 rounded-md border border-line text-ink disabled:opacity-40 hover:bg-utec-cyan/10 transition-colors">
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

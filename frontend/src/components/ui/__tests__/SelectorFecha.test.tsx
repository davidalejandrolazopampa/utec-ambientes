import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SelectorFecha, { formatoFechaLarga } from '../SelectorFecha';

describe('SelectorFecha', () => {
    it('formatoFechaLarga escribe la fecha en español con mayúscula inicial', () => {
        expect(formatoFechaLarga('2026-06-15')).toBe('Lunes, 15 de junio de 2026');
        expect(formatoFechaLarga('')).toBe('');
    });

    it('muestra los chips y la fecha en español, y "Mañana" llama onChange', () => {
        const onChange = vi.fn();
        render(<SelectorFecha value="2026-06-15" onChange={onChange} />);
        // chips
        expect(screen.getByRole('button', { name: 'Hoy' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Pasado' })).toBeInTheDocument();
        // etiqueta amigable
        expect(screen.getByText(/Lunes, 15 de junio de 2026/)).toBeInTheDocument();
        // al pulsar "Mañana" se emite una fecha YYYY-MM-DD
        fireEvent.click(screen.getByRole('button', { name: 'Mañana' }));
        expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    });

    it('con maxOffsetDias=1 no muestra el chip "Pasado" (anticipación de 1 día)', () => {
        render(<SelectorFecha value="" onChange={() => {}} maxOffsetDias={1} />);
        expect(screen.getByRole('button', { name: 'Hoy' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Pasado' })).toBeNull();
    });

    it('filtra por diasPermitidos: si hoy/mañana no están, no hay chips y avisa', () => {
        const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const hoy = new Date().getDay();
        // un día que NO es hoy ni mañana → así hoy y mañana quedan fuera del filtro
        const lejano = DIAS.find((_, i) => i !== hoy && i !== (hoy + 1) % 7)!;
        render(<SelectorFecha value="" onChange={() => {}} maxOffsetDias={1} diasPermitidos={[lejano]} />);
        expect(screen.queryByRole('button', { name: 'Hoy' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Mañana' })).toBeNull();
        expect(screen.getByText(/No hay días disponibles/)).toBeInTheDocument();
    });
});

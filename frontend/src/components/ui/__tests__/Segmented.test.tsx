import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Segmented from '../Segmented';

describe('Segmented', () => {
    const options = [
        { value: 'a', label: 'Uno' },
        { value: 'b', label: 'Dos' },
    ] as const;

    it('renderiza tablist con un tab por opción y marca el activo', () => {
        render(<Segmented value="a" onChange={() => {}} options={[...options]} />);
        expect(screen.getByRole('tablist')).toBeInTheDocument();
        const tabs = screen.getAllByRole('tab');
        expect(tabs).toHaveLength(2);
        expect(screen.getByRole('tab', { name: 'Uno' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tab', { name: 'Dos' })).toHaveAttribute('aria-selected', 'false');
    });

    it('emite onChange con el value al hacer click', () => {
        const onChange = vi.fn();
        render(<Segmented value="a" onChange={onChange} options={[...options]} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Dos' }));
        expect(onChange).toHaveBeenCalledWith('b');
    });

    it('acepta el tamaño sm sin romper', () => {
        render(<Segmented value="a" onChange={() => {}} options={[...options]} size="sm" />);
        expect(screen.getAllByRole('tab')).toHaveLength(2);
    });
});

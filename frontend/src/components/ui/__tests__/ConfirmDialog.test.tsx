import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmProvider, useConfirm } from '../ConfirmDialog';

// Componente de prueba que dispara la confirmación y reporta el resultado.
function Demo({ onResult, variant }: { onResult: (v: boolean) => void; variant?: 'danger' | 'primary' }) {
    const confirm = useConfirm();
    return (
        <button onClick={async () => onResult(await confirm({ title: 'Título', message: '¿Seguro?', variant }))}>
            disparar
        </button>
    );
}

const renderConProvider = (onResult: (v: boolean) => void, variant?: 'danger' | 'primary') =>
    render(
        <ConfirmProvider>
            <Demo onResult={onResult} variant={variant} />
        </ConfirmProvider>
    );

describe('ConfirmDialog / useConfirm', () => {
    beforeEach(() => vi.clearAllMocks());

    it('muestra el modal y resuelve true al Confirmar', async () => {
        const onResult = vi.fn();
        renderConProvider(onResult);
        fireEvent.click(screen.getByText('disparar'));
        expect(await screen.findByText('¿Seguro?')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
        await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
        // el modal se cierra tras decidir
        expect(screen.queryByText('¿Seguro?')).not.toBeInTheDocument();
    });

    it('resuelve false al Cancelar', async () => {
        const onResult = vi.fn();
        renderConProvider(onResult);
        fireEvent.click(screen.getByText('disparar'));
        await screen.findByText('¿Seguro?');
        fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
        await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    });

    it('variante danger pinta el botón de confirmar en rojo', async () => {
        const onResult = vi.fn();
        renderConProvider(onResult, 'danger');
        fireEvent.click(screen.getByText('disparar'));
        await screen.findByText('¿Seguro?');
        expect(screen.getByRole('button', { name: 'Confirmar' }).className).toContain('bg-red-600');
    });

    it('sin ConfirmProvider cae al window.confirm nativo', async () => {
        const spy = vi.spyOn(window, 'confirm').mockReturnValue(false);
        const onResult = vi.fn();
        render(<Demo onResult={onResult} />);
        fireEvent.click(screen.getByText('disparar'));
        await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
        expect(spy).toHaveBeenCalledWith('¿Seguro?');
    });
});

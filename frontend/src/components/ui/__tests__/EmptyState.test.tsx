import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Search } from 'lucide-react';
import EmptyState from '../EmptyState';

describe('EmptyState', () => {
    it('muestra el título y, si se pasa, la descripción y la acción', () => {
        render(
            <EmptyState
                title="Sin reservas"
                description="Aún no hay nada por aquí"
                action={<button>Crear</button>}
            />
        );
        expect(screen.getByText('Sin reservas')).toBeInTheDocument();
        expect(screen.getByText('Aún no hay nada por aquí')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Crear' })).toBeInTheDocument();
    });

    it('sin descripción ni acción solo renderiza el título', () => {
        render(<EmptyState title="Vacío" icon={Search} />);
        expect(screen.getByText('Vacío')).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});

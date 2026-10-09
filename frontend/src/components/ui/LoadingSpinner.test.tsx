import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import LoadingSpinner from './LoadingSpinner';

describe('LoadingSpinner', () => {
    it('renderiza con tamaño md por defecto', () => {
        const { container } = render(<LoadingSpinner />);
        const spinner = container.querySelector('.animate-spin');
        expect(spinner).toBeInTheDocument();
        expect(spinner?.className).toContain('h-8');
    });

    it('aplica las clases del tamaño sm', () => {
        const { container } = render(<LoadingSpinner size="sm" />);
        expect(container.querySelector('.animate-spin')?.className).toContain('h-4');
    });

    it('aplica las clases del tamaño lg', () => {
        const { container } = render(<LoadingSpinner size="lg" />);
        expect(container.querySelector('.animate-spin')?.className).toContain('h-12');
    });
});

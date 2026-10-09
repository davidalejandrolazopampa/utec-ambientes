import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton, SkeletonCards, SkeletonRows } from '../Skeleton';

describe('Skeleton', () => {
    it('Skeleton aplica la clase de shimmer y la className extra', () => {
        const { container } = render(<Skeleton className="h-4 w-10" />);
        const el = container.firstChild as HTMLElement;
        expect(el).toHaveClass('animate-pulse');
        expect(el).toHaveClass('h-4');
        expect(el).toHaveClass('w-10');
    });

    it('SkeletonCards renderiza N tarjetas', () => {
        const { container } = render(<SkeletonCards count={3} />);
        expect(container.querySelectorAll('.card')).toHaveLength(3);
    });

    it('SkeletonRows renderiza N filas', () => {
        const { container } = render(<SkeletonRows rows={6} />);
        expect(container.querySelectorAll('.animate-pulse')).toHaveLength(6);
    });
});

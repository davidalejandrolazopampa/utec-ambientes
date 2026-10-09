import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from './useDebounce';

describe('useDebounce', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('retarda el valor hasta que transcurre el delay', () => {
        const { result, rerender } = renderHook(({ v }) => useDebounce(v, 300), { initialProps: { v: 'a' } });
        expect(result.current).toBe('a');
        rerender({ v: 'b' });
        expect(result.current).toBe('a'); // todavía no pasó el delay
        act(() => { vi.advanceTimersByTime(300); });
        expect(result.current).toBe('b');
    });
});

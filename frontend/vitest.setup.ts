import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Fecha del sistema CONGELADA → tests deterministas que dependen de "hoy" (agrupado Hoy/Pasadas,
// calendario, etc.) sin fallar en el cambio de día/medianoche. Se fake-ea SOLO `Date`: setTimeout,
// Promise y demás siguen reales, así findBy/waitFor (esperas async) funcionan igual.
// Lunes 15-jun-2026, 12:00 (día hábil + mediodía, para que el filtro de horas pasadas sea estable).
vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));

// window.confirm: en jsdom no está implementado y lanza. Las páginas usan el hook
// useConfirm, que cuando NO hay <ConfirmProvider> en el árbol (tests que renderizan
// una página suelta) cae a window.confirm. Lo mockeamos a `true` por defecto para que
// las acciones (guardar/crear/eliminar) procedan; un test puede sobreescribirlo a
// `false` para verificar la cancelación.
beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
});

// Cleanup después de cada test
afterEach(() => {
    cleanup();
});

// Mock de window.matchMedia
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});

// Mock de ResizeObserver (lo usan Recharts y algunos componentes)
global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
} as any;

// Mock de IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
    constructor() {}
    disconnect() {}
    observe() {}
    takeRecords() {
        return [];
    }
    unobserve() {}
} as any;
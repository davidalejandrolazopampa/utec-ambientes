import { create } from 'zustand';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'utec-theme';

function applyTheme(theme: Theme) {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
}

function initialTheme(): Theme {
    try {
        const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
        if (saved === 'light' || saved === 'dark') return saved;
        // por defecto sigue la preferencia del sistema
        if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
    } catch {
        /* ignore */
    }
    return 'light';
}

interface ThemeState {
    theme: Theme;
    toggle: () => void;
    setTheme: (t: Theme) => void;
}

export const useThemeStore = create<ThemeState>((set, get) => {
    const theme = initialTheme();
    // aplica al cargar
    if (typeof document !== 'undefined') applyTheme(theme);

    return {
        theme,
        setTheme: (t) => {
            applyTheme(t);
            try { localStorage.setItem(STORAGE_KEY, t); } catch { /* ignore */ }
            set({ theme: t });
        },
        toggle: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
    };
});

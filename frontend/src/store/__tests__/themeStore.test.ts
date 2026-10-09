import { describe, it, expect, beforeEach } from 'vitest';
import { useThemeStore } from '../themeStore';

describe('themeStore', () => {
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.classList.remove('dark');
        useThemeStore.getState().setTheme('light');
    });

    it('setTheme("dark") aplica la clase .dark y persiste en localStorage', () => {
        useThemeStore.getState().setTheme('dark');
        expect(useThemeStore.getState().theme).toBe('dark');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(localStorage.getItem('utec-theme')).toBe('dark');
    });

    it('setTheme("light") quita la clase .dark', () => {
        useThemeStore.getState().setTheme('dark');
        useThemeStore.getState().setTheme('light');
        expect(useThemeStore.getState().theme).toBe('light');
        expect(document.documentElement.classList.contains('dark')).toBe(false);
        expect(localStorage.getItem('utec-theme')).toBe('light');
    });

    it('toggle alterna entre light y dark', () => {
        expect(useThemeStore.getState().theme).toBe('light');
        useThemeStore.getState().toggle();
        expect(useThemeStore.getState().theme).toBe('dark');
        useThemeStore.getState().toggle();
        expect(useThemeStore.getState().theme).toBe('light');
    });
});

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./vitest.setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text-summary', 'html'],
            include: ['src/**/*.{ts,tsx}'],
            exclude: ['src/main.tsx', 'src/types/**', 'src/**/*.test.{ts,tsx}', 'src/**/__tests__/**', 'src/vite-env.d.ts'],
            // Umbral mínimo tipo "ratchet" (roadmap #5), medido con vitest 4 (v8/AST).
            // NO bajar de aquí; subir conforme se añadan tests. CI falla si la
            // cobertura cae por debajo de estos valores.
            // Re-baseado (jul-2026) al incorporar el módulo de Aulas (AulasPage, CursosPage,
            // DocenciaPage, capa de clases en LabCalendar): mucho código interactivo nuevo
            // (modales/grilla/import) con tests de camino feliz → el ratchet se ajusta al
            // valor real medido: lines 84.4% · stmts 79.87% · branches 71.21% · funcs 73.28%.
            thresholds: {
                lines: 84,
                statements: 79,
                branches: 70,
                functions: 72,
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Tokens semánticos (light/dark vía CSS vars en globals.css)
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        ink: {
          DEFAULT: 'var(--ink)',
          muted: 'var(--ink-muted)',
        },
        line: 'var(--line)',
        sidebar: {
          DEFAULT: 'var(--sidebar)',
          ink: 'var(--sidebar-ink)',
        },
        danger: 'var(--danger)',
        utec: {
          // Primarios (manual pág. 13)
          cyan: '#00BFFF',
          dark: '#231F20',
          white: '#FFFFFF',
          // Secundarios (manual pág. 14)
          blue: '#015EEA',
          yellow: '#FBBC05',
          green: '#34A853',
          // Terciarios (manual pág. 15)
          'cyan-50': '#BFF0FF',
          'cyan-100': '#82E1FF',
          'blue-50': '#7FDFFF',
          'gray-50': '#F8F8F8',
          'gray-100': '#C8C8C8',
          'gray-200': '#8F8F8F',
          'yellow-50': '#FFF0BE',
          'yellow-100': '#FFDD82',
          'green-50': '#CDEBD2',
          'green-100': '#96D2AA',
        },
      },
      fontFamily: {
        // Tipografía corporativa UTEC; sustitutos web libres si no hay licencia
        // (Roboto Slab ≈ Adelle · Inter ≈ Stag Sans). Calibri como fallback del manual.
        display: ['Adelle', 'Roboto Slab', 'Georgia', 'serif'],
        sans: ['Stag Sans', 'Inter', 'Calibri', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
import type { CapacitorConfig } from '@capacitor/cli';

// Envoltura nativa (Android/iOS) de la MISMA app web. Reusa el build de Vite (`dist`).
// La URL del backend se inyecta al compilar con VITE_API_URL (absoluta, HTTPS) — el
// frontend ya la usa en services/api.ts. Ver CAPACITOR.md para el flujo completo.
const config: CapacitorConfig = {
  appId: 'pe.edu.utec.ambientes',
  appName: 'UTEC Ambientes',
  webDir: 'dist',
};

export default config;

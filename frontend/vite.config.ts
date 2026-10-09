import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
export default defineConfig({
  plugins: [
    react(),
    // PWA: instala "UTEC Ambientes" en el celular (Android/iOS), a pantalla completa.
    // Precachea la cáscara de la app (JS/CSS/HTML) para arranque rápido; el backend (/api)
    // NUNCA se cachea (datos en vivo + auth) → siempre va a la red.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'UTEC Ambientes',
        short_name: 'UTEC',
        description: 'Reserva y gestión de laboratorios y ambientes de UTEC.',
        lang: 'es',
        theme_color: '#0891b2',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // No servir index.html (SPA fallback) para el backend: que un 404 de /api sea 404.
        navigateFallbackDenylist: [/^\/api/],
      },
      // En dev el SW queda desactivado (evita cachear mientras se desarrolla).
      devOptions: { enabled: false },
    }),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  // allowedHosts permite servir a través de túneles públicos (Cloudflare/ngrok) en el deploy de demo.
  server: { port: 5173, host: true, allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok-free.dev', '.ngrok.io'], proxy: { '/api': { target: 'http://localhost:8080', changeOrigin: true } } },
  // `vite preview` sirve el build de PRODUCCIÓN (mucho menos ancho de banda que dev) y NO hereda
  // server.proxy, así que repetimos proxy + allowedHosts aquí. Lo usa la demo pública por Cloudflare.
  preview: { port: 4173, host: true, allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok-free.dev', '.ngrok.io'], proxy: { '/api': { target: 'http://localhost:8080', changeOrigin: true } } },
});

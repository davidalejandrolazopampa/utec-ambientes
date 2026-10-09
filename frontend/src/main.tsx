import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import App from './App';
import './styles/globals.css';
import { CLAVES_ANALYTICS } from './config/polling';
// Tras CUALQUIER mutación exitosa (crear/editar/eliminar/asignar) refresca automáticamente
// las listas de gestión activas, sin recargar la página. No se dispara al cancelar, ni al
// solo navegar o abrir modales.
const qc = new QueryClient({
    // refetchOnWindowFocus: al volver a la pestaña, refresca los datos (barato: solo pide cuando
    // miras la pantalla). Así una reserva nueva aparece sin recargar a mano. El polling de cada
    // vista (refetchInterval) se pausa solo cuando la pestaña está oculta → no gasta banda de fondo.
    defaultOptions: { queries: { staleTime: 5*60*1000, retry: 1, refetchOnWindowFocus: true } },
    mutationCache: new MutationCache({
        // Invalidación DIRIGIDA: refresca todo MENOS las queries pesadas de analytics/dashboard
        // (tienen su propio refetchInterval + botón "Actualizar"). Evita disparar agregaciones
        // caras en BD por cada mutación operativa. Ver config/polling.ts.
        onSuccess: () => {
            qc.invalidateQueries({
                predicate: (query) => !CLAVES_ANALYTICS.includes(String(query.queryKey[0])),
            });
        },
    }),
});
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><QueryClientProvider client={qc}><BrowserRouter><App /></BrowserRouter></QueryClientProvider></React.StrictMode>
);

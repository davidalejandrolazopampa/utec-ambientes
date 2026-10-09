// Intervalos de refresco automático (React Query `refetchInterval`), centralizados en un
// solo lugar para mantener coherencia y ajustarlos sin tocar cada pantalla.
// El polling se PAUSA solo cuando la pestaña está oculta (default de React Query) → no gasta
// banda en segundo plano. Ver también `refetchOnWindowFocus` en main.tsx.
//
// ⚠️ Desde el TIEMPO REAL por SSE (useRealtime): los cambios operativos (check-in, reservas,
// bloqueos) llegan por PUSH al instante, así que el polling de esas pantallas pasó a ser un
// FALLBACK (por si el stream SSE se cae o por cambios hechos FUERA de la app, p. ej. reservar.sh
// que inserta por psql y no emite evento). Por eso se subieron los intervalos.
//
// El DASHBOARD ya NO tiene polling (se quitó POLL.DASHBOARD=60s): es un reporte, no una
// vista operativa — el auto-poll solo cubría 2 de sus 7 queries (KPIs se movían pero
// insights/resumen no → falsa sensación de frescura) y disparaba agregaciones pesadas por
// cada viewer. Su frescura la dan el botón "Actualizar" (invalida TODAS sus queries), el
// refetchOnWindowFocus global (al volver a la pestaña) y el indicador "Actualizado hace X".
export const POLL = {
    // Operativo en vivo cubierto por SSE (detalle de lab, calendario): fallback cada 2 min.
    RAPIDO: 120_000,
    // Listas de gestión cubiertas por SSE (labs, bloqueos, reservas): fallback cada 3 min.
    NORMAL: 180_000,
} as const;

// Claves de query PESADAS (dashboard/analytics: queries nativas de agregación). Se EXCLUYEN
// de la invalidación global tras cada mutación (main.tsx) — su frescura va por el botón
// "Actualizar" del dashboard + refetchOnWindowFocus. Así, p. ej., editar una reserva no
// dispara todas las gráficas del dashboard. Se comparan contra queryKey[0].
export const CLAVES_ANALYTICS = [
    'dashboard-full', 'tabla-reservas', 'bloqueos-dashboard', 'operativos',
    'insights', 'resumen-ejecutivo', 'analytics-periodos', 'labs-dashboard',
];

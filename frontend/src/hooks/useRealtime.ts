import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { CLAVES_ANALYTICS } from '@/config/polling';

/**
 * Tiempo real por SSE: al ocurrir un check-in / reserva / bloqueo en el servidor, el navegador
 * recibe un evento e **invalida las queries operativas** (no las de analytics) → las listas,
 * calendarios y detalle se refrescan al instante, sin esperar al polling.
 *
 * Auth: `EventSource` no puede mandar `Authorization: Bearer`, así que primero se pide un
 * ticket de corta vida (endpoint autenticado) y el stream se abre con `?ticket=...`. El ticket
 * es de un solo uso; en cada (re)conexión se pide uno nuevo (por eso NO usamos el auto-reconnect
 * nativo de EventSource, que reintentaría con el ticket ya consumido).
 */
export function useRealtime() {
    const qc = useQueryClient();
    const user = useAuthStore((s) => s.user);

    useEffect(() => {
        if (!user) return; // solo con sesión
        let es: EventSource | null = null;
        let stopped = false;
        let retry: ReturnType<typeof setTimeout> | null = null;

        const connect = async () => {
            if (stopped) return;
            try {
                const res = await api.post<{ data: { ticket: string } }>('/events/ticket');
                const ticket = res.data.data.ticket;
                if (stopped) return;
                const base = import.meta.env.VITE_API_URL || '/api/v1';
                es = new EventSource(`${base}/events/stream?ticket=${encodeURIComponent(ticket)}`, {
                    withCredentials: true,
                });
                es.addEventListener('lab-activity', () => {
                    // Refresca todo lo operativo (reservas, bloqueos, labs, calendario) menos analytics.
                    qc.invalidateQueries({
                        predicate: (q) => !CLAVES_ANALYTICS.includes(String(q.queryKey[0])),
                    });
                });
                es.onerror = () => {
                    es?.close();
                    es = null;
                    if (!stopped) retry = setTimeout(connect, 3000); // re-ticket + reconecta
                };
            } catch {
                if (!stopped) retry = setTimeout(connect, 5000); // p. ej. sin sesión aún
            }
        };
        connect();

        return () => {
            stopped = true;
            es?.close();
            if (retry) clearTimeout(retry);
        };
    }, [user, qc]);
}

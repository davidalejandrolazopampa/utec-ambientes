import { RefreshCw } from 'lucide-react';

/**
 * Indicador discreto de "actualizando…" para listas con refresco automático (polling).
 * Se muestra solo mientras `fetching` es true (un refetch en curso). Usa opacidad (no
 * display) para no mover el layout al aparecer/desaparecer.
 */
export default function LiveIndicator({ fetching, className = '' }: { fetching?: boolean; className?: string }) {
    return (
        <span
            aria-live="polite"
            className={`inline-flex items-center gap-1.5 text-xs text-ink-muted transition-opacity duration-200 ${fetching ? 'opacity-100' : 'opacity-0'} ${className}`}
        >
            <RefreshCw size={12} className="animate-spin" /> Actualizando…
        </span>
    );
}

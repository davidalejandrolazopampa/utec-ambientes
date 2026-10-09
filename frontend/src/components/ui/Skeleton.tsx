/** Bloque de carga (shimmer) reutilizable. */
export function Skeleton({ className = '' }: { className?: string }) {
    return <div className={`animate-pulse rounded-md bg-ink/10 ${className}`} />;
}

/** Grilla de tarjetas KPI en carga. */
export function SkeletonCards({ count = 4 }: { count?: number }) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="card !p-4 space-y-3">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-6 w-16" />
                </div>
            ))}
        </div>
    );
}

/** Filas de tabla/listado en carga. */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
    return (
        <div className="space-y-2">
            {Array.from({ length: rows }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
            ))}
        </div>
    );
}

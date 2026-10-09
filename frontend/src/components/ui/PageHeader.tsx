import { ReactNode } from 'react';

interface PageHeaderProps {
    /** Título de la página (se renderiza como h1). */
    title: string;
    /** Subtítulo o resumen opcional (texto o nodos). */
    subtitle?: ReactNode;
    /** Acciones a la derecha (botones). Usa `btnOnBanner` para el botón de acción principal. */
    actions?: ReactNode;
}

/**
 * Encabezado de página: título + subtítulo + acciones, en un estilo PLANO (no es una barra
 * de color). Antes era un banner con degradado que parecía un segundo navbar junto al
 * MainLayout; ahora es un título de contenido con un acento cyan y un borde inferior, así
 * la única "barra" es el navbar superior.
 */
export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
    return (
        <div className="flex items-start justify-between gap-3 flex-wrap mb-6 pb-3 border-b border-utec-gray-100">
            <div className="min-w-0 flex items-center gap-3">
                <span className="w-1.5 self-stretch min-h-[2rem] rounded-full bg-gradient-to-b from-utec-blue to-utec-cyan" aria-hidden="true" />
                <div className="min-w-0">
                    <h1 className="text-2xl font-display font-bold text-utec-dark">{title}</h1>
                    {subtitle && <div className="text-sm text-utec-gray-200 mt-0.5">{subtitle}</div>}
                </div>
            </div>
            {actions && <div className="flex gap-2 flex-wrap items-center">{actions}</div>}
        </div>
    );
}

/** Estilo del botón de acción principal del encabezado (cyan sobre fondo claro). */
export const btnOnBanner = 'bg-utec-cyan text-white hover:bg-utec-blue px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors';

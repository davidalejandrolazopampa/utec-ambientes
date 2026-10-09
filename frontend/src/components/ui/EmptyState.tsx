import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
    icon?: LucideIcon;
    title: string;
    description?: string;
    action?: React.ReactNode;
}

/** Estado vacío reutilizable: icono + título + descripción + acción opcional. */
export default function EmptyState({ icon: Icon = Inbox, title, description, action }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center text-center py-14 px-6">
            <div className="mb-3 grid place-items-center h-12 w-12 rounded-full bg-utec-cyan/10 text-utec-cyan">
                <Icon size={24} />
            </div>
            <p className="font-medium text-ink">{title}</p>
            {description && <p className="mt-1 text-sm text-ink-muted max-w-sm">{description}</p>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}

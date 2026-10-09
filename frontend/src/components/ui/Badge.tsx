import { clsx } from 'clsx';

interface BadgeProps {
    children: React.ReactNode;
    variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'cyan';
    className?: string;
}

const variants = {
    default: 'bg-utec-gray-50 text-utec-dark border border-utec-gray-100',
    success: 'bg-utec-green-50 text-utec-green',
    warning: 'bg-utec-yellow-50 text-yellow-800',
    danger: 'bg-red-100 text-red-800',
    info: 'bg-utec-cyan-50 text-utec-blue',
    cyan: 'bg-utec-cyan text-utec-dark font-bold',
};

export default function Badge({ children, variant = 'default', className }: BadgeProps) {
    return (
        <span className={clsx(
            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
            variants[variant],
            className
        )}>
      {children}
    </span>
    );
}
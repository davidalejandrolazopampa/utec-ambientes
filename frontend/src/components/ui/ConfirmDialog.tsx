import { createContext, useCallback, useContext, useState } from 'react';

export interface ConfirmOptions {
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'primary';
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingState extends ConfirmOptions {
    resolve: (value: boolean) => void;
}

/**
 * Proveedor de confirmación: monta un único modal y expone una función async
 * `confirm(opts)` vía contexto. Se usa con `const confirm = useConfirm()` y
 * `if (!(await confirm({ message }))) return;` en los manejadores.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
    const [pending, setPending] = useState<PendingState | null>(null);

    const confirm = useCallback<ConfirmFn>((opts) => {
        return new Promise<boolean>((resolve) => {
            setPending({ ...opts, resolve });
        });
    }, []);

    const cerrar = (value: boolean) => {
        if (pending) pending.resolve(value);
        setPending(null);
    };

    const esDanger = pending?.variant === 'danger';

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            {pending && (
                <div
                    className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
                    onClick={() => cerrar(false)}
                    role="dialog"
                    aria-modal="true"
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {pending.title && (
                            <h3 className="text-lg font-bold text-utec-dark mb-2">{pending.title}</h3>
                        )}
                        <p className="text-sm text-utec-gray-200 whitespace-pre-line mb-6">{pending.message}</p>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => cerrar(false)} className="btn-secondary text-sm">
                                {pending.cancelText ?? 'Cancelar'}
                            </button>
                            <button
                                onClick={() => cerrar(true)}
                                autoFocus
                                className={`text-sm font-medium px-4 py-2 rounded-lg text-white transition-colors ${
                                    esDanger
                                        ? 'bg-red-600 hover:bg-red-700'
                                        : 'bg-utec-cyan hover:bg-utec-blue'
                                }`}
                            >
                                {pending.confirmText ?? 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmContext.Provider>
    );
}

/**
 * Devuelve la función de confirmación. Si no hay `ConfirmProvider` en el árbol
 * (p. ej. en tests que renderizan una página suelta), cae al `window.confirm`
 * nativo para no romper su comportamiento.
 */
export function useConfirm(): ConfirmFn {
    const ctx = useContext(ConfirmContext);
    if (ctx) return ctx;
    return (opts: ConfirmOptions) => Promise.resolve(window.confirm(opts.message));
}

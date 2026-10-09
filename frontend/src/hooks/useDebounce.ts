import { useEffect, useState } from 'react';

/** Devuelve `value` retardado `delay` ms; reinicia el timer en cada cambio. */
export function useDebounce<T>(value: T, delay = 300): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
}

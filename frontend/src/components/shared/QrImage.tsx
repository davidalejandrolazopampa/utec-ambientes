import { useEffect, useState } from 'react';
import api from '@/services/api';

interface Props {
    recursoId: number;
    size: number;
    alt?: string;
    className?: string;
}

// El endpoint /qr/recurso/{id} exige autenticación, por lo que no se puede usar
// <img src> directo (no manda el header Authorization). Aquí se descarga el PNG
// con axios (que sí adjunta el access token) y se muestra como objectURL.
export default function QrImage({ recursoId, size, alt, className }: Props) {
    const [src, setSrc] = useState<string | null>(null);

    useEffect(() => {
        let objectUrl: string | null = null;
        let cancelado = false;
        api.get(`/qr/recurso/${recursoId}?size=${size}`, { responseType: 'blob' })
            .then((res) => {
                if (cancelado) return;
                objectUrl = URL.createObjectURL(res.data);
                setSrc(objectUrl);
            })
            .catch(() => { if (!cancelado) setSrc(null); });
        return () => {
            cancelado = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [recursoId, size]);

    if (!src) return <div className={className} aria-label={alt} />;
    return <img src={src} alt={alt} className={className} />;
}

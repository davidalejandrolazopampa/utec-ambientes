import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import logo from '@/assets/utec-logo.png';
import type { Laboratorio, RecursoLab } from '@/types';

// Hoja imprimible de QR de mesas (6 por hoja A4). Se monta vía portal directo en <body>
// para que, al imprimir, paginar limpio (sin que la app la corte) — ver @media print en globals.css.
// Cada QR codifica la URL pública de check-in: {origin}/checkin/{qrCode}, igual que el QR del backend.
const chunk = <T,>(arr: T[], n: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
};

// Imprime poniendo temporalmente el título del documento = "UTEC_LAB_LXXX", para que el PDF
// descargado tenga ese nombre referencial. Restaura el título al cerrar el diálogo.
export function imprimirHojaQr(codigoLab: string) {
    const prev = document.title;
    document.title = `UTEC_LAB_${codigoLab}`;
    const restore = () => { document.title = prev; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    window.print();
}

export default function QrMesasPrint({ lab, recursos }: { lab: Laboratorio; recursos: RecursoLab[] }) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const ordenados = [...recursos].sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { numeric: true }));
    const paginas = chunk(ordenados, 6);
    const sheet = (
        <div className="qr-print-sheet" aria-hidden="true">
            {paginas.map((pagina, i) => (
                <div className="qr-print-page" key={i}>
                    {pagina.map((r) => (
                        <div className="qr-print-card" key={r.id}>
                            <img src={logo} alt="UTEC" className="qr-print-logo" />
                            <div className="qr-print-lab">{lab.nombre} · {lab.codigoLab}</div>
                            <div className="qr-print-mesa">{r.nombre}</div>
                            <QRCodeSVG value={`${origin}/checkin/${r.qrCode}`} size={160} level="M" />
                            <div className="qr-print-foot">Escanea para hacer check-in</div>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
    return typeof document !== 'undefined' ? createPortal(sheet, document.body) : sheet;
}

import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import api from '@/services/api';

export default function CheckinPage() {
    const { qrCode } = useParams<{ qrCode: string }>();
    const navigate = useNavigate();
    const { isAuthenticated } = useAuthStore();
    const [estado, setEstado] = useState<'loading' | 'success' | 'error'>('loading');
    const [mensaje, setMensaje] = useState('');
    const [detalle, setDetalle] = useState({ recurso: '', laboratorio: '' });
    // Evita el doble disparo del check-in: el useEffect se invoca dos veces en dev
    // (React StrictMode) y al cambiar deps; sin esta guarda se enviaban 2 POST a la vez
    // sobre la misma reserva/mesa → deadlock o un segundo error confuso ("no hay reserva
    // activa", porque la 1ª ya la dejó EN_CURSO). Solo el primer intento procede.
    const yaIntentado = useRef(false);

    useEffect(() => {
        if (!isAuthenticated) {
            localStorage.setItem('checkin_pendiente', qrCode || '');
            navigate('/login');
            return;
        }

        if (qrCode && !yaIntentado.current) {
            yaIntentado.current = true;
            api.post(`/checkin/qr/${qrCode}`)
                .then((res) => {
                    const data = res.data.data;
                    setEstado('success');
                    setMensaje(data.mensaje);
                    setDetalle({ recurso: data.recursoNombre, laboratorio: data.laboratorioNombre });
                })
                .catch((err) => {
                    setEstado('error');
                    setMensaje(err.response?.data?.message || 'Error al hacer check-in');
                });
        }
    }, [qrCode, isAuthenticated]);

    return (
        <div className="min-h-screen bg-utec-gray-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
                <img src="https://utec.edu.pe/sites/default/files/2024-10/LOGO_UTEC.svg" alt="UTEC" className="h-10 mx-auto mb-6" />

                {estado === 'loading' && (
                    <div>
                        <div className="animate-spin rounded-full h-12 w-12 border-2 border-utec-gray-100 border-t-utec-cyan mx-auto mb-4" />
                        <p className="text-utec-gray-200">Validando check-in...</p>
                    </div>
                )}

                {estado === 'success' && (
                    <div>
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Check size={32} className="text-green-600" />
                        </div>
                        <h2 className="text-xl font-bold text-utec-dark mb-2">¡Check-in Exitoso!</h2>
                        <p className="text-utec-gray-200 mb-4">{mensaje}</p>
                        <div className="bg-utec-cyan/5 border border-utec-cyan/20 rounded-lg p-3 mb-6">
                            <p className="text-sm font-medium text-utec-dark">{detalle.recurso}</p>
                            <p className="text-sm text-utec-gray-200">{detalle.laboratorio}</p>
                        </div>
                        <button onClick={() => navigate('/reservas')} className="btn-primary w-full">
                            Ver mis reservas
                        </button>
                    </div>
                )}

                {estado === 'error' && (
                    <div>
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <X size={32} className="text-red-600" />
                        </div>
                        <h2 className="text-xl font-bold text-utec-dark mb-2">Check-in Fallido</h2>
                        <p className="text-red-600 mb-6">{mensaje}</p>
                        <button onClick={() => navigate('/reservas')} className="btn-secondary w-full">
                            Ir a mis reservas
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
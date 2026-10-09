import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import toast from 'react-hot-toast';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export default function LoginPage() {
    const navigate = useNavigate();
    const { login } = useAuthStore();
    const theme = useThemeStore((s) => s.theme);

    // El login SIEMPRE se muestra en modo claro (en oscuro se ve mal). Se quita la clase
    // `dark` mientras esta página está montada y se restaura la preferencia del usuario al salir.
    useEffect(() => {
        const root = document.documentElement;
        root.classList.remove('dark');
        return () => {
            if (theme === 'dark') root.classList.add('dark');
        };
    }, [theme]);

    const handleSuccess = async (credentialResponse: { credential?: string }) => {
        if (!credentialResponse.credential) {
            toast.error('No se recibió credencial de Google');
            return;
        }
        try {
            await login(credentialResponse.credential);
            toast.success('Bienvenido a UTEC Ambientes');
            navigate('/laboratorios');
        } catch (err: unknown) {
            // Muestra el mensaje real del backend (ej. "No estás registrado... contacta al
            // coordinador" para correos administrativos); si no hay, mensaje genérico.
            const e = err as { response?: { data?: { message?: string } } };
            toast.error(e.response?.data?.message || 'Error al iniciar sesión. Verifica que uses un correo @utec.edu.pe');
        }
    };

    return (
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
            <div className="min-h-screen flex">
                {/* Lado izquierdo: imagen edificio UTEC */}
                <div className="hidden lg:block lg:w-[45%] relative">
                    <img
                        src="https://z9r4docs.utec.edu.pe/sites/default/files/2024-10/utec-img.jpg"
                        alt="Edificio UTEC"
                        className="absolute inset-0 w-full h-full object-cover"
                    />
                </div>

                {/* Lado derecho: login */}
                <div className="w-full lg:w-[55%] relative overflow-hidden" style={{ backgroundColor: '#f0f2f5' }}>
                    {/* Triángulo decorativo sutil (como la intranet) */}
                    <svg
                        className="absolute top-0 right-0 opacity-[0.07]"
                        width="700"
                        height="700"
                        viewBox="0 0 700 700"
                    >
                        <polygon points="700,0 700,700 0,0" fill="#00BFFF" />
                    </svg>

                    {/* Logo UTEC arriba derecha */}
                    <div className="relative z-10 flex justify-end p-10">
                        <img
                            src="https://utec.edu.pe/sites/default/files/2024-10/LOGO_UTEC.svg"
                            alt="UTEC"
                            className="h-28"
                        />
                    </div>

                    {/* Contenido centrado */}
                    <div className="relative z-10 flex items-start justify-center px-10 mt-8 lg:mt-16">
                        <div className="w-full max-w-md">
                            {/* Título estilo intranet */}
                            <h1 className="text-[2.2rem] font-bold text-utec-dark mb-1" style={{ fontFamily: "'Adelle', Georgia, serif" }}>
                                UTEC Ambientes
                            </h1>
                            <p className="text-[1rem] text-[#6b7280] mb-8" style={{ fontFamily: "'Stag Sans', Calibri, sans-serif" }}>
                                Ingresa con tu cuenta de correo
                            </p>

                            {/* Card blanca con sombra suave */}
                            <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.08)] p-10">
                                {GOOGLE_CLIENT_ID ? (
                                    <div className="flex flex-col items-center gap-8">
                                        <GoogleLogin
                                            onSuccess={handleSuccess}
                                            onError={() => toast.error('Error con Google')}
                                            theme="filled_blue"
                                            size="large"
                                            text="signin_with"
                                            shape="rectangular"
                                            width="280"
                                        />
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-4">
                                        <p className="text-sm text-[#6b7280]">
                                            Google Client ID no configurado
                                        </p>
                                        <button
                                            onClick={() => navigate('/laboratorios')}
                                            className="bg-[#4285f4] text-white px-8 py-3 rounded font-medium text-sm hover:bg-[#3367d6] transition-colors"
                                        >
                                            Continuar sin login (dev)
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Link inferior como la intranet */}
                            <p className="mt-6">
                                <a href="#" className="text-sm text-[#9ca3af] hover:text-utec-cyan transition-colors">
                                    ¿Necesitas ayuda?
                                </a>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </GoogleOAuthProvider>
    );
}
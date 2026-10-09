import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { POLL } from '@/config/polling';
import { reservasApi } from '@/services/reservas';
import { useAuthStore } from '@/store/authStore';
import api from '@/services/api';
import { Bell, CalendarDays, Armchair, Users, Calendar, Clock, User, Mail, GraduationCap, Camera, Check, LayoutGrid, Table as TableIcon, XCircle, ScanLine, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import Badge from '@/components/ui/Badge';
import DataTable from '@/components/ui/DataTable';
import Segmented from '@/components/ui/Segmented';
import PageHeader from '@/components/ui/PageHeader';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import toast from 'react-hot-toast';
import type { BrowserQRCodeReader } from '@zxing/library';
import { hoyLocal } from '@/utils/fecha';
import type { Reserva } from '@/types';

export const estadoVariant = (estado: string) => {
    switch (estado) {
        case 'PENDIENTE': return 'warning';
        case 'CONFIRMADA': return 'info';
        case 'EN_CURSO': return 'success';
        case 'COMPLETADA': return 'default';
        case 'CANCELADA': return 'danger';
        case 'NO_SHOW': return 'danger';
        default: return 'default';
    }
};

const rolesAdmin = ['ADMIN', 'COORDINADOR', 'DIRECTOR', 'RESPONSABLE_LAB'];

// Duraciones cuyo FIN cae siempre en la malla de 30 min (:00 / :30).
// Ej.: inicio 10:05 → 25 min (fin 10:30), 55 min (11:00), 1h25 (11:30)...
export const generarDuraciones = (horaInicio: string, horaCierre: string): { label: string; fin: string }[] => {
    if (!horaInicio) return [];
    const [hI, mI] = horaInicio.split(':').map(Number);
    const [hC, mC] = horaCierre.split(':').map(Number);
    const inicio = hI * 60 + mI;
    const cierre = hC * 60 + mC;
    const out: { label: string; fin: string }[] = [];
    let fin = Math.floor(inicio / 30) * 30 + 30;
    while (fin <= cierre && out.length < 12) {
        const dur = fin - inicio;
        const finStr = `${String(Math.floor(fin / 60)).padStart(2, '0')}:${String(fin % 60).padStart(2, '0')}`;
        const hrs = Math.floor(dur / 60);
        const min = dur % 60;
        const etiqueta = hrs === 0 ? `${min} min` : min === 0 ? `${hrs} h` : `${hrs}h${min}`;
        out.push({ label: `${etiqueta} → ${finStr}`, fin: finStr });
        fin += 30;
    }
    return out;
};

// ✅ Generar horas cada 30 minutos
export const generarHoras = (horaApertura: string, horaCierre: string): string[] => {
    const horas: string[] = [];
    const [aperturaH, aperturaM] = horaApertura.split(':').map(Number);
    const [cierreH, cierreM] = horaCierre.split(':').map(Number);

    let h = aperturaH;
    let m = aperturaM;

    while (h < cierreH || (h === cierreH && m < cierreM)) {
        horas.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        m += 30;
        if (m >= 60) {
            m -= 60;
            h += 1;
        }
    }

    return horas;
};

// ✅ Calcular hora fin sumando duración
export const calcularHoraFin = (horaInicio: string, duracion: string): string => {
    const [hI, mI] = horaInicio.split(':').map(Number);
    const [hD, mD] = duracion.split(':').map(Number);

    let horaFinal = hI + hD;
    let minFinal = mI + mD;

    if (minFinal >= 60) {
        horaFinal += Math.floor(minFinal / 60);
        minFinal = minFinal % 60;
    }

    return `${String(horaFinal).padStart(2, '0')}:${String(minFinal).padStart(2, '0')}`;
};

export default function ReservasPage() {
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const user = useAuthStore((s) => s.user);
    const esAdmin = user?.rol && rolesAdmin.includes(user.rol);

    // ========== ESTADOS ==========
    const [editModal, setEditModal] = useState<Reserva | null>(null);
    const [checkinModal, setCheckinModal] = useState<Reserva | null>(null);
    const [vista, setVista] = useState<'tarjetas' | 'tabla'>('tarjetas');
    const [scanning, setScanning] = useState(false);
    const [scanError, setScanError] = useState('');
    const [expandirHoy, setExpandirHoy] = useState(true);

    // ========== REFS PARA CÁMARA ==========
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // ========== ESTADO PARA EDITAR ==========
    const [editForm, setEditForm] = useState({
        recursoId: 0,
        fecha: '',
        horaInicio: '',
        horaFin: '',
        participantes: 1,
        // Correos de los acompañantes (participantes - 1). Vacíos al abrir: por PII no
        // se reciben del backend; solo se envían si el editor cambia los participantes.
        emailsAdicionales: [] as string[],
    });

    const correoUtecValido = (e: string) => /^[^\s@]+@utec\.edu\.pe$/i.test(e.trim());

    // ========== QUERIES ==========
    // Gestión de Reservas PAGINADA en el servidor (antes bajaba las 8k+ de golpe y
    // refrescaba cada 15s → se colgaba). Ahora pide solo la página visible; búsqueda
    // con debounce; refresco lento (60s) + botón manual (invalida la query).
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(20);
    const [busqueda, setBusqueda] = useState('');
    const [q, setQ] = useState(''); // término efectivo (con debounce) que va al backend
    const [labId, setLabId] = useState<number | ''>(''); // filtro por laboratorio; '' = todos
    useEffect(() => {
        const t = setTimeout(() => { setQ(busqueda); setPage(0); }, 350);
        return () => clearTimeout(t);
    }, [busqueda]);

    // Labs para el desplegable de filtro: el endpoint ya está acotado por rol
    // (admin/coord = todos; director/responsable = solo los suyos).
    const { data: misLabs } = useQuery({
        queryKey: ['mis-laboratorios'],
        queryFn: () => api.get('/laboratorios/mis-laboratorios'),
        select: (res) => (res.data.data as { id: number; nombre: string; codigoLab: string }[])
            .slice().sort((a, b) => a.codigoLab.localeCompare(b.codigoLab, 'es', { numeric: true })),
        enabled: !!esAdmin, // el alumno no gestiona labs → no necesita el filtro
    });

    const { data: pagina, isLoading, isFetching } = useQuery({
        queryKey: ['mis-reservas-pag', q, labId, page, pageSize],
        queryFn: () => reservasApi.buscarMisReservas(q, page, pageSize, labId || undefined),
        select: (res) => res.data.data,
        placeholderData: (prev) => prev, // no parpadea al cambiar de página
        refetchInterval: POLL.NORMAL,
    });
    const reservas = pagina?.content;

    // Separar reservas por estado temporal Y por estado de asistencia
    const { futuras, hoy, pasadas } = useMemo(() => {
        if (!reservas) return { futuras: [], hoy: [], pasadas: [] };

        // Fecha LOCAL (no UTC): con toISOString(), pasadas las 19:00 en Lima (UTC-5) ya es el día
        // siguiente en UTC y las reservas de hoy caían en "pasadas" (la sección "Hoy" quedaba vacía).
        const hoyFecha = hoyLocal();

        const futuras: Reserva[] = [];
        const hoy_list: Reserva[] = [];
        const pasadas: Reserva[] = [];

        reservas.forEach((r: Reserva) => {
            if (r.fecha > hoyFecha) {
                futuras.push(r);
            } else if (r.fecha === hoyFecha) {
                hoy_list.push(r);
            } else {
                pasadas.push(r);
            }
        });

        const ordenarPorEstado = (a: Reserva, b: Reserva) => {
            const orden = { 'EN_CURSO': 0, 'PENDIENTE': 1, 'CONFIRMADA': 2, 'COMPLETADA': 3, 'NO_SHOW': 4 };
            const ordA = orden[a.estado as keyof typeof orden] ?? 99;
            const ordB = orden[b.estado as keyof typeof orden] ?? 99;
            if (ordA !== ordB) return ordA - ordB;
            return a.horaInicio.localeCompare(b.horaInicio);
        };

        // Pasadas: de la fecha más reciente a la más antigua (y dentro del día, la hora más tardía primero).
        const pasadasDescFecha = (a: Reserva, b: Reserva) =>
            a.fecha !== b.fecha ? b.fecha.localeCompare(a.fecha) : b.horaInicio.localeCompare(a.horaInicio);

        return {
            futuras: futuras.sort(ordenarPorEstado),
            hoy: hoy_list.sort(ordenarPorEstado),
            pasadas: pasadas.sort(pasadasDescFecha),
        };
    }, [reservas]);

    const { data: recursosLab } = useQuery({
        queryKey: ['recursos-edit', editModal?.laboratorioCodigo],
        queryFn: () => api.get(`/laboratorios/codigo/${editModal?.laboratorioCodigo}`),
        select: (res) => res.data.data,
        enabled: !!editModal,
    });

    const { data: recursosDisponibles } = useQuery({
        queryKey: ['recursos-lab-edit', recursosLab?.id],
        queryFn: () => api.get(`/laboratorios/${recursosLab?.id}/recursos`),
        select: (res) => res.data.data as { id: number; nombre: string; estado: string; capacidadPersonas: number }[],
        enabled: !!recursosLab?.id,
    });

    // Disponibilidad por mesa para el modal de edición: reservas de ESA mesa en la fecha
    // elegida + bloqueos del lab → pintar la cuadrícula de horas (igual que al reservar).
    const { data: reservasRecursoEdit } = useQuery({
        queryKey: ['reservas-recurso-edit', editForm?.recursoId, editForm?.fecha],
        queryFn: () => api.get(`/reservas/recurso/${editForm.recursoId}?fecha=${editForm.fecha}`),
        select: (res) => res.data.data as any[],
        enabled: !!editModal && !!editForm.recursoId && !!editForm.fecha,
    });

    const { data: bloqueosLabEdit } = useQuery({
        queryKey: ['bloqueos-lab-edit', recursosLab?.id],
        queryFn: () => api.get(`/bloqueos/laboratorio/${recursosLab?.id}`),
        select: (res) => res.data.data as any[],
        enabled: !!recursosLab?.id,
    });

    // ========== MUTATIONS ==========
    const cancelarMutation = useMutation({
        mutationFn: (id: number) => reservasApi.cancelar(id),
        onSuccess: () => {
            toast.success('Reserva cancelada');
        },
        onError: () => toast.error('Error al cancelar la reserva'),
    });

    const reactivarMutation = useMutation({
        mutationFn: (id: number) => reservasApi.reactivar(id),
        onSuccess: () => {
            toast.success('Reserva reactivada');
        },
        onError: (err: any) => toast.error(err.response?.data?.message || 'Error al reactivar la reserva'),
    });

    const completarMutation = useMutation({
        mutationFn: (id: number) => reservasApi.completar(id),
        onSuccess: () => toast.success('Reserva marcada como completada'),
        onError: (err: any) => toast.error(err.response?.data?.message || 'Error al completar la reserva'),
    });

    const noShowMutation = useMutation({
        mutationFn: (id: number) => reservasApi.noShow(id),
        onSuccess: () => toast.success('Reserva marcada como no-show'),
        onError: (err: any) => toast.error(err.response?.data?.message || 'Error al marcar no-show'),
    });

    // ========== FUNCIONES ==========
    const cancelarReserva = async (reserva: Reserva) => {
        const ok = await confirm({
            title: 'Cancelar reserva',
            message: `¿Confirmar cancelar la reserva de ${reserva.recursoNombre} (${reserva.horaInicio?.slice(0, 5)})?`,
            confirmText: 'Cancelar reserva',
            cancelText: 'Volver',
            variant: 'danger',
        });
        if (ok) cancelarMutation.mutate(reserva.id);
    };

    const reactivarReserva = async (reserva: Reserva) => {
        const ok = await confirm({
            title: 'Reactivar reserva',
            message: `¿Confirmar revertir la cancelación de ${reserva.recursoNombre} (${reserva.horaInicio?.slice(0, 5)})? Volverá a estar activa.`,
            confirmText: 'Reactivar',
            variant: 'primary',
        });
        if (ok) reactivarMutation.mutate(reserva.id);
    };

    const completarReserva = async (reserva: Reserva) => {
        const ok = await confirm({
            title: 'Marcar completada',
            message: `¿Cerrar como COMPLETADA la reserva de ${reserva.recursoNombre} (${reserva.horaInicio?.slice(0, 5)})? Úsalo cuando el uso ya ocurrió y quedó sin check-in.`,
            confirmText: 'Marcar completada',
            variant: 'primary',
        });
        if (ok) completarMutation.mutate(reserva.id);
    };

    const noShowReserva = async (reserva: Reserva) => {
        const ok = await confirm({
            title: 'Marcar no-show',
            message: `¿Marcar como NO_SHOW la reserva de ${reserva.recursoNombre} (${reserva.horaInicio?.slice(0, 5)})? El alumno no se presentó.`,
            confirmText: 'Marcar no-show',
            variant: 'danger',
        });
        if (ok) noShowMutation.mutate(reserva.id);
    };

    // Confirmar = PENDIENTE → CONFIRMADA (gestión). NO hace check-in (no deja la
    // reserva EN_CURSO ni ocupa la mesa); el check-in/asistencia es un paso aparte.
    const confirmarReserva = async (reservaId: number, recursoNombre: string) => {
        const ok = await confirm({
            title: 'Confirmar reserva',
            message: `¿Confirmar la reserva de ${recursoNombre}? Quedará CONFIRMADA (el check-in es aparte).`,
            confirmText: 'Confirmar',
            variant: 'primary',
        });
        if (!ok) return;
        api.post(`/reservas/${reservaId}/confirmar`)
            .then(() => {
                toast.success('Reserva confirmada');
                queryClient.invalidateQueries();
            })
            .catch((err) => toast.error(err.response?.data?.message || 'Error'));
    };

    const checkinManual = async (reservaId: number, recursoNombre: string) => {
        const ok = await confirm({
            title: 'Registrar check-in',
            message: `¿Registrar el check-in (asistencia) de ${recursoNombre}? La reserva pasará a EN CURSO.`,
            confirmText: 'Check-in',
            variant: 'primary',
        });
        if (!ok) return;
        api.post(`/checkin/manual/${reservaId}`)
            .then((res) => {
                toast.success(res.data.data.mensaje || 'Check-in confirmado');
                queryClient.invalidateQueries();
            })
            .catch((err) => toast.error(err.response?.data?.message || 'Error'));
    };

    const guardarEdicion = async () => {
        if (!editModal) return;
        const ok = await confirm({
            title: 'Guardar cambios',
            message: '¿Confirmar guardar los cambios de esta reserva?',
            confirmText: 'Guardar',
            variant: 'primary',
        });
        if (!ok) return;
        api.put(`/reservas/${editModal.id}`, {
            recursoId: editForm.recursoId,
            fecha: editForm.fecha,
            horaInicio: editForm.horaInicio + ':00',
            horaFin: editForm.horaFin + ':00',
            participantes: editForm.participantes,
            // Solo si el editor cambió los participantes; si no, se omite y el backend
            // conserva los participantes ya registrados.
            ...(participantesTocados
                ? { participantesEmails: editForm.emailsAdicionales.map((e) => e.trim().toLowerCase()) }
                : {}),
        }).then(() => {
            toast.success('Reserva actualizada');
            queryClient.invalidateQueries();
            setEditModal(null);
        }).catch((err) => toast.error(err.response?.data?.message || 'Error al actualizar'));
    };

    const abrirEdicion = (r: Reserva) => {
        // Pre-cargamos los correos reales de los acompañantes (vienen en participantesLista
        // solo en este listado de gestión) para que el modal no se vea confuso.
        const acomp = (r.participantesLista || []).filter((p) => !p.esTitular);
        setEditForm({
            recursoId: r.recursoId,
            fecha: r.fecha,
            horaInicio: r.horaInicio?.slice(0, 5) || '',
            horaFin: r.horaFin?.slice(0, 5) || '',
            participantes: r.participantes,
            emailsAdicionales: Array.from({ length: Math.max(0, r.participantes - 1) }, (_, i) => acomp[i]?.correo || ''),
        });
        setEditModal(r);
    };

    // Cambia la cantidad de participantes redimensionando los correos adicionales.
    const cambiarParticipantesEdit = (n: number) => {
        setEditForm((prev) => {
            const next = prev.emailsAdicionales.slice(0, n - 1);
            while (next.length < n - 1) next.push('');
            return { ...prev, participantes: n, emailsAdicionales: next };
        });
    };

    // Correos originales de los acompañantes (los que vinieron en la reserva), para
    // detectar si el editor realmente cambió algo respecto a lo precargado.
    const emailsOriginales = (editModal?.participantesLista || [])
        .filter((p) => !p.esTitular)
        .map((p) => (p.correo || '').toLowerCase());
    // ¿El editor tocó los participantes? (cambió la cantidad o editó algún correo).
    // Solo entonces reenviamos participantesEmails; si no, el backend conserva los actuales.
    const participantesTocados = !!editModal
        && (editForm.participantes !== editModal.participantes
            || editForm.emailsAdicionales.some((e, i) => e.trim().toLowerCase() !== (emailsOriginales[i] || '')));
    const participantesEditValidos = !participantesTocados
        || editForm.emailsAdicionales.every((e) => correoUtecValido(e));

    const esHoy = (fecha: string) => fecha === hoyLocal();

    // ✅ Horas del laboratorio para el modal de edición
    const horaApertura = recursosLab?.horaApertura?.slice(0, 5) || '08:00';
    const horaCierre = recursosLab?.horaCierre?.slice(0, 5) || '18:00';

    // ── Disponibilidad por franja para la mesa/fecha en edición (mismo patrón que LaboratorioDetallePage) ──
    // La reserva que se está editando NO cuenta contra sí misma (su franja actual debe verse libre).
    const edHoraReservada = (hora: string): boolean =>
        (reservasRecursoEdit ?? []).some((r) => {
            if (r.id === editModal?.id) return false;
            if (!['PENDIENTE', 'CONFIRMADA'].includes(r.estado)) return false;
            return hora >= (r.horaInicio ?? '').slice(0, 5) && hora < (r.horaFin ?? '').slice(0, 5);
        });
    const edHoraConCheckin = (hora: string): boolean =>
        (reservasRecursoEdit ?? []).some((r) => {
            if (r.id === editModal?.id) return false;
            if (r.estado !== 'EN_CURSO') return false;
            return hora >= (r.horaInicio ?? '').slice(0, 5) && hora < (r.horaFin ?? '').slice(0, 5);
        });
    const edEstaBloqueado = (recursoId: number, fecha: string, hora: string): boolean =>
        (bloqueosLabEdit ?? []).some((b) => {
            if (fecha < b.fechaInicio || fecha > b.fechaFin) return false;
            const ini = (b.horaInicio ?? '').slice(0, 5), fin = (b.horaFin ?? '').slice(0, 5);
            const dentro = !ini || !fin || (hora >= ini && hora < fin);
            if (b.tipo === 'TOTAL') return dentro;
            if (b.tipo === 'PARCIAL') return (b.recursosAfectados || []).includes(recursoId) && dentro;
            return false;
        });
    const edHoraOcupada = (hora: string): boolean =>
        edHoraReservada(hora) || edHoraConCheckin(hora) || edEstaBloqueado(editForm.recursoId, editForm.fecha, hora);
    // Fin máximo de la duración: corta en el primer slot ocupado posterior (evita solapes).
    const edHoraFinMaxima = (inicio: string): string => {
        if (!inicio) return horaCierre;
        for (const h of generarHoras(horaApertura, horaCierre)) {
            if (h <= inicio) continue;
            if (edHoraOcupada(h)) return h;
        }
        return horaCierre;
    };

    // ========== USEEFFECT PARA CÁMARA CON @ZXING ==========
    useEffect(() => {
        if (!scanning || !videoRef.current) return;

        let reader: BrowserQRCodeReader | null = null;
        let isScanning = true;

        const startCamera = async () => {
            try {
                // Carga @zxing bajo demanda (solo al abrir el escáner) → no infla el chunk de la página.
                const { BrowserQRCodeReader } = await import('@zxing/library');
                reader = new BrowserQRCodeReader();
                const result = await reader.decodeFromVideoElement(videoRef.current!);
                // ✅ Parar cámara inmediatamente al detectar QR
                if (videoRef.current?.srcObject) {
                    (videoRef.current.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
                }

                let qrCode = result.getText();
                if (qrCode.includes('/')) {
                    qrCode = qrCode.split('/').pop() || qrCode;
                }

                if (reader) {
                    try {
                        await reader.reset();
                    } catch {
                        /* el reader ya estaba cerrado */
                    }
                }

                api.post(`/checkin/qr/${qrCode}`)
                    .then((res) => {
                        toast.success(res.data.data.mensaje || 'Check-in confirmado');
                        queryClient.invalidateQueries();
                        setScanning(false);
                        setCheckinModal(null);
                        setScanError('');
                        isScanning = false;
                    })
                    .catch((err) => {
                        const mensaje = err.response?.data?.message || 'Error al hacer check-in';
                        setScanError(mensaje + '. El check-in se habilita 10 minutos antes de tu reserva.');
                        setScanning(false);
                        isScanning = false;
                    });
            } catch (error) {
                const err = error as any;
                let mensaje = 'No se pudo acceder a la cámara';
                if (err.name === 'NotAllowedError') {
                    mensaje = 'Permiso de cámara denegado. Habilita en configuración del navegador.';
                } else if (err.name === 'NotFoundError') {
                    mensaje = 'No se encontró cámara en este dispositivo.';
                } else if (err.name === 'NotSupportedError') {
                    mensaje = 'Tu navegador no soporta acceso a cámara.';
                }

                setScanError(mensaje);
                setScanning(false);
            }
        };

        navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
        }).then((stream) => {
            if (videoRef.current && isScanning) {
                videoRef.current.srcObject = stream;
                startCamera();
            }
        }).catch(() => {
            setScanError('No se pudo acceder a la cámara');
            setScanning(false);
        });

        return () => {
            isScanning = false;
            if (reader) {
                try { reader.reset(); } catch (e) { /* ya cerrado */ }
            }
            if (videoRef.current?.srcObject) {
                (videoRef.current.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
            }
        };
    }, [scanning, queryClient]);

    // ========== COMPONENTE TARJETA RESERVA ==========
    const ReservaCard = ({ r }: { r: Reserva }) => (
        <div className="card">
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-utec-cyan bg-utec-cyan/10 px-2 py-0.5 rounded">
                            {r.laboratorioCodigo}
                        </span>
                        <Badge variant={estadoVariant(r.estado) as 'default' | 'success' | 'warning' | 'danger' | 'info'}>
                            {r.estado}
                        </Badge>
                    </div>
                    <h3 className="font-bold text-utec-dark">{r.laboratorioNombre}</h3>
                    <p className="text-sm text-utec-gray-200 mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <span className="inline-flex items-center gap-1"><Armchair size={14} /> {r.recursoNombre}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1"><Users size={14} /> {r.participantes} participante(s)</span>
                    </p>
                    <p className="text-sm text-utec-gray-200 mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <span className="inline-flex items-center gap-1"><Calendar size={14} /> {r.fecha}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1"><Clock size={14} /> {r.horaInicio?.slice(0, 5)} — {r.horaFin?.slice(0, 5)}</span>
                    </p>
                    {/* Un solo bloque de personas: el titular (quien reservó) lleva el badge
                        "titular"; ya no se muestra el "👤 nombre" aparte (era redundante). */}
                    {r.participantesLista && r.participantesLista.length > 0 ? (
                        <div className="mt-2 text-xs text-utec-gray-200">
                            <p className="font-medium text-utec-dark mb-1 inline-flex items-center gap-1">
                                <Users size={14} /> {r.participantesLista.length > 1 ? 'Participantes' : 'Reservado por'}
                            </p>
                            <ul className="space-y-1">
                                {r.participantesLista.map((p, i) => (
                                    <li key={i} className="flex flex-wrap items-center gap-1.5 bg-gray-50 rounded px-2 py-1">
                                        <span className="font-medium text-utec-dark">{p.nombreCompleto}</span>
                                        {p.esTitular && (
                                            <span className="text-[10px] font-bold text-utec-cyan bg-utec-cyan/10 px-1.5 py-0.5 rounded">
                                                titular
                                            </span>
                                        )}
                                        {p.correo && <span className="text-utec-gray-200 inline-flex items-center gap-1">· <Mail size={12} /> {p.correo}</span>}
                                        {p.carrera && <span className="text-utec-gray-200 inline-flex items-center gap-1">· <GraduationCap size={12} /> {p.carrera}</span>}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : (
                        esAdmin && r.usuarioNombre && (
                            <p className="text-xs text-utec-dark mt-2 font-medium bg-gray-50 inline-flex items-center gap-1 px-2 py-0.5 rounded">
                                <User size={12} /> {r.usuarioNombre}
                            </p>
                        )
                    )}
                </div>
                <div className="flex flex-col gap-2 items-end ml-4">
                    {r.estado === 'PENDIENTE' && esAdmin && (
                        <button onClick={() => confirmarReserva(r.id, r.recursoNombre)} className="btn-primary text-xs px-3 py-1.5 inline-flex items-center gap-1">
                            <Check size={14} /> Confirmar
                        </button>
                    )}
                    {(r.estado === 'PENDIENTE' || r.estado === 'CONFIRMADA') && esHoy(r.fecha) && esAdmin && (
                        <button
                            onClick={() => checkinManual(r.id, r.recursoNombre)}
                            className="text-xs bg-utec-cyan text-white font-medium px-3 py-1.5 rounded-full hover:bg-utec-blue transition-colors flex items-center gap-1"
                        >
                            <Camera size={14} /> Check-in
                        </button>
                    )}
                    {r.estado === 'PENDIENTE' && esHoy(r.fecha) && !esAdmin && r.esMia !== false && (
                        <button
                            onClick={() => setCheckinModal(r)}
                            className="text-xs bg-utec-cyan text-white font-medium px-3 py-1.5 rounded-full hover:bg-utec-blue transition-colors flex items-center gap-1"
                        >
                            <Camera size={14} /> Check-in
                        </button>
                    )}
                    {/* Acompañante (no titular y sin rol de gestión): la ve de solo lectura. */}
                    {!esAdmin && r.esMia === false && (
                        <span className="text-xs text-utec-gray-200 bg-gray-50 px-3 py-1 rounded-full flex items-center gap-1"><Users size={13} /> Acompañante</span>
                    )}
                    {r.estado === 'EN_CURSO' && (
                        <span className="text-xs text-green-600 font-medium bg-green-50 px-3 py-1 rounded-full">En uso</span>
                    )}
                    {/* Acciones de gestión: solo el titular (esMia) o un rol elevado (esAdmin).
                        Un acompañante (esMia === false) ve la reserva pero no la gestiona. */}
                    {(r.estado === 'PENDIENTE' || r.estado === 'CONFIRMADA' || r.estado === 'EN_CURSO') && (esAdmin || r.esMia !== false) && (
                        <div className="flex gap-2 text-xs">
                            {esAdmin && (
                                <button onClick={() => abrirEdicion(r)} className="text-utec-cyan hover:text-utec-blue font-medium">
                                    Editar
                                </button>
                            )}
                            {esAdmin && (
                                <button onClick={() => completarReserva(r)} disabled={completarMutation.isPending} className="text-green-600 hover:text-green-700 font-medium">
                                    Completar
                                </button>
                            )}
                            {esAdmin && (
                                <button onClick={() => noShowReserva(r)} disabled={noShowMutation.isPending} className="text-amber-600 hover:text-amber-700 font-medium">
                                    No-show
                                </button>
                            )}
                            <button
                                onClick={() => cancelarReserva(r)}
                                disabled={cancelarMutation.isPending}
                                className="text-red-500 hover:text-red-700 font-medium"
                            >
                                Cancelar
                            </button>
                        </div>
                    )}
                    {/* Revertir cancelación: solo roles de gestión (no estudiante) y solo el mismo día */}
                    {r.estado === 'CANCELADA' && esHoy(r.fecha) && esAdmin && (
                        <button
                            onClick={() => reactivarReserva(r)}
                            disabled={reactivarMutation.isPending}
                            className="text-xs text-utec-cyan hover:text-utec-blue font-medium"
                        >
                            ↩ Reactivar
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

    // ========== RENDER PRINCIPAL ==========
    const reservaCols: ColumnDef<Reserva, unknown>[] = [
        { accessorKey: 'fecha', header: 'Fecha' },
        { id: 'hora', header: 'Hora', accessorFn: (r) => `${(r.horaInicio ?? '').slice(0, 5)}–${(r.horaFin ?? '').slice(0, 5)}` },
        { accessorKey: 'laboratorioCodigo', header: 'Lab', cell: ({ row }) => <span title={row.original.laboratorioNombre}>{row.original.laboratorioCodigo}</span> },
        { accessorKey: 'recursoNombre', header: 'Recurso' },
        { accessorKey: 'estado', header: 'Estado', cell: ({ getValue }) => <Badge variant={estadoVariant(getValue() as string)}>{getValue() as string}</Badge> },
        { accessorKey: 'participantes', header: 'Part.' },
        {
            id: 'titular', header: 'Titular',
            accessorFn: (r) => r.participantesLista?.find((p) => p.esTitular)?.nombreCompleto || r.usuarioNombre || '—',
        },
        {
            id: 'acompanantes', header: 'Acompañantes',
            accessorFn: (r) => {
                const otros = (r.participantesLista ?? []).filter((p) => !p.esTitular).map((p) => p.nombreCompleto);
                return otros.length ? otros.join(', ') : '—';
            },
        },
    ];

    const total = pagina?.total ?? 0;
    const totalPaginas = Math.max(1, Math.ceil(total / pageSize));
    const serverControls = {
        total, pageIndex: page, pageSize,
        onPageChange: setPage, onPageSizeChange: (s: number) => { setPageSize(s); setPage(0); },
        search: busqueda, onSearchChange: setBusqueda, loading: isFetching,
    };

    const headerActions = (
        <div className="flex items-center gap-2 flex-wrap">
            {esAdmin && misLabs && misLabs.length > 1 && (
                <select
                    value={labId}
                    onChange={(e) => { setLabId(e.target.value ? Number(e.target.value) : ''); setPage(0); }}
                    title="Filtrar por laboratorio"
                    className="input-field text-sm py-1.5 max-w-[240px]"
                >
                    <option value="">🏢 Todos los labs</option>
                    {misLabs.map((l) => <option key={l.id} value={l.id}>{l.codigoLab} · {l.nombre}</option>)}
                </select>
            )}
            <button
                onClick={() => queryClient.invalidateQueries({ queryKey: ['mis-reservas-pag'] })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-line text-ink hover:bg-utec-cyan/10 transition-colors"
                title="Actualizar la lista"
            >
                <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Actualizar
            </button>
            <Segmented
                value={vista}
                onChange={setVista}
                size="sm"
                options={[
                    { value: 'tarjetas', label: 'Tarjetas', icon: <LayoutGrid size={14} /> },
                    { value: 'tabla', label: 'Tabla', icon: <TableIcon size={14} /> },
                ]}
            />
        </div>
    );

    return (
        <div>
            <PageHeader title={esAdmin ? 'Gestión de Reservas' : 'Mis Reservas'} actions={headerActions} />

            {isLoading ? (
                <div className="text-center py-12 text-utec-gray-200">Cargando reservas...</div>
            ) : vista === 'tabla' ? (
                <DataTable
                    data={reservas ?? []}
                    columns={reservaCols}
                    filename="reservas"
                    searchPlaceholder="Buscar lab, recurso, estado, titular…"
                    canExport={!!esAdmin}
                    server={serverControls}
                />
            ) : reservas && reservas.length > 0 ? (
                <div className="space-y-6">
                    {/* Búsqueda + pager (tarjetas también paginan en el servidor) */}
                    <div className="flex flex-wrap items-center gap-3">
                        <input
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            placeholder="Buscar lab, recurso, estado, titular…"
                            className="input-field !py-2 text-sm flex-1 min-w-[200px] max-w-sm"
                        />
                        <span className="text-xs text-ink-muted tabular">{total} reserva(s){isFetching && ' · actualizando…'}</span>
                        {totalPaginas > 1 && (
                            <div className="ml-auto flex items-center gap-1">
                                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page <= 0} aria-label="Anterior"
                                    className="p-1.5 rounded-md border border-line text-ink disabled:opacity-40 hover:bg-utec-cyan/10 transition-colors"><ChevronLeft size={16} /></button>
                                <span className="text-sm text-ink-muted tabular px-2">{page + 1} / {totalPaginas}</span>
                                <button onClick={() => setPage((p) => Math.min(totalPaginas - 1, p + 1))} disabled={page >= totalPaginas - 1} aria-label="Siguiente"
                                    className="p-1.5 rounded-md border border-line text-ink disabled:opacity-40 hover:bg-utec-cyan/10 transition-colors"><ChevronRight size={16} /></button>
                            </div>
                        )}
                    </div>

                    {/* HOY - PRIMERO */}
                    {hoy.length > 0 && (
                        <div>
                            <button
                                onClick={() => setExpandirHoy(!expandirHoy)}
                                className="w-full text-left flex items-center gap-2 p-4 bg-utec-cyan/10 border border-utec-cyan/20 rounded-lg hover:bg-utec-cyan/15 transition-colors"
                            >
                                <span className="text-xl">{expandirHoy ? '▼' : '▶'}</span>
                                <h2 className="text-lg font-display font-bold text-utec-dark flex-1"><span className="inline-flex items-center gap-2"><Bell size={18} className="text-utec-cyan" /> Hoy</span></h2>
                                <span className="text-sm font-medium text-utec-cyan">{hoy.length} reserva(s)</span>
                            </button>
                            {expandirHoy && (
                                <div className="space-y-3 mt-4">
                                    {hoy.map((r) => <ReservaCard key={r.id} r={r} />)}
                                </div>
                            )}
                        </div>
                    )}

                    {/* PRÓXIMAS - DESPLEGABLE */}
                    {futuras.length > 0 && (
                        <details className="group" open>
                            <summary className="cursor-pointer w-full text-left p-4 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-2">
                                <span className="text-xl group-open:rotate-90 transition-transform">▶</span>
                                <h2 className="text-lg font-display font-bold text-utec-dark flex-1"><span className="inline-flex items-center gap-2"><CalendarDays size={18} className="text-utec-cyan" /> Próximas Reservas</span></h2>
                                <span className="text-sm font-medium text-blue-600">{futuras.length}</span>
                            </summary>
                            <div className="space-y-3 mt-4">
                                {futuras.map((r) => <ReservaCard key={r.id} r={r} />)}
                            </div>
                        </details>
                    )}

                    {/* PASADAS - DESPLEGABLE */}
                    {pasadas.length > 0 && (
                        <details className="group">
                            <summary className="cursor-pointer w-full text-left p-4 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2">
                                <span className="text-xl group-open:rotate-90 transition-transform">▶</span>
                                <h2 className="text-lg font-display font-bold text-utec-gray-200 flex-1">Reservas Pasadas</h2>
                                <span className="text-sm font-medium text-utec-gray-200">{pasadas.length}</span>
                            </summary>
                            <div className="space-y-3 mt-4">
                                {pasadas.map((r) => <ReservaCard key={r.id} r={r} />)}
                            </div>
                        </details>
                    )}
                </div>
            ) : (
                <div className="text-center py-12">
                    <p className="text-utec-gray-200 mb-2">{esAdmin ? 'No hay reservas activas' : 'No tienes reservas'}</p>
                    <p className="text-sm text-utec-gray-200">Ve a Laboratorios para hacer una reserva</p>
                </div>
            )}

            {/* ========== MODAL EDITAR RESERVA ========== */}
            {editModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-utec-dark mb-2">Editar Reserva</h3>
                        <p className="text-sm text-utec-gray-200 mb-4">
                            {editModal.laboratorioNombre} — {editModal.recursoNombre}
                        </p>

                        <div className="space-y-4">
                            {/* Recurso / Mesa */}
                            <div>
                                <label className="block text-sm font-medium text-utec-dark mb-1"><Armchair size={13} className="inline align-[-2px] mr-1" />Mesa / Recurso</label>
                                <select
                                    value={editForm.recursoId}
                                    onChange={(e) => setEditForm({ ...editForm, recursoId: Number(e.target.value), horaInicio: '', horaFin: '' })}
                                    className="input-field font-semibold text-utec-dark"
                                >
                                    {recursosDisponibles?.sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { numeric: true })).map((rec) => (
                                        <option key={rec.id} value={rec.id}>{rec.nombre} ({rec.estado})</option>
                                    ))}
                                </select>
                            </div>

                            {/* Fecha */}
                            <div>
                                <label className="block text-sm font-medium text-utec-dark mb-1">Fecha</label>
                                <input
                                    type="date"
                                    value={editForm.fecha}
                                    onChange={(e) => setEditForm({ ...editForm, fecha: e.target.value, horaInicio: '', horaFin: '' })}
                                    min={hoyLocal()}
                                    className="input-field"
                                />
                            </div>

                            {/* Hora de inicio - cuadrícula coloreada por disponibilidad de la mesa/fecha */}
                            <div>
                                <label className="block text-sm font-medium text-utec-dark mb-2">Hora de inicio</label>
                                <div className="grid grid-cols-4 gap-2 max-h-44 overflow-y-auto">
                                    {generarHoras(horaApertura, horaCierre).map((hora) => {
                                        const conCheckin = edHoraConCheckin(hora);
                                        const reservada = edHoraReservada(hora);
                                        const bloqueada = edEstaBloqueado(editForm.recursoId, editForm.fecha, hora);
                                        const ocupada = conCheckin || reservada || bloqueada;
                                        return (
                                            <button
                                                key={hora}
                                                type="button"
                                                disabled={ocupada}
                                                onClick={() => setEditForm({ ...editForm, horaInicio: hora, horaFin: '' })}
                                                className={`px-2 py-2 rounded-lg text-xs font-medium transition-all ${
                                                    editForm.horaInicio === hora
                                                        ? 'bg-utec-cyan text-white'
                                                        : conCheckin
                                                            ? 'bg-red-600 text-white cursor-not-allowed'
                                                            : reservada
                                                                ? 'bg-orange-500 text-white cursor-not-allowed'
                                                                : bloqueada
                                                                    ? 'bg-slate-500 text-white cursor-not-allowed'
                                                                    : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300'
                                                }`}
                                            >
                                                {hora}
                                            </button>
                                        );
                                    })}
                                </div>
                                {/* Leyenda de colores */}
                                <div className="flex flex-wrap gap-3 mt-3 text-xs text-utec-dark font-medium">
                                    <span className="flex items-center gap-1"><span className="w-3.5 h-3.5 rounded bg-emerald-100 border border-emerald-400"></span>Disponible</span>
                                    <span className="flex items-center gap-1"><span className="w-3.5 h-3.5 rounded bg-orange-500"></span>Reservada</span>
                                    <span className="flex items-center gap-1"><span className="w-3.5 h-3.5 rounded bg-red-600"></span>Check-in hecho</span>
                                    <span className="flex items-center gap-1"><span className="w-3.5 h-3.5 rounded bg-slate-500"></span>Bloqueada</span>
                                </div>
                            </div>

                            {/* Duración - botones (acotada al primer slot ocupado posterior) */}
                            {editForm.horaInicio && (
                                <div>
                                    <label className="block text-sm font-medium text-utec-dark mb-2">Duración</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {generarDuraciones(editForm.horaInicio, edHoraFinMaxima(editForm.horaInicio)).map((d) => (
                                            <button
                                                key={d.fin}
                                                type="button"
                                                onClick={() => setEditForm({ ...editForm, horaFin: d.fin })}
                                                className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                                    editForm.horaFin === d.fin
                                                        ? 'bg-utec-cyan text-white'
                                                        : 'bg-gray-100 text-utec-dark hover:bg-gray-200'
                                                }`}
                                            >
                                                {d.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Resumen */}
                            {editForm.horaInicio && editForm.horaFin && (
                                <div className="bg-utec-cyan/10 border border-utec-cyan/30 rounded-lg p-3 text-sm">
                                    <p className="text-utec-dark font-medium">
                                        <Calendar size={13} className="inline align-[-1px]" /> {editForm.fecha} · <Clock size={13} className="inline align-[-1px]" /> {editForm.horaInicio} — {editForm.horaFin}
                                    </p>
                                    <p className="text-xs text-utec-gray-200 mt-1">
                                        Lab cierra a las {horaCierre}
                                    </p>
                                </div>
                            )}

                            {/* Participantes — botones 1..capacidad de la mesa (no desplegable) */}
                            {(() => {
                                const cap = recursosDisponibles?.find((rec) => rec.id === editForm.recursoId)?.capacidadPersonas || 10;
                                // Correo del titular (no editable) para mostrarlo ya cargado.
                                const titularCorreo = (editModal?.participantesLista || []).find((p) => p.esTitular)?.correo;
                                return (
                            <div>
                                <label className="block text-sm font-medium text-utec-dark mb-1">
                                    Participantes <span className="text-xs text-utec-gray-200 font-normal">(capacidad de la mesa: {cap})</span>
                                </label>
                                <div className="grid grid-cols-5 gap-2">
                                    {Array.from({ length: cap }, (_, i) => i + 1).map((n) => (
                                        <button
                                            type="button"
                                            key={n}
                                            onClick={() => cambiarParticipantesEdit(n)}
                                            className={`py-2 rounded-lg text-sm font-medium border transition-colors ${editForm.participantes === n ? 'bg-utec-cyan text-white border-utec-cyan' : 'bg-white text-utec-dark border-gray-200 hover:border-utec-cyan'}`}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                </div>

                                {/* Correos de los participantes. El 1° es el titular (no editable,
                                    su correo se muestra ya cargado); los demás vienen pre-cargados
                                    y se pueden editar para cambiar de acompañante. */}
                                <div className="mt-3">
                                    <label className="block text-sm font-medium text-utec-dark mb-1">
                                        Correos de los participantes <span className="text-xs text-utec-gray-200 font-normal">(@utec.edu.pe)</span>
                                    </label>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-utec-gray-200 w-5 text-right">1</span>
                                            <input
                                                type="text"
                                                value={`${titularCorreo || editModal?.usuarioNombre || 'Titular'} (titular)`}
                                                readOnly
                                                disabled
                                                className="input-field flex-1 bg-gray-100 text-utec-gray-200 cursor-not-allowed"
                                                title="Titular de la reserva (no editable)"
                                            />
                                        </div>
                                        {editForm.emailsAdicionales.map((email, i) => {
                                            const invalido = email.length > 0 && !correoUtecValido(email);
                                            return (
                                                <div key={i} className="flex items-center gap-2">
                                                    <span className="text-xs text-utec-gray-200 w-5 text-right">{i + 2}</span>
                                                    <input
                                                        type="email"
                                                        value={email}
                                                        onChange={(e) => setEditForm((prev) => ({
                                                            ...prev,
                                                            emailsAdicionales: prev.emailsAdicionales.map((v, j) => (j === i ? e.target.value : v)),
                                                        }))}
                                                        placeholder="nombre.apellido@utec.edu.pe"
                                                        className={`input-field flex-1 ${invalido ? 'border-red-400 focus:border-red-400' : ''}`}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {editForm.emailsAdicionales.length > 0 && (
                                        <p className="text-xs text-utec-gray-200 mt-1">
                                            Los correos vienen cargados. Edítalos solo si quieres cambiar de acompañante (deben estar registrados).
                                        </p>
                                    )}
                                </div>
                            </div>
                                );
                            })()}
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setEditModal(null)} className="btn-secondary text-sm">Cancelar</button>
                            <button
                                onClick={guardarEdicion}
                                disabled={!editForm.horaInicio || !editForm.horaFin || !participantesEditValidos}
                                className="btn-primary text-sm disabled:opacity-50"
                            >
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ========== MODAL CHECK-IN CON CÁMARA O MANUAL ========== */}
            {checkinModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-utec-dark mb-2">Check-in: {checkinModal.recursoNombre}</h3>
                        <p className="text-sm text-gray-600 mb-4">
                            {checkinModal.laboratorioNombre} • {checkinModal.horaInicio?.slice(0, 5)}
                        </p>

                        {!scanning ? (
                            <div className="space-y-3">
                                <button
                                    onClick={() => { setScanError(''); setScanning(true); }}
                                    className="w-full btn-primary flex items-center justify-center gap-2"
                                >
                                    <Camera size={16} className="inline align-[-3px] mr-1" />Abrir cámara
                                </button>
                                {scanError && (
                                    <div className="bg-red-100 border border-red-300 rounded-lg p-3 text-sm text-red-700 mt-3">
                                        <XCircle size={14} className="inline align-[-2px] mr-1" />{scanError}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="relative bg-black rounded-lg overflow-hidden">
                                    <video ref={videoRef} autoPlay playsInline className="w-full h-64 object-cover" />
                                    <canvas ref={canvasRef} className="hidden" />
                                </div>

                                {scanError && (
                                    <div className="bg-red-100 border border-red-300 rounded-lg p-3 text-sm text-red-700">
                                        {scanError}
                                    </div>
                                )}

                                <p className="text-xs text-gray-500 text-center">
                                    <ScanLine size={14} className="inline align-[-2px] mr-1" />Apunta al código QR o <button onClick={() => setScanning(false)} className="underline">ingresa manualmente</button>
                                </p>

                                <button
                                    onClick={() => {
                                        setScanning(false);
                                        setScanError('');
                                        if (videoRef.current?.srcObject) {
                                            (videoRef.current.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
                                        }
                                    }}
                                    className="w-full btn-secondary"
                                >
                                    Cancelar
                                </button>
                            </div>
                        )}

                        {!scanning && (
                            <button onClick={() => setCheckinModal(null)} className="w-full btn-secondary mt-3">
                                Cerrar
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
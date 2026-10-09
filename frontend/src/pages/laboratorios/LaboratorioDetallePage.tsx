import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Calendar, CalendarDays, Ban, Briefcase, Wrench, Printer, PackageMinus, X, ExternalLink, Sparkles } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { POLL } from '@/config/polling';
import { laboratoriosApi } from '@/services/laboratorios';
import { reservasApi } from '@/services/reservas';
import api from '@/services/api';
import Badge from '@/components/ui/Badge';
import QrImage from '@/components/shared/QrImage';
import QrMesasPrint, { imprimirHojaQr } from '@/components/shared/QrMesasPrint';
import { getISOWeek } from 'date-fns';
import { hoyLocal, nombreDiaEs, labAtiende } from '@/utils/fecha';

// ¿Una clase quincenal (Semana A/B) se dicta en la semana de esa fecha? A=semanas ISO impares, B=pares.
const claseAplicaSemana = (frecuencia: string | undefined, fecha: Date): boolean => {
    if (!frecuencia || frecuencia === 'SEMANA_GENERAL') return true;
    const impar = getISOWeek(fecha) % 2 === 1;
    return frecuencia === 'SEMANA_A' ? impar : !impar;
};
import SelectorFecha, { formatoFechaLarga } from '@/components/ui/SelectorFecha';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';
import type { RecursoLab } from '@/types';

export const estadoColor = (estado: string) => {
    switch (estado) {
        case 'DISPONIBLE': return 'success';
        case 'OCUPADO': return 'danger';
        case 'RESERVADO': return 'warning';
        case 'BLOQUEADO': return 'danger';
        default: return 'default';
    }
};

export const generarHoras = (horaApertura: string, horaCierre: string, fechaSeleccionada: string): string[] => {
    const horas: string[] = [];
    const [aperturaH, aperturaM] = horaApertura.split(':').map(Number);
    const [cierreH, cierreM] = horaCierre.split(':').map(Number);

    const ahora = new Date();
    const hoyFecha = hoyLocal();
    const esHoy = fechaSeleccionada === hoyFecha;
    const horaActual = ahora.getHours();
    const minutoActual = ahora.getMinutes();

    let h = aperturaH;
    let m = aperturaM;

    while (h < cierreH || (h === cierreH && m < cierreM)) {
        // Solo filtrar horas pasadas si es HOY
        if (!esHoy || h > horaActual || (h === horaActual && m >= minutoActual)) {
            horas.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        }

        m += 30;
        if (m >= 60) {
            m -= 60;
            h += 1;
        }
    }

    // Si es HOY y la hora actual NO cae en la malla (:00/:30), permite empezar "ahora"
    // (ej. 10:05) para no perder el bloque en curso. La duración ajustará el fin a la malla.
    if (esHoy && minutoActual % 30 !== 0) {
        const dentro = (horaActual > aperturaH || (horaActual === aperturaH && minutoActual >= aperturaM))
            && (horaActual < cierreH || (horaActual === cierreH && minutoActual < cierreM));
        if (dentro) horas.unshift(`${String(horaActual).padStart(2, '0')}:${String(minutoActual).padStart(2, '0')}`);
    }

    return horas;
};

// Helpers de día/atención centralizados en utils/fecha; se re-exportan para
// no romper imports/tests existentes que los toman desde esta página.
export { nombreDiaEs, labAtiende };

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

// Duraciones cuyo FIN cae siempre en la malla de 30 min (:00 / :30).
// Si el inicio es 10:05 → 25 min (fin 10:30), 55 min (11:00), 1h25 (11:30)...
export const generarDuraciones = (horaInicio: string, horaCierre: string): { label: string; fin: string }[] => {
    if (!horaInicio) return [];
    const [hI, mI] = horaInicio.split(':').map(Number);
    const [hC, mC] = horaCierre.split(':').map(Number);
    const inicio = hI * 60 + mI;
    const cierre = hC * 60 + mC;
    const out: { label: string; fin: string }[] = [];
    let fin = Math.floor(inicio / 30) * 30 + 30; // siguiente múltiplo de 30 > inicio
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

const rolesAdminReal = ['ADMIN', 'COORDINADOR'];

export default function LaboratorioDetallePage() {
    const { id } = useParams<{ id: string }>();
    const labId = Number(id);
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const navigate = useNavigate();
    const user = useAuthStore((s) => s.user);
    const esAdminReal = !!user?.rol && rolesAdminReal.includes(user.rol);

    const [selectedRecurso, setSelectedRecurso] = useState<RecursoLab | null>(null);
    const [fecha, setFecha] = useState(hoyLocal());

    // En móvil el panel "Reservar" queda apilado debajo de la grilla de mesas; al elegir una
    // mesa hacemos scroll suave hasta él para que no quede "perdido" abajo. En escritorio (≥lg)
    // el panel ya está visible (sticky a la derecha), así que no se hace scroll.
    const reservarRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (selectedRecurso && typeof window !== 'undefined' && window.innerWidth < 1024) {
            reservarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [selectedRecurso]);
    const [horaInicio, setHoraInicio] = useState('');
    const [horaFin, setHoraFin] = useState('');
    const [participantes, setParticipantes] = useState(1);
    // Correos de los acompañantes (participantes - 1). El titular es el usuario logueado y no se edita.
    const [emailsAdicionales, setEmailsAdicionales] = useState<string[]>([]);
    const [carreraReserva, setCarreraReserva] = useState('');
    const [qrModal, setQrModal] = useState<RecursoLab | null>(null);
    const [showAgregarRecurso, setShowAgregarRecurso] = useState(false);
    const [showEditarLab, setShowEditarLab] = useState(false);
    const [editLab, setEditLab] = useState({
        nombre: '',
        resena: '',
        horaApertura: '',
        horaCierre: '',
        diasAtencion: [] as string[],
        directorId: null as number | null,
        piso: 1,
        ubicacionFase: '',
        departamentoId: null as number | null,
        carreraId: null as number | null,
    });
    // Servicios del lab (nombre + enlace externo). Se editan en el modal de editar lab.
    const [editServicios, setEditServicios] = useState<{ nombre: string; url: string; descripcion: string }[]>([]);
    const [nuevoRecurso, setNuevoRecurso] = useState({ tipo: 'MESA', nombre: '', capacidadPersonas: 4 });
    const [editRecurso, setEditRecurso] = useState<RecursoLab | null>(null);
    const [editCap, setEditCap] = useState(1);
    // Retiro de mesas: mesas que salen físicamente del lab por un periodo (p. ej. un ciclo).
    // Se modela como bloqueo PARCIAL motivo RETIRO, todo el día, sobre el rango de fechas.
    const [showRetiro, setShowRetiro] = useState(false);
    const [retiroMesas, setRetiroMesas] = useState<Set<number>>(new Set());
    const [retiroIni, setRetiroIni] = useState('');
    const [retiroFin, setRetiroFin] = useState('');
    // Si es != null, el modal de retiro está EDITANDO ese retiro (acortar rango / cambiar mesas).
    const [retiroEditId, setRetiroEditId] = useState<number | null>(null);
    // Modal de HISTORIAL de retiros ya vencidos (para no ensuciar la vista con periodos pasados).
    const [showHistorialRetiros, setShowHistorialRetiros] = useState(false);
    // Modal "Programar almuerzo" (bloqueo ALMUERZO recurrente sobre los días de atención del rango).
    const [showAlmuerzo, setShowAlmuerzo] = useState(false);
    const [almIni, setAlmIni] = useState('13:00');
    const [almFin, setAlmFin] = useState('14:00');
    const [almDesde, setAlmDesde] = useState('');
    const [almHasta, setAlmHasta] = useState('');
    const [almForzar, setAlmForzar] = useState(false);
    const [almReporte, setAlmReporte] = useState<{ creados: number; reservasCanceladas: number; omitidos: { fecha: string; motivo: string }[] } | null>(null);

    // ========== QUERIES ==========
    const { data: lab, isLoading: loadingLab } = useQuery({
        queryKey: ['laboratorio', labId],
        queryFn: () => laboratoriosApi.obtener(labId),
        select: (res) => res.data.data,
        // Auto-refresh: si un admin cambia el horario/datos del lab, el alumno lo ve solo
        // (cada 30s); se pausa mientras está reservando para no alterarle el panel.
        refetchInterval: selectedRecurso ? false : POLL.RAPIDO,
    });

    // Admins gestionan cualquier lab; el responsable solo los labs donde figura como responsable.
    const esResponsableDeEsteLab =
        user?.rol === 'RESPONSABLE_LAB' && !!user?.nombreCompleto && !!lab?.responsables?.includes(user.nombreCompleto);
    const esAdmin = esAdminReal || esResponsableDeEsteLab;
    // A los alumnos no les interesa la jerarquía (decanato/departamento/director):
    // solo ven los responsables del laboratorio.
    const esEstudiante = user?.rol === 'ESTUDIANTE';
    // DOCENTE = solo-consulta: ve la disponibilidad de las mesas pero NO puede reservar
    // (el backend además rechaza su reserva con FORBIDDEN).
    const esDocente = user?.rol === 'DOCENTE';
    // Imprimir QR de mesas: roles de gestión (responsable / director / coordinador / admin).
    const puedeImprimirQr = ['ADMIN', 'COORDINADOR', 'DIRECTOR', 'RESPONSABLE_LAB'].includes(user?.rol || '');

    const { data: bloqueos } = useQuery({
        queryKey: ['bloqueos', labId],
        queryFn: () => api.get(`/bloqueos/laboratorio/${labId}`),
        select: (res) => res.data.data,
        refetchInterval: selectedRecurso ? false : POLL.RAPIDO,
    });

    // Clases del horario académico que ocupan este lab en el ciclo de la fecha elegida:
    // se pintan como franjas "Clase" en la cuadrícula (no se puede reservar encima).
    const { data: ciclos } = useQuery({
        queryKey: ['ciclos'],
        queryFn: () => api.get('/ciclos'),
        select: (res) => res.data.data as { codigo: string; fechaInicio: string; fechaFin: string; excepciones?: { fechaInicio: string; fechaFin: string; tipo?: string }[] }[],
    });
    const cicloDeFecha = (ciclos ?? []).find((c) => fecha >= c.fechaInicio && fecha <= c.fechaFin)?.codigo;
    // Días de examen/feriado (cualquier ciclo): no hay clases → no se bloquean para reservar.
    const esDiaSinClases = (fechaIso: string): boolean =>
        (ciclos ?? []).some((c) => (c.excepciones ?? []).some((e) => fechaIso >= e.fechaInicio && fechaIso <= e.fechaFin));
    // CIERRE institucional (feriado que cierra TODO UTEC): ese día no se puede reservar ningún lab.
    const esCierreInstitucional = (fechaIso: string): boolean =>
        (ciclos ?? []).some((c) => (c.excepciones ?? []).some((e) => e.tipo === 'CIERRE' && fechaIso >= e.fechaInicio && fechaIso <= e.fechaFin));
    const { data: clasesLab } = useQuery({
        queryKey: ['clases-lab-grid', labId, cicloDeFecha],
        queryFn: () => api.get('/aulas/clases', { params: { labId, ciclo: cicloDeFecha } }),
        select: (res) => res.data.data as { diaSemana: string; fechaInicio: string; fechaFin: string; horaInicio: string; horaFin: string; frecuencia?: string }[],
        enabled: !!cicloDeFecha,
    });

    const { data: reservasMesa } = useQuery({
        queryKey: ['reservas-mesa', selectedRecurso?.id, fecha],
        queryFn: () => api.get(`/reservas/recurso/${selectedRecurso?.id}?fecha=${fecha}`),
        select: (res) => res.data.data,
        enabled: !!selectedRecurso?.id && !!fecha,
    });

    const { data: recursos, isLoading: loadingRecursos } = useQuery({
        queryKey: ['recursos', labId],
        queryFn: () => laboratoriosApi.recursos(labId),
        select: (res) => res.data.data,
        refetchInterval: selectedRecurso ? false : POLL.RAPIDO,
    });

    const { data: usuarios } = useQuery({
        queryKey: ['usuarios-administrativos'],
        queryFn: () => api.get('/usuarios/administrativos'),
        select: (res) => res.data.data as { id: number; nombreCompleto: string; rol: string; cargo?: string }[],
        enabled: showEditarLab,
    });

    const { data: departamentos } = useQuery({
        queryKey: ['departamentos'],
        queryFn: () => api.get('/estructura/departamentos'),
        select: (res) => res.data.data as { id: number; nombre: string; facultadId?: number }[],
        enabled: showEditarLab,
    });

    const { data: carreras } = useQuery({
        queryKey: ['carreras'],
        queryFn: () => api.get('/estructura/carreras'),
        select: (res) => res.data.data as { id: number; nombre: string }[],
        enabled: showEditarLab || !!selectedRecurso,
    });

    // Perfil del usuario actual: trae su carrera para pre-seleccionarla al reservar.
    const { data: miPerfil } = useQuery({
        queryKey: ['mi-perfil'],
        queryFn: () => api.get('/usuarios/me'),
        select: (res) => res.data.data as { carrera?: string },
    });

    // Pre-selecciona la carrera guardada del alumno (si aún no eligió otra).
    useEffect(() => {
        if (miPerfil?.carrera && !carreraReserva) setCarreraReserva(miPerfil.carrera);
    }, [miPerfil, carreraReserva]);

    const { data: facultades } = useQuery({
        queryKey: ['facultades'],
        queryFn: () => api.get('/estructura/facultades'),
        select: (res) => res.data.data as { id: number; nombre: string }[],
        enabled: showEditarLab,
    });

    const directores = usuarios?.filter((u) => u.rol === 'DIRECTOR') || [];

    // ========== FUNCIONES DE VALIDACIÓN ==========

    // ¿La fecha/hora cae en una CLASE del horario del lab? (las clases ocupan todo el lab).
    const DIA_JS_NOMBRE = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
    const estaEnClase = (fechaSeleccionada: string, horaSeleccionada: string): boolean => {
        if (!clasesLab || esDiaSinClases(fechaSeleccionada)) return false; // examen/feriado → sin clase
        const d = new Date(`${fechaSeleccionada}T00:00:00`);
        const dia = DIA_JS_NOMBRE[d.getDay()];
        return clasesLab.some((c) =>
            c.diaSemana === dia &&
            fechaSeleccionada >= c.fechaInicio && fechaSeleccionada <= c.fechaFin &&
            horaSeleccionada >= c.horaInicio.slice(0, 5) && horaSeleccionada < c.horaFin.slice(0, 5) &&
            claseAplicaSemana(c.frecuencia, d));
    };

    const estaBloqueado = (recursoId: number, fechaSeleccionada: string, horaSeleccionada: string): boolean => {
        // Una clase programada ocupa todo el lab → cuenta como bloqueado para cualquier recurso.
        if (estaEnClase(fechaSeleccionada, horaSeleccionada)) return true;
        if (!bloqueos) return false;

        return bloqueos.some((bloqueo: any) => {
            if (fechaSeleccionada < bloqueo.fechaInicio || fechaSeleccionada > bloqueo.fechaFin) {
                return false;
            }
            // El backend serializa las horas como "HH:mm:ss"; la malla usa "HH:mm".
            // Normalizamos a "HH:mm" para que la comparación sea correcta en los límites.
            const ini = bloqueo.horaInicio?.slice(0, 5);
            const fin = bloqueo.horaFin?.slice(0, 5);
            const dentroDeFranja = !ini || !fin || (horaSeleccionada >= ini && horaSeleccionada < fin);

            if (bloqueo.tipo === 'TOTAL') {
                return dentroDeFranja;
            }

            if (bloqueo.tipo === 'PARCIAL') {
                const recursosAfectados = bloqueo.recursosAfectados || [];
                if (!recursosAfectados.includes(recursoId)) {
                    return false;
                }
                return dentroDeFranja;
            }

            return false;
        });
    };

    const horaReservada = (hora: string): boolean => {
        if (!reservasMesa) return false;
        return reservasMesa.some((r: any) => {
            if (!['PENDIENTE', 'CONFIRMADA'].includes(r.estado)) return false;
            const inicio = r.horaInicio?.slice(0, 5);
            const fin = r.horaFin?.slice(0, 5);
            return hora >= inicio && hora < fin;
        });
    };

    const horaConCheckin = (hora: string): boolean => {
        if (!reservasMesa) return false;
        return reservasMesa.some((r: any) => {
            if (r.estado !== 'EN_CURSO') return false;
            const inicio = r.horaInicio?.slice(0, 5);
            const fin = r.horaFin?.slice(0, 5);
            return hora >= inicio && hora < fin;
        });
    };

    // Hora de fin MÁXIMA válida desde un inicio: corta en el primer slot ocupado
    // (bloqueo / reserva / check-in) posterior, o en el cierre del lab si no hay.
    // Así la "Duración" no ofrece tramos que se solaparían con un bloqueo/reserva
    // posterior (p. ej. inicio 15:30 con bloqueo 16:00–18:00 → solo 30 min).
    const horaFinMaxima = (inicio: string): string => {
        const cierre = (lab?.horaCierre || '18:00').slice(0, 5);
        if (!inicio || !selectedRecurso) return cierre;
        for (const h of generarHoras(lab?.horaApertura || '08:00', cierre, fecha)) {
            if (h <= inicio) continue;
            if (estaBloqueado(selectedRecurso.id, fecha, h) || horaReservada(h) || horaConCheckin(h)) {
                return h;
            }
        }
        return cierre;
    };

    // ========== PARTICIPANTES ==========

    // Al cambiar la cantidad de participantes, redimensiona la lista de correos
    // adicionales (participantes - 1) conservando los ya escritos.
    const cambiarParticipantes = (n: number) => {
        setParticipantes(n);
        setEmailsAdicionales((prev) => {
            const next = prev.slice(0, n - 1);
            while (next.length < n - 1) next.push('');
            return next;
        });
    };

    const setEmailAdicional = (idx: number, valor: string) => {
        setEmailsAdicionales((prev) => prev.map((e, i) => (i === idx ? valor : e)));
    };

    const correoUtecValido = (e: string) => /^[^\s@]+@utec\.edu\.pe$/i.test(e.trim());
    // Todos los acompañantes deben tener un correo @utec.edu.pe válido.
    const participantesCompletos = emailsAdicionales.every((e) => correoUtecValido(e));

    // El lab NO atiende la fecha elegida (día no laborable del lab) O es un CIERRE institucional
    // (todo UTEC cerrado) → las mesas no se pueden usar ese día.
    const cerradoPorCierre = esCierreInstitucional(fecha);
    const cerradoEseDia = !labAtiende(fecha, lab?.diasAtencion) || cerradoPorCierre;
    // FUERA DE HORARIO hoy: el lab atiende hoy pero ya pasó la hora de CIERRE → no quedan
    // franjas reservables (generarHoras devuelve []). Solo aplica DESPUÉS del cierre; antes de
    // abrir sí se puede reservar para más tarde. Se muestra "CERRADO" y no es seleccionable.
    const fueraDeHorarioHoy = fecha === hoyLocal() && !cerradoEseDia
        && generarHoras(lab?.horaApertura || '08:00', (lab?.horaCierre || '18:00').slice(0, 5), fecha).length === 0;

    // ¿TODAS las horas reservables de la fecha elegida están bloqueadas por evento(s)
    // (TOTAL, o PARCIAL sobre esta mesa)? Sirve para marcar la mesa como no disponible
    // ANTES de elegir hora — p. ej. varios eventos TOTAL que juntos cubren todo el horario
    // del lab (bug: sin esto la mesa se veía DISPONIBLE hasta que elegías una hora tomada).
    // Solo mira bloqueos (la grilla no tiene las reservas de todas las mesas, solo de la
    // seleccionada); es exacto para eventos TOTAL/PARCIAL, que es el caso operativo.
    const diaBloqueadoPorEvento = (recursoId: number): boolean => {
        if (cerradoEseDia) return false; // el "cerrado" ya se muestra aparte
        const horas = generarHoras(lab?.horaApertura || '08:00', (lab?.horaCierre || '18:00').slice(0, 5), fecha);
        if (horas.length === 0) return false; // hoy pasado el cierre: no aplica "bloqueado por evento"
        return horas.every((h) => estaBloqueado(recursoId, fecha, h));
    };

    // ========== MUTATIONS ==========

    const crearReserva = useMutation({
        mutationFn: () =>
            reservasApi.crear({
                recursoId: selectedRecurso!.id,
                fecha,
                horaInicio,
                horaFin,
                participantes,
                carrera: carreraReserva || undefined,
                participantesEmails: emailsAdicionales.map((e) => e.trim().toLowerCase()),
            }),
        onSuccess: () => {
            toast.success('Reserva creada exitosamente');
            setSelectedRecurso(null);
            setHoraInicio('');
            setHoraFin('');
            setParticipantes(1);
            setEmailsAdicionales([]);
        },
        onError: (error: unknown) => {
            const err = error as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message || 'Error al crear la reserva');
        },
    });

    // ── Retiro de mesas (bloqueo PARCIAL motivo RETIRO, todo el día) ──
    // Retiros vigentes/programados del lab (de la query de bloqueos ya cargada).
    const retiros = (bloqueos ?? []).filter((b: { motivo?: string }) => b.motivo === 'RETIRO') as {
        id: number; fechaInicio: string; fechaFin: string; recursosAfectados?: number[];
    }[];
    // IDs de mesas retiradas en la fecha seleccionada (para pintar "RETIRADA" en la grilla).
    const mesasRetiradasEnFecha = useMemo(() => {
        const s = new Set<number>();
        retiros.forEach((r) => { if (fecha >= r.fechaInicio && fecha <= r.fechaFin) (r.recursosAfectados ?? []).forEach((id) => s.add(id)); });
        return s;
    }, [retiros, fecha]);
    const nombreRecurso = (rid: number) => recursos?.find((r: RecursoLab) => r.id === rid)?.nombre ?? `#${rid}`;
    // Vigentes/programados (aún gestionables: editar/reponer) vs vencidos (ya volvieron solos → historial).
    // Los vencidos se sacan de la vista principal: si no, se acumularían por años y ensuciarían la pantalla.
    const retirosVigentes = retiros.filter((r) => r.fechaFin >= hoyLocal());
    const retirosVencidos = retiros
        .filter((r) => r.fechaFin < hoyLocal())
        .sort((a, b) => b.fechaFin.localeCompare(a.fechaFin)); // más reciente primero

    const abrirRetiro = () => { setRetiroEditId(null); setRetiroMesas(new Set()); setRetiroIni(''); setRetiroFin(''); setShowRetiro(true); };
    const editarRetiro = (r: { id: number; recursosAfectados?: number[]; fechaInicio: string; fechaFin: string }) => {
        setRetiroEditId(r.id);
        setRetiroMesas(new Set(r.recursosAfectados ?? []));
        setRetiroIni(r.fechaInicio);
        setRetiroFin(r.fechaFin);
        setShowRetiro(true);
    };
    const toggleRetiroMesa = (rid: number) => setRetiroMesas((prev) => { const n = new Set(prev); n.has(rid) ? n.delete(rid) : n.add(rid); return n; });
    const aplicarCicloARetiro = (codigo: string) => {
        const c = (ciclos ?? []).find((x) => x.codigo === codigo);
        if (c) { setRetiroIni(c.fechaInicio); setRetiroFin(c.fechaFin); }
    };
    const crearRetiro = useMutation({
        mutationFn: () => {
            const body = {
                laboratorioId: Number(labId), tipo: 'PARCIAL', motivo: 'RETIRO',
                descripcion: 'Mesas retiradas del laboratorio por un periodo',
                fechaInicio: retiroIni, fechaFin: retiroFin,
                horaInicio: null, horaFin: null,
                recursosIds: [...retiroMesas],
            };
            // Editar = PUT (rango + todo el día, sigue siendo retiro); crear = POST.
            return retiroEditId ? api.put(`/bloqueos/${retiroEditId}`, body) : api.post('/bloqueos', body);
        },
        onSuccess: () => {
            toast.success(retiroEditId
                ? `Retiro actualizado (${retiroMesas.size} mesa(s) hasta ${retiroFin})`
                : `${retiroMesas.size} mesa(s) retirada(s) hasta ${retiroFin}`);
            setShowRetiro(false);
            queryClient.invalidateQueries({ queryKey: ['bloqueos', labId] });
            queryClient.invalidateQueries({ queryKey: ['recursos', labId] });
        },
        onError: (error: unknown) => {
            const err = error as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message || 'No se pudo retirar las mesas');
        },
    });
    const abrirAlmuerzo = () => { setAlmReporte(null); setAlmIni('13:00'); setAlmFin('14:00'); setAlmDesde(''); setAlmHasta(''); setAlmForzar(false); setShowAlmuerzo(true); };
    const aplicarCicloAlmuerzo = (codigo: string) => {
        const c = (ciclos ?? []).find((x) => x.codigo === codigo);
        if (c) { setAlmDesde(c.fechaInicio); setAlmHasta(c.fechaFin); }
    };
    const generarAlmuerzos = useMutation({
        mutationFn: () => api.post(`/bloqueos/laboratorio/${labId}/almuerzos`, {
            horaInicio: `${almIni}:00`, horaFin: `${almFin}:00`,
            fechaInicio: almDesde, fechaFin: almHasta, forzar: almForzar,
        }),
        onSuccess: (res: { data: { data: { creados: number; reservasCanceladas: number; omitidos: { fecha: string; motivo: string }[] } } }) => {
            const rep = res.data.data;
            setAlmReporte(rep);
            toast.success(`Almuerzos: ${rep.creados} creado(s), ${rep.omitidos.length} omitido(s)`);
            queryClient.invalidateQueries({ queryKey: ['bloqueos', labId] });
        },
        onError: (error: unknown) => {
            const err = error as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message || 'No se pudieron generar los almuerzos');
        },
    });
    const reponerRetiro = async (r: { id: number; recursosAfectados?: number[] }) => {
        const ok = await confirm({
            title: 'Reponer mesas', variant: 'primary', confirmText: 'Reponer',
            message: `¿Reponer ${(r.recursosAfectados ?? []).length} mesa(s)? Volverán a estar disponibles para reservar.`,
        });
        if (!ok) return;
        try {
            await api.delete(`/bloqueos/${r.id}`);
            toast.success('Mesas repuestas');
            queryClient.invalidateQueries({ queryKey: ['bloqueos', labId] });
            queryClient.invalidateQueries({ queryKey: ['recursos', labId] });
        } catch { toast.error('No se pudo reponer'); }
    };

    const descargarQr = async (recurso: RecursoLab) => {
        try {
            // El endpoint exige auth → se descarga con axios (Bearer) y se vuelca a un blob.
            const res = await api.get(`/qr/recurso/${recurso.id}?size=600`, { responseType: 'blob' });
            const url = URL.createObjectURL(res.data);
            const link = document.createElement('a');
            link.href = url;
            link.download = `QR_${lab?.codigoLab}_${recurso.nombre.replace(/\s/g, '_')}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch {
            toast.error('Error al descargar el QR');
        }
    };

    const confirmarReserva = async () => {
        const ok = await confirm({
            title: 'Confirmar reserva',
            message: `¿Confirmar la reserva de ${selectedRecurso?.nombre} el ${fecha} de ${horaInicio} a ${horaFin}?`,
            confirmText: 'Reservar',
            variant: 'primary',
        });
        if (ok) crearReserva.mutate();
    };

    const eliminarLab = async () => {
        const ok = await confirm({
            title: 'Eliminar laboratorio',
            message: `¿Eliminar ${lab?.nombre} (${lab?.codigoLab})? Se eliminarán todos sus recursos.`,
            confirmText: 'Eliminar',
            variant: 'danger',
        });
        if (!ok) return;
        api.delete(`/laboratorios/${labId}`).then(() => {
            toast.success('Laboratorio eliminado');
            navigate('/laboratorios');
        }).catch(() => toast.error('Error al eliminar'));
    };

    const agregarRecurso = async () => {
        const ok = await confirm({
            title: 'Agregar recurso',
            message: `¿Confirmar agregar el recurso "${nuevoRecurso.nombre || nuevoRecurso.tipo}"?`,
            confirmText: 'Agregar',
            variant: 'primary',
        });
        if (!ok) return;
        api.post(`/laboratorios/${labId}/recursos`, nuevoRecurso).then(() => {
            toast.success('Recurso agregado');
            queryClient.invalidateQueries();
            setShowAgregarRecurso(false);
            setNuevoRecurso({ tipo: 'MESA', nombre: '', capacidadPersonas: 4 });
        }).catch(() => toast.error('Error al agregar recurso'));
    };

    const eliminarRecurso = async (recurso: RecursoLab) => {
        const ok = await confirm({
            title: 'Eliminar recurso',
            message: `¿Eliminar ${recurso.nombre}?`,
            confirmText: 'Eliminar',
            variant: 'danger',
        });
        if (!ok) return;
        api.delete(`/laboratorios/${labId}/recursos/${recurso.id}`)
            .then(() => {
                toast.success(`${recurso.nombre} eliminado`);
                queryClient.invalidateQueries();
            })
            .catch(() => toast.error('Error al eliminar recurso'));
    };

    const guardarEditarLab = async () => {
        if (!lab) return;
        const ok = await confirm({
            title: 'Guardar cambios',
            message: '¿Confirmar guardar los cambios del laboratorio?',
            confirmText: 'Guardar',
            variant: 'primary',
        });
        if (!ok) return;
        api.put(`/laboratorios/${labId}`, {
            nombre: editLab.nombre,
            resena: editLab.resena,
            horaApertura: editLab.horaApertura + ':00',
            horaCierre: editLab.horaCierre + ':00',
            diasAtencion: editLab.diasAtencion,
            aforoTipo: lab.aforoTipo,
            aforoCantidad: lab.aforoCantidad,
            aforoCapacidad: lab.aforoCapacidad,
            piso: editLab.piso,
            ubicacionFase: editLab.ubicacionFase,
            directorId: editLab.directorId,
            departamentoId: editLab.departamentoId,
            carreraId: editLab.carreraId,
            codigoLab: lab.codigoLab,
            // Solo servicios con nombre; el backend los reemplaza en bloque.
            servicios: editServicios.filter((s) => s.nombre.trim()).map((s) => ({ nombre: s.nombre.trim(), url: s.url.trim() || null, descripcion: s.descripcion.trim() || null })),
        }).then(() => {
            toast.success('Laboratorio actualizado');
            queryClient.invalidateQueries();
            setShowEditarLab(false);
        }).catch(() => toast.error('Error al actualizar'));
    };

    const guardarCapacidadRecurso = async () => {
        if (!editRecurso) return;
        const ok = await confirm({
            title: 'Guardar capacidad',
            message: `¿Confirmar guardar la capacidad de ${editRecurso.nombre} en ${editCap}?`,
            confirmText: 'Guardar',
            variant: 'primary',
        });
        if (!ok) return;
        api.put(`/laboratorios/${labId}/recursos/${editRecurso.id}`, { capacidadPersonas: editCap })
            .then(() => {
                toast.success('Capacidad actualizada');
                queryClient.invalidateQueries();
                setEditRecurso(null);
            })
            .catch(() => toast.error('Error al actualizar'));
    };

    if (loadingLab) {
        return <div className="text-center py-12 text-utec-gray-200">Cargando laboratorio...</div>;
    }

    if (!lab) {
        return <div className="text-center py-12 text-utec-gray-200">Laboratorio no encontrado</div>;
    }

    // ========== RENDER ==========
    return (
        <div>
            {/* Header del laboratorio */}
            <div className="card mb-6">
                <div className="flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-2xl font-display font-bold text-utec-dark">{lab.nombre}</h1>
                            <Badge variant={lab.estado === 'ACTIVO' ? 'success' : 'danger'}>{lab.estado}</Badge>
                        </div>
                        <p className="text-utec-gray-200 mb-1">{lab.codigoLab} · Piso {lab.piso} · {lab.ubicacionFase}</p>
                        <p className="text-utec-gray-200 mb-1">{lab.horaApertura?.slice(0, 5)} — {lab.horaCierre?.slice(0, 5)}</p>
                        {lab.resena && <p className="text-sm text-utec-gray-200 mt-2">{lab.resena}</p>}
                        {/* Panel DESTACADO de servicios: no es "un texto más" — es un llamado a la
                            acción. Cada servicio es una fila con su nombre, qué es, y un botón
                            "Solicitar" que abre el formulario/enlace del servicio. */}
                        {(lab.servicios?.length ?? 0) > 0 && (
                            <div className="mt-4 rounded-xl border-2 border-utec-cyan/40 bg-gradient-to-r from-utec-cyan/10 to-utec-blue/5 p-4">
                                <p className="text-sm font-display font-bold text-utec-dark flex items-center gap-1.5">
                                    <Sparkles size={16} className="text-utec-cyan" /> Este laboratorio ofrece servicios
                                </p>
                                <p className="text-xs text-utec-gray-200 mt-0.5 mb-3">Pídelos en línea con el botón — no necesitas reservar una mesa para usarlos.</p>
                                <div className="space-y-2">
                                    {lab.servicios!.map((s, i) => (
                                        <div key={i} className="flex items-center justify-between gap-3 bg-white rounded-lg border border-utec-cyan/20 px-3.5 py-2.5 shadow-sm">
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-utec-dark">{s.nombre}</p>
                                                {s.descripcion && <p className="text-xs text-utec-gray-200">{s.descripcion}</p>}
                                            </div>
                                            {s.url ? (
                                                <a href={s.url} target="_blank" rel="noopener noreferrer" aria-label={`Solicitar ${s.nombre}`}
                                                   className="btn-primary text-sm flex-shrink-0 inline-flex items-center gap-1.5">
                                                    Solicitar <ExternalLink size={13} />
                                                </a>
                                            ) : (
                                                <span className="text-xs text-utec-gray-200 flex-shrink-0 italic">Consulta con el responsable</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <button
                            onClick={() => navigate(`/aulas?lab=${labId}`)}
                            className="btn-secondary text-sm mt-3 inline-flex items-center gap-1"
                        >
                            <Calendar size={14} className="inline align-[-2px]" /> Ver calendario
                        </button>
                    </div>
                    <div className="text-right">
                        {(() => {
                            // El contador refleja la FECHA elegida en el selector, no siempre hoy.
                            // HOY: foto en vivo del backend (estado real de las mesas + eventos vigentes).
                            // Otra fecha: mesas que NO están tomadas por completo por evento(s) ese día.
                            const esHoy = fecha === hoyLocal();
                            if (esHoy) {
                                if (!labAtiende(hoyLocal(), lab.diasAtencion)) {
                                    return (
                                        <>
                                            <p className="text-lg font-bold text-amber-600 inline-flex items-center gap-1"><Ban size={16} /> Fuera de servicio</p>
                                            <p className="text-xs text-utec-gray-200">No atiende hoy ({nombreDiaEs(hoyLocal()).toLowerCase()})</p>
                                        </>
                                    );
                                }
                                if (fueraDeHorarioHoy) {
                                    return (
                                        <>
                                            <p className="text-lg font-bold text-amber-600 inline-flex items-center gap-1"><Ban size={16} /> Fuera de horario</p>
                                            <p className="text-xs text-utec-gray-200">Cerró a las {(lab.horaCierre || '18:00').slice(0, 5)}</p>
                                        </>
                                    );
                                }
                                return (
                                    <>
                                        <p className="text-3xl font-bold text-utec-cyan">{lab.recursosDisponibles}</p>
                                        <p className="text-xs text-utec-gray-200">de {lab.totalRecursos} disponibles hoy</p>
                                    </>
                                );
                            }
                            if (cerradoEseDia) {
                                return (
                                    <>
                                        <p className="text-lg font-bold text-amber-600 inline-flex items-center gap-1"><Ban size={16} /> Fuera de servicio</p>
                                        <p className="text-xs text-utec-gray-200">No atiende los {nombreDiaEs(fecha).toLowerCase()}</p>
                                    </>
                                );
                            }
                            const total = recursos?.length ?? lab.totalRecursos;
                            const libres = recursos ? recursos.filter((r: RecursoLab) => !diaBloqueadoPorEvento(r.id)).length : total;
                            return (
                                <>
                                    <p className="text-3xl font-bold text-utec-cyan">{libres}</p>
                                    <p className="text-xs text-utec-gray-200">de {total} disponibles ese día</p>
                                </>
                            );
                        })()}
                        {esAdmin && (
                            <div className="flex flex-col gap-1 mt-2">
                                <button
                                    onClick={() => {
                                        setEditLab({
                                            nombre: lab.nombre,
                                            resena: lab.resena || '',
                                            horaApertura: lab.horaApertura?.slice(0, 5) || '08:00',
                                            horaCierre: lab.horaCierre?.slice(0, 5) || '18:00',
                                            diasAtencion: lab.diasAtencion || [],
                                            directorId: lab.directorId || null,
                                            piso: lab.piso,
                                            ubicacionFase: lab.ubicacionFase || '',
                                            departamentoId: lab.departamentoId || null,
                                            carreraId: lab.carreraId || null,
                                        });
                                        setEditServicios((lab.servicios || []).map((s) => ({ nombre: s.nombre, url: s.url || '', descripcion: s.descripcion || '' })));
                                        setShowEditarLab(true);
                                    }}
                                    className="text-xs text-utec-cyan hover:text-utec-blue font-medium"
                                >
                                    Editar laboratorio
                                </button>
                                <button onClick={eliminarLab} className="text-xs text-red-500 hover:text-red-700 font-medium">
                                    Eliminar laboratorio
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-utec-gray-100 text-sm text-utec-gray-200">
                    <span>{lab.aforoCantidad} {lab.aforoTipo === 'MESA' ? 'mesas' : 'PCs'}</span>
                    <span>{lab.aforoCapacidad} personas por {lab.aforoTipo === 'MESA' ? 'mesa' : 'PC'}</span>
                    {!esEstudiante && lab.facultadNombre && <span>Decanato: {lab.facultadNombre}</span>}
                    {!esEstudiante && lab.departamentoNombre && <span>{lab.departamentoNombre}</span>}
                    {lab.carreraNombre && <span>{lab.carreraNombre}</span>}
                </div>
            </div>

            {((esEstudiante && lab.responsablesInfo && lab.responsablesInfo.length > 0) ||
              (!esEstudiante && (lab.directorNombre || (lab.responsablesInfo && lab.responsablesInfo.length > 0)))) && (
                <div className="bg-white rounded-xl border border-utec-gray-100 p-5">
                    <h2 className="text-sm font-display font-bold text-utec-dark mb-3">{esEstudiante ? 'Responsable(s) del laboratorio' : 'Director y responsables'}</h2>
                    <div className={`grid grid-cols-1 gap-4 ${!esEstudiante ? 'md:grid-cols-2' : ''}`}>
                        {!esEstudiante && (
                        <div>
                            <p className="text-[11px] font-bold text-amber-600 uppercase mb-1 inline-flex items-center gap-1"><Briefcase size={11} /> Director</p>
                            {lab.directorNombre ? (
                                <div>
                                    <p className="text-sm font-medium text-utec-dark">{lab.directorNombre}</p>
                                    {lab.directorCargo && <p className="text-xs text-utec-gray-200">{lab.directorCargo}</p>}
                                    {lab.directorCorreo && <a href={`mailto:${lab.directorCorreo}`} className="text-xs text-utec-cyan hover:underline">{lab.directorCorreo}</a>}
                                </div>
                            ) : <p className="text-sm text-utec-gray-200 italic">Sin asignar</p>}
                        </div>
                        )}
                        <div>
                            <p className="text-[11px] font-bold text-green-600 uppercase mb-1 inline-flex items-center gap-1"><Wrench size={11} /> Responsable(s)</p>
                            {lab.responsablesInfo && lab.responsablesInfo.length > 0 ? (
                                <div className="space-y-2">
                                    {lab.responsablesInfo.map(r => (
                                        <div key={r.id}>
                                            <p className="text-sm font-medium text-utec-dark">{r.nombreCompleto}</p>
                                            {r.cargo && <p className="text-xs text-utec-gray-200">{r.cargo}</p>}
                                            <a href={`mailto:${r.correoUtec}`} className="text-xs text-utec-cyan hover:underline">{r.correoUtec}</a>
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="text-sm text-utec-gray-200 italic">Sin asignar</p>}
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Grid de recursos */}
                <div className="lg:col-span-2">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-display font-bold text-utec-dark">Recursos disponibles</h2>
                        <div className="flex items-center gap-3">
                            {puedeImprimirQr && (recursos?.length ?? 0) > 0 && (
                                <button onClick={() => imprimirHojaQr(lab.codigoLab)} className="text-sm text-utec-cyan hover:text-utec-blue font-medium" title="Imprimir o guardar como PDF los QR de las mesas (6 por hoja)">
                                    <Printer size={14} className="inline align-[-2px]" /> QR de mesas
                                </button>
                            )}
                            {esAdmin && (
                                <button onClick={abrirAlmuerzo} className="text-sm text-amber-600 hover:text-amber-700 font-medium" title="Programar el almuerzo recurrente (bloquea reservas de alumno en esa franja) en los días de atención del rango">
                                    🍽️ Programar almuerzo
                                </button>
                            )}
                            {esAdmin && (
                                <button onClick={abrirRetiro} className="text-sm text-amber-600 hover:text-amber-700 font-medium" title="Retirar mesas del lab por un periodo (p. ej. un ciclo): dejan de estar disponibles pero no cuentan como capacidad">
                                    <PackageMinus size={14} className="inline align-[-2px]" /> Retirar mesas
                                </button>
                            )}
                            {esAdmin && (
                                <button onClick={() => setShowAgregarRecurso(true)} className="text-sm text-utec-cyan hover:text-utec-blue font-medium">
                                    + Agregar recurso
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Tira de retiros VIGENTES/programados (solo gestión): mesas fuera + periodo + editar/reponer.
                        Los vencidos NO se muestran aquí (ya volvieron solos): se consultan en el historial. */}
                    {esAdmin && (retirosVigentes.length > 0 || retirosVencidos.length > 0) && (
                        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide"><PackageMinus size={13} className="inline align-[-2px]" /> Mesas retiradas {retirosVigentes.length > 0 ? `(${retirosVigentes.length} vigente${retirosVigentes.length === 1 ? '' : 's'})` : 'actualmente'}</p>
                                {retirosVencidos.length > 0 && (
                                    <button onClick={() => setShowHistorialRetiros(true)} className="text-xs text-amber-700 hover:underline font-medium whitespace-nowrap">Ver historial ({retirosVencidos.length})</button>
                                )}
                            </div>
                            {retirosVigentes.length > 0 ? (
                                <div className="space-y-1.5">
                                    {retirosVigentes.map((r) => (
                                        <div key={r.id} className="flex items-center justify-between gap-2 text-xs">
                                            <span className="text-amber-900 min-w-0">
                                                <b>{(r.recursosAfectados ?? []).map(nombreRecurso).join(', ')}</b>
                                                <span className="text-amber-700"> · {r.fechaInicio} → {r.fechaFin}</span>
                                            </span>
                                            <span className="flex items-center gap-2 flex-shrink-0">
                                                <button onClick={() => editarRetiro(r)} className="text-amber-700 hover:underline font-medium">Editar</button>
                                                <button onClick={() => reponerRetiro(r)} className="text-utec-cyan hover:underline font-medium">Reponer</button>
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-amber-700">No hay mesas retiradas en este momento. Hay {retirosVencidos.length} periodo{retirosVencidos.length === 1 ? '' : 's'} pasado{retirosVencidos.length === 1 ? '' : 's'} en el historial.</p>
                            )}
                        </div>
                    )}
                    {puedeImprimirQr && lab && (recursos?.length ?? 0) > 0 && (
                        <QrMesasPrint lab={lab} recursos={recursos!} />
                    )}

                    {/* Selector de fecha SIEMPRE visible (arriba de la grilla): la disponibilidad
                        de las mesas depende de esta fecha. Así, en un día cerrado el usuario puede
                        cambiar al siguiente día que sí atiende y recién ahí seleccionar mesas. */}
                    <div className="mb-4 rounded-xl border border-utec-gray-100 bg-utec-gray-50 p-3">
                        <label className="block text-sm font-medium text-utec-dark mb-1"><Calendar size={13} className="inline align-[-2px]" /> Fecha para reservar</label>
                        <SelectorFecha
                            value={fecha}
                            onChange={(f) => { setFecha(f); setSelectedRecurso(null); setHoraInicio(''); setHoraFin(''); }}
                            maxOffsetDias={1}
                            diasPermitidos={lab?.diasAtencion}
                            ocultarInput
                        />
                    </div>

                    {cerradoPorCierre ? (
                        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
                            <Ban size={13} className="inline align-[-1px]" /> <strong>UTEC está cerrada por feriado institucional</strong> ese día: no se puede reservar ningún laboratorio. Elige otra fecha arriba.
                        </div>
                    ) : cerradoEseDia && (
                        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                            <Ban size={13} className="inline align-[-1px]" /> El laboratorio <strong>no atiende los {nombreDiaEs(fecha).toLowerCase()}</strong>, así que las mesas no están disponibles ese día. Elige otra fecha arriba para reservar.
                        </div>
                    )}
                    {fueraDeHorarioHoy && (
                        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                            <Ban size={13} className="inline align-[-1px]" /> El laboratorio <strong>ya cerró por hoy</strong> (cerró a las {(lab?.horaCierre || '18:00').slice(0, 5)}). Elige otra fecha arriba para reservar.
                        </div>
                    )}
                    {esDocente && (
                        <div className="mb-4 rounded-lg bg-teal-50 border border-teal-200 px-4 py-3 text-sm text-teal-800">
                            👁️ <strong>Vista de consulta (docente):</strong> puedes ver la disponibilidad de las mesas y el calendario, pero las reservas de laboratorio las hacen los alumnos.
                        </div>
                    )}
                    {loadingRecursos ? (
                        <div className="text-center py-8 text-utec-gray-200">Cargando recursos...</div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {recursos?.sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { numeric: true })).map((recurso: RecursoLab) => {
                                const bloqueado = estaBloqueado(recurso.id, fecha, horaInicio);
                                // El estado "en vivo" (mesa OCUPADA por check-in o bajo un bloqueo/evento
                                // vigente AHORA) solo aplica a HOY: es una foto del momento. Si el usuario
                                // elige una fecha futura (ej. mañana), ese estado de hoy NO debe pintar la
                                // mesa como "EN USO" — para mañana está disponible. La disponibilidad de un
                                // día futuro depende de los bloqueos/reservas de ESE día (grilla de horas),
                                // no del estado actual del recurso.
                                const esHoySeleccionado = fecha === hoyLocal();
                                // Marca BLOQUEADO si: (a) elegiste una hora y esa hora está tomada, o (b) para
                                // una fecha FUTURA, el día entero está tomado por evento(s) (sin elegir hora).
                                // Para HOY no se usa (b): manda la foto del momento (EN USO), abajo.
                                const bloqueadoTotal = (bloqueado && !!horaInicio) || (!esHoySeleccionado && diaBloqueadoPorEvento(recurso.id));
                                const bloqueadoAhora = esHoySeleccionado && estaBloqueado(recurso.id, hoyLocal(), new Date().toTimeString().slice(0, 5));
                                const enUso = esHoySeleccionado && (recurso.estado === 'OCUPADO' || bloqueadoAhora);
                                // Estado a MOSTRAR según la fecha: OCUPADO/RESERVADO son transitorios
                                // (foto de HOY) → para una fecha futura no aplican, la mesa se ve
                                // DISPONIBLE. BLOQUEADO/MANTENIMIENTO son administrativos y sí aplican.
                                const estadoParaFecha = (!esHoySeleccionado && (recurso.estado === 'OCUPADO' || recurso.estado === 'RESERVADO'))
                                    ? 'DISPONIBLE'
                                    : recurso.estado;
                                // Mesa RETIRADA en la fecha elegida: fuera físicamente ese periodo → badge propio.
                                const esRetirada = mesasRetiradasEnFecha.has(recurso.id);
                                // Si el lab no atiende ese día, la mesa no se puede usar (no seleccionable).
                                const noPuedoSeleccionar = cerradoEseDia || fueraDeHorarioHoy || esRetirada || recurso.estado === 'BLOQUEADO' || recurso.estado === 'MANTENIMIENTO' || bloqueadoTotal;

                                return (
                                    <div
                                        key={recurso.id}
                                        className={`p-4 rounded-xl border text-center transition-all ${
                                            selectedRecurso?.id === recurso.id
                                                ? 'border-utec-cyan bg-utec-cyan/5 ring-2 ring-utec-cyan'
                                                : noPuedoSeleccionar
                                                    ? 'border-utec-gray-100 bg-utec-gray-50 opacity-50'
                                                    : enUso
                                                        ? 'border-orange-200 bg-orange-50 hover:border-utec-cyan'
                                                        : 'border-utec-gray-100 bg-white hover:border-utec-cyan'
                                        }`}
                                    >
                                        <button
                                            onClick={() => { if (!noPuedoSeleccionar && !esDocente) { setSelectedRecurso(recurso); cambiarParticipantes(1); } }}
                                            disabled={!!noPuedoSeleccionar || esDocente}
                                            className="w-full"
                                        >
                                            <p className="font-medium text-utec-dark text-sm">{recurso.nombre}</p>
                                            <Badge
                                                variant={
                                                    cerradoEseDia || fueraDeHorarioHoy
                                                        ? 'default'
                                                        : esRetirada
                                                            ? 'warning'
                                                            : bloqueadoTotal
                                                                ? 'danger'
                                                                : enUso
                                                                    ? 'warning'
                                                                    : estadoColor(estadoParaFecha) as 'default' | 'success' | 'warning' | 'danger' | 'info'
                                                }
                                                className="mt-2"
                                            >
                                                {cerradoEseDia || fueraDeHorarioHoy ? 'CERRADO' : esRetirada ? 'RETIRADA' : bloqueadoTotal ? 'BLOQUEADO' : enUso ? 'EN USO' : estadoParaFecha}
                                            </Badge>
                                            <p className="text-xs text-utec-gray-200 mt-1">{recurso.capacidadPersonas} personas</p>
                                        </button>

                                        {esAdmin && (
                                            <button
                                                onClick={() => setQrModal(recurso)}
                                                className="mt-2 hover:opacity-80 transition-opacity mx-auto block"
                                                title="Ver QR grande"
                                            >
                                                <QrImage
                                                    recursoId={recurso.id}
                                                    size={120}
                                                    alt={`QR ${recurso.nombre}`}
                                                    className="w-12 h-12 mx-auto"
                                                />
                                            </button>
                                        )}

                                        {esAdmin && (
                                            <button
                                                onClick={() => eliminarRecurso(recurso)}
                                                className="text-[10px] text-red-400 hover:text-red-600 mt-1 block mx-auto"
                                            >
                                                Eliminar
                                            </button>
                                        )}

                                        {esAdmin && (
                                            <button
                                                onClick={() => { setEditRecurso(recurso); setEditCap(recurso.capacidadPersonas); }}
                                                className="text-[10px] text-utec-cyan hover:underline mt-1 block mx-auto"
                                            >
                                                Editar capacidad
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Panel de reserva */}
                <div>
                    <div ref={reservarRef} className="card sticky top-8 scroll-mt-4">
                        <h3 className="font-display font-bold text-utec-dark mb-4">Reservar</h3>
                        {selectedRecurso ? (
                            <div className="space-y-4">
                                <div className="bg-utec-cyan/5 border border-utec-cyan/20 rounded-lg p-3">
                                    <p className="font-medium text-utec-dark">{selectedRecurso.nombre}</p>
                                    <p className="text-sm text-utec-gray-200">Capacidad: {selectedRecurso.capacidadPersonas} personas</p>
                                </div>

                                {/* Fecha (se elige arriba, en la grilla; aquí solo se muestra) */}
                                <div>
                                    <label className="block text-sm font-medium text-utec-dark mb-1">Fecha</label>
                                    <p className="text-sm text-utec-dark"><CalendarDays size={13} className="inline align-[-1px]" /> {formatoFechaLarga(fecha)}</p>
                                    <p className="text-xs text-utec-gray-200">Para cambiarla, usa el selector de fecha arriba de las mesas.</p>
                                </div>

                                {labAtiende(fecha, lab?.diasAtencion) ? (
                                  <>
                                {/* Hora inicio */}
                                <div>
                                    <label className="block text-sm font-medium text-utec-dark mb-2">Hora inicio</label>
                                    <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                                        {generarHoras(lab?.horaApertura || '08:00', lab?.horaCierre || '18:00', fecha).map((hora) => {
                                            const enClase = estaEnClase(fecha, hora);
                                            const bloqueadoEnEstaHora = estaBloqueado(selectedRecurso.id, fecha, hora);
                                            const yaReservada = horaReservada(hora);
                                            const conCheckin = horaConCheckin(hora);
                                            const noDisponible = bloqueadoEnEstaHora || yaReservada || conCheckin;
                                            return (
                                                <button
                                                    key={hora}
                                                    onClick={() => { setHoraInicio(hora); setHoraFin(''); }}
                                                    disabled={noDisponible}
                                                    title={enClase ? 'Clase programada' : undefined}
                                                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                                        horaInicio === hora
                                                            ? 'bg-utec-cyan text-white'
                                                            : conCheckin
                                                                ? 'bg-red-600 text-white cursor-not-allowed'
                                                                : yaReservada
                                                                    ? 'bg-orange-500 text-white cursor-not-allowed'
                                                                    : enClase
                                                                        ? 'bg-indigo-600 text-white cursor-not-allowed'
                                                                        : bloqueadoEnEstaHora
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
                                        <span className="flex items-center gap-1"><span className="w-3.5 h-3.5 rounded bg-indigo-600"></span>Clase</span>
                                    </div>
                                </div>

                                {/* Duración */}
                                {horaInicio && (
                                    <div>
                                        <label className="block text-sm font-medium text-utec-dark mb-2">Duración</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {generarDuraciones(horaInicio, horaFinMaxima(horaInicio)).map((d) => (
                                                <button
                                                    key={d.fin}
                                                    onClick={() => setHoraFin(d.fin)}
                                                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                                        horaFin === d.fin
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
                                {horaInicio && horaFin && (
                                    <div className="bg-utec-cyan/10 border border-utec-cyan/30 rounded-lg p-3 text-sm">
                                        <p className="text-utec-dark font-medium">
                                            {fecha} · {horaInicio} — {horaFin}
                                        </p>
                                        <p className="text-xs text-utec-gray-200 mt-1">
                                            {selectedRecurso.capacidadPersonas} personas
                                        </p>
                                    </div>
                                )}

                                {/* Carrera del alumno (se recuerda en su perfil) */}
                                <div>
                                    <label className="block text-sm font-medium text-utec-dark mb-1">Tu carrera</label>
                                    <select
                                        value={carreraReserva}
                                        onChange={(e) => setCarreraReserva(e.target.value)}
                                        className="input-field"
                                    >
                                        <option value="">— Selecciona tu carrera —</option>
                                        {carreras?.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                                    </select>
                                    <p className="text-xs text-utec-gray-200 mt-1">Se guarda en tu perfil; solo la eliges una vez.</p>
                                </div>

                                {/* Participantes — botones 1..capacidad de la mesa (no desplegable) */}
                                <div>
                                    <label className="block text-sm font-medium text-utec-dark mb-1">
                                        Participantes <span className="text-xs text-utec-gray-200 font-normal">(capacidad de la mesa: {selectedRecurso.capacidadPersonas})</span>
                                    </label>
                                    <div className="grid grid-cols-5 gap-2">
                                        {Array.from({ length: selectedRecurso.capacidadPersonas }, (_, i) => i + 1).map((n) => (
                                            <button
                                                type="button"
                                                key={n}
                                                onClick={() => cambiarParticipantes(n)}
                                                className={`py-2 rounded-lg text-sm font-medium border transition-colors ${participantes === n ? 'bg-utec-cyan text-white border-utec-cyan' : 'bg-white text-utec-dark border-gray-200 hover:border-utec-cyan'}`}
                                            >
                                                {n}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Correos de los participantes — uno por persona. El 1° es el titular
                                    (usuario logueado, bloqueado); los demás se ingresan a mano y son obligatorios. */}
                                <div>
                                    <label className="block text-sm font-medium text-utec-dark mb-1">
                                        Correos de los participantes <span className="text-xs text-utec-gray-200 font-normal">(@utec.edu.pe)</span>
                                    </label>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-utec-gray-200 w-5 text-right">1</span>
                                            <input
                                                type="email"
                                                value={user?.correoUtec || ''}
                                                readOnly
                                                disabled
                                                className="input-field flex-1 bg-gray-100 text-utec-gray-200 cursor-not-allowed"
                                                title="Titular de la reserva (tu cuenta)"
                                            />
                                        </div>
                                        {emailsAdicionales.map((email, i) => {
                                            const invalido = email.length > 0 && !correoUtecValido(email);
                                            return (
                                                <div key={i} className="flex items-center gap-2">
                                                    <span className="text-xs text-utec-gray-200 w-5 text-right">{i + 2}</span>
                                                    <input
                                                        type="email"
                                                        value={email}
                                                        onChange={(e) => setEmailAdicional(i, e.target.value)}
                                                        placeholder="nombre.apellido@utec.edu.pe"
                                                        required
                                                        className={`input-field flex-1 ${invalido ? 'border-red-400 focus:border-red-400' : ''}`}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {emailsAdicionales.length > 0 && (
                                        <p className="text-xs text-utec-gray-200 mt-1">Cada acompañante debe estar registrado como alumno en el sistema.</p>
                                    )}
                                </div>

                                {/* Botones */}
                                <button
                                    onClick={confirmarReserva}
                                    disabled={!horaInicio || !horaFin || !participantesCompletos || crearReserva.isPending}
                                    className="btn-primary w-full disabled:opacity-50"
                                >
                                    {crearReserva.isPending ? 'Creando...' : 'Confirmar reserva'}
                                </button>
                                  </>
                                ) : (
                                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-center">
                                        <Ban size={28} className="mx-auto text-utec-gray-200" />
                                        <p className="text-sm font-medium text-amber-800 mt-1">
                                            Este laboratorio no atiende los {nombreDiaEs(fecha).toLowerCase()}.
                                        </p>
                                        <p className="text-xs text-amber-700 mt-1">
                                            Atiende: {lab?.diasAtencion?.length ? lab.diasAtencion.join(', ') : 'todos los días'}
                                            {lab?.horaApertura && lab?.horaCierre ? ` · ${lab.horaApertura.slice(0, 5)}–${lab.horaCierre.slice(0, 5)}` : ''}. Elige otra fecha.
                                        </p>
                                    </div>
                                )}
                                <button
                                    onClick={() => { setSelectedRecurso(null); setHoraInicio(''); setHoraFin(''); setParticipantes(1); setEmailsAdicionales([]); }}
                                    className="btn-secondary w-full"
                                >
                                    Cancelar
                                </button>
                            </div>
                        ) : (
                            <p className="text-sm text-utec-gray-200 text-center py-4">Selecciona un recurso disponible para reservar</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal editar laboratorio */}
            {showEditarLab && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-utec-dark mb-4">Editar {lab.nombre}</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-utec-dark mb-1">Nombre</label>
                                <input type="text" value={editLab.nombre} onChange={(e) => setEditLab({ ...editLab, nombre: e.target.value })} className="input-field" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-utec-dark mb-1">Descripción</label>
                                <textarea value={editLab.resena} onChange={(e) => setEditLab({ ...editLab, resena: e.target.value })} className="input-field" rows={2} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-utec-dark mb-1">Piso</label>
                                    <select value={editLab.piso} onChange={(e) => setEditLab({ ...editLab, piso: Number(e.target.value) })} className="input-field">
                                        {[1, 2, 3, 4, 5].map((p) => (<option key={p} value={p}>Piso {p}</option>))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-utec-dark mb-1">Fase</label>
                                    <select value={editLab.ubicacionFase} onChange={(e) => setEditLab({ ...editLab, ubicacionFase: e.target.value })} className="input-field">
                                        <option value="Fase 1">Fase 1</option>
                                        <option value="Fase 2">Fase 2</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-utec-dark mb-1">Hora apertura</label>
                                    <input type="time" value={editLab.horaApertura} onChange={(e) => setEditLab({ ...editLab, horaApertura: e.target.value })} className="input-field" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-utec-dark mb-1">Hora cierre</label>
                                    <input type="time" value={editLab.horaCierre} onChange={(e) => setEditLab({ ...editLab, horaCierre: e.target.value })} className="input-field" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-utec-dark mb-1">Días de atención</label>
                                <div className="flex flex-wrap gap-2">
                                    {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'].map((dia) => (
                                        <button key={dia} type="button"
                                                onClick={() => setEditLab((prev) => ({
                                                    ...prev,
                                                    diasAtencion: prev.diasAtencion.includes(dia) ? prev.diasAtencion.filter((d) => d !== dia) : [...prev.diasAtencion, dia],
                                                }))}
                                                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                                                    editLab.diasAtencion.includes(dia) ? 'bg-utec-cyan text-white' : 'bg-utec-gray-50 text-utec-dark border border-utec-gray-100'
                                                }`}
                                        >
                                            {dia}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-utec-dark mb-1">Facultad (Decanato)</label>
                                    <select
                                        value={departamentos?.find((d) => d.id === editLab.departamentoId)?.facultadId || ''}
                                        disabled
                                        className="input-field bg-utec-gray-50"
                                    >
                                        <option value="">Se determina por el departamento</option>
                                        {facultades?.map((f) => (<option key={f.id} value={f.id}>{f.nombre}</option>))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-utec-dark mb-1">Departamento</label>
                                    <select value={editLab.departamentoId || ''} onChange={(e) => setEditLab({ ...editLab, departamentoId: e.target.value ? Number(e.target.value) : null })} className="input-field">
                                        <option value="">Sin departamento</option>
                                        {departamentos?.map((d) => (<option key={d.id} value={d.id}>{d.nombre}</option>))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-utec-dark mb-1">Carrera</label>
                                    <select value={editLab.carreraId || ''} onChange={(e) => setEditLab({ ...editLab, carreraId: e.target.value ? Number(e.target.value) : null })} className="input-field">
                                        <option value="">Sin carrera</option>
                                        {carreras?.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-utec-dark mb-1">Director</label>
                                <select value={editLab.directorId || ''} onChange={(e) => setEditLab({ ...editLab, directorId: e.target.value ? Number(e.target.value) : null })} className="input-field">
                                    <option value="">Sin director asignado</option>
                                    {directores.map((d) => (<option key={d.id} value={d.id}>{d.nombreCompleto} {d.cargo ? `— ${d.cargo}` : ''}</option>))}
                                </select>
                            </div>
                        </div>

                        {/* Servicios que ofrece el lab (nombre + enlace externo) */}
                        <div className="mt-5 border-t border-utec-gray-100 pt-4">
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-sm font-medium text-utec-dark"><Wrench size={13} className="inline align-[-2px] text-utec-cyan" /> Servicios del laboratorio</label>
                                <button type="button" onClick={() => setEditServicios((s) => [...s, { nombre: '', url: '', descripcion: '' }])} className="text-xs text-utec-cyan hover:text-utec-blue font-medium">+ Agregar servicio</button>
                            </div>
                            <p className="text-xs text-utec-gray-200 mb-2">Servicios que ofrece este lab con su enlace externo (p. ej. "Impresiones 3D" → link de solicitud).</p>
                            {editServicios.length === 0 && <p className="text-xs text-utec-gray-200 italic">Sin servicios. Usa "+ Agregar servicio".</p>}
                            <div className="space-y-2">
                                {editServicios.map((s, i) => (
                                    <div key={i} className="flex flex-wrap items-start gap-2 bg-utec-gray-50 border border-utec-gray-100 rounded-lg p-2">
                                        <input type="text" value={s.nombre} placeholder="Nombre (p. ej. Impresiones 3D)" aria-label={`Servicio ${i + 1} nombre`}
                                            onChange={(e) => setEditServicios((arr) => arr.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))}
                                            className="input-field text-sm py-1.5 flex-1 min-w-[140px]" />
                                        <input type="url" value={s.url} placeholder="https://enlace..." aria-label={`Servicio ${i + 1} enlace`}
                                            onChange={(e) => setEditServicios((arr) => arr.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                                            className="input-field text-sm py-1.5 flex-1 min-w-[160px]" />
                                        <input type="text" value={s.descripcion} placeholder="Descripción (opcional)" aria-label={`Servicio ${i + 1} descripción`}
                                            onChange={(e) => setEditServicios((arr) => arr.map((x, j) => j === i ? { ...x, descripcion: e.target.value } : x))}
                                            className="input-field text-sm py-1.5 flex-1 min-w-[140px]" />
                                        <button type="button" onClick={() => setEditServicios((arr) => arr.filter((_, j) => j !== i))} aria-label={`Quitar servicio ${i + 1}`} className="text-red-400 hover:text-red-600 p-1.5"><X size={15} /></button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setShowEditarLab(false)} className="btn-secondary text-sm">Cancelar</button>
                            <button
                                onClick={guardarEditarLab}
                                className="btn-primary text-sm"
                            >
                                Guardar cambios
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal agregar recurso */}
            {showAgregarRecurso && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-utec-dark mb-4">Agregar Recurso a {lab.nombre}</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-utec-dark mb-1">Tipo</label>
                                <select value={nuevoRecurso.tipo} onChange={(e) => setNuevoRecurso({ ...nuevoRecurso, tipo: e.target.value })} className="input-field">
                                    <option value="MESA">Mesa</option>
                                    <option value="PC">PC</option>
                                    <option value="EQUIPO">Equipo especializado</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-utec-dark mb-1">Nombre (opcional)</label>
                                <input type="text" value={nuevoRecurso.nombre} onChange={(e) => setNuevoRecurso({ ...nuevoRecurso, nombre: e.target.value })} placeholder="Se genera automáticamente si vacío" className="input-field" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-utec-dark mb-1">Capacidad (personas)</label>
                                <div className="grid grid-cols-5 gap-2">
                                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                                        <button
                                            type="button"
                                            key={n}
                                            onClick={() => setNuevoRecurso({ ...nuevoRecurso, capacidadPersonas: n })}
                                            className={`py-2 rounded-lg text-sm font-medium border transition-colors ${nuevoRecurso.capacidadPersonas === n ? 'bg-utec-cyan text-white border-utec-cyan' : 'bg-white text-utec-dark border-gray-200 hover:border-utec-cyan'}`}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setShowAgregarRecurso(false)} className="btn-secondary text-sm">Cancelar</button>
                            <button onClick={agregarRecurso} className="btn-primary text-sm">Agregar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal PROGRAMAR ALMUERZO recurrente */}
            {showAlmuerzo && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-start justify-between mb-1">
                            <h3 className="text-lg font-bold text-utec-dark">🍽️ Programar almuerzo · {lab.nombre}</h3>
                            <button onClick={() => setShowAlmuerzo(false)} aria-label="Cerrar" className="text-utec-gray-200 hover:text-utec-dark"><X size={18} /></button>
                        </div>
                        <p className="text-xs text-utec-gray-200 mb-4">Crea el almuerzo (una fila por día) en los <b>días de atención</b> del lab dentro del rango. Bloquea la reserva del alumno en esa franja. Se <b>omiten</b> los días con evento, clase o reserva (te los reporta).</p>

                        <div className="grid grid-cols-2 gap-3 mb-3">
                            <label className="block text-xs text-utec-gray-200">Desde (hora)<input type="time" value={almIni} onChange={(e) => setAlmIni(e.target.value)} className="input-field text-sm block mt-0.5" /></label>
                            <label className="block text-xs text-utec-gray-200">Hasta (hora)<input type="time" value={almFin} onChange={(e) => setAlmFin(e.target.value)} className="input-field text-sm block mt-0.5" /></label>
                        </div>
                        {(ciclos ?? []).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                <span className="text-[11px] text-utec-gray-200 self-center">Atajo:</span>
                                {(ciclos ?? []).map((c) => (
                                    <button key={c.codigo} onClick={() => aplicarCicloAlmuerzo(c.codigo)} className="text-[11px] px-2 py-0.5 rounded-full border border-line hover:bg-utec-cyan/10">Ciclo {c.codigo}</button>
                                ))}
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3 mb-3">
                            <label className="block text-xs text-utec-gray-200">Desde<input type="date" value={almDesde} onChange={(e) => setAlmDesde(e.target.value)} className="input-field text-sm block mt-0.5" /></label>
                            <label className="block text-xs text-utec-gray-200">Hasta<input type="date" value={almHasta} min={almDesde || undefined} onChange={(e) => setAlmHasta(e.target.value)} className="input-field text-sm block mt-0.5" /></label>
                        </div>
                        <label className="flex items-start gap-2 text-xs text-utec-dark mb-4">
                            <input type="checkbox" checked={almForzar} onChange={(e) => setAlmForzar(e.target.checked)} className="mt-0.5" />
                            <span><b>Forzar:</b> cancelar las reservas de alumno en conflicto (se les avisa por correo) y crear el almuerzo igual. Apagado = esos días se omiten.</span>
                        </label>

                        {almReporte && (
                            <div className="mb-4 rounded-lg border border-line bg-gray-50 p-3 text-xs">
                                <p className="font-semibold text-utec-dark mb-1">Resultado: {almReporte.creados} creado(s) · {almReporte.omitidos.length} omitido(s){almReporte.reservasCanceladas > 0 ? ` · ${almReporte.reservasCanceladas} reserva(s) cancelada(s)` : ''}</p>
                                {almReporte.omitidos.length > 0 && (
                                    <ul className="text-utec-gray-200 max-h-32 overflow-y-auto space-y-0.5">
                                        {almReporte.omitidos.map((o, i) => <li key={i}>{o.fecha} — {o.motivo}</li>)}
                                    </ul>
                                )}
                            </div>
                        )}

                        <div className="flex justify-end gap-2">
                            <button onClick={() => setShowAlmuerzo(false)} className="px-4 py-2 text-sm rounded-lg border border-line hover:bg-gray-50">Cerrar</button>
                            <button onClick={() => generarAlmuerzos.mutate()} disabled={!almDesde || !almHasta || generarAlmuerzos.isPending} className="px-4 py-2 text-sm rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-50">
                                {generarAlmuerzos.isPending ? 'Generando…' : 'Generar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal HISTORIAL de retiros ya vencidos (solo lectura) */}
            {showHistorialRetiros && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowHistorialRetiros(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-start justify-between mb-1">
                            <h3 className="text-lg font-bold text-utec-dark"><PackageMinus size={18} className="inline align-[-3px] text-amber-600" /> Historial de retiros · {lab.nombre}</h3>
                            <button onClick={() => setShowHistorialRetiros(false)} aria-label="Cerrar" className="text-utec-gray-200 hover:text-utec-dark"><X size={18} /></button>
                        </div>
                        <p className="text-xs text-utec-gray-200 mb-4">Periodos de retiro ya <b>vencidos</b>: las mesas ya volvieron solas al servicio. Es solo un registro histórico y <b>no afecta la disponibilidad actual</b>.</p>
                        {retirosVencidos.length === 0 ? (
                            <p className="text-sm text-utec-gray-200 py-6 text-center">No hay retiros vencidos.</p>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {retirosVencidos.map((r) => (
                                    <li key={r.id} className="py-2.5 flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-utec-dark">{(r.recursosAfectados ?? []).map(nombreRecurso).join(', ') || '—'}</p>
                                            <p className="text-xs text-utec-gray-200">{r.fechaInicio} → {r.fechaFin}</p>
                                        </div>
                                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200 whitespace-nowrap flex-shrink-0">Vencido</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="mt-4 flex justify-end">
                            <button onClick={() => setShowHistorialRetiros(false)} className="px-4 py-2 text-sm rounded-lg border border-line hover:bg-gray-50">Cerrar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal RETIRAR MESAS por un periodo */}
            {showRetiro && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-start justify-between mb-1">
                            <h3 className="text-lg font-bold text-utec-dark"><PackageMinus size={18} className="inline align-[-3px] text-amber-600" /> {retiroEditId ? 'Editar retiro de' : 'Retirar mesas de'} {lab.nombre}</h3>
                            <button onClick={() => setShowRetiro(false)} aria-label="Cerrar" className="text-utec-gray-200 hover:text-utec-dark"><X size={18} /></button>
                        </div>
                        <p className="text-xs text-utec-gray-200 mb-4">Las mesas seleccionadas salen físicamente del laboratorio durante el periodo: dejan de estar disponibles para reservar y <b>no cuentan como capacidad</b> en el dashboard. No compiten con eventos y vuelven solas al terminar el periodo.</p>

                        {/* Mesas a retirar */}
                        <label className="block text-sm font-medium text-utec-dark mb-1">Mesas a retirar</label>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
                            {recursos?.filter((r: RecursoLab) => r.tipo === 'MESA').sort((a: RecursoLab, b: RecursoLab) => a.nombre.localeCompare(b.nombre, undefined, { numeric: true })).map((r: RecursoLab) => {
                                const sel = retiroMesas.has(r.id);
                                // Solo bloquea si la mesa ya está en OTRO retiro VIGENTE (uno vencido no impide re-retirarla).
                                const yaRetirada = retirosVigentes.some((x) => x.id !== retiroEditId && (x.recursosAfectados ?? []).includes(r.id));
                                return (
                                    <button key={r.id} type="button" disabled={yaRetirada} onClick={() => toggleRetiroMesa(r.id)}
                                        title={yaRetirada ? 'Ya está retirada en otro periodo' : undefined}
                                        className={`py-2 rounded-lg text-xs font-medium border transition-colors ${yaRetirada ? 'bg-utec-gray-50 text-utec-gray-200 border-utec-gray-100 cursor-not-allowed line-through' : sel ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-utec-dark border-gray-200 hover:border-amber-400'}`}>
                                        {r.nombre}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Periodo con atajo de ciclo */}
                        <label className="block text-sm font-medium text-utec-dark mb-1">Periodo del retiro</label>
                        {(ciclos?.length ?? 0) > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                <span className="text-[11px] text-utec-gray-200 self-center">Atajo:</span>
                                {ciclos?.map((c) => (
                                    <button key={c.codigo} type="button" onClick={() => aplicarCicloARetiro(c.codigo)}
                                        className="text-[11px] px-2 py-1 rounded-full border border-utec-gray-100 hover:border-utec-cyan hover:text-utec-cyan transition-colors">
                                        Ciclo {c.codigo}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3 mb-5">
                            <label className="block text-xs text-utec-gray-200">Desde<input type="date" value={retiroIni} onChange={(e) => setRetiroIni(e.target.value)} className="input-field text-sm block mt-0.5" /></label>
                            <label className="block text-xs text-utec-gray-200">Hasta<input type="date" value={retiroFin} min={retiroIni || undefined} onChange={(e) => setRetiroFin(e.target.value)} className="input-field text-sm block mt-0.5" /></label>
                        </div>

                        <div className="flex justify-end gap-3">
                            <button onClick={() => setShowRetiro(false)} className="btn-secondary text-sm">Cancelar</button>
                            <button onClick={() => crearRetiro.mutate()}
                                disabled={retiroMesas.size === 0 || !retiroIni || !retiroFin || crearRetiro.isPending}
                                className="btn-primary text-sm disabled:opacity-40">
                                {crearRetiro.isPending ? 'Guardando…' : retiroEditId ? 'Guardar cambios' : `Retirar ${retiroMesas.size || ''} mesa${retiroMesas.size === 1 ? '' : 's'}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal editar capacidad del recurso */}
            {editRecurso && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-utec-dark mb-1">Editar {editRecurso.nombre}</h3>
                        <p className="text-sm text-utec-gray-200 mb-4">Capacidad de personas</p>
                        <div className="grid grid-cols-5 gap-2">
                            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                                <button
                                    type="button"
                                    key={n}
                                    onClick={() => setEditCap(n)}
                                    className={`py-2 rounded-lg text-sm font-medium border transition-colors ${editCap === n ? 'bg-utec-cyan text-white border-utec-cyan' : 'bg-white text-utec-dark border-gray-200 hover:border-utec-cyan'}`}
                                >
                                    {n}
                                </button>
                            ))}
                        </div>
                        <div className="flex justify-end gap-2 mt-6">
                            <button onClick={() => setEditRecurso(null)} className="btn-secondary text-sm">Cancelar</button>
                            <button
                                onClick={guardarCapacidadRecurso}
                                className="btn-primary text-sm"
                            >
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal QR Grande */}
            {qrModal && esAdmin && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setQrModal(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="mb-4">
                            <img src="https://utec.edu.pe/sites/default/files/2024-10/LOGO_UTEC.svg" alt="UTEC" className="h-10 mx-auto mb-3" />
                            <div className="border-t-2 border-utec-cyan pt-3">
                                <h3 className="text-xl font-bold text-utec-dark">{lab.nombre}</h3>
                                <p className="text-sm text-utec-gray-200">{lab.codigoLab} · Piso {lab.piso} · {lab.ubicacionFase}</p>
                            </div>
                        </div>
                        <div className="bg-utec-gray-50 rounded-xl p-6 mb-4">
                            <QrImage recursoId={qrModal.id} size={400} alt={`QR ${qrModal.nombre}`} className="w-64 h-64 mx-auto" />
                        </div>
                        <div className="mb-6">
                            <p className="text-2xl font-bold text-utec-dark">{qrModal.nombre}</p>
                            <p className="text-sm text-utec-gray-200">Capacidad: {qrModal.capacidadPersonas} personas</p>
                            <p className="text-xs text-utec-gray-200 mt-1 font-mono">{qrModal.qrCode}</p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => descargarQr(qrModal)} className="btn-primary flex-1">Descargar QR</button>
                            <button onClick={() => setQrModal(null)} className="btn-secondary flex-1">Cerrar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
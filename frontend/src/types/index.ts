export interface ApiResponse<T> {
    success: boolean;
    message: string;
    data: T;
    error?: string;
    status: number;
    timestamp: string;
}

export interface UserProfile {
    id: number;
    correoUtec: string;
    nombres: string;
    apellidos: string;
    nombreCompleto: string;
    rol: string;
    cargo?: string;
    avatarUrl?: string;
}

export interface PersonaResumen {
    id: number;
    nombreCompleto: string;
    correoUtec: string;
    cargo?: string;
}

export interface Laboratorio {
    id: number;
    codigoLab: string;
    nombre: string;
    piso: number;
    ubicacionFase: string;
    resena?: string;
    diasAtencion: string[];
    horaApertura: string;
    horaCierre: string;
    aforoTipo: string;
    aforoCantidad: number;
    aforoCapacidad: number;
    estado: string;
    directorId?: number;
    directorNombre?: string;
    directorCorreo?: string;
    directorCargo?: string;
    departamentoId?: number;
    departamentoNombre?: string;
    carreraId?: number;
    carreraNombre?: string;
    facultadNombre?: string;
    responsables: string[];
    responsablesInfo?: PersonaResumen[];
    totalRecursos: number;
    recursosDisponibles: number;
    recursosDisponiblesHoy?: number;
    servicios?: ServicioLab[];
}

export interface ServicioLab {
    nombre: string;
    url?: string;
    descripcion?: string;
}

export interface RecursoLab {
    id: number;
    tipo: string;
    nombre: string;
    numero: number;
    qrCode: string;
    estado: string;
    capacidadPersonas: number;
}

export interface Reserva {
    id: number;
    recursoId: number;
    recursoNombre: string;
    recursoQrCode: string;
    laboratorioNombre: string;
    laboratorioCodigo: string;
    fecha: string;
    horaInicio: string;
    horaFin: string;
    estado: string;
    tipoReserva: string;
    participantes: number;
    motivo?: string;
    usuarioNombre: string;
    createdAt: string;
    // Solo presente en el listado de gestión (/reservas/mis-reservas); en el
    // calendario viene undefined (no se expone la composición de la reserva).
    participantesLista?: ParticipanteResumen[];
    // ¿El usuario actual es el titular? Solo en /reservas/mis-reservas. Un
    // acompañante la ve de solo lectura (sin Cancelar/Editar/Check-in).
    esMia?: boolean;
}

export interface ParticipanteResumen {
    nombreCompleto: string;
    correo?: string;
    carrera?: string;
    esTitular: boolean;
}

export interface CreateReservaRequest {
    recursoId: number;
    fecha: string;
    horaInicio: string;
    horaFin: string;
    participantes: number;
    motivo?: string;
    carrera?: string;
    participantesEmails?: string[];
}
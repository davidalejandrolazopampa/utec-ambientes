// Tipos y helpers compartidos de la sección Organización (página + tarjetas + modales).
import { Shield, ClipboardList, Briefcase, Wrench, GraduationCap, DoorOpen, BookOpen } from 'lucide-react';

export interface Usuario { id: number; correoUtec: string; nombres: string; apellidos: string; nombreCompleto: string; rol: string; cargo?: string; carrera?: string; departamentoId?: number; activo: boolean; laboratoriosAsignados?: string[]; }
// Página de usuarios (búsqueda paginada por servidor, p. ej. alumnos).
export interface UsuarioPage { content: Usuario[]; total: number; page: number; size: number; totalPages: number; }
export interface Carrera { id: number; nombre: string; facultadId?: number; departamentoId?: number; }
export interface Lab { id: number; nombre: string; codigoLab: string; estado: string; piso?: number; ubicacionFase?: string; departamentoId?: number; departamentoNombre?: string; facultadNombre?: string; responsables?: string[]; directorNombre?: string; directorId?: number; }
// tipo: 'FACULTAD' (su líder es decano/a) | 'DIRECCION' (área administrativa; su líder es director/a).
export interface Facultad { id: number; nombre: string; decanoId?: number; tipo?: string; }
export interface Departamento { id: number; nombre: string; facultadId?: number; directorId?: number; }
export type Tab = 'estructura' | 'labs' | 'personas';

export const ROLES = [
    { id: 'ADMIN', label: 'Admin', color: 'bg-red-100 text-red-700 border-red-200', Icon: Shield },
    { id: 'COORDINADOR', label: 'Coordinador', color: 'bg-blue-100 text-blue-700 border-blue-200', Icon: ClipboardList },
    { id: 'DIRECTOR', label: 'Director', color: 'bg-amber-100 text-amber-700 border-amber-200', Icon: Briefcase },
    { id: 'RESPONSABLE_LAB', label: 'Responsable', color: 'bg-green-100 text-green-700 border-green-200', Icon: Wrench },
    // Counter de Docencia (aulas/cursos/horarios de clase; su dashboard es el ámbito Aulas).
    { id: 'DOCENCIA', label: 'Docencia', color: 'bg-indigo-100 text-indigo-700 border-indigo-200', Icon: DoorOpen },
    // Docente (profesor): consulta calendarios y horarios en solo lectura — NO reserva.
    { id: 'DOCENTE', label: 'Docente', color: 'bg-teal-100 text-teal-700 border-teal-200', Icon: BookOpen },
    { id: 'ESTUDIANTE', label: 'Estudiante', color: 'bg-gray-100 text-gray-600 border-gray-200', Icon: GraduationCap },
];
// Roles administrativos (todos menos ESTUDIANTE). El alumno SOLO puede ser ESTUDIANTE.
export const ROLES_ADMIN = ROLES.filter(r => r.id !== 'ESTUDIANTE');
export const rolInfo = (rol: string) => ROLES.find(r => r.id === rol) || ROLES.find(r => r.id === 'ESTUDIANTE')!;

// Extrae el mensaje de error del backend (ApiResponse.message) para no ocultarlo.
export const errMsg = (e: unknown) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message;

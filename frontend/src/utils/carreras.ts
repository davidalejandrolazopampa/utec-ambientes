// Mapeo del PREFIJO del código de curso → "Área funcional" OFICIAL de UTEC (la misma que usa
// el sistema de horarios para agrupar los cursos). Derivado de los nombres de curso reales del
// horario 2026-1. Algunos prefijos son transversales (PI, PR, GE) o poco frecuentes → mejor esfuerzo.
export const AREA_CARRERA: Record<string, string> = {
    AD: 'Administración y Negocios Digitales',
    AM: 'Departamento de Ingeniería Ambiental',
    BA: 'Business Analytics',
    BI: 'Departamento de Bioingeniería',
    CC: 'Departamento de Ciencias',
    CI: 'Departamento de Civil',
    CS: 'Departamento de Computer Science',
    CY: 'Ciberseguridad',
    DS: 'Ciencia de Datos e Inteligencia Artificial',
    EL: 'Departamento de Electrónica',
    EN: 'Departamento de Energía',
    GE: 'Cursos electivos (GE)',
    GH: 'Dirección de Gestión',
    GI: 'Dirección de Gestión',
    HH: 'Dirección de Humanidades, Artes y Ciencias Sociales',
    IN: 'Departamento de Industrial',
    IQ: 'Departamento de Química',
    IS: 'Departamento de Sistemas de Información',
    ME: 'Departamento de Mecánica',
    MT: 'Departamento de Mecatrónica',
    PI: 'Proyectos Interdisciplinarios',
    PO: 'Departamento de Bioingeniería',
    PR: 'Proyecto Preprofesional',
    QI: 'Departamento de Química',
};

/** Nombre del área funcional a partir del prefijo del código; si no está mapeado, devuelve el código. */
export const nombreCarrera = (area: string) => AREA_CARRERA[area] ?? area;

-- V11: Rol DOCENTE (profesores) — consultan los calendarios (aulas/labs/auditorios y cursos)
-- pero NO reservan (la guarda vive en ReservaService). Ver la documentación técnica.

INSERT INTO roles (nombre, descripcion, activo)
VALUES ('DOCENTE', 'Docente: consulta calendarios y horarios (solo lectura, no reserva)', true)
ON CONFLICT (nombre) DO NOTHING;

-- Backfill: da de alta la cuenta de cada docente que ya figura en las CLASES del horario
-- (HorarioImportService guarda su nombre y correo en responsable_nombre/responsable_correo;
-- el nombre viene "Apellidos, Nombres"). Idempotente: no toca correos ya registrados y en
-- una BD sin clases (test/CI) inserta 0 filas. Los imports futuros crean a los docentes
-- nuevos directamente (registrarDocente en HorarioImportService).
INSERT INTO usuarios (correo_utec, nombres, apellidos, rol_id, activo)
SELECT DISTINCT ON (lower(b.responsable_correo))
       lower(b.responsable_correo),
       COALESCE(NULLIF(trim(split_part(b.responsable_nombre, ',', 2)), ''), b.responsable_nombre),
       COALESCE(NULLIF(trim(split_part(b.responsable_nombre, ',', 1)), ''), ''),
       (SELECT id FROM roles WHERE nombre = 'DOCENTE'),
       true
FROM bloqueos b
WHERE b.es_clase = true
  AND b.responsable_correo IS NOT NULL
  AND lower(b.responsable_correo) LIKE '%@utec.edu.pe'
  AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE lower(u.correo_utec) = lower(b.responsable_correo))
ORDER BY lower(b.responsable_correo), b.id;

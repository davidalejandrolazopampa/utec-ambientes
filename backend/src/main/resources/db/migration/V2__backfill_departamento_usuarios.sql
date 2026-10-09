-- V2: rellena usuarios.departamento_id desde la estructura (herencia).
--
-- Contexto: la cascada del sistema (responsable → director → departamento) se calcula al
-- vuelo desde `director_responsables` y `departamentos.director_id`, pero NUNCA escribía el
-- departamento en la ficha del usuario (`usuarios.departamento_id`), que quedaba NULL. Por eso
-- en Organización → Personas las personas salían "Sin departamento" aunque el dato existiera.
--
-- Este backfill hereda el departamento de la estructura, de forma NO ambigua:
--   - Director  → el departamento que dirige (`departamentos.director_id`).
--   - Responsable → el departamento de su(s) lab(s) (`lab_responsables` → `laboratorios`);
--     ningún responsable tiene labs de departamentos distintos, así que es único.
-- Solo se rellenan los vacíos (no pisa asignaciones manuales existentes). Idempotente:
-- re-ejecutar no cambia nada porque el WHERE exige `departamento_id IS NULL`.
-- El backend además mantiene esto sincronizado al asignar responsables/directores a labs.

-- Directores: el departamento que dirigen.
UPDATE usuarios u
SET departamento_id = d.id
FROM departamentos d
WHERE d.director_id = u.id
  AND u.departamento_id IS NULL;

-- Responsables (y cualquiera aún sin depto): el departamento de su lab (único por persona).
UPDATE usuarios u
SET departamento_id = sub.depto
FROM (
    SELECT lr.usuario_id, MIN(l.departamento_id) AS depto
    FROM lab_responsables lr
    JOIN laboratorios l ON l.id = lr.laboratorio_id
    WHERE l.departamento_id IS NOT NULL
    GROUP BY lr.usuario_id
) sub
WHERE u.id = sub.usuario_id
  AND u.departamento_id IS NULL;

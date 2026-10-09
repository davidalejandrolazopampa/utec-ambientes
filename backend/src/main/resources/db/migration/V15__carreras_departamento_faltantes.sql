-- V15 (jul-2026): completa el departamento_id de las carreras que quedaron NULL tras el
-- backfill heurístico original (5 carreras "sin labs" no se pudieron mapear vía laboratorios).
-- Desde entonces se crearon los departamentos académicos con NOMBRE EXACTO correspondiente,
-- así que el mapeo ya no es heurístico sino directo por nombre:
--   · Administración y Negocios Digitales → DPTO. ACADÉMICO DE ADMINISTRACIÓN Y NEGOCIOS DIGITALES
--   · Business Analytics                  → DPTO. ACADÉMICO DE BUSINESS ANALYTICS
--   · Ingeniería Industrial               → DPTO. ACADÉMICO DE INGENIERÍA INDUSTRIAL
--   · Sistemas de Información             → DPTO. ACADÉMICO DE SISTEMAS Y SEGURIDAD DE LA INFORMACIÓN
-- (Física y Ciencia de Datos e IA ya fueron completadas antes por datos vivos.)
-- Idempotente: solo toca carreras con departamento_id NULL y si el depto existe.

UPDATE carreras SET departamento_id =
    (SELECT id FROM departamentos WHERE nombre ILIKE '%ADMINISTRACIÓN Y NEGOCIOS DIGITALES%' LIMIT 1)
WHERE nombre = 'Administración y Negocios Digitales' AND departamento_id IS NULL
  AND EXISTS (SELECT 1 FROM departamentos WHERE nombre ILIKE '%ADMINISTRACIÓN Y NEGOCIOS DIGITALES%');

UPDATE carreras SET departamento_id =
    (SELECT id FROM departamentos WHERE nombre ILIKE '%BUSINESS ANALYTICS%' LIMIT 1)
WHERE nombre = 'Business Analytics' AND departamento_id IS NULL
  AND EXISTS (SELECT 1 FROM departamentos WHERE nombre ILIKE '%BUSINESS ANALYTICS%');

UPDATE carreras SET departamento_id =
    (SELECT id FROM departamentos WHERE nombre ILIKE '%INGENIERÍA INDUSTRIAL%' LIMIT 1)
WHERE nombre = 'Ingeniería Industrial' AND departamento_id IS NULL
  AND EXISTS (SELECT 1 FROM departamentos WHERE nombre ILIKE '%INGENIERÍA INDUSTRIAL%');

UPDATE carreras SET departamento_id =
    (SELECT id FROM departamentos WHERE nombre ILIKE '%SISTEMAS Y SEGURIDAD DE LA INFORMACIÓN%' LIMIT 1)
WHERE nombre = 'Sistemas de Información' AND departamento_id IS NULL
  AND EXISTS (SELECT 1 FROM departamentos WHERE nombre ILIKE '%SISTEMAS Y SEGURIDAD DE LA INFORMACIÓN%');

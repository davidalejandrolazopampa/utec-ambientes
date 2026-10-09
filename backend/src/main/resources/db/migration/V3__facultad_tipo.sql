-- V3: distingue FACULTAD real de DIRECCION/área administrativa.
--
-- Contexto: en `facultades` conviven facultades académicas reales (Ingeniería, Computación,
-- Ciencias, Ind. y Negocios) con unidades administrativas mal modeladas como facultad
-- (Marketing, Dirección General Académica, Innovación e Investigación). El sistema llamaba
-- "Decano/a" a cualquiera asignado en `facultades.decano_id`, aunque no lo fuera
-- (p. ej. Patricia en "Marketing"). Con `tipo` se separa el concepto:
--   - FACULTAD  → su líder es DECANO/A.
--   - DIRECCION → su líder es DIRECTOR/A de esa área (no decano).
-- Clasificación por nombre: lo que NO empieza con "FACULTAD" es una DIRECCION. Idempotente.

ALTER TABLE facultades ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'FACULTAD';

UPDATE facultades SET tipo = 'DIRECCION' WHERE nombre NOT ILIKE 'FACULTAD%';

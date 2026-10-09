-- V8: agrega la semana de exámenes de REZAGADOS 2026-1 (13–18 jul) al calendario académico.
-- Cae después del último día de clases (4 jul); sirve para que el calendario la muestre.
-- Idempotente (la tabla no tiene unique): solo inserta si no existe ya.
INSERT INTO ciclo_excepciones (ciclo, fecha_inicio, fecha_fin, tipo, descripcion)
SELECT '2026-1', '2026-07-13', '2026-07-18', 'EXAMEN', 'Exámenes de rezagados'
WHERE NOT EXISTS (
    SELECT 1 FROM ciclo_excepciones
    WHERE ciclo = '2026-1' AND fecha_inicio = '2026-07-13' AND tipo = 'EXAMEN'
);

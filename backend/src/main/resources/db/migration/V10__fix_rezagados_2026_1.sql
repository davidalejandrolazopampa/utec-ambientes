-- V10: corrige la semana de EXÁMENES DE REZAGADOS de 2026-1 según el calendario académico
-- oficial de UTEC (ANEXO 1, Pregrado 2026-1): "Exámenes de rezagados — Jueves 16 jul → Lunes
-- 20 jul 2026". V8 la sembró 13–18 jul por error (antes de tener la fecha oficial).
UPDATE ciclo_excepciones
SET fecha_inicio = DATE '2026-07-16', fecha_fin = DATE '2026-07-20'
WHERE ciclo = '2026-1' AND tipo = 'EXAMEN' AND descripcion = 'Exámenes de rezagados';

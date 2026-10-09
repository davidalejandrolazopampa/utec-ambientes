-- V9: Reconcilia los feriados duplicados. FUENTE ÚNICA = los feriados OPERATIVOS
-- (bloqueos motivo=FERIADO): los feriados oficiales del año en todos los labs, que cierran el
-- lab para reservas y alimentan la sección "Operativo" del dashboard. De ahí se DERIVAN las
-- excepciones ACADÉMICAS del calendario (ciclo_excepciones tipo FERIADO), que marcan "ese día no
-- hay clase" en el calendario del alumno, excluyen el día del cálculo de horas de clase
-- (AnalyticsRepository.horasClasePorLab) y evitan bloquear una reserva por clase ese día
-- (ReservaService.validarSinClaseProgramada).
--
-- ANTES: había 3 excepciones FERIADO sembradas a mano (V7), incompletas e inconsistentes:
--   - faltaba p. ej. "Batalla de Arica" (7-jun), que cae dentro del ciclo 2026-1;
--   - agrupaba "Semana Santa 2–3 abr" en vez de "Jueves Santo" / "Viernes Santo".
-- Y como el frontend pintaba el bloqueo FERIADO como evento morado ADEMÁS de la marca rosa
-- académica, el mismo feriado salía DOS veces en el calendario. Ahora la marca rosa se deriva de
-- la MISMA fuente (los bloqueos oficiales) y el frontend deja de pintar el FERIADO operativo como
-- evento → un solo feriado, consistente y completo.

-- 1) Limpia las excepciones FERIADO existentes (se regeneran desde la fuente única).
DELETE FROM ciclo_excepciones WHERE tipo = 'FERIADO';

-- 2) Deriva una excepción FERIADO por cada feriado operativo (fecha distinta) que cae dentro del
--    rango de un ciclo académico. La descripción es el nombre oficial del feriado (del bloqueo).
INSERT INTO ciclo_excepciones (ciclo, fecha_inicio, fecha_fin, tipo, descripcion)
SELECT c.anio || '-' || c.ciclo, f.fecha, f.fecha, 'FERIADO', f.descripcion
FROM (SELECT fecha_inicio AS fecha, MIN(descripcion) AS descripcion
      FROM bloqueos WHERE CAST(motivo AS VARCHAR) = 'FERIADO'
      GROUP BY fecha_inicio) f
JOIN ciclos_academicos c ON f.fecha BETWEEN c.fecha_inicio AND c.fecha_fin;

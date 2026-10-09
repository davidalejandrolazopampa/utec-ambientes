-- V13 (jul-2026): tipo de excepción "CIERRE" = cierre institucional (feriado institucional
-- que cierra TODO UTEC por un rango de fechas). A diferencia de FERIADO/EXAMEN (que solo
-- detienen clases), un CIERRE ADEMÁS bloquea las reservas de labs y descuenta esos días de la
-- capacidad del dashboard. Es la fuente ÚNICA y general (una fila = toda UTEC), gestionada
-- desde el calendario académico (CiclosPage) — no crea bloqueos por-lab.
--
-- Solo amplía el CHECK del tipo; el resto de la lógica lo leen ReservaService (bloquea reservas)
-- y AnalyticsService.getInsights (resta capacidad). `esDiaSinClases` ya es agnóstico al tipo,
-- así que un CIERRE detiene clases (labs + aulas) sin cambios.
ALTER TABLE ciclo_excepciones DROP CONSTRAINT IF EXISTS chk_excepcion_tipo;
ALTER TABLE ciclo_excepciones ADD CONSTRAINT chk_excepcion_tipo
    CHECK (tipo IN ('EXAMEN', 'FERIADO', 'OTRO', 'CIERRE'));

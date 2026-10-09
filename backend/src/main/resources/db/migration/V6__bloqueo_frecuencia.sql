-- V6: frecuencia de una clase (bloqueo recurrente). El horario UTEC tiene clases
-- QUINCENALES: "Semana A" y "Semana B" se dictan en semanas alternas (no todas las semanas).
-- SEMANA_GENERAL = todas las semanas (por defecto para las clases ya cargadas).
ALTER TABLE bloqueos ADD COLUMN IF NOT EXISTS frecuencia VARCHAR(20);
UPDATE bloqueos SET frecuencia = 'SEMANA_GENERAL' WHERE es_clase = true AND frecuencia IS NULL;

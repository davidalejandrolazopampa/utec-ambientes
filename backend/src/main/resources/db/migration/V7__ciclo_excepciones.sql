-- V7: excepciones del calendario académico (días/semanas SIN clases regulares):
-- exámenes (Parciales/Finales) y feriados. En esas fechas no se dictan clases → el
-- calendario no las pinta y las reservas de lab NO se bloquean por clase.
CREATE TABLE IF NOT EXISTS ciclo_excepciones (
    id           BIGSERIAL PRIMARY KEY,
    ciclo        VARCHAR(10)  NOT NULL,          -- 2026-1
    fecha_inicio DATE         NOT NULL,
    fecha_fin    DATE         NOT NULL,
    tipo         VARCHAR(20)  NOT NULL,          -- EXAMEN, FERIADO, OTRO
    descripcion  VARCHAR(120),
    created_at   TIMESTAMP    NOT NULL DEFAULT now(),
    CONSTRAINT chk_excepcion_fechas CHECK (fecha_inicio <= fecha_fin),
    CONSTRAINT chk_excepcion_tipo CHECK (tipo IN ('EXAMEN', 'FERIADO', 'OTRO'))
);
CREATE INDEX IF NOT EXISTS idx_excepciones_ciclo ON ciclo_excepciones (ciclo);

-- Semilla 2026-1 (de la "Programación Semanal 2026-1" oficial).
INSERT INTO ciclo_excepciones (ciclo, fecha_inicio, fecha_fin, tipo, descripcion) VALUES
    ('2026-1', '2026-05-11', '2026-05-16', 'EXAMEN',  'Exámenes parciales'),
    ('2026-1', '2026-07-06', '2026-07-11', 'EXAMEN',  'Exámenes finales'),
    ('2026-1', '2026-04-02', '2026-04-03', 'FERIADO', 'Semana Santa'),
    ('2026-1', '2026-05-01', '2026-05-01', 'FERIADO', 'Día del Trabajo'),
    ('2026-1', '2026-06-29', '2026-06-29', 'FERIADO', 'San Pedro y San Pablo')
ON CONFLICT DO NOTHING;

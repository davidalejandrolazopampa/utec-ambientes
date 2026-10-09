-- V5: Calendario académico configurable. Antes las fechas del ciclo estaban hardcodeadas
-- en el frontend; ahora viven en BD y se editan desde la ventana "Ciclos académicos".
CREATE TABLE IF NOT EXISTS ciclos_academicos (
    id           BIGSERIAL PRIMARY KEY,
    anio         INTEGER NOT NULL,
    ciclo        INTEGER NOT NULL,          -- 0 (verano), 1 (Mar–Jul), 2 (Ago–Nov)
    fecha_inicio DATE    NOT NULL,          -- inicio de clases
    fecha_fin    DATE    NOT NULL,          -- último día de clases
    created_at   TIMESTAMP NOT NULL DEFAULT now(),
    updated_at   TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT uq_ciclo_anio UNIQUE (anio, ciclo),
    CONSTRAINT chk_ciclo_valores CHECK (ciclo IN (0, 1, 2)),
    CONSTRAINT chk_ciclo_fechas CHECK (fecha_inicio <= fecha_fin)
);

-- Semilla 2026 con las fechas del calendario académico oficial (pregrado).
INSERT INTO ciclos_academicos (anio, ciclo, fecha_inicio, fecha_fin) VALUES
    (2026, 0, '2026-01-05', '2026-02-28'),
    (2026, 1, '2026-03-23', '2026-07-04'),
    (2026, 2, '2026-08-10', '2026-11-21')
ON CONFLICT (anio, ciclo) DO NOTHING;

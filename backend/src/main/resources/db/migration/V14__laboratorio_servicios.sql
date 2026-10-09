-- V14 (jul-2026): servicios que ofrece cada laboratorio (p. ej. FabLab L105/L207 → "Impresiones
-- 3D" con su enlace externo). Es POR LABORATORIO: cada lab tiene su propia lista, con su enlace.
CREATE TABLE IF NOT EXISTS laboratorio_servicios (
    id             BIGSERIAL PRIMARY KEY,
    laboratorio_id BIGINT NOT NULL REFERENCES laboratorios(id) ON DELETE CASCADE,
    nombre         VARCHAR(120) NOT NULL,
    url            VARCHAR(500),
    descripcion    VARCHAR(400),
    created_at     TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lab_servicios_lab ON laboratorio_servicios (laboratorio_id);

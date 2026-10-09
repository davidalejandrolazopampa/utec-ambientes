-- V16 (jul-2026): sanciones / castigos a alumnos que impiden RESERVAR (no el login: siguen
-- consultando calendarios y disponibilidad, solo se les niega crear/editar reservas).
--   * laboratorio_id NULL  = veta TODOS los labs; con id = solo ese laboratorio.
--   * fecha_fin NULL       = sanción INDEFINIDA (hasta que un admin la levante); con fecha se
--                            levanta sola al vencer.
--   * activo               = permite "levantar" la sanción conservando el historial.
-- El check vive en ReservaService.crear/editar (mismo punto único que el resto de validaciones).
CREATE TABLE IF NOT EXISTS sanciones (
    id             BIGSERIAL PRIMARY KEY,
    usuario_id     BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    laboratorio_id BIGINT REFERENCES laboratorios(id) ON DELETE CASCADE,
    motivo         VARCHAR(400) NOT NULL,
    fecha_inicio   DATE NOT NULL,
    fecha_fin      DATE,
    creado_por     VARCHAR(100) NOT NULL,
    activo         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sanciones_usuario ON sanciones (usuario_id);
CREATE INDEX IF NOT EXISTS idx_sanciones_lookup  ON sanciones (usuario_id, activo, fecha_inicio, fecha_fin);

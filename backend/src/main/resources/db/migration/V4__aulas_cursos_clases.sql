-- V4: Módulo de AULAS + CURSOS + CLASES (horario académico).
-- Una "clase" es un bloqueo recurrente (motivo CLASE) sobre un aula o un laboratorio:
-- ocupa ese día de la semana + franja horaria durante todo el ciclo.
-- Ver la documentación técnica (módulo Aulas). Los espacios NO-lab viven en `aulas`; los labs siguen en `laboratorios`.

-- ── Rol nuevo: DOCENCIA (counter de Docencia: gestiona aulas/cursos e importa horarios) ──
INSERT INTO roles (nombre, descripcion, activo)
VALUES ('DOCENCIA', 'Counter de Docencia: gestiona aulas, cursos y horarios de clase', true)
ON CONFLICT (nombre) DO NOTHING;

-- ── Catálogo de aulas (espacios NO laboratorio) ──
CREATE TABLE IF NOT EXISTS aulas (
    id          BIGSERIAL PRIMARY KEY,
    codigo      VARCHAR(30)  NOT NULL UNIQUE,
    nombre      VARCHAR(120),
    tipo        VARCHAR(30)  NOT NULL,   -- AULA, AULA_MIXTA, AULA_POSGRADO, AUDITORIO, AULA_MAGNA, ESTUDIO_GRABACION, SALA_ESTUDIO_SUM, LOSA_DEPORTIVA
    capacidad   INTEGER,
    piso        INTEGER,
    activo      BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMP    NOT NULL DEFAULT now(),
    updated_at  TIMESTAMP    NOT NULL DEFAULT now(),
    CONSTRAINT chk_aula_tipo CHECK (tipo IN (
        'AULA','AULA_MIXTA','AULA_POSGRADO','AUDITORIO','AULA_MAGNA',
        'ESTUDIO_GRABACION','SALA_ESTUDIO_SUM','LOSA_DEPORTIVA'))
);
CREATE INDEX IF NOT EXISTS idx_aulas_tipo ON aulas (tipo);

-- ── Catálogo de cursos (para filtrar el horario por carrera/curso) ──
CREATE TABLE IF NOT EXISTS cursos (
    id          BIGSERIAL PRIMARY KEY,
    cod_curso   VARCHAR(20)  NOT NULL UNIQUE,
    nombre      VARCHAR(200) NOT NULL,
    area        VARCHAR(10),                 -- prefijo del código (CC, AD, ME…) para derivar carrera/área
    carrera_id  BIGINT REFERENCES carreras(id) ON DELETE SET NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cursos_area ON cursos (area);

-- ── Extensión de bloqueos para representar CLASES recurrentes ──
-- El espacio de un bloqueo pasa a ser un lab O un aula (uno de los dos).
ALTER TABLE bloqueos ALTER COLUMN laboratorio_id DROP NOT NULL;
ALTER TABLE bloqueos ADD COLUMN IF NOT EXISTS aula_id      BIGINT REFERENCES aulas(id) ON DELETE CASCADE;
ALTER TABLE bloqueos ADD COLUMN IF NOT EXISTS es_clase     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE bloqueos ADD COLUMN IF NOT EXISTS dia_semana   VARCHAR(12);   -- LUNES..DOMINGO (recurrencia semanal; NULL = bloqueo por fecha)
ALTER TABLE bloqueos ADD COLUMN IF NOT EXISTS ciclo        VARCHAR(10);   -- 2026-0, 2026-1
ALTER TABLE bloqueos ADD COLUMN IF NOT EXISTS curso_id     BIGINT REFERENCES cursos(id) ON DELETE SET NULL;
ALTER TABLE bloqueos ADD COLUMN IF NOT EXISTS seccion      VARCHAR(40);
ALTER TABLE bloqueos ADD COLUMN IF NOT EXISTS grupo        VARCHAR(20);
ALTER TABLE bloqueos ADD COLUMN IF NOT EXISTS tipo_sesion  VARCHAR(30);   -- TEORICO, LABORATORIO, PRACTICO
ALTER TABLE bloqueos ADD COLUMN IF NOT EXISTS modalidad    VARCHAR(20);   -- PRESENCIAL, VIRTUAL, SINCRONICO

-- Exactamente un espacio (lab o aula); un bloqueo no puede quedar sin espacio ni con ambos.
ALTER TABLE bloqueos ADD CONSTRAINT chk_bloqueo_espacio
    CHECK (num_nonnulls(laboratorio_id, aula_id) = 1);

CREATE INDEX IF NOT EXISTS idx_bloqueos_aula      ON bloqueos (aula_id, fecha_inicio, fecha_fin);
CREATE INDEX IF NOT EXISTS idx_bloqueos_clase     ON bloqueos (es_clase, ciclo, dia_semana);
CREATE INDEX IF NOT EXISTS idx_bloqueos_curso     ON bloqueos (curso_id);

# `db/` — Herramientas de datos (ETL, operación y respaldos)

Esta carpeta contiene **herramientas de datos**, NO el esquema. Hay dos "db" en el repo y conviene no confundirlas:

| Ubicación | Qué es | Regla |
|-----------|--------|-------|
| `backend/src/main/resources/db/migration/` | **El esquema** (Flyway): `V1__baseline.sql` + `V2…Vn`. Fuente de verdad, la aplica el backend al arrancar. | **Inmutable.** Todo cambio va en una migración **nueva** (`Vn+1`), nunca editando una ya aplicada. |
| `db/` (esta carpeta) | ETL, scripts operativos, datos fuente y backups. | Utilidades; no las aplica Flyway. |

## Estructura

```
db/
├── etl/         Importadores (Python). Leen un CSV/XLSX y GENERAN un .sql (o una migración).
│   ├── import_directorio.py          Directorio oficial de 54 labs (CSV en Mac Roman).
│   ├── import_affluence_l108.py      Reservas Affluences de L108 (2026).
│   ├── import_affluence_l108_2025.py Reservas Affluences de L108 (2025).
│   ├── import_datalabs.py            Reservas DataLabs (Affluences, multi-lab).
│   └── import_actividad_personal.py  Bloqueos de actividad personal → tabla bloqueos.
├── ops/         Scripts operativos recurrentes (Bash).
│   ├── agregar_alumnos.sh   Alta idempotente de alumnos (uno o --csv en lote).
│   ├── reservar.sh          Reserva manual (espejo de Affluences) + correo al titular.
│   ├── backup.sh            pg_dump con rotación (últimos 7 + latest.sql).
│   └── restore.sh           Restaura un dump de backups/.
├── data/        Insumos fuente (versionados).
│   ├── directorio-laboratorios.csv
│   └── horarios/horarios-clases-2026-0/1.xlsx   Fuente de las clases (las sube DOCENCIA por la UI).
├── generated/   Artefactos .sql que producen los ETL. IGNORADO por git (se regenera).
└── backups/     Dumps de pg_dump. IGNORADO por git (pesado).
```

## Convención de nombres de datos

Los archivos de `data/` y `generated/` siguen: **`<qué-es>-<alcance>-<periodo>.<ext>`**, en
**minúsculas, kebab-case, sin acentos ni espacios**, y fechas en **ISO** (`2026-1`).

- **El nombre debe decir la verdad del contenido.** Si un archivo trae *eventos/bloqueos*,
  se llama `eventos-…`, aunque el origen lo rotule "Reservas". El contenido manda sobre la etiqueta de origen.
- Ejemplos: `directorio-laboratorios.csv`, `horarios-clases-2026-1.xlsx`, `eventos-l108-2026.csv`.
- **Procedencia:** el export oficial de UTEC de los horarios se llama `INF_HORARIOS <ciclo>.xlsx`;
  al versionarlo aquí se renombra a `horarios-clases-<ciclo>.xlsx` (esta nota conserva el rastro).

## Notas importantes

- **Los ETL escriben migraciones históricas.** Varios `import_*.py` generan archivos `Vn__*.sql` que ya fueron **consolidados en `V1__baseline.sql`**. Se conservan como herramienta de referencia; si vuelves a correrlos, revisa el `Vn` que generan para no reintroducir una migración que Flyway ya no espera.
- **Rutas relativas y portables.** Todos los scripts calculan sus rutas desde su propia ubicación (`__file__` / `BASH_SOURCE`), así que funcionan en cualquier máquina y desde cualquier `cwd`. No hay rutas absolutas hardcodeadas.
- **PII fuera de git.** Los CSV con datos reales de alumnos (`DataLabs.csv`, `Affluence *.csv`) NO se versionan: los ETL los leen desde `~/Downloads/` por defecto (o por argumento).
- **Secretos.** `reservar.sh` lee `MAIL_USERNAME`/`MAIL_PASSWORD` del entorno → `.env` → `application-local.yml` (en ese orden); nunca se hornean en el script. `SEND_EMAIL=0` desactiva el correo (útil en cargas masivas).

## Uso rápido

```bash
# Backup / restore de toda la BD
db/ops/backup.sh
db/ops/restore.sh db/backups/latest.sql

# Alta de alumnos en lote
db/ops/agregar_alumnos.sh --csv alumnos.csv

# Reserva manual con correo
db/ops/reservar.sh <lab_id> "<MESA>" <horaIni> <horaFin> "correo@utec.edu.pe"

# Regenerar el SQL del directorio de labs (escribe en db/generated/)
python3 db/etl/import_directorio.py
```

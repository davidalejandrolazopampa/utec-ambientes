# Dump completo de la base de datos

`utec_labs.sql` es un volcado completo (estructura + datos) de la base **PostgreSQL 16**
del proyecto, generado con `pg_dump --inserts --no-owner --no-privileges`.

Incluye catálogos, laboratorios y recursos, aulas, cursos, ciclos y excepciones,
usuarios (alumnos y administrativos), reservas, participantes, bloqueos/eventos,
clases del horario y feriados. Se excluyen únicamente las tablas meta/runtime
(`flyway_schema_history`, `shedlock`, `refresh_tokens`).

## Restaurar sobre una base vacía

```bash
createdb utec_labs
psql -U utec_admin -d utec_labs -f db/dump/utec_labs.sql
```

> Alternativa: levantar la estructura con las migraciones **Flyway**
> (`backend/src/main/resources/db/migration`) y cargar solo los datos que necesites.

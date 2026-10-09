# 16. Manual Técnico

> Instalación, arquitectura y despliegue. Complementa [10-arquitectura-c4.md](10-arquitectura-c4.md).

## 1. Stack
| Capa | Tecnología |
|------|------------|
| Frontend | React 18 + TypeScript, Vite, TailwindCSS, TanStack Query, `@zxing/*`, react-big-calendar |
| Backend | Java 21, Spring Boot 3.5, Spring Security, JPA/Hibernate, springdoc-openapi |
| Datos | PostgreSQL 16 (ENUMs nativos), Flyway |
| Infra | Redis 7 (caché), RabbitMQ 3.13 (correos async), Docker / docker-compose |
| Auth | Google OAuth2 + JWT (access en memoria, refresh en cookie HttpOnly) |
| Build | Maven (`./mvnw`) · npm (Vite) |
| CI | GitHub Actions (`mvn verify` + `npm run test:coverage`) |

## 2. Requisitos previos
- JDK 21, Maven (incluido como `./mvnw`).
- Node 20+ y npm.
- Docker (Postgres + Redis + RabbitMQ).
- Un `JWT_SECRET` de ≥32 caracteres (en prod, obligatorio).

## 3. Puesta en marcha (desarrollo)
```bash
# 1) Infra local (los TRES contenedores son necesarios)
docker start utec-postgres utec-redis utec-rabbitmq
docker ps   # verificar que están "Up"

# 2) Backend (puerto 8080)
cd backend
./mvnw spring-boot:run -Dspring-boot.run.profiles=local

# 3) Frontend (puerto 5173)
cd frontend
npm install
npm run dev
```
- El perfil `local` trae el `JWT_SECRET` de desarrollo. En otros entornos, exporta `JWT_SECRET` (`openssl rand -base64 48`).
- Si `GET /actuator/health` da **503**, falta alguno de los 3 contenedores (el componente caído aparece `DOWN`).

## 4. Configuración (perfiles Spring)
| Archivo | Uso |
|---------|-----|
| `application.yml` | base (defaults seguros: errores sin detalle, actuator mínimo). |
| `application-local.yml` | desarrollo (**gitignored**). Secretos vía `${VAR:default}`. |
| `application-local.yml.example` | plantilla para clonar. |
| `application-test.yml` | tests; BD `utec_labs_test`. **DB_PASSWORD** parametrizable (CN-012). |
| `application-prod.yml` | producción (HTTPS, cookie `Secure`, errores ocultos). |

**Variables de entorno relevantes:** `JWT_SECRET`, `DB_HOST/PORT/NAME/USER/PASSWORD`, `MAIL_USERNAME/MAIL_PASSWORD`, `GOOGLE_CLIENT_ID`, `REDIS_*`, `RABBITMQ_*`.
- El **Google Client ID** va en dos sitios: `application-local.yml` (`app.google.client-id`) y `frontend/.env.local` (`VITE_GOOGLE_CLIENT_ID`).
- El **App Password de Gmail** se toma de `MAIL_PASSWORD` (env / `.env` raíz); no hardcodear en texto plano (CN-006).

## 5. Base de datos y migraciones
- **Flyway** con `ddl-auto: none`. Esquema y datos en `backend/src/main/resources/db/migration`.
- **Baseline ÚNICO inmutable** `V1__baseline.sql` (generado con `pg_dump`; datos semilla, directorio de 54 labs, import Affluences L108). **Re-consolidado (jul-2026): absorbe las antiguas V1–V21** (ver historial de git y el header de `V1`): drop del CHECK de fecha (ex-V2), ENUMs con `ALMUERZO`/`EQUIPO` (ex-V3/V5), `shedlock` (ex-V4), anti doble-reserva + índices (ex-V6), reservas L108, limpiezas de esquema, `reserva_participantes`, `director_responsables`, feriados, etc.
- **Regla:** nunca editar una migración aplicada (Flyway valida checksums); todo cambio va en una `Vn` nueva.
- **Migraciones vigentes sobre el baseline (jul-2026):** `V2__backfill_departamento_usuarios.sql` (rellena `usuarios.departamento_id` heredándolo de la estructura: director→depto que dirige, responsable→depto de su lab) · `V3__facultad_tipo.sql` (añade `facultades.tipo` = `FACULTAD`\|`DIRECCION` para distinguir facultad real de área administrativa). La próxima será `V4__…`.
- **Gotcha ENUMs:** URL JDBC con `?stringtype=unspecified`; en consultas nativas castear columnas y parámetros a `varchar`.

### Scripts operativos (`db/`)
Herramientas de línea de comandos (usan el contenedor `utec-postgres`); no son parte del arranque pero ayudan a poblar/operar la BD:
- **`reservar.sh <lab_id> "<MESA>" <hI> <hF> [correos] [fecha] [estado]`** — inserta UNA reserva a mano (espejo de Affluences). `[correos]` admite varios separados por coma: el 1º es titular y los demás acompañantes (valida capacidad). Crea también las filas de `reserva_participantes` (titular + acompañantes con su carrera), necesarias para la gráfica "Reservas por carrera".
- **`agregar_alumnos.sh`** — alta de alumnos (rol ESTUDIANTE) con correo + carrera. Modo suelto (`<correo> "<Nombres>" "<Apellidos>" "[Carrera]"`) o lote (`--csv <archivo>`, detecta el correo por el `@`; acepta `nombre,correo,carrera` o `nombres,apellidos,correo,carrera`). Idempotente (`ON CONFLICT (correo_utec)`: no duplica, solo actualiza carrera); `--carreras` lista las oficiales.
- **ETL** `import_directorio.py` (directorio de 54 labs, CSV Mac Roman) e `import_affluence_l108*.py` (reservas Affluences; generan SQL que además crea el participante titular por reserva).
- **`backup.sh` / `restore.sh`** — `pg_dump`/`pg_restore` de toda la BD con rotación (las últimas 7 + `latest.sql`).

## 6. Arquitectura del código
```
backend/src/main/java/pe/edu/utec/reservas/
├─ config/        CORS, Redis, RabbitMQ, Async, ShedLock
├─ security/      SecurityConfig, JwtTokenProvider, JwtAuthenticationFilter, CustomUserDetailsService
├─ schedulers/    ReservaScheduler (@Scheduled + @SchedulerLock)
├─ shared/        ApiResponse, GlobalExceptionHandler, BusinessException
└─ modules/       auth · iam · laboratorios · reservas · bloqueos · aulas · qr · notificaciones · analytics · audit · respaldo · realtime
frontend/src/     pages/ · services/ · store/ (Zustand) · components/ · layouts/
```
- **Patrón:** controller → service → repository; DTOs en los bordes; React Query para todo el estado de servidor.
- **Auto-cascada** responsable→director→departamento en `LaboratorioService`.
- **Anti-IDOR** en `ReservaService.cancelar/editar`.
- **Módulo `aulas` (horario académico):** aulas/auditorios/salas + cursos; el **horario de clases** se modela como **bloqueos recurrentes** (`es_clase=true`, `dia_semana`, `frecuencia` A/B) enlazados a un lab o aula. `HorarioImportService` importa el Excel/CSV oficial; `AulaService` sirve clases/libres/ocupación; `CicloService` gestiona los ciclos y sus excepciones. Rol **`DOCENCIA`**. Las clases se excluyen de Bloqueos/dashboard/respaldo (se consultan aparte) pero cuentan como uso en el % de ocupación.
- **Módulo `realtime` (SSE):** `RealtimeService` empuja `LabActivityEvent` (check-in/reserva/bloqueo) por Server-Sent Events tras el COMMIT; el frontend invalida las queries operativas al instante (el polling queda como fallback). El mismo evento dispara la **invalidación de la caché de analytics** (`CacheInvalidationListener`).

## 7. Seguridad (resumen operativo)
- Autorización en **doble capa**: reglas de ruta (`SecurityConfig`, evaluadas primero) + `@PreAuthorize` + pertenencia/propiedad a nivel de servicio.
- Cabeceras: HSTS, CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` (Spring + nginx).
- Actuator: solo `health`/`info` públicos; resto ADMIN.
- Secretos fuera de git (`.env`, `application-local.yml` gitignored; `.dockerignore`); Actions pinneadas a SHA + Dependabot.
- **Re-login tras cambiar `JWT_SECRET`:** DevTools → *Clear site data* + hard refresh.

## 8. Pruebas y cobertura (ratchet)
```bash
# Backend (requiere BD utec_labs_test): corre tests + reporte + check de cobertura
cd backend && ./mvnw verify
# Frontend
cd frontend && npm run test:coverage
```
- **Ratchet backend** (`pom.xml`, jacoco:check en fase `verify`): mínimos INSTRUCTION 0.90 · BRANCH 0.65 (real ≈ 94% / 72%). **~300 tests** (JUnit 5 + Mockito).
- **Ratchet frontend** (`vitest.config.ts`): lines 85 · statements 81 · branches 71 · functions 74 (real ≈ 85.4 / 81.3 / 72.0 / 74.4). **~258 tests** (Vitest v8/AST).
- CI falla si la cobertura cae por debajo. Subir el ratchet conforme se añadan tests.

## 8.b Escalabilidad

Estado y plan, en orden de impacto:

- **P1 — Índices (hecho, en el baseline `V1`).** `reservas(recurso_id,fecha)`, `(usuario_id,fecha)`, `(estado,fecha)`, `recursos_lab(laboratorio_id)`, `bloqueos(laboratorio_id,fecha_inicio,fecha_fin)`. Evita scans secuenciales en el chequeo de conflictos, "mis reservas", calendario y scheduler.
- **P2 — Correctitud de doble-reserva (hecho, en el baseline `V1`).** Constraint de exclusión `btree_gist`: la BD rechaza solapes de reservas activas sobre la misma mesa, a prueba de concurrencia y multi-instancia.
- **P3 — Crecimiento a varios años (pendiente, cuando el volumen lo pida).**
  - **Particionar `reservas` por año** (partición declarativa de Postgres): cada año es una tabla pequeña; los años viejos se archivan/desacoplan. Recomendado al acercarse a ~10⁵–10⁶ filas (con 50+ labs puede llegar en 1–2 años). Premature hoy (~600 filas).
  - ~~**Dashboard:** cachear KPIs/heatmap en **Redis**.~~ **Hecho (jul-2026)** — las 8 lecturas caras de `AnalyticsService` (`getDashboardFull`, `getInsights`, `getOperativos`, `getResumenEjecutivo`, KPIs, tabla, años/periodos) están anotadas `@Cacheable("analytics")` sobre un `RedisCacheManager` (TTL 10 min, JSON tipado). `CacheInvalidationListener` vacía la caché en cada `LabActivityEvent` (reserva/bloqueo/check-in) → datos siempre frescos. Alternativa complementaria a futuro: **vistas materializadas / tablas resumen** si el volumen crudo lo exige.
  - ~~**Paginación** en listados grandes (no devolver todas las reservas).~~ **Hecho (jul-2026)** — ver P4.c.
- **P4 — Capa de aplicación (hecho/en marcha).** `validarReservasActivas` ya usa una query filtrada (no `findAll`). **ShedLock** permite varias instancias del backend; al escalar, subir `spring.datasource.hikari.maximum-pool-size`.
- **P4.b — Usuarios paginados (hecho, jul-2026).** Con **~9500+ alumnos**, ninguna pantalla baja todos los usuarios: `GET /usuarios/buscar?q&rol&activo&page&size` (paginado por servidor, `UsuarioPageResponse`), `GET /usuarios/administrativos` (solo no-estudiantes, lista pequeña) y `GET /usuarios/conteo-roles` (chips). Organización pide alumnos de a 50 por página; CrearBloqueo/LaboratorioDetalle/modales usan `/administrativos`. Carga masiva idempotente por `db/agregar_alumnos.sh --csv` (SQL por **STDIN**, aguanta archivos grandes; `DISTINCT ON` deduplica). ⚠️ Los `:param IS NULL` de `/buscar` van con `CAST(...)` (gotcha de Postgres con `stringtype=unspecified`).
- **P4.c — Reservas paginadas (hecho, jul-2026).** Con **8k+ reservas** (y creciendo con 50+ labs), Gestión de Reservas ya no baja todas: `GET /reservas/mis-reservas/buscar?q&page&size` (`ReservaPageResponse`) pagina y filtra por lab/recurso/titular en el servidor, con el **alcance por rol** (4 queries: todas / por director / por responsable / propias) y enriquece participantes+`esMia` **solo de la página** (~20 filas). El frontend (`DataTable` en modo servidor) muestra la página con búsqueda por debounce y refresco lento (60s + botón "Actualizar"); se **eliminó** el `refetchInterval` de 15s que recargaba las 8k. Mismo patrón y gotcha `CAST(:patron)` que P4.b. El endpoint viejo `GET /reservas/mis-reservas` (lista completa) queda por compat.
- **P4.d — Calendario acotado por rol (hecho, jul-2026).** `CalendarioAccessGuard.asegurarAccesoCalendario` en `GET /reservas/laboratorio/{id}` y `/bloqueos/laboratorio/{id}`: ADMIN/COORDINADOR/ESTUDIANTE ven cualquier lab, DIRECTOR/RESPONSABLE_LAB solo los suyos → 403 (antes cualquier autenticado veía todos).

> Regla práctica: implementar P3 (partición + caché) cuando las consultas del dashboard o el listado empiecen a superar ~200 ms o la tabla `reservas` pase de unas centenas de miles de filas.

## 9. Despliegue
- `docker-compose.yml`: 5 servicios (postgres, redis, rabbitmq, backend, frontend), imágenes multi-stage, `no-new-privileges`, infra atada a `127.0.0.1`.
- En **prod**: `JWT_SECRET` obligatorio, cookie `Secure`, CORS con orígenes explícitos (no `*`), errores sin detalle.
- Healthcheck del contenedor: `GET /actuator/health`.

## 10. Operación y troubleshooting
| Síntoma | Causa probable | Acción |
|---------|----------------|--------|
| `/actuator/health` = 503 | Falta Postgres/Redis/RabbitMQ | `docker start` los 3 contenedores |
| `mail` DOWN (535 BadCredentials) | App Password desactualizado | Actualizar `MAIL_PASSWORD` |
| Todo da 401 (incl. QR) | Cambió `JWT_SECRET` / sesión vieja | Clear site data + re-login |
| App no arranca | `JWT_SECRET` ausente o <32 chars | Exportar `JWT_SECRET` |
| Crear lab con equipos falla | Faltaba `EQUIPO` en enum | Ya resuelto en `V5` |

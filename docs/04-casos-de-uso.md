# 4. Casos de Uso

> Flujos detallados (actor, precondición, flujo principal, flujos alternos/excepción y **cómo actúa cada rol**).
> Autorización efectiva en [12-matriz-roles-permisos.md](12-matriz-roles-permisos.md). Roles: `ADMIN` → `COORDINADOR` → `DIRECTOR` → `RESPONSABLE_LAB` → `ESTUDIANTE`.

---

## CU-01 — Iniciar sesión (Google OAuth2)
- **Actor principal:** cualquier usuario UTEC.
- **Precondición:** tener cuenta `@utec.edu.pe`.
- **Flujo principal:**
  1. El usuario pulsa "Iniciar sesión con Google".
  2. Google devuelve un *id token*; el frontend lo envía a `POST /auth/google`.
  3. El backend verifica el token (`GoogleTokenVerifier`), valida dominio `utec.edu.pe`.
  4. Emite **JWT access** (15 min, en memoria) + **refresh** (7 días, cookie `HttpOnly`).
  5. El frontend carga el perfil con `GET /auth/me`.
- **Flujos alternos / excepción:**
  - *A1 — Correo de alumno nuevo* (`nombre.apellido@…`): se auto-registra como `ESTUDIANTE`.
  - *E1 — Correo administrativo nuevo* (`inicialApellido@…`, sin punto): NO se auto-registra → "comunícate con el coordinador".
  - *E2 — Dominio distinto de `utec.edu.pe`*: rechazo (login no permitido).
- **Cómo actúa cada rol:** todos siguen el mismo flujo; el rol **se reconstruye desde la BD** en cada request (no del claim del JWT), así que las autoridades reflejan cambios inmediatos.

## CU-02 — Rehidratar sesión tras recargar (F5)
- **Actor:** usuario autenticado.
- **Flujo principal:** al recargar, el access token (que vivía en memoria) se pierde → el interceptor de `api.ts` detecta 401 → llama `POST /auth/refresh` con la cookie → obtiene nuevo access → reintenta la petición.
- **Excepción:** cookie de refresh vencida/ inválida → redirección a login.

## CU-03 — Cerrar sesión
- **Actor:** usuario autenticado.
- **Flujo:** `POST /auth/logout` borra la cookie de refresh; el frontend descarta el access en memoria.

---

## CU-04 — Reservar un recurso
- **Actor principal:** ESTUDIANTE (también pueden reservar roles superiores).
- **Precondición:** sesión iniciada; lab activo con recursos disponibles.
- **Flujo principal:**
  1. El actor abre el detalle del lab y elige un recurso (mesa/PC).
  2. Selecciona **fecha**, **hora de inicio**, **duración** y **participantes**; elige su **carrera** (si no la tiene en el perfil). Por cada participante aparece una casilla de **correo**: la 1ª es el titular (él mismo, fija) y las demás son acompañantes a ingresar (`@utec.edu.pe`, registrados).
  3. `POST /reservas` (con `participantesEmails`).
  4. El backend valida (ver CU-05) y crea la reserva en estado `PENDIENTE`.
  5. Se dispara correo `@Async` "reserva registrada — recuerda tu check-in".
- **Flujos alternos:**
  - *A1 — Hora flexible:* si es **hoy** y la hora actual no cae en la malla, se usa como inicio y el **fin se ajusta** a la malla de 30 min.
- **Flujos de excepción (validaciones de `ReservaService`):**
  - *E1* fecha pasada → `INVALID_DATE`.
  - *E2* fecha > anticipación máxima (1 día) → `DATE_TOO_FAR`.
  - *E3* el lab no atiende ese día → `LAB_CLOSED_DAY`.
  - *E4* hora fuera de `horaApertura`–`horaCierre` → fuera de horario.
  - *E5* participantes > capacidad → `EXCEEDS_CAPACITY`.
  - *E6* choque con otra reserva o bloqueo (lock pesimista `FOR UPDATE` + `@Version`) → doble-booking rechazado.
- **Cómo actúa cada rol:** el ESTUDIANTE reserva para sí; los roles elevados pueden además **editar/cancelar** reservas ajenas (CU-06).

## CU-05 — Validar disponibilidad y aforo (incluido en CU-04)
- **Actor:** sistema (`ReservaService`).
- **Reglas:** horario del lab, día de atención, anticipación, aforo, choques con reservas y con `bloqueos`/`bloqueo_recursos`. Concurrencia protegida por lock pesimista + optimista (`NFR-10`).

## CU-06 — Cancelar / Modificar reserva
- **Actor:** dueño de la reserva o rol elevado.
- **Flujo:** `DELETE /reservas/{id}` (cancelar) o `PUT /reservas/{id}` (editar inicio libre + malla). Toda acción pasa antes por un **modal de confirmación** ("¿Confirmar cancelar/guardar?") en la UI.
- **Excepción (anti-IDOR):** si quien actúa **no es el dueño** ni ADMIN/COORDINADOR/RESPONSABLE_LAB → `FORBIDDEN`.
- **Cómo actúa cada rol:** ESTUDIANTE solo sobre **su** reserva; RESP_LAB/DIRECTOR/COORDINADOR/ADMIN sobre cualquiera.

## CU-06b — Revertir una cancelación (reactivar)
- **Actor:** rol de gestión (ADMIN/COORDINADOR/DIRECTOR/RESPONSABLE_LAB). **El ESTUDIANTE no puede.**
- **Precondición:** la reserva está `CANCELADA` y es **del día de HOY** (si el día ya pasó, no se puede hacer nada).
- **Flujo:** en *Gestión de Reservas* aparece el botón **"↩ Reactivar"** → confirmación → `POST /reservas/{id}/reactivar` → la reserva vuelve a `CONFIRMADA`.
- **Flujos de excepción (`ReservaService.reactivar`):** `FORBIDDEN` (estudiante) · `INVALID_STATE` (no estaba cancelada) · `EXPIRED` (la fecha no es hoy) · `RESOURCE_NOT_AVAILABLE` (otra reserva ya tomó la franja).
- **Origen:** corrige el caso de una cancelación por error el mismo día sin tener que tocar la BD.

---

## CU-07 — Check-in por QR (alumno)
- **Actor:** ESTUDIANTE con reserva de hoy.
- **Precondición:** reserva `PENDIENTE`, estar dentro de la ventana (desde 10 min antes).
- **Flujo:** el alumno escanea el QR del recurso (`@zxing`) → `POST /checkin` o `/checkin/qr/{qr}` → valida pertenencia, fecha de hoy, estado y ventana → reserva pasa a `EN_CURSO`, recurso a `OCUPADO`, se registra en `qr_validaciones`.
- **Excepción:** fuera de la ventana → "se habilita 10 minutos antes"; QR de otro recurso/fecha → inválido.

## CU-08 — Check-in manual (responsable)
- **Actor:** RESPONSABLE_LAB (de su lab), COORDINADOR, ADMIN.
- **Flujo:** `POST /checkin/manual/{reservaId}` para una reserva de **hoy** dentro de la ventana de 10 min.
- **Cómo actúa cada rol:** RESP_LAB solo en sus labs (`asegurarAccesoAlLab` → 403); COORDINADOR/ADMIN en cualquiera. DIRECTOR/ESTUDIANTE: ❌.

## CU-09 — Generar/visualizar QR
- **Actor:** usuario autenticado.
- **Flujo:** `GET /qr/recurso/{id}` o `/qr/laboratorio/{id}` devuelve un PNG **autenticado**; el frontend usa el componente `QrImage` (descarga el blob con Bearer), nunca `<img src>` directo (CN-006).

---

## CU-10 — Crear bloqueo (total o parcial)
- **Actor:** RESPONSABLE_LAB (su lab), DIRECTOR, COORDINADOR, ADMIN.
- **Precondición:** lab existente; franja dentro de **07:00–23:00** (`ACCESO_INICIO/FIN`).
- **Flujo principal:**
  1. El actor abre "Crear bloqueo": título, responsable (nombre+correo), motivo, fecha única, franja, tipo (TOTAL/PARCIAL).
  2. Si **PARCIAL**, selecciona recursos concretos (`recursosIds`).
  3. `POST /bloqueos` → valida choques **solo sobre los recursos seleccionados** (parcial) o todo el lab (total).
  4. Persiste en `bloqueos` (+ `bloqueo_recursos` si parcial); correo al responsable.
- **Excepción:** franja fuera de 07:00–23:00 → `OUT_OF_WINDOW`; reservas activas en conflicto → rechazo.
- **Regla especial:** los motivos operativos `ALMUERZO`, `MANTENIMIENTO` y `FERIADO` cierran el lab pero el **dashboard los excluye** de KPIs/gráficas/tabla de eventos (se ven aparte en "Operativo", FR-24). En `EVENTO` el responsable/título se ingresan; en ALMUERZO/MANTENIMIENTO/FERIADO se autocompletan con el usuario logeado (`FERIADO` es solo TOTAL).

## CU-11 — Editar / Eliminar bloqueo
- **Actor:** mismos roles que CU-10.
- **Flujo:** `PUT /bloqueos/{id}` (editar, incl. recursos en parcial), `DELETE /bloqueos/{id}` (borrado real). *(La acción "Desactivar"/soft-delete se retiró.)*
- **Cómo actúa cada rol:** RESP_LAB solo sus labs; el resto según jerarquía. ESTUDIANTE: ❌.

## CU-12 — Ver calendario del laboratorio
- **Actor:** usuario autenticado.
- **Flujo:** `GET /reservas/laboratorio/{labId}` → vista `react-big-calendar` (semana/mes/día) con reservas + bloqueos color-coded (naranja=reservada, rojo=check-in, gris=bloqueo).

---

## CU-13 — Gestionar laboratorios y recursos
- **Actor:** COORDINADOR/ADMIN (crear/eliminar/activar); + RESPONSABLE_LAB (editar lab y recursos de **sus** labs).
- **Flujo:** `POST /laboratorios` (genera recursos según aforo), `PUT /laboratorios/{id}`, `PUT/PATCH estado`, recursos `POST/PUT/DELETE`.
- **Excepción:** RESP_LAB sobre lab ajeno → 403.

## CU-14 — Asignar director / responsables (auto-cascada)
- **Actor:** COORDINADOR/ADMIN.
- **Flujo:** `PATCH /laboratorios/{labId}/director`, `POST /laboratorios/{labId}/responsables`. Al asignar el **responsable**, el sistema autocompleta **director** y **departamento** en cascada (si las relaciones están pobladas).
- **Estado actual:** `director_responsables` **poblada** (V11, derivada de responsable→lab→director) → la cascada **sí autocompleta** director↔responsables y depto/facultad.

## CU-15 — Gestionar la jerarquía académica
- **Actor:** ADMIN.
- **Flujo:** CRUD de **facultades** y **departamentos** (`/organizacion/**`), asignación de decano/director.

## CU-16 — Gestionar usuarios
- **Actor:** COORDINADOR/ADMIN (alta/edición); ADMIN (desactivar/eliminar, vínculos director↔resp).
- **Flujo:** `POST /usuarios` (alta manual, dominio `@utec.edu.pe`, correo único), `PUT /usuarios/{id}` (rol/cargo/depto), `PATCH` (desactivar), `DELETE`.
- **Tipo de persona (alumno vs administrativo):** al crear se elige **Alumno** (se registra como `ESTUDIANTE`, sin rol/cargo/depto) o **Administrativo** (rol entre los 4 administrativos + cargo + departamento). Al **editar**, un `ESTUDIANTE` solo permite **corregir el nombre** (no puede pasar a director/coordinador/etc.); los administrativos tienen el editor completo.

---

## CU-17 — Consultar el dashboard
- **Actor:** DIRECTOR, COORDINADOR, ADMIN.
- **Flujo:** `GET /analytics/dashboard`, `/dashboard/full`, `/tabla`, `/operativos`, `/insights`, `/resumen-ejecutivo`. **4 vistas** (Todo · Solo reservas · Solo bloqueos · **Uso del lab (OEE)**); filtros lab/ciclo/año/vista/carrera; exporta PNG, CSV y **reporte ejecutivo one-pager a PDF** (🖨️). **Dashboard ejecutivo (dirección):** Δ vs periodo anterior, insights narrativos y procedencia (`/resumen-ejecutivo`); Pareto de carreras/motivos, cruce carrera×lab y capacidad ociosa (`/insights`); proyección de demanda + media móvil y banda de saturación en el heatmap (cliente). **Modelo OEE:** **% de ocupación NETA** (utilización, sin feriados/mantenimiento) y **Disponibilidad** (% cerrado) por separado. Excluye `ALMUERZO`, `MANTENIMIENTO` y `FERIADO` de los eventos (van en la sección "Operativo"). **Gráficas de analista:** embudo de estados, reservas por día de la semana, tamaño de grupo, y "reservas por día" apilada con scroll.
- **Excepción:** ESTUDIANTE/RESP_LAB: ❌ (403).

## CU-18 — Respaldo (descargar/restaurar)
- **Actor:** ADMIN.
- **Flujo:** `GET /respaldo` (JSON alumnos, reservas y bloqueos —incluye `bloqueo_recursos`), `POST /respaldo` (restaura con `ON CONFLICT DO NOTHING`, dedup por ID).

## CU-19 — Auditoría de reservas
- **Actor:** ADMIN.
- **Flujo:** `GET /auditoria`, `/auditoria/reserva/{id}`, `/auditoria/usuario/{id}`.

---

## CU-20 — Procesos automáticos (scheduler)
- **Actor:** sistema (`ReservaScheduler`, `@Scheduled` + `@SchedulerLock`).
- **Flujo:**
  - **No-show:** reservas `PENDIENTE` sin check-in tras 15 min → canceladas, recurso liberado.
  - **Completar:** reservas `EN_CURSO` vencidas → `COMPLETADA`, recurso liberado.
  - **Protección de medianoche:** evita procesar mal el cambio de día.
  - **ShedLock:** con varias instancias, solo una ejecuta cada tarea.

---

## CU-21 — Consultar el horario de clases / calendario (alumno)
- **Actor:** ESTUDIANTE (cualquier autenticado).
- **Flujo:** `GET /ciclos` (fechas del calendario), `GET /aulas/clases?ciclo&aulaId|labId&area&q`. Grilla semanal proyectada sobre el calendario académico real (con exámenes/feriados). `GET /aulas/cursos` → horario de un curso.

## CU-22 — Buscar ambientes libres (alumno)
- **Actor:** ESTUDIANTE.
- **Flujo:** `GET /aulas/libres?…` (buscador inverso) + `GET /aulas/ocupacion?…` (grilla aulas×horas de apoyo), filtrando por área/tipo/franja.

## CU-23 — Importar el horario de clases
- **Actor:** DOCENCIA (+ ADMIN/COORDINADOR).
- **Flujo:** `POST /aulas/horarios/importar` (Excel/CSV). `HorarioImportService` detecta el ciclo, crea **aulas/cursos** faltantes y una **clase** (bloqueo recurrente por día + frecuencia **A/B**) por sesión; descarta Virtual/RESV; anti-solape en memoria. Devuelve conteos + muestra de problemas.
- **Nota:** las clases se **excluyen** de Bloqueos/dashboard/respaldo (se consultan aparte), pero cuentan como uso del lab en el % de ocupación.

## CU-24 — Gestionar aulas
- **Actor:** DOCENCIA (+ ADMIN/COORDINADOR).
- **Flujo:** CRUD de **aulas** (`POST/PUT/DELETE /aulas`, soft-delete; valida tipo y código único). Además, **bloqueo de aula** (auditorio/sala) para un evento: bloqueo TOTAL sin recursos.

## CU-25 — Configurar ciclos académicos y excepciones
- **Actor:** DOCENCIA (+ ADMIN/COORDINADOR).
- **Flujo:** `POST /ciclos/anio/{anio}` (crea los ciclos 0/1/2 con fechas por defecto editables; las excepciones **FERIADO se derivan automáticamente** de los feriados operativos del año), `PUT /ciclos/{id}` (fechas + **excepciones** de exámenes/feriados). `GET /ciclos` lo consume el calendario del alumno.

## CU-26 — Retirar/reponer mesas por un periodo
- **Actor:** RESPONSABLE_LAB (sus labs) / COORDINADOR / ADMIN.
- **Precondición:** las mesas salen **físicamente** del laboratorio por un rango (p. ej. un ciclo).
- **Flujo:** en el detalle del lab, botón **Retirar mesas** → selecciona mesas + rango de fechas (atajo "Ciclo YYYY-C") → `POST /bloqueos` (PARCIAL, motivo `RETIRO`, todo el día). Las mesas quedan **RETIRADA** (no reservables), el dashboard **descuenta su capacidad** y **no compiten con eventos** (un bloqueo total/parcial se puede crear encima). **Reponer** = `DELETE /bloqueos/{id}`.
- **Excepción:** si una mesa tiene reservas activas en el rango → `RESERVAS_ACTIVAS` (se listan; no se cancela nada automáticamente).

## CU-27 — Publicar / solicitar servicios del laboratorio
- **Actores:** RESPONSABLE_LAB/COORDINADOR/ADMIN publican; ESTUDIANTE/DOCENTE (cualquier usuario) solicitan.
- **Flujo (publicar):** Editar laboratorio → sección **Servicios** (nombre + enlace + descripción) → `PUT /laboratorios/{id}` con `servicios[]` (reemplazo en bloque; tabla `laboratorio_servicios`, V14).
- **Flujo (solicitar):** el detalle del lab muestra el panel **"Este laboratorio ofrece servicios"**; el botón **Solicitar** abre el enlace externo (formulario). No requiere reservar mesa. El listado permite **filtrar labs por servicio**.

## CU-28 — Consulta del DOCENTE (solo visualización)
- **Actor:** DOCENTE (cuenta creada automáticamente por el import de horarios, CU-23).
- **Flujo:** ve **Calendario** (aulas y labs con clases/eventos/ocupación), **Cursos** y la **disponibilidad de laboratorios**; puede **solicitar servicios** (CU-27).
- **Restricción:** **no reserva** — el menú le oculta Reservas, la cuadrícula deshabilita las mesas ("Vista de consulta") y `ReservaService.crear` lo rechaza (`FORBIDDEN`).

## CU-29 — Declarar un cierre institucional (todo UTEC)
- **Actor:** ADMIN.
- **Precondición:** feriado institucional que cierra **toda** la universidad por un rango (aniversario, puente declarado).
- **Flujo:** Ciclos académicos → excepción tipo **CIERRE** con rango de fechas (`POST /ciclos/{codigo}/excepciones`, V13). **Una sola entrada**: detiene las clases (labs + aulas), **impide reservar cualquier lab** esos días (`INSTITUTIONAL_CLOSURE`), el calendario los pinta como **"Cerrado (UTEC)"** y el dashboard **descuenta esos días de la capacidad**. Reabrir = eliminar la excepción.
- **Nota:** los feriados **nacionales** siguen siendo bloqueos FERIADO por-lab (V9); el CIERRE es solo para cierres institucionales generales.

---

## Resumen actor ↔ caso de uso
| CU | EST | RESP | DIR | COOR | ADMIN | DOC | DTE |
|----|:---:|:----:|:---:|:----:|:-----:|:---:|:---:|
| CU-01..03 Sesión | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| CU-04/05 Reservar | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| CU-06 Cancelar/editar ajena | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| CU-07 Check-in QR | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| CU-08 Check-in manual | ❌ | ✅¹ | ❌ | ✅ | ✅ | ❌ | ❌ |
| CU-10/11 Bloqueos | ❌ | ✅¹ | ✅ | ✅ | ✅ | ✅³ | ❌ |
| CU-13 Gestionar labs/recursos | ❌ | ✅¹ | ❌ | ✅ | ✅ | ❌ | ❌ |
| CU-14 Asignar dir/resp | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| CU-15 Jerarquía | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| CU-16 Usuarios | ❌ | ❌ | ❌ | ✅² | ✅ | ❌ | ❌ |
| CU-17 Dashboard | ❌ | ✅¹ | ✅¹ | ✅ | ✅ | ✅⁴ | ❌ |
| CU-18 Respaldo | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| CU-19 Auditoría | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| CU-21/22 Calendario / libres | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| CU-23 Importar horarios | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| CU-24 Gestionar aulas | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| CU-25 Configurar ciclos | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| CU-26 Retirar/reponer mesas | ❌ | ✅¹ | ✅¹ | ✅ | ✅ | ❌ | ❌ |
| CU-27 Servicios del lab (publicar) | ❌ | ✅¹ | ❌ | ✅ | ✅ | ❌ | ❌ |
| CU-27 Servicios del lab (solicitar) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| CU-28 Consulta docente | — | — | — | — | — | — | ✅ |
| CU-29 Cierre institucional | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |

¹ solo sus labs asignados · ² alta/edición; desactivar/eliminar y vínculos solo ADMIN · ³ solo bloqueo de **aulas** (DOC = DOCENCIA) · ⁴ solo ámbito **Aulas** · DTE = DOCENTE (solo consulta).

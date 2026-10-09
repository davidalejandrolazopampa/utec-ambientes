# 13. Documentación API (REST)

> Referencia REST. **Base URL:** `/api/v1`. Autenticación por **JWT Bearer** (access token en header `Authorization: Bearer <token>`) salvo los endpoints públicos. Documentación viva (OpenAPI/Swagger) en `/swagger-ui.html`.

## Convenciones
- **Envoltura de respuesta** (`shared/dto/ApiResponse`):
  ```json
  { "success": true, "message": "OK", "data": { } }
  ```
- **Errores**: `BusinessException` → `{ "success": false, "message": "...", "code": "INVALID_DATE" }` (manejados por `GlobalExceptionHandler`). Códigos típicos: `INVALID_DATE`, `DATE_TOO_FAR`, `LAB_CLOSED_DAY`, `EXCEEDS_CAPACITY`, `OUT_OF_WINDOW`, `FORBIDDEN`.
- **Autorización**: ver matriz completa en [12-matriz-roles-permisos.md](12-matriz-roles-permisos.md). Las reglas de ruta (`SecurityConfig`) se evalúan **antes** que `@PreAuthorize`.

---

## Auth — `/auth`
| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/auth/google` | Público | Login con id_token de Google → access (body) + refresh (cookie HttpOnly). |
| POST | `/auth/refresh` | Cookie | Rota el refresh y devuelve nuevo access. |
| POST | `/auth/logout` | Público | Borra la cookie de refresh. |
| GET | `/auth/me` | Autenticado | Perfil del usuario actual. |

## Usuarios — `/usuarios`
| Método | Ruta | Auth |
|--------|------|------|
| GET | `/usuarios` | ADMIN, COORDINADOR — lista TODOS (evitar con miles de alumnos; usar `/buscar`) |
| GET | `/usuarios/administrativos` | ADMIN, COORDINADOR — todos menos ESTUDIANTE (lista pequeña) |
| GET | `/usuarios/buscar?q&rol&activo&page&size` | ADMIN, COORDINADOR — **paginado** (`UsuarioPageResponse`: content/total/page/size/totalPages). Para listar alumnos sin cargarlos todos |
| GET | `/usuarios/conteo-roles` | ADMIN, COORDINADOR — `{ROL: cantidad}` para los chips del encabezado |
| POST | `/usuarios` | ADMIN, COORDINADOR — alta manual (acepta `carrera` para alumnos) |
| GET | `/usuarios/me` | Autenticado |
| GET | `/usuarios/{id}` | ADMIN, COORDINADOR |
| PUT | `/usuarios/{id}` | ADMIN, COORDINADOR |
| PATCH | `/usuarios/{id}/desactivar` | ADMIN |
| DELETE | `/usuarios/{id}` | ADMIN |
| GET | `/usuarios/por-director/{directorId}` | Autenticado |
| GET | `/usuarios/responsables` | ADMIN, COORDINADOR |
| GET | `/usuarios/directores` | ADMIN, COORDINADOR — opcional `?facultadId=` (solo los que dirigen un depto de esa facultad) |
| GET | `/usuarios/director-de/{responsableId}` | ADMIN, COORDINADOR — director de un responsable (cascada inversa) |
| POST/DELETE | `/usuarios/{id}/labs/{labId}` | ADMIN |
| POST/DELETE | `/usuarios/{id}/responsables/...` (vínculo dir↔resp) | ADMIN |

## Laboratorios — `/laboratorios`
| Método | Ruta | Auth |
|--------|------|------|
| POST | `/laboratorios` | ADMIN, COORDINADOR |
| GET | `/laboratorios/admin/todos` | ADMIN, COORDINADOR |
| GET | `/laboratorios` | Autenticado (estudiante: solo activos) |
| GET | `/laboratorios/{id}` | Autenticado |
| GET | `/laboratorios/codigo/{codigo}` | Autenticado |
| GET | `/laboratorios/{id}/recursos` | Autenticado |
| DELETE | `/laboratorios/{id}` | ADMIN, COORDINADOR |
| PUT | `/laboratorios/{id}/estado` | ADMIN, COORDINADOR |
| PUT | `/laboratorios/{id}` | ADMIN, COORDINADOR, RESPONSABLE_LAB¹ |
| POST | `/laboratorios/{id}/recursos` | ADMIN, COORDINADOR, RESPONSABLE_LAB¹ |
| PUT | `/laboratorios/{labId}/recursos/{recursoId}` | ADMIN, COORDINADOR, RESPONSABLE_LAB¹ |
| DELETE | `/laboratorios/{labId}/recursos/{recursoId}` | ADMIN, COORDINADOR, RESPONSABLE_LAB¹ |
| PATCH | `/laboratorios/{labId}/director` | ADMIN, COORDINADOR |
| POST/DELETE | `/laboratorios/{labId}/responsables/...` | ADMIN, COORDINADOR |

¹ solo sobre sus labs asignados (`asegurarAccesoAlLab` → 403).

## Estructura académica — `/estructura`
| Método | Ruta | Auth |
|--------|------|------|
| GET | `/estructura/facultades` | Autenticado |
| GET | `/estructura/departamentos` | Autenticado — opcional `?facultadId=` |
| GET | `/estructura/carreras` | Autenticado — opcional `?departamentoId=` (precede) o `?facultadId=` |
| GET | `/estructura/departamento-por-director/{directorId}` | Autenticado — departamento que dirige (cascada director→depto) |

## Organización (jerarquía) — `/organizacion` · **todo ADMIN**
| Método | Ruta |
|--------|------|
| GET/POST | `/organizacion/facultades` (POST/PUT aceptan `tipo`: `FACULTAD`\|`DIRECCION`) |
| PUT/DELETE | `/organizacion/facultades/{id}` |
| GET/POST | `/organizacion/departamentos` |
| PUT/DELETE | `/organizacion/departamentos/{id}` (DELETE desvincula labs/usuarios antes de borrar) |
| GET/POST | `/organizacion/carreras` (POST: `nombre`, `facultadId`*, `departamentoId`) |
| PUT/DELETE | `/organizacion/carreras/{id}` |

## Reservas — `/reservas`
| Método | Ruta | Auth |
|--------|------|------|
| POST | `/reservas` | Autenticado |
| GET | `/reservas/mis-reservas` | Autenticado |
| GET | `/reservas/mis-reservas/buscar?q&labId&page&size` | Autenticado (alcance por rol⁵; `labId` filtra por laboratorio) |
| GET | `/reservas/recurso/{recursoId}` | Autenticado |
| GET | `/reservas/laboratorio/{labId}` | Autenticado (calendario acotado por rol⁶) |
| DELETE | `/reservas/{id}` | Dueño o rol elevado² |
| PUT | `/reservas/{id}` | Dueño o rol elevado² |
| POST | `/reservas/{id}/reactivar` | Rol elevado³ (NO estudiante) |
| POST | `/reservas/{id}/confirmar` | Rol elevado⁴ (NO estudiante) |

² autorización fina en `ReservaService` (anti-IDOR): dueño, o ADMIN/COORDINADOR/RESPONSABLE_LAB.

³ **Revertir una cancelación.** Solo roles de gestión (ADMIN/COORDINADOR/DIRECTOR/RESPONSABLE_LAB) y **solo el mismo día** de la reserva. Validaciones (en `ReservaService.reactivar`): `FORBIDDEN` si es ESTUDIANTE · `INVALID_STATE` si no está `CANCELADA` · `EXPIRED` si `fecha ≠ hoy` · `RESOURCE_NOT_AVAILABLE` si otra reserva tomó la franja. Éxito → estado vuelve a `CONFIRMADA`.

⁴ **Confirmar una reserva** (`ReservaService.confirmar`): `PENDIENTE → CONFIRMADA`. Es gestión, **NO** hace check-in (no deja la reserva `EN_CURSO` ni ocupa la mesa; el check-in es `POST /checkin/manual`). `FORBIDDEN` si es ESTUDIANTE · `INVALID_STATE` si no está `PENDIENTE`.

⁵ **Gestión de Reservas PAGINADA en el servidor** (`ReservaService.buscarMisReservas` → `ReservaPageResponse` `{ content, total, page, size, totalPages }`). Reemplaza a `/reservas/mis-reservas` para el frontend: antes se bajaban **todas** las reservas de golpe (8k+ para el admin) y se paginaba en el cliente → se colgaba. Ahora el servidor pagina/filtra: `q` busca por código/nombre de lab, recurso y nombre/correo del **titular** (LIKE con `CAST(:patron)` por el gotcha Postgres); orden **fecha desc**; enriquece con participantes+`esMia` **solo la página** (~20 filas). Mismo alcance por rol que la versión lista: ADMIN/COORDINADOR todas, DIRECTOR sus labs, RESPONSABLE_LAB sus labs+propias, ESTUDIANTE propias+donde es acompañante.

⁶ **Calendario acotado por rol** (`CalendarioAccessGuard.asegurarAccesoCalendario`): ADMIN/COORDINADOR/ESTUDIANTE ven el calendario de **cualquier** lab (el alumno lo necesita para reservar); DIRECTOR/RESPONSABLE_LAB **solo los suyos** → **403** en labs ajenos. Aplica a `GET /reservas/laboratorio/{labId}` y `GET /bloqueos/laboratorio/{labId}` (antes cualquier autenticado veía reservas/bloqueos de todos los labs).

**Ejemplo `POST /reservas`:**
```json
{ "recursoId": 12, "fecha": "2026-06-15", "horaInicio": "10:00",
  "horaFin": "11:00", "participantes": 2, "carrera": "Ciencia de la Computación",
  "participantesEmails": ["amigo@utec.edu.pe"] }
```
> `participantesEmails` = correos de los acompañantes (todos menos el titular = el usuario logueado). Deben ser exactamente `participantes − 1`, `@utec.edu.pe` y estar registrados, o falla (`PARTICIPANTS_MISMATCH`, `PARTICIPANT_NOT_FOUND`, `INVALID_EMAIL`, `DUPLICATE_PARTICIPANT`). Cada reserva guarda una fila por participante (`reserva_participantes`) con su carrera, y la gráfica de carreras cuenta por persona.

> **Respuesta de `GET /reservas/mis-reservas` — campo `participantesLista`:** solo este endpoint (alcance: dueño de la reserva o rol elevado que la gestiona) incluye la lista de participantes; los endpoints de **calendario** (`/reservas/recurso`, `/reservas/laboratorio`) la devuelven `null` para no exponer la composición de cada reserva a cualquier autenticado. Cada item es `{ nombreCompleto, correo, carrera, esTitular }` (titular primero, vía query batch que evita N+1). El frontend lo usa para listar los alumnos en cada tarjeta y para **pre-cargar los correos en el modal de editar**.
> ```json
> { "id": 123, "recursoNombre": "MESA 5", "participantes": 2, "estado": "CONFIRMADA",
>   "participantesLista": [
>     { "nombreCompleto": "David Lazo", "correo": "david.lazo@utec.edu.pe", "carrera": "Ciencia de la Computación", "esTitular": true },
>     { "nombreCompleto": "Abel Chuquillanqui", "correo": "abel.chuquillanqui@utec.edu.pe", "carrera": "Ingeniería Mecatrónica", "esTitular": false }
>   ] }
> ```

**Ejemplo `POST /laboratorios` (recursos mixtos):**
```json
{ "codigoLab": "L301", "nombre": "Lab X", "piso": 3, "ubicacionFase": "Fase 2",
  "horaApertura": "08:00", "horaCierre": "18:00",
  "aforoTipo": "MESA", "aforoCantidad": 10, "aforoCapacidad": 5,
  "recursos": [ { "tipo": "MESA", "cantidad": 10, "capacidadPersonas": 5 },
                { "tipo": "PC", "cantidad": 1, "capacidadPersonas": 1 } ],
  "equiposEspecializados": [ { "nombre": "Torno CNC", "tipo": "Maquinaria", "cantidad": 1, "capacidadPersonas": 1 } ] }
```
> `recursos` permite **mezclar tipos** (p. ej. 10 mesas + 1 PC). Si se omite, se cae al aforo legacy (un solo tipo). `aforoTipo/Cantidad/Capacidad` siguen marcando el "aforo principal" del lab (tarjeta).

## Bloqueos — `/bloqueos`
| Método | Ruta | Auth |
|--------|------|------|
| POST | `/bloqueos` | ADMIN, COORDINADOR, DIRECTOR, RESPONSABLE_LAB¹ |
| PUT | `/bloqueos/{id}` | ídem |
| GET | `/bloqueos/laboratorio/{labId}` | Autenticado (calendario acotado por rol⁶) |
| GET | `/bloqueos/activos` | Autenticado |
| GET | `/bloqueos/todos` | Autenticado (acotado por rol: ADMIN/COORD todos, DIRECTOR/RESPONSABLE sus labs) |
| DELETE | `/bloqueos/{id}` | ídem |

**Ejemplo `POST /bloqueos` (parcial):**
```json
{ "laboratorioId": 5, "tipo": "PARCIAL", "motivo": "CLASE",
  "fechaInicio": "2026-06-20", "fechaFin": "2026-06-20",
  "horaInicio": "08:00", "horaFin": "10:00", "recursosIds": [12,13] }
```

> Un bloqueo recae en un **lab O un aula** (`laboratorioId` **o** `aulaId`). En aulas siempre `TOTAL`.

## Aulas y horario — `/aulas`
| Método | Ruta | Auth |
|--------|------|------|
| POST | `/aulas/horarios/importar` (multipart Excel/CSV) | ADMIN, COORDINADOR, DOCENCIA |
| POST / PUT / DELETE | `/aulas` · `/aulas/{id}` (DELETE = soft-delete) | ADMIN, COORDINADOR, DOCENCIA |
| GET | `/aulas?todas=true` | Autenticado |
| GET | `/aulas/areas` · `/aulas/cursos` · `/aulas/cursos/{id}/clases` | Autenticado |
| GET | `/aulas/clases?ciclo&aulaId o labId&area&q` | Autenticado |
| GET | `/aulas/libres?…` · `/aulas/ocupacion?…` | Autenticado |
| GET | `/aulas/laboratorios-con-ocupacion` | Autenticado |

> Cada sesión del horario se persiste como una **clase** = bloqueo recurrente (`es_clase=true`, `dia_semana`, `frecuencia` A/B). Las clases se **excluyen** de `/bloqueos/**`, del dashboard y del respaldo; se consultan por estos endpoints.

## Ciclos académicos — `/ciclos`
| Método | Ruta | Auth |
|--------|------|------|
| GET | `/ciclos` (fechas del calendario + excepciones) | Autenticado |
| POST | `/ciclos/anio/{anio}` (crea 0/1/2 con fechas por defecto) | ADMIN, COORDINADOR, DOCENCIA |
| PUT | `/ciclos/{id}` (fechas + excepciones de exámenes/feriados) | ADMIN, COORDINADOR, DOCENCIA |

## QR — `/qr`
| Método | Ruta | Auth |
|--------|------|------|
| GET | `/qr/recurso/{id}` | Autenticado (PNG) |
| GET | `/qr/laboratorio/{id}` | Autenticado (PNG) |

## Check-in — `/checkin`
| Método | Ruta | Auth |
|--------|------|------|
| POST | `/checkin` | Autenticado |
| POST | `/checkin/qr/{qrCode}` | Autenticado |
| POST | `/checkin/manual/{reservaId}` | ADMIN, COORDINADOR, RESPONSABLE_LAB¹ |

> Un check-in **válido** (cualquiera de las 3 rutas) pasa la reserva a `EN_CURSO`, marca el recurso `OCUPADO` y envía al **titular** el correo **"Check-in confirmado — estás En curso"** (`EmailService.enviarCheckinConfirmado`, `@Async`, best-effort: un fallo de SMTP no rompe el check-in).

## Analytics — `/analytics` · **ADMIN, COORDINADOR, DIRECTOR**
| Método | Ruta |
|--------|------|
| GET | `/analytics/dashboard` |
| GET | `/analytics/dashboard/full` (filtros: lab, ciclo, año, carrera) |
| GET | `/analytics/tabla` (export CSV; incluye correo del usuario) |
| GET | `/analytics/operativos` (bloqueos ALMUERZO/MANTENIMIENTO/FERIADO: por lab, por mes, historial) |
| GET | `/analytics/insights?...&soloReservas=` (**modelo OEE**: ocupación NETA por lab = (reservas + eventos∩ventana) ÷ capacidad [sin feriados/mantenimiento], `soloReservas=true` → solo reservas; + **disponibilidad** `porcentajeCerrado`; + tamaño de grupo + **cruce carrera×lab**) |
| GET | `/analytics/resumen-ejecutivo` (Δ vs periodo anterior + insights narrativos + procedencia de datos) |

## Respaldo — `/respaldo` · **ADMIN**
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/respaldo` | Descarga JSON (alumnos, reservas y bloqueos + `bloqueo_recursos`). |
| POST | `/respaldo` | Restaura con dedup por ID (`ON CONFLICT DO NOTHING`). |

## Auditoría — `/auditoria` · **ADMIN**
| Método | Ruta |
|--------|------|
| GET | `/auditoria` |
| GET | `/auditoria/reserva/{reservaId}` |
| GET | `/auditoria/usuario/{usuarioId}` |

## Actuator
| Ruta | Auth |
|------|------|
| `/actuator/health`, `/actuator/info` | Público |
| `/actuator/**` (resto) | ADMIN |

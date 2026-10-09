# 12. Matriz de Roles y Permisos (RBAC)

## Roles (jerarquía)
> `SUPER_ADMIN` fue eliminado (V6). `rol_id` en BD = 2–6.

| Rol | `rol_id` | Descripción |
|-----|----------|-------------|
| **ADMIN** | 2 | Nivel máximo. Gestión total + organización + respaldo + auditoría. También remitente de correos. |
| **COORDINADOR** | 3 | Gestión de labs/recursos/reservas/bloqueos, dashboard. |
| **DIRECTOR** | 4 | Sus labs y los de sus responsables; dashboard. |
| **RESPONSABLE_LAB** | 5 | Solo sus labs asignados (editar lab, recursos, bloqueos, check-in manual). |
| **ESTUDIANTE** | 6 | Reservar, check-in propio, ver labs activos. Rol por defecto al auto-registrarse. |

## Doble control de autorización
1. **Reglas de ruta** en `SecurityConfig` (se evalúan **antes**).
2. **`@PreAuthorize`** a nivel de método.
3. **Pertenencia/propiedad** a nivel de servicio (`asegurarAccesoAlLab` → 403; check de dueño en `ReservaService.cancelar/editar` → anti-IDOR).

## Matriz por funcionalidad

| Funcionalidad | ESTUDIANTE | RESP_LAB | DIRECTOR | COORDINADOR | ADMIN |
|---------------|:---------:|:--------:|:--------:|:-----------:|:-----:|
| Login / ver labs activos | ✅ | ✅ | ✅ | ✅ | ✅ |
| Crear / cancelar reserva propia | ✅ | ✅ | ✅ | ✅ | ✅ |
| Editar/cancelar reserva ajena | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Reactivar** reserva cancelada (solo HOY)² | ❌ | ✅ | ✅ | ✅ | ✅ |
| Check-in por QR (propio) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Check-in **manual** | ❌ | ✅¹ | ❌ | ✅ | ✅ |
| Crear/editar/eliminar **bloqueo** | ❌ | ✅¹ | ✅ | ✅ | ✅ |
| Editar lab / gestionar recursos | ❌ | ✅¹ | ❌ | ✅ | ✅ |
| Crear / eliminar laboratorio | ❌ | ❌ | ❌ | ✅ | ✅ |
| Asignar director/responsable a lab | ❌ | ❌ | ❌ | ✅ | ✅ |
| Ver lista de **usuarios** | ❌ | ❌ | ❌ | ✅ | ✅ |
| Crear/editar usuario | ❌ | ❌ | ❌ | ✅ | ✅ |
| Desactivar/eliminar usuario, vínculos director↔resp | ❌ | ❌ | ❌ | ❌ | ✅ |
| Organización (facultades/departamentos CRUD) | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Dashboard** / analítica | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Auditoría** de reservas | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Respaldo** (descargar/restaurar) | ❌ | ❌ | ❌ | ❌ | ✅ |

¹ `RESPONSABLE_LAB`: **solo sobre sus labs asignados** (`asegurarAccesoAlLab` → 403 si no).

² **Reactivar** (`POST /reservas/{id}/reactivar`): revierte una cancelación **solo el mismo día** de la reserva; si el día ya pasó → `EXPIRED`. El ESTUDIANTE no puede (`FORBIDDEN`). Autorización fina en `ReservaService.reactivar`.

## Matriz por endpoint (autorización efectiva)

| Endpoint | Auth requerida |
|----------|----------------|
| `POST /auth/google`, `/refresh`, `/logout` | Público |
| `GET /auth/me`, `/usuarios/me` | Autenticado |
| `GET /actuator/health`, `/info` | Público |
| `GET /actuator/**` (resto) | ADMIN |
| `POST/PUT/PATCH/DELETE /usuarios/**` | ADMIN (algunos ADMIN/COORDINADOR) |
| `GET /usuarios/**`, `/analytics/**` | Autenticado / Director+ (`@PreAuthorize`) |
| `POST /laboratorios`, `/laboratorios/admin/todos` | ADMIN, COORDINADOR |
| `PUT /laboratorios/{id}`, recursos | ADMIN, COORDINADOR, RESPONSABLE_LAB |
| `PATCH /laboratorios/{labId}/director|responsables/**` | ADMIN, COORDINADOR |
| `GET /laboratorios/**`, `/estructura/**` | Autenticado |
| `POST/PUT/DELETE /bloqueos/**` | ADMIN, COORDINADOR, DIRECTOR, RESPONSABLE_LAB |
| `GET /bloqueos/**` | Autenticado (PII del responsable) |
| `POST/GET/PUT/DELETE /reservas/**` | Autenticado (autorización fina en `ReservaService`: dueño/rol elevado) |
| `POST /reservas/{id}/reactivar` | Autenticado → rol elevado y solo HOY (en servicio) |
| `POST /checkin`, `/checkin/qr/{qr}` | Autenticado |
| `POST /checkin/manual/{id}` | ADMIN, COORDINADOR, RESPONSABLE_LAB |
| `GET /qr/**` | Autenticado |
| `/organizacion/**` | ADMIN |
| `/auditoria/**` | ADMIN |
| `/analytics/**` | ADMIN, COORDINADOR, DIRECTOR |
| `GET/POST /respaldo` | ADMIN |

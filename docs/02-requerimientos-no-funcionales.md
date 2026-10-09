# 2. Requerimientos No Funcionales (NFR)

> Atributos de calidad. Verificables contra el código y la configuración reales.

## Seguridad
| ID | Requerimiento | Implementación |
|----|---------------|----------------|
| NFR-01 | El acceso se restringe a la comunidad UTEC. | Login Google OAuth2 limitado a dominio `utec.edu.pe` (`GoogleTokenVerifier`). |
| NFR-02 | Los tokens no deben ser robables vía XSS. | Refresh token en cookie `HttpOnly`+`Secure`+`SameSite=Strict`; access token **solo en memoria** (nunca `localStorage`). |
| NFR-03 | La autorización se aplica por rol y por pertenencia. | `@PreAuthorize` (method security) + reglas de ruta en `SecurityConfig` + check de pertenencia (`asegurarAccesoAlLab` → 403) y de propiedad de reserva (anti-IDOR). |
| NFR-04 | El secreto JWT debe ser fuerte y obligatorio. | `JwtTokenProvider` exige `JWT_SECRET` ≥ 32 chars al arranque o la app no inicia. |
| NFR-05 | No exponer detalles internos en errores de producción. | `application-prod.yml`: `include-message/stacktrace/binding-errors: never`. |
| NFR-06 | Cabeceras de seguridad presentes. | HSTS, CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` (Spring + nginx). |
| NFR-07 | Endpoints de monitoreo protegidos. | Solo `/actuator/health` e `/info` públicos; el resto requiere `ROLE_ADMIN`. |
| NFR-08 | Sin secretos en el repositorio. | `.env`, `application-local.yml` gitignored; plantillas `*.example`; cobertura de cyber-neo. |

## Rendimiento y escalabilidad
| ID | Requerimiento | Implementación |
|----|---------------|----------------|
| NFR-09 | El sistema soporta varias instancias del backend. | **ShedLock** (lock distribuido): cada `@Scheduled` lo corre una sola instancia. |
| NFR-10 | La concurrencia en reservas no debe producir doble-booking. | `SELECT ... FOR UPDATE` (lock pesimista) + `version` (lock optimista) en `reservas`. |
| NFR-11 | El estado del servidor se cachea en el cliente. | TanStack Query (cache + invalidación automática tras mutaciones). |
| NFR-12 | Caché de aplicación disponible. | Redis 7. |
| NFR-13 | Mensajería asíncrona para correos. | RabbitMQ 3.13 + `@Async` (no bloquea la request). |
| NFR-14 | El sistema soporta **miles de alumnos** (~9500+) sin degradar la UI ni las consultas. | Listado de usuarios **paginado** por servidor (`GET /usuarios/buscar?q&rol&activo&page&size`), administrativos aparte (`/usuarios/administrativos`) y conteo por rol (`/usuarios/conteo-roles`); ninguna pantalla carga todos los alumnos. Carga masiva idempotente por lotes (`db/agregar_alumnos.sh --csv`). |
| NFR-15 | El sistema soporta **miles de reservas** (8k+ y creciendo) sin colgar Gestión de Reservas. | Gestión de Reservas **paginada por servidor** (`GET /reservas/mis-reservas/buscar?q&page&size` → `ReservaPageResponse`): trae solo la página visible (~20 filas), filtra por lab/recurso/titular y enriquece participantes/`esMia` solo de esa página; el coste **no crece** con el total. Antes se bajaban todas de golpe y se refrescaba cada 15s. Frontend: `DataTable` en modo servidor + búsqueda con debounce + refresco lento (60s) con botón "Actualizar". |

## Fiabilidad y mantenibilidad
| ID | Requerimiento | Implementación |
|----|---------------|----------------|
| NFR-14 | El esquema evoluciona de forma controlada y reproducible. | **Flyway** con baseline único inmutable (`V1__baseline.sql`, consolida V1–V6), checksums validados; cambios futuros en migraciones nuevas. |
| NFR-15 | Cobertura de pruebas alta y no regresiva. | Backend **94.5%** (JaCoCo, 237 tests) · Frontend **85%** (Vitest, 145 tests); CI falla si baja del ratchet. |
| NFR-16 | Integración continua. | GitHub Actions (build + test de backend y frontend), permisos mínimos, Actions pinneadas a SHA. |
| NFR-17 | La lógica de fechas resiste el cambio de día. | Protección de medianoche en `ReservaScheduler`. |

## Usabilidad y compatibilidad
| ID | Requerimiento | Implementación |
|----|---------------|----------------|
| NFR-18 | Interfaz responsive (móvil y escritorio). | TailwindCSS + menú móvil. |
| NFR-19 | Estados visuales claros en la cuadrícula horaria. | Colores: verde=disponible, naranja=reservada, rojo=check-in, gris=bloqueada. |
| NFR-19a | Prevención de errores: toda acción destructiva o de guardado pide **confirmación** antes de ejecutarse. | Modal reutilizable `ConfirmDialog` (`useConfirm()`) en todos los botones de eliminar/cancelar/guardar/crear/editar. |
| NFR-20 | Internacionalización del dominio en español. | Nombres de dominio, mensajes y UI en español; zona horaria `America/Lima`. |
| NFR-21 | La API es auto-documentada. | OpenAPI/Swagger (springdoc) en `/swagger-ui.html`. |

## Operación
| ID | Requerimiento | Implementación |
|----|---------------|----------------|
| NFR-22 | Despliegue reproducible. | `docker-compose.yml` (postgres, redis, rabbitmq, backend, frontend); imágenes multi-stage. |
| NFR-23 | Observabilidad básica. | Actuator (`health`, `info`), logging estructurado, auditoría de reservas. |
| NFR-24 | Configuración por entorno. | Perfiles Spring `local`/`test`/`prod` + variables de entorno. |

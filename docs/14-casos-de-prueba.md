# 14. Casos de Prueba

> Pruebas funcionales y su trazabilidad a requerimientos (FR) y casos de uso (CU).
> Cobertura automatizada real: **Backend ~94% instr. (~300 tests, JaCoCo)** · **Frontend ~85% líneas (~258 tests, Vitest)**. CI falla si la cobertura baja del *ratchet* (`pom.xml` jacoco:check + `vitest.config.ts` thresholds).

## Leyenda
- **Tipo:** Positivo (camino feliz) / Negativo (error esperado) / Seguridad.
- **Estado:** ✅ automatizado · ⚙️ manual.

## Autenticación (CU-01..03)
| ID | Caso | Tipo | Pasos | Resultado esperado | FR | Estado |
|----|------|------|-------|--------------------|----|--------|
| TC-01 | Login alumno nuevo | Positivo | id_token válido `nombre.apellido@utec.edu.pe` | Auto-registro ESTUDIANTE + tokens | FR-02 | ✅ |
| TC-02 | Login administrativo nuevo | Negativo | id_token `xlazo@utec.edu.pe` | "Comunícate con el coordinador" | FR-02 | ✅ |
| TC-03 | Dominio externo | Seguridad | id_token `@gmail.com` | Rechazado | FR-01, NFR-01 | ✅ |
| TC-04 | Refresh con cookie | Positivo | POST /auth/refresh con cookie válida | Nuevo access + rota refresh | FR-03 | ✅ |
| TC-05 | Acceso sin token | Seguridad | GET /usuarios sin Bearer | 401 | NFR-03 | ✅ |

## Reservas (CU-04..06)
| ID | Caso | Tipo | Resultado esperado | FR | Estado |
|----|------|------|--------------------|----|--------|
| TC-06 | Crear reserva válida | Positivo | Estado PENDIENTE + correo | FR-12, FR-17 | ✅ |
| TC-07 | Fecha pasada | Negativo | `INVALID_DATE` | FR-13 | ✅ |
| TC-08 | Fecha > anticipación | Negativo | `DATE_TOO_FAR` | FR-13 | ✅ |
| TC-09 | Día no atendido | Negativo | `LAB_CLOSED_DAY` | FR-13 | ✅ |
| TC-10 | Fuera de horario del lab | Negativo | Error de horario | FR-13 | ✅ |
| TC-11 | Participantes > capacidad | Negativo | `EXCEEDS_CAPACITY` | FR-13 | ✅ |
| TC-12 | Doble-booking (horario solapado) | Negativo | Rechazo (lock pesimista + version) | FR-13, NFR-10 | ✅ |
| TC-13 | Hora flexible (hoy, 10:05) | Positivo | Fin ajustado a malla 30 min | FR-14 | ✅ |
| TC-14 | Cancelar reserva propia | Positivo | Recurso liberado | FR-15 | ✅ |
| TC-15 | Editar reserva ajena (estudiante) | Seguridad | `FORBIDDEN` (anti-IDOR) | NFR-03 | ✅ |
| TC-16 | Editar reserva ajena (responsable) | Positivo | Permitido | FR-15 | ✅ |
| TC-16a | Reactivar reserva CANCELADA de hoy (rol gestión) | Positivo | Estado → `CONFIRMADA` | FR-15a | ✅ |
| TC-16b | Reactivar siendo estudiante | Seguridad | `FORBIDDEN` | FR-15a, NFR-03 | ✅ |
| TC-16c | Reactivar reserva no cancelada | Negativo | `INVALID_STATE` | FR-15a | ✅ |
| TC-16d | Reactivar cancelación de día pasado | Negativo | `EXPIRED` | FR-15a | ✅ |
| TC-16e | Reactivar con franja ya tomada | Negativo | `RESOURCE_NOT_AVAILABLE` | FR-15a | ✅ |
| TC-16f | Confirmación previa en cancelar/guardar/eliminar | Positivo | Modal "¿Confirmar?" antes de ejecutar | NFR-19a | ✅ |
| TC-16g | Gestión de Reservas paginada (servidor) | Positivo | `buscarMisReservas` pagina/filtra; enriquece solo la página; `esMia` correcto | NFR-11 | ✅ |
| TC-16h | Búsqueda por lab/titular en Gestión de Reservas | Positivo | Filtra por `q` (código de lab); término ausente → 0 filas | NFR-11 | ✅ |
| TC-16i | Ver calendario (reservas) de lab ajeno (responsable/director) | Seguridad | 403 (`CalendarioAccessGuard`) | NFR-03 | ✅ |

## Check-in (CU-07..09)
| ID | Caso | Tipo | Resultado esperado | FR | Estado |
|----|------|------|--------------------|----|--------|
| TC-17 | Check-in QR en ventana | Positivo | EN_CURSO + recurso OCUPADO + `VALIDO` | FR-18, FR-20 | ✅ |
| TC-18 | Check-in antes de la ventana | Negativo | "Se habilita 10 min antes" | FR-18 | ✅ |
| TC-19 | Check-in QR de otro recurso | Negativo | Error de pertenencia | FR-18 | ✅ |
| TC-20 | Check-in manual (responsable, su lab) | Positivo | OK; registra `VALIDO` | FR-19 | ✅ |
| TC-21 | Check-in manual en lab ajeno | Seguridad | 403 (`asegurarAccesoAlLab`) | NFR-03 | ✅ |
| TC-22 | QR sin autenticación | Seguridad | 401 (CN-006) | NFR-03 | ✅ |

## Bloqueos (CU-10..12)
| ID | Caso | Tipo | Resultado esperado | FR | Estado |
|----|------|------|--------------------|----|--------|
| TC-23 | Bloqueo total válido | Positivo | Creado + correo | FR-21, FR-25 | ✅ |
| TC-24 | Bloqueo parcial (recursos puntuales) | Positivo | Solo esos recursos bloqueados | FR-21 | ✅ |
| TC-25 | Franja fuera de 07:00–23:00 | Negativo | `OUT_OF_WINDOW` | FR-21 | ✅ |
| TC-26 | Bloqueo con reservas en conflicto | Negativo | Rechazo | FR-22 | ✅ |
| TC-27 | Bloqueo ALMUERZO excluido del dashboard | Positivo | No aparece en KPIs/gráficas/tabla | FR-24 | ✅ |
| TC-28 | Eliminar bloqueo (responsable) | Positivo | Borrado real | FR-23 | ✅ |
| TC-29 | GET /bloqueos sin auth | Seguridad | 401 (PII del responsable) | NFR-03 | ✅ |
| TC-29a | Calendario de bloqueos de lab ajeno (responsable/director) | Seguridad | 403 (`CalendarioAccessGuard`) | NFR-03 | ✅ |

## Laboratorios / recursos (CU-13)
| ID | Caso | Tipo | Resultado esperado | FR | Estado |
|----|------|------|--------------------|----|--------|
| TC-30 | Crear lab con aforo → genera recursos | Positivo | Mesas/PCs creados | FR-06 | ✅ |
| TC-31 | Crear lab con equipos especializados | Positivo | Recursos `tipo=EQUIPO` (regresión V5) | FR-06 | ✅ |
| TC-32 | Editar lab ajeno (responsable) | Seguridad | 403 | NFR-03 | ✅ |
| TC-33 | Filtro estudiante: solo activos | Positivo | No ve inactivos | FR-07 | ✅ |

## Organización / usuarios (CU-14..16)
| ID | Caso | Tipo | Resultado esperado | FR | Estado |
|----|------|------|--------------------|----|--------|
| TC-34 | Alta de persona con correo duplicado | Negativo | Rechazo (correo único) | FR-27 | ✅ |
| TC-35 | Alta con dominio externo | Negativo | Rechazo | FR-27 | ✅ |
| TC-36 | Asignar responsable → cascada | Positivo | Autocompleta director/depto (si poblado) | FR-10 | ⚙️ |
| TC-37 | Desactivar/reactivar usuario | Positivo | `activo` cambia | FR-27 | ✅ |

## Dashboard / respaldo / auditoría (CU-17..19)
| ID | Caso | Tipo | Resultado esperado | FR | Estado |
|----|------|------|--------------------|----|--------|
| TC-38 | Dashboard como estudiante | Seguridad | 403 | NFR-03 | ✅ |
| TC-39 | Filtro por carrera | Positivo | KPIs/gráfico por carrera | FR-29 | ✅ |
| TC-40 | Restaurar respaldo con IDs repetidos | Positivo | Dedup (`ON CONFLICT DO NOTHING`) | FR-31 | ✅ |
| TC-41 | Auditoría por reserva | Positivo | Historial de acciones | FR-32 | ✅ |

## Scheduler (CU-20)
| ID | Caso | Tipo | Resultado esperado | FR | Estado |
|----|------|------|--------------------|----|--------|
| TC-42 | No-show tras 15 min | Positivo | Reserva cancelada + recurso liberado | FR-33 | ✅ |
| TC-43 | Completar EN_CURSO vencida | Positivo | COMPLETADA + recurso liberado | FR-33 | ✅ |
| TC-44 | Cambio de día (medianoche) | Positivo | Procesa el día correcto | NFR-17 | ✅ |
| TC-45 | Varias instancias (ShedLock) | Positivo | Solo una ejecuta | NFR-09 | ⚙️ |

> **Nota:** los tests de fecha (`ReservaServiceTest`, `BloqueoServiceTest`) usan labs que atienden los **7 días**, de modo que `now().plusDays(1)` nunca salta el fin de semana → ya no son *flaky* los viernes/findes (verificado en domingo).

# 1. Requerimientos Funcionales (FR)

> Derivados de las funcionalidades reales implementadas. Prioridad: **A** (alta), **M** (media), **B** (baja).

## Autenticación y sesión
| ID | Requerimiento | Prioridad |
|----|---------------|-----------|
| FR-01 | El sistema permite iniciar sesión con **Google OAuth2**, solo con correos `@utec.edu.pe`. | A |
| FR-02 | El sistema auto-registra como `ESTUDIANTE` a los correos de alumno (`nombre.apellido@utec.edu.pe`); los administrativos (`inicialApellido@…`) requieren alta manual. | A |
| FR-03 | El sistema emite un **JWT** (access 15 min) y un **refresh token** (7 días, cookie HttpOnly) y rota el refresh en cada renovación. | A |
| FR-04 | El sistema rehidrata la sesión tras recargar (F5) usando `/auth/me` y, si hace falta, `/auth/refresh`. | A |
| FR-05 | El usuario puede cerrar sesión (`/auth/logout`), invalidando la cookie de refresh. | A |

## Gestión de laboratorios y recursos
| ID | Requerimiento | Prioridad |
|----|---------------|-----------|
| FR-06 | ADMIN/COORDINADOR pueden **crear** laboratorios, con generación automática de recursos (mesas/PCs) según el aforo. | A |
| FR-07 | El sistema lista laboratorios filtrando por **piso**, **fase** y **disponibilidad**; admins ven activos e inactivos. | A |
| FR-08 | ADMIN/COORDINADOR/RESPONSABLE_LAB pueden **editar** un laboratorio y **gestionar sus recursos** (agregar/editar capacidad/eliminar). | A |
| FR-09 | ADMIN/COORDINADOR pueden **activar/desactivar** y **eliminar** laboratorios. | M |
| FR-10 | El sistema **autocompleta el director y el departamento en cascada** al asignar el responsable de un laboratorio. | A |
| FR-11 | El sistema genera **códigos QR** por recurso y por laboratorio (PNG, requiere autenticación). | A |

## Reservas
| ID | Requerimiento | Prioridad |
|----|---------------|-----------|
| FR-12 | Un ESTUDIANTE puede **crear una reserva** de un recurso para una fecha/hora, indicando participantes (con el **correo @utec.edu.pe** de cada acompañante, registrado) y **carrera**. | A |
| FR-13 | El sistema valida la reserva: horario del lab, día de atención, anticipación máxima (1 día), aforo, bloqueos y doble-booking (con bloqueo optimista). | A |
| FR-14 | El sistema admite **hora de inicio flexible** (no-redonda) ajustando el fin a la malla de 30 min. | M |
| FR-15 | El usuario puede **cancelar** su propia reserva; roles elevados pueden cancelar/editar cualquiera. | A |
| FR-15a | Un rol de gestión (no estudiante) puede **revertir una cancelación** (reactivar) **solo el mismo día** de la reserva; si el día ya pasó, no se permite. | M |
| FR-15b | Toda acción de **eliminar/cancelar/guardar/crear/editar** pide una **confirmación** previa (modal "¿Confirmar…?") antes de ejecutarse. | M |
| FR-16 | El usuario ve **Mis Reservas** agrupadas en Hoy / Próximas / Pasadas. | M |
| FR-17 | El sistema envía un **correo** "reserva registrada — recuerda tu check-in" al crear una reserva. | M |

## Check-in (QR y manual)
| ID | Requerimiento | Prioridad |
|----|---------------|-----------|
| FR-18 | El alumno hace **check-in escaneando el QR** del recurso; el sistema valida pertenencia, fecha de hoy, estado y ventana (10 min antes). | A |
| FR-19 | El responsable puede hacer **check-in manual** de una reserva de hoy (dentro de la ventana de 10 min). | A |
| FR-20 | El check-in válido pone la reserva `EN_CURSO` y el recurso `OCUPADO`; queda registrado en `qr_validaciones`. | A |

## Bloqueos
| ID | Requerimiento | Prioridad |
|----|---------------|-----------|
| FR-21 | ADMIN/COORDINADOR/DIRECTOR/RESPONSABLE_LAB pueden **crear bloqueos** TOTAL (todo el lab) o PARCIAL (recursos específicos) en una fecha y franja 07:00–23:00. | A |
| FR-22 | El sistema rechaza un bloqueo si hay **reservas activas** en conflicto en esa franja. | A |
| FR-23 | El responsable puede **editar y eliminar (borrado real)** bloqueos. | M |
| FR-24 | Los motivos operativos `ALMUERZO`, `MANTENIMIENTO` y `FERIADO` cierran el lab pero el **dashboard los excluye** de KPIs/gráficas/tabla de eventos (se ven aparte en la sección "Operativo"; siguen visibles en Bloqueos). | M |
| FR-25 | El sistema envía un **correo** al responsable al crear un bloqueo. | B |

## Ambientes: aulas y horario académico
| ID | Requerimiento | Prioridad |
|----|---------------|-----------|
| FR-34 | El sistema modela **aulas/auditorios/salas** además de laboratorios; un bloqueo puede recaer en un **lab O un aula** (en aulas siempre TOTAL, no tienen recursos). | A |
| FR-35 | **DOCENCIA** (rol nuevo) **importa el horario de clases** desde Excel/CSV (`POST /aulas/horarios/importar`): crea aulas/cursos faltantes y una **clase** (bloqueo recurrente por día + frecuencia quincenal A/B) por sesión, descartando filas Virtual/RESV y omitiendo solapes. | A |
| FR-36 | DOCENCIA gestiona el **CRUD de aulas** (soft-delete) y los **ciclos académicos** (fechas del calendario por ciclo + excepciones de exámenes/feriados). | M |
| FR-37 | El **alumno** consulta el **Calendario** (horario de clases del ciclo proyectado sobre el calendario académico real, con exámenes/feriados) y **busca ambientes libres** por área/tipo/franja. | A |
| FR-38 | Las **clases** se **excluyen** de la página de Bloqueos, del dashboard de eventos y del respaldo (se consultan aparte), pero **cuentan como uso** del lab en el % de ocupación del dashboard. | M |
| FR-39 | El sistema **rechaza reservar** un lab en la franja de una clase programada (`LAB_CLASS_SCHEDULED`); la cuadrícula pinta esas franjas como "Clase". | A |

## Organización académica
| ID | Requerimiento | Prioridad |
|----|---------------|-----------|
| FR-26 | ADMIN gestiona la jerarquía **Facultades → Departamentos → Laboratorios** (CRUD) y asigna **decanos/directores**. | A |
| FR-27 | ADMIN da de **alta manual de personas** (`@utec.edu.pe`, correo único), edita rol/cargo/departamento y activa/desactiva. | A |
| FR-28 | ADMIN vincula **responsables a directores** y **labs a directores**. | M |

## Dashboard y analítica
| ID | Requerimiento | Prioridad |
|----|---------------|-----------|
| FR-29 | ADMIN/COORDINADOR/DIRECTOR ven un **dashboard** con KPIs, heatmap, tendencias y reservas por carrera, con filtros (lab/ciclo/año/carrera). | A |
| FR-30 | El dashboard exporta **gráficas a PNG** y la tabla a **CSV**. | B |
| FR-31 | ADMIN puede **descargar un respaldo** (JSON de alumnos, reservas y bloqueos) y **restaurarlo** (dedup por ID). | M |

## Auditoría y programación
| ID | Requerimiento | Prioridad |
|----|---------------|-----------|
| FR-32 | El sistema **audita** las acciones sobre reservas (`auditoria_reservas`); ADMIN consulta el historial. | M |
| FR-33 | Un **scheduler** anula reservas sin check-in tras 15 min (no-show), completa reservas EN_CURSO vencidas y libera recursos, con **protección de medianoche** y **lock distribuido** (ShedLock). | A |

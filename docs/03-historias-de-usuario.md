# 3. Historias de Usuario

> Formato ágil: **Como** \<rol\> **quiero** \<acción\> **para** \<beneficio\>.
> Trazabilidad a los requerimientos funcionales ([01-requerimientos-funcionales.md](01-requerimientos-funcionales.md)).
> Roles: `ADMIN` → `COORDINADOR` → `DIRECTOR` → `RESPONSABLE_LAB` → `ESTUDIANTE`.

## ESTUDIANTE
| ID | Historia | Criterios de aceptación | FR |
|----|----------|-------------------------|----|
| HU-01 | Como **estudiante** quiero iniciar sesión con mi correo `@utec.edu.pe` para acceder sin crear otra contraseña. | Solo dominio UTEC; me auto-registro como ESTUDIANTE si mi correo es `nombre.apellido@…`. | FR-01, FR-02 |
| HU-02 | Como **estudiante** quiero ver los laboratorios activos y filtrarlos por piso/fase/disponibilidad para encontrar dónde reservar. | Solo veo labs activos; filtros funcionan; veo solo los **responsables** del lab (no la jerarquía). | FR-07 |
| HU-03 | Como **estudiante** quiero reservar un recurso (mesa/PC) en una fecha y hora indicando participantes y mi **carrera** para asegurar mi espacio. | Valida horario del lab, día de atención, anticipación (1 día), aforo y choques; mi carrera se guarda en mi perfil. | FR-12, FR-13 |
| HU-04 | Como **estudiante** quiero reservar con **hora flexible** (p. ej. ahora mismo si es hoy) para no esperar a una hora redonda. | El fin se ajusta a la malla de 30 min según la duración. | FR-14 |
| HU-05 | Como **estudiante** quiero ver "Mis Reservas" agrupadas en Hoy/Próximas/Pasadas para hacer seguimiento. | Listado agrupado y ordenado. | FR-16 |
| HU-06 | Como **estudiante** quiero **cancelar** mi propia reserva para liberar el recurso si ya no la necesito. | Solo puedo cancelar las **mías** (anti-IDOR). | FR-15 |
| HU-07 | Como **estudiante** quiero hacer **check-in escaneando el QR** del recurso para validar mi asistencia. | Valida pertenencia, fecha de hoy, estado y ventana de 10 min antes. | FR-18, FR-20 |
| HU-08 | Como **estudiante** quiero recibir un **correo** al reservar que me recuerde el check-in para no perder mi reserva. | Llega correo "reserva registrada — recuerda tu check-in". | FR-17 |
| HU-08b | Como **estudiante** quiero ver el **Calendario** con el horario de clases del ciclo y **buscar ambientes libres** para saber cuándo/dónde estudiar. | Horario proyectado sobre el calendario académico real (con exámenes/feriados); filtro por área/tipo/ambiente; buscador de libres. | FR-37 |

## RESPONSABLE_LAB
| ID | Historia | Criterios de aceptación | FR |
|----|----------|-------------------------|----|
| HU-09 | Como **responsable** quiero gestionar **solo mis labs asignados** (editar lab, recursos) para no afectar labs ajenos. | `asegurarAccesoAlLab` → 403 si no es mío. | FR-08 |
| HU-10 | Como **responsable** quiero agregar/editar/eliminar mesas y PCs (con su capacidad) para mantener el inventario al día. | Capacidad por cuadrícula 1–10; edición vía `PUT recursos`. | FR-08 |
| HU-11 | Como **responsable** quiero hacer **check-in manual** de una reserva de hoy para registrar al alumno si no pudo escanear. | Solo hoy y desde 10 min antes. | FR-19 |
| HU-12 | Como **responsable** quiero **crear, editar y eliminar bloqueos** (total o parcial) de mis labs para cerrarlos por mantenimiento/clase. | Franja 07:00–23:00; parcial = recursos puntuales; rechaza choques. | FR-21, FR-22, FR-23 |
| HU-13 | Como **responsable** quiero recibir un **correo** cuando se crea un bloqueo de mi lab para estar informado. | Llega correo detallado. | FR-25 |

## DIRECTOR
| ID | Historia | Criterios de aceptación | FR |
|----|----------|-------------------------|----|
| HU-14 | Como **director** quiero crear/editar bloqueos de los labs de mi área para coordinar su uso. | Mismo flujo de bloqueos. | FR-21 |
| HU-15 | Como **director** quiero ver el **dashboard** (KPIs, heatmap, tendencias, reservas por carrera) para tomar decisiones. | Filtros lab/ciclo/año/carrera; excluye operativos (ALMUERZO/MANTENIMIENTO/FERIADO). | FR-29, FR-24 |

## COORDINADOR
| ID | Historia | Criterios de aceptación | FR |
|----|----------|-------------------------|----|
| HU-16 | Como **coordinador** quiero crear/editar/activar/desactivar **cualquier laboratorio** y sus recursos para administrar la operación. | Genera recursos según aforo; ve labs activos e inactivos. | FR-06, FR-08, FR-09 |
| HU-17 | Como **coordinador** quiero asignar **director/responsables** a un lab para mantener la estructura. | Auto-cascada responsable→director→departamento. | FR-10 |
| HU-18 | Como **coordinador** quiero gestionar usuarios (alta/edición) para mantener el directorio. | Dominio `@utec.edu.pe`, correo único. | FR-27 |
| HU-19 | Como **coordinador** quiero usar el **dashboard** para supervisar el uso global. | Igual que director. | FR-29 |

## ADMIN
| ID | Historia | Criterios de aceptación | FR |
|----|----------|-------------------------|----|
| HU-20 | Como **admin** quiero gestionar la jerarquía **Facultades → Departamentos → Laboratorios** (CRUD) y asignar decanos/directores para reflejar la estructura real. | CRUD completo en Organización. | FR-26 |
| HU-21 | Como **admin** quiero vincular **responsables↔directores** y **labs↔directores** para alimentar la auto-cascada. | Relaciones persistidas. | FR-28 |
| HU-22 | Como **admin** quiero **desactivar/eliminar** usuarios para depurar el directorio. | Soft-delete (`activo=false`) y borrado real. | FR-27 |
| HU-23 | Como **admin** quiero **descargar y restaurar un respaldo** (JSON de alumnos, reservas y bloqueos) para no perder datos. | Restaura deduplicando por ID. | FR-31 |
| HU-24 | Como **admin** quiero consultar la **auditoría** de reservas para investigar incidencias. | Historial por reserva/usuario. | FR-32 |
| HU-25 | Como **admin** quiero que el **scheduler** anule no-shows y libere recursos automáticamente para mantener la disponibilidad real. | No-show a los 15 min; protección de medianoche; ShedLock. | FR-33 |

## DOCENCIA
| ID | Historia | Criterios de aceptación | FR |
|----|----------|-------------------------|----|
| HU-26 | Como **counter de Docencia** quiero **importar el horario de clases** desde el Excel/CSV oficial para no cargar cada sesión a mano. | Detecta el ciclo, crea aulas/cursos faltantes y una clase por sesión (frecuencia A/B); descarta Virtual/RESV; devuelve resumen (creadas/omitidas/errores). | FR-35 |
| HU-27 | Como **counter de Docencia** quiero **gestionar las aulas** (alta/edición/baja) para mantener el catálogo de ambientes. | CRUD con soft-delete; valida tipo y código único. | FR-36 |
| HU-28 | Como **counter de Docencia** quiero **configurar los ciclos académicos** (fechas + excepciones de exámenes/feriados) para que el calendario del alumno sea correcto. | Alta de año (crea 0/1/2 con fechas por defecto editables) y de excepciones por ciclo. | FR-36 |
| HU-29 | Como **counter de Docencia** quiero **bloquear un aula** (auditorio/sala) para un evento para reservar el espacio. | Bloqueo TOTAL de aula (sin recursos); valida ventana 07:00–23:00 y solape. | FR-34 |

> **Nota de prioridad**: las HU de autenticación (HU-01), reserva (HU-03) y check-in (HU-07) son el núcleo del producto (prioridad **A**). El resto soporta la operación y la gobernanza.

# Diagramas visuales

Versiones **visuales** (SVG / HTML autónomo) de los diagramas de ingeniería, con la estética del proyecto (paleta y tipografía del sistema). Complementan los diagramas Mermaid embebidos en los documentos markdown de `../`.

| Archivo | Qué muestra | Doc relacionado |
|---------|-------------|-----------------|
| [system-architecture.svg](system-architecture.svg) | Arquitectura por capas (cliente → nginx → seguridad → backend → módulos → datos → externos). | [10 — C4](../10-arquitectura-c4.md) |
| [reservation-flow-sequence.svg](reservation-flow-sequence.svg) | Secuencia de creación de reserva (participantes por correo, lock pesimista + version, correo async). | [07 — Secuencia](../07-diagrama-secuencia.md) |
| [checkin-flow-sequence.svg](checkin-flow-sequence.svg) | Secuencia de check-in por QR con ventana de 10 min (+ correo "Check-in confirmado" al titular). | [07 — Secuencia](../07-diagrama-secuencia.md) |
| [use-cases.svg](use-cases.svg) | Actores ↔ grupos de casos de uso (con herencia de roles). | [05 — Casos de uso](../05-diagrama-casos-de-uso.md) |
| [use-cases-uml.svg](use-cases-uml.svg) | Casos de uso en notación **UML** (figuras de actor + óvalos + frontera). | [05 — Casos de uso](../05-diagrama-casos-de-uso.md) |
| [er-diagram.html](er-diagram.html) | ERD / diagrama de tablas interactivo (Mermaid con tema). Abrir en el navegador. | [09 — ERD](../09-erd-base-datos.md) |

### Diagramas de flujo (guía de uso paso a paso) → [17 — Guía visual de flujos](../17-guia-visual-flujos.md)
| Archivo | Flujo |
|---------|-------|
| [flow-login.svg](flow-login.svg) | Iniciar sesión |
| [flow-reservar.svg](flow-reservar.svg) | Reservar un laboratorio |
| [flow-checkin.svg](flow-checkin.svg) | Hacer check-in |
| [flow-cancelar-reserva.svg](flow-cancelar-reserva.svg) | Cancelar / modificar / reactivar reserva |
| [flow-bloqueo.svg](flow-bloqueo.svg) | Crear un bloqueo |
| [flow-gestion-recurso.svg](flow-gestion-recurso.svg) | Crear lab (mesas+PCs+equipos) o gestionar recursos del lab |
| [flow-alta-persona.svg](flow-alta-persona.svg) | Alta de persona (con carrera del alumno) |

> Los `.svg` se renderizan directamente en GitHub. El `.html` es autónomo (importa Mermaid por ESM); ábrelo en un navegador.
> Generados a partir del código real (controllers, entidades, `SecurityConfig`, `docker-compose.yml`).

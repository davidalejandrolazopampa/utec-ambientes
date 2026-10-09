# Documentación — UTEC Lab Reservation

Sistema de **reserva y bloqueo de laboratorios** de la Universidad de Ingeniería y Tecnología (UTEC).
Documentación de ingeniería generada a partir del código real del repositorio.

> Los diagramas están en **Mermaid** (se renderizan automáticamente en GitHub).

## Índice de entregables

| # | Documento | Descripción |
|---|-----------|-------------|
| 1 | [Requerimientos Funcionales](01-requerimientos-funcionales.md) | Qué hace el sistema (FR-xx) |
| 2 | [Requerimientos No Funcionales](02-requerimientos-no-funcionales.md) | Calidad: seguridad, rendimiento, etc. (NFR-xx) |
| 3 | [Historias de Usuario](03-historias-de-usuario.md) | Necesidades por rol (formato ágil) |
| 4 | [Casos de Uso](04-casos-de-uso.md) | Flujos detallados (actor, precondición, pasos) |
| 5 | [Diagrama de Casos de Uso](05-diagrama-casos-de-uso.md) | Vista global actor ↔ caso de uso |
| 6 | [Diagramas de Actividades](06-diagrama-actividades.md) | Flujos: reserva, check-in, scheduler |
| 7 | [Diagramas de Secuencia](07-diagrama-secuencia.md) | Login OAuth2, reserva, check-in QR |
| 8 | [Diagrama de Clases](08-diagrama-clases.md) | Entidades y servicios del dominio |
| 9 | [Diagrama ERD](09-erd-base-datos.md) | Modelo de datos (20 tablas · 8 ENUMs) |
| 10 | [Arquitectura C4](10-arquitectura-c4.md) | Contexto / Contenedor / Componente |
| 11 | [Wireframes](11-wireframes.md) | Bocetos de las pantallas |
| 12 | [Matriz de Roles y Permisos](12-matriz-roles-permisos.md) | RBAC endpoint por endpoint |
| 13 | [Documentación API](13-documentacion-api.md) | Referencia REST completa |
| 14 | [Casos de Prueba](14-casos-de-prueba.md) | Pruebas funcionales y su trazabilidad |
| 15a | [Manual del Alumno](manuales/15a-manual-alumnos.md) · [PDF](manuales/15a-manual-alumnos.pdf) | Guía **ilustrada paso a paso** para estudiantes (reservar, check-in, mis reservas), con capturas reales y diagramas de flujo. |
| 15b | [Manual del Administrativo](manuales/15b-manual-administrativos.md) · [PDF](manuales/15b-manual-administrativos.pdf) | Guía **ilustrada paso a paso** para Responsable/Director/Coordinador/Admin (labs, recursos, bloqueos, dashboard, organización). |

> Capturas: `node docs/tools/manual-screenshots.mjs` (con la app corriendo) · PDF: `bash docs/manuales/build-manual-pdf.sh` (marked → HTML → Chromium headless; construye ambos manuales).
| 16 | [Manual Técnico](16-manual-tecnico.md) | Instalación, arquitectura, despliegue |
| 17 | [Guía visual de flujos](17-guia-visual-flujos.md) | Diagramas de flujo paso a paso para usar el software sin errores |

> 🎨 **Diagramas visuales** (SVG/HTML con la estética del proyecto): ver [`diagrams/`](diagrams/README.md) — arquitectura, secuencias de reserva y check-in, casos de uso y ERD interactivo.

> 📣 **Banner A4 imprimible** ([`assets/banner-reserva-a4.svg`](assets/banner-reserva-a4.svg)): póster con el QR de acceso y el logo UTEC para que los alumnos escaneen y reserven. SVG self-contained (QR + logo embebidos), listo para imprimir en A4.

## Stack
- **Backend:** Java 21 · Spring Boot 3.3.5 · PostgreSQL 16 · Flyway · Redis · RabbitMQ
- **Frontend:** React 18 · TypeScript · Vite · TailwindCSS · TanStack Query
- **Auth:** Google OAuth2 + JWT (access en memoria, refresh en cookie HttpOnly)

## Roles del sistema (5)
`ADMIN` → `COORDINADOR` → `DIRECTOR` → `RESPONSABLE_LAB` → `ESTUDIANTE`

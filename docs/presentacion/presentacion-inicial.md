# Presentación inicial — Aplicativo de Reserva de Espacios

> **Sesión:** viernes 10/07/2026, 11:30 am
> **Audiencia:** Andrea Aranda (Coordinadora de Laboratorios), Denisse Trinidad (Jefa de Soluciones TI), Diego Milanes (TI)
> **Expositor:** David Lazo — Responsable Jr. Concept Lab
> **Objetivo de la sesión (según Denisse):** presentar funcionalidades → sesión técnica (arquitectura/tecnología/documentación) → evaluar escalabilidad y seguridad.

---

## Cómo manejar la sesión

- **Foco del viernes:** funcionalidades (etapa 1). Pero ten a la mano lo técnico por si "revisamos todos los puntos".
- **Regla de oro:** demo en vivo primero (impacta), la teoría después. Si algo falla, tienes los manuales con capturas reales como respaldo.
- **Tiempo total sugerido:** ~40 min (20 demo + 10 técnico + 10 preguntas).

---

## PARTE 1 — Presentación funcional (demo en vivo, ~20 min)

### Slide 1 — Portada
- Aplicativo de Reserva de Espacios — Laboratorios UTEC
- Concept Lab · Dirección de Proyectos e Infraestructura Académica
- David Lazo · julio 2026

### Slide 2 — El problema y la solución (1 min)
- **Hoy:** la reserva de laboratorios es manual / dispersa (Affluences, correos, hojas).
- **La solución:** una plataforma web única para **reservar, bloquear y controlar el uso presencial** de los labs, con datos para decisiones.
- Modela la **jerarquía real UTEC**: Facultades → Departamentos → Laboratorios → Responsables.

### Slide 3 — Roles (30 seg)
5 roles: **Admin · Coordinador · Director · Responsable de Lab · Estudiante**. Cada uno ve solo lo suyo.

### Demo en vivo (el corazón de la presentación)
Orden sugerido (ver checklist al final):
1. **Login con Google** (@utec.edu.pe) — seguridad institucional, sin contraseñas nuevas.
2. **Estudiante reserva un lab** — elegir lab, mesa/PC, horario, participantes por correo → recibe correo.
3. **Check-in por QR** — el diferenciador: valida el uso presencial real.
4. **Responsable bloquea un lab** — mantenimiento / evento / clase; bloqueo total o parcial (solo ciertas mesas).
5. **Dashboard ejecutivo** — KPIs, % de ocupación por lab, reservas por carrera, resumen ejecutivo con Δ vs periodo anterior. *(Esto es lo que más le interesa a dirección.)*
6. **Organización** — estructura académica y gestión de personas/labs.

### Slide de cierre funcional — Diferenciadores
- ✅ Check-in por **QR** (uso presencial verificado).
- ✅ **Dashboard ejecutivo** con analítica real (datos de Affluences ya importados).
- ✅ **Tiempo real** (SSE) — los cambios se reflejan al instante.
- ✅ **Correos automáticos** en cada reserva/bloqueo/check-in.
- ✅ Respeta la **jerarquía y permisos** reales de UTEC.

---

## PARTE 2 — Sesión técnica (~10 min, si hay tiempo)

### Arquitectura y stack
| Capa | Tecnología |
|---|---|
| Frontend | React 18 + TypeScript + Vite + TailwindCSS + React Query |
| Backend | Java 21 + Spring Boot 3.3.5 (API REST) |
| Base de datos | PostgreSQL 16 |
| Infra de apoyo | Redis (caché) + RabbitMQ (correos async) |
| Auth | Google OAuth2 + JWT (access en memoria + refresh en cookie HttpOnly) |

- Arquitectura por capas: **Controller → Service → Repository**, DTOs (no se exponen entidades).
- Migraciones versionadas con **Flyway**.
- **Documentación completa en `docs/`** (16 entregables): mostrar el índice `docs/README.md`.
  - Diagramas **C4** (`10-arquitectura-c4.md`), **ERD** (`09-erd-base-datos.md`), clases, secuencia — renderizan en GitHub.
  - **Doc de API** (`13`), **matriz de roles/permisos** (`12`), **manual técnico** (`16`).
  - **Manuales de usuario ilustrados** con capturas reales (alumno `15a` + administrativo `15b`, en PDF).

### Calidad
- **Tests:** 294 backend + 215 frontend, todos verdes.
- **Cobertura:** ~94% backend (JaCoCo) · ~85% frontend (Vitest).
- **CI** con GitHub Actions (falla si baja la cobertura).

---

## PARTE 3 — Escalabilidad y seguridad (~5 min)

### Escalabilidad
- Ya cargados **9,528 alumnos reales** (desde `Alumno.xlsx`), sistema pensado para toda la universidad.
- **Paginación** en listados grandes (usuarios y reservas) — no baja miles de registros de golpe.
- **ShedLock**: los procesos programados corren una sola vez aunque haya varias instancias → **escalable horizontalmente**.
- Índices de rendimiento y anti-doble-reserva a nivel de BD (constraint de exclusión).
- ⚠️ **Punto honesto a mencionar:** el tiempo real (SSE) hoy es de una instancia; multi-instancia requiere fan-out por Redis/RabbitMQ (ya identificado).

### Seguridad
- **2 auditorías de seguridad** internas realizadas (metodología OWASP 2025 / CWE Top 25): **Risk 28/100 — Medio, 0 críticas / 0 altas.**
- Autenticación **Google OAuth2** (solo @utec.edu.pe) + **JWT**; refresh token en cookie **HttpOnly + Secure + SameSite=Strict** (a prueba de XSS).
- Autorización por rol **y** por pertenencia ("solo tu lab"); protección contra **IDOR** verificada endpoint por endpoint.
- Secretos **fuera del repositorio** (variables de entorno / `.gitignore`).
- Cabeceras de seguridad (HSTS, CSP), actuator protegido, CORS restringido.
- ✅ **Abierto a alinear** con las políticas y estándares de seguridad de UTEC (es exactamente lo que pide Denisse).

---

## Preguntas probables de TI (prepárate)

| Pregunta | Respuesta corta |
|---|---|
| ¿Dónde está desplegado? | Hoy demo local + túnel; listo para desplegar donde TI indique (Docker Compose ya hecho). |
| ¿Cómo se autentica? | Google OAuth2 institucional, sin manejar contraseñas propias. |
| ¿Dónde viven los datos de alumnos? | PostgreSQL; solo correo @utec, nombre y carrera. Sin datos sensibles extra. |
| ¿Se integra con sistemas UTEC? | Ya consume la data de matriculados; abierto a integrar (SSO, Calendar). |
| ¿Cumple estándares de seguridad? | Auditado internamente; listo para revisión formal de TI. |
| ¿Quién lo mantiene? | Documentado y con tests para transferencia/continuidad. |
| ¿Escala a toda la universidad? | Sí; ya probado con 9.5k alumnos y paginación; multi-instancia con ajuste menor. |

---

## Material de soporte a tener abierto/impreso

- [ ] La **demo funcionando** (backend + frontend arriba — ver checklist).
- [ ] `docs/README.md` (índice de los 16 entregables) en el navegador.
- [ ] PDFs de manuales: `docs/15a-manual-alumnos.pdf`, `docs/15b-manual-administrativos.pdf`.
- [ ] Diagrama C4 y ERD abiertos (por si preguntan arquitectura).
- [ ] Esta presentación.

---

## CHECKLIST DEMO EN VIVO (hacerlo 30 min antes)

### Antes de empezar
- [ ] Arrancar todo: `./demo.sh start` (o `./demo.sh start --cf` si es remoto/virtual).
- [ ] Verificar `./demo.sh status` — backend (8080) y frontend (5173) OK.
- [ ] `GET /actuator/health` en verde (Postgres + Redis + RabbitMQ arriba).
- [ ] Si es **virtual/remoto**: la URL del túnel Cloudflare debe estar **añadida a Orígenes JS del OAuth de Google** (si no → `origin_mismatch` en el login).
- [ ] Tener **2 usuarios listos** para loguear: uno **estudiante** y uno **administrativo** (coordinador/responsable).
- [ ] Cerrar pestañas/apps que distraigan; navegador en pantalla completa.
- [ ] Tener un **lab con recursos y horario** que atienda **hoy** (para que las mesas salgan disponibles).

### Recorrido (orden a demostrar)
1. [ ] **Login Google** con el estudiante.
2. [ ] **Reservar**: entrar a un lab → elegir mesa → horario → confirmar. Mostrar el **correo** que llega.
3. [ ] **Check-in por QR**: mostrar el QR del recurso y el flujo de check-in (o check-in manual del responsable).
4. [ ] Cambiar a usuario **administrativo**.
5. [ ] **Crear un bloqueo** (evento o mantenimiento) — mostrar total vs parcial.
6. [ ] **Dashboard**: recorrer KPIs, ocupación por lab, reservas por carrera, resumen ejecutivo. Botón **🖨️ Reporte ejecutivo** (PDF).
7. [ ] **Organización**: mostrar la jerarquía y la gestión de personas/labs.

### Plan B (si algo falla en vivo)
- [ ] Tener abiertos los **PDFs de los manuales** con capturas reales → se presenta con esas imágenes.
- [ ] Screenshots del dashboard ya generados en `docs/manual-img/`.

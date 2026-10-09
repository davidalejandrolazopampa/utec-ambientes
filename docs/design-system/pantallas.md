# UTEC Labs — Rediseño por pantalla (18 puntos)

> Modo **diseño** — no código. Cada pantalla sigue los tokens de `MASTER.md`.
> Formato: 18 puntos (Problemas · UX · Mejora · Wireframe · Visual · Componentes · Layout ·
> Tipografía · Colores · Espaciados · Iconografía · Animaciones · Estados · Accesibilidad ·
> Responsive · Beneficio · Prioridad · Mockup).
>
> ⚠️ **Premisa corregida:** la plataforma la usan **administrativos Y estudiantes**. Las
> pantallas de análisis/gestión son admin; **Login, Detalle de lab y Reserva son de alumno** y
> se rediseñan con cuidado de no romper el flujo existente (reserva + check-in por QR).

---

## 0. Dashboard (Home)
El análisis completo de 18 puntos está entregado en la conversación y resumido en `MASTER.md`.
Claves: 2 planos **"Hoy" (operativo)** + **"Análisis" (histórico, tab)**; 5 KPIs con sparkline+Δ;
timeline del día + alertas priorizadas; 1 gráfica ancla (ocupación por hora); resto de gráficas
en la pestaña Análisis. P0 = foundation (tokens, Lucide, dark mode).

---

## 1. Sidebar / Navegación global (TRANSVERSAL)

1. **Problemas:** navbar-only de 143 líneas sin jerarquía; sin búsqueda global; sin favoritos; ítem activo poco claro; emojis.
2. **UX:** navegación es lo más repetido; debe ser predecible, con estado activo obvio y acceso directo a lo frecuente (`nav-state-active`, `adaptive-navigation`).
3. **Mejora:** sidebar 240px negro `#231F20`, agrupado (Operación / Análisis / Administración), colapsable a 64px (solo iconos), **búsqueda global ⌘K**, sección **Favoritos** (labs/vistas fijadas).
4. **Wireframe:** logo UTEC arriba · buscador · grupos con headers · ítem activo con barra cyan izquierda · abajo: tema claro/oscuro + avatar/rol.
5. **Visual:** fondo negro, texto blanco/`--ink-muted`, activo = texto blanco + `border-left 3px #00BFFF` + fondo `rgba(0,191,255,.08)`.
6. **Componentes:** `Sidebar`, `NavGroup`, `NavItem`, `CommandPalette` (⌘K), `FavoritesList`, `ThemeToggle`, `RoleBadge`.
7. **Layout:** fijo a la izquierda ≥1024; drawer con scrim 50% en < 1024. Colapsa a 64px con tooltips.
8. **Tipografía:** ítems 14 medium; headers de grupo 11 uppercase `--ink-muted` letter-spacing 0.06em.
9. **Colores:** el "20% negro" del manual vive aquí; cyan solo en el indicador activo y el logo.
10. **Espaciados:** ítem alto 40px, padding 12px, gap grupos 16px.
11. **Iconografía:** Lucide (`layout-dashboard`, `calendar-check`, `ban`, `calendar`, `users`, `building-2`, `star`).
12. **Animaciones:** colapso 200ms width; indicador activo se desliza (shared layout); ⌘K aparece con scale+fade.
13. **Estados:** sin favoritos → hint "Fija labs o vistas"; destino no disponible por rol → se explica, no se oculta en silencio (`empty-nav-state`).
14. **Accesibilidad:** `nav` landmark; activo con `aria-current`; ⌘K y tab completos; foco visible; logout separado visualmente (`destructive-nav-separation`).
15. **Responsive:** drawer móvil con gesto/botón; en móvil, top-bar con hamburguesa.
16. **Beneficio:** menos clics para lo frecuente; orientación clara; look Linear/Notion institucional.
17. **Prioridad:** **P1** (base de toda la navegación).
18. **Mockup:**
```
▐ UTEC
[ ⌘K  Buscar… ]
OPERACIÓN
 ◉ Inicio          ← activo (barra cyan)
 ▫ Reservas
 ▫ Bloqueos
 ▫ Calendario
ANÁLISIS
 ▫ Ocupación
 ▫ Reportes
ADMINISTRACIÓN
 ▫ Personas
 ▫ Laboratorios
★ FAVORITOS
 ▫ L108 · ▫ Vista OEE
──────────
◐ Tema   (CL) Coordinador
```

---

## 2. Tablas (Reservas · Usuarios · Bloqueos) (TRANSVERSAL)

1. **Problemas:** listas/tarjetas sin orden, filtro ni columnas configurables; búsqueda básica; sin export uniforme; sin sticky header; scroll pobre con miles de filas.
2. **UX:** el admin necesita filtrar/ordenar/agrupar y actuar rápido; densidad alta pero legible (`data-density`, `sortable-table`).
3. **Mejora:** tabla unificada con **TanStack Table**: filtros por columna, orden (`aria-sort`), agrupación, columnas configurables, búsqueda inteligente, export CSV, acciones rápidas por fila, sticky header, virtualización (50+ filas).
4. **Wireframe:** toolbar (buscar + filtros chips + columnas ▾ + export) · header sticky · filas con hover highlight + acciones al final · footer paginación/conteo.
5. **Visual:** filas 44px, cebra sutil `--bg`, hover `rgba(0,191,255,.06)`, chips de estado con icono+color.
6. **Componentes:** `DataTable`, `TableToolbar`, `FilterChip`, `ColumnMenu`, `RowActions`, `StatusPill`, `Pagination`, `ExportButton`.
7. **Layout:** ancho completo del contenido; columnas con min/max; primera col congelada opcional.
8. **Tipografía:** celdas 14; números/fechas **tabulares**; header 12 semibold uppercase.
9. **Colores:** estados = verde/amarillo/danger con icono; enlaces `#015EEA`; foco cyan.
10. **Espaciados:** padding celda 12×16; gap toolbar 8.
11. **Iconografía:** `search`, `filter`, `arrow-up-down`, `columns-3`, `download`, `more-horizontal`.
12. **Animaciones:** orden/filtim con crossfade 200ms; fila nueva stagger; skeleton al cargar.
13. **Estados:** vacío ("Sin resultados" + limpiar filtros); carga (skeleton rows); error (reintentar); sin permiso (mensaje).
14. **Accesibilidad:** `<table>` semántica, `aria-sort`, filtros teclado, foco por fila, resumen de resultados en `aria-live`.
15. **Responsive:** < 768 → tarjetas apiladas (label:valor) en vez de columnas; acciones en menú.
16. **Beneficio:** encontrar/actuar en segundos sobre miles de registros; export directo.
17. **Prioridad:** **P2** (alto impacto, requiere `@tanstack/react-table`).
18. **Mockup:**
```
[ Buscar…  ]  [Estado ▾][Carrera ▾][Fecha ▾]   [Columnas ▾] [⬇ CSV]
┌ Lab │ Fecha ▲ │ Horario │ Titular │ Estado ─────────────┐  (header sticky)
│ L108│ 07 jul  │ 09–11   │ A. Pérez│ ● En curso   ⋯ acciones│
│ L207│ 07 jul  │ 10–12   │ Robótica│ ▲ Bloqueo    ⋯        │
└──────────────────────────────────────── 1–50 de 8 650 ──┘
```

---

## 3. Reserva de laboratorio (ALUMNO — cuidar el flujo)

1. **Problemas:** grilla horaria funcional pero con estados/colores mejorables; pasos poco guiados; sin sensación "1 clic".
2. **UX:** reservar debe ser tan simple como Google Calendar; disponibilidad inmediata, mínimos pasos (`primary-action`, `progressive-disclosure`).
3. **Mejora:** fecha arriba (chips Hoy/Mañana + picker) → grilla de mesas con estado claro → panel de reserva sticky con duración y participantes; confirmación en 1 paso. (Drag-select de rango horario como mejora futura, no obligatorio.)
4. **Wireframe:** header lab (nombre, aforo, "N disponibles ese día") · selector fecha · grilla de mesas (verde/naranja/rojo/gris) · panel reserva (hora, duración, participantes por correo) · CTA "Confirmar".
5. **Visual:** disponible `#34A853` · reservada `#FBBC05` · check-in `#E5484D` · bloqueada `#8F8F8F` · **con leyenda icono+texto**.
6. **Componentes:** `DateChips`, `ResourceGrid`, `ResourceCell`, `BookingPanel`, `ParticipantInputs`, `DurationPicker`.
7. **Layout:** grilla 2/3 + panel 1/3 sticky (desktop); apilado con auto-scroll al panel (móvil, ya existe).
8. **Tipografía:** horas tabulares; título lab Adelle 24.
9. **Colores:** estados de mesa por semántica; cyan solo en selección/foco.
10. **Espaciados:** celdas 8px gap; panel padding 20.
11. **Iconografía:** `calendar`, `clock`, `users`, `check`.
12. **Animaciones:** selección de mesa scale 1.02 + borde cyan; panel entra 200ms; confirmación con check animado.
13. **Estados:** día cerrado → "Fuera de servicio, elige otro día" (ya existe); sin cupo → guía; error de solape → mensaje claro con alternativa.
14. **Accesibilidad:** grilla navegable por teclado; cada mesa con `aria-label` (estado + capacidad); correos con validación inline y `aria-live`.
15. **Responsive:** móvil = grilla scroll + panel apilado con auto-scroll (comportamiento actual conservado).
16. **Beneficio:** menos fricción → más reservas completadas; claridad de estado.
17. **Prioridad:** **P2** (tocar con tests; no romper anti-solape ni participantes).
18. **Mockup:**
```
L108 · Concept Lab       09–18h · 9 de 12 disponibles hoy
[ Hoy ][ Mañana ][ 📅 ]
Mesa1 ✓  Mesa2 ✓  Mesa3 ⏱  Mesa4 ⛔        ┌ Reservar ───────┐
Mesa5 ✓  Mesa6 ✓  Mesa7 ✓  Mesa8 🔧        │ 10:30 · 1h 30m  │
Leyenda: ✓ libre ⏱ reservada ⛔ check-in 🔧 bloq  │ 👥 correos…     │
                                            │ [ Confirmar ]   │
                                            └─────────────────┘
```

---

## 4. Login (ALUMNO + admin)

1. **Problemas:** funcional pero sin personalidad de marca; mensaje de patrón de correo poco visible.
2. **UX:** primer contacto = confianza institucional; una sola acción (Google), errores claros.
3. **Mejora:** split screen — izquierda marca UTEC (logo + tagline sobre fondo negro o cyan controlado), derecha botón Google + ayuda; mensajes de error legibles (admin sin auto-registro → "contacta a tu coordinador").
4. **Wireframe:** panel marca 50% (desktop) + panel auth 50%; móvil = logo arriba + botón centrado.
5. **Visual:** panel izquierdo negro `#231F20` con logo negativo blanco + acento cyan; derecho blanco limpio.
6. **Componentes:** `AuthSplit`, `GoogleButton`, `BrandPanel`, `AuthError`.
7. **Layout:** centrado, `max-w` del panel auth ~ 400px.
8. **Tipografía:** título Adelle 32 "Bienvenido a UTEC Labs"; subtítulo Stag 16.
9. **Colores:** respeta "si fondo cyan → texto negro"; usar negro de fondo si hay logo a color.
10. **Espaciados:** panel padding 48; gap 24.
11. **Iconografía:** logo oficial UTEC (asset correcto, no recolorear); icono Google.
12. **Animaciones:** fade-in del panel 300ms; botón con press feedback.
13. **Estados:** cargando (spinner en botón); error de dominio; error de red con reintento.
14. **Accesibilidad:** botón con label; foco visible; contraste del panel de marca verificado; sin depender de color.
15. **Responsive:** 1 columna en móvil; imagen/marca reducida.
16. **Beneficio:** percepción premium e institucional desde el segundo 1.
17. **Prioridad:** **P1** (alto impacto visual, bajo riesgo).
18. **Mockup:**
```
┌───────────────┬──────────────────────┐
│ ▐ UTEC        │  Bienvenido a         │
│  (fondo negro)│  UTEC Labs            │
│  Reserva y    │  [  G  Ingresar con   │
│  gestiona     │       Google         ]│
│  laboratorios │  Solo @utec.edu.pe    │
└───────────────┴──────────────────────┘
```

---

## 5. Detalle de laboratorio (ALUMNO ve responsables; admin ve todo)

1. **Problemas:** mucha info mezclada; jerarquía por rol implícita; contadores confusos por fecha (ya parcialmente resuelto).
2. **UX:** el alumno quiere reservar; el admin, gestionar. Mostrar lo relevante por rol (`content-priority`).
3. **Mejora:** cabecera con identidad del lab + disponibilidad clara del día elegido; tabs "Reservar / Recursos / Calendario"; alumno ve responsables por nombre; admin ve director/responsables + acciones.
4. **Wireframe:** hero lab (código, nombre, piso, aforo, chips de estado) · tabs · contenido.
5. **Visual:** card hero con acento cyan; badges de estado con icono.
6. **Componentes:** `LabHero`, `Tabs`, `ResourceGrid` (reusa #3), `ResponsibleCard`, `AdminActions`.
7. **Layout:** hero ancho + tabs; contenido en grid.
8. **Tipografía:** código lab Adelle 24; metadatos 14 muted.
9. **Colores:** estado del lab con semántica; cyan en acentos.
10. **Espaciados:** hero padding 24; gap tabs 8.
11. **Iconografía:** `door-open`, `layers`, `users`, `qr-code`.
12. **Animaciones:** cambio de tab crossfade; hover en recursos.
13. **Estados:** lab inactivo (badge, solo admin); cerrado hoy ("Fuera de servicio"); sin recursos.
14. **Accesibilidad:** tabs con roles ARIA; QR autenticado vía `QrImage` (ya existe); labels.
15. **Responsive:** tabs scrollables; grid 1-col móvil.
16. **Beneficio:** claridad por rol; reserva más directa.
17. **Prioridad:** **P2**.
18. **Mockup:** `L108 · Concept Lab  · Piso 1 · Aforo 12 · ● Activo` + tabs `[Reservar][Recursos][Calendario]`.

---

## 6. Calendario por lab

1. **Problemas:** `react-big-calendar` con estilos por defecto; poco integrado a la marca.
2. **UX:** ver de un vistazo reservas + bloqueos; color-coded claro (`chart-type`, `color-not-only`).
3. **Mejora:** re-tematizar el calendario a tokens UTEC; leyenda; vistas semana/mes/día; eventos con icono de tipo.
4. **Wireframe:** toolbar (vista + navegación fecha + leyenda) · grilla calendario.
5. **Visual:** reserva naranja, check-in rojo, bloqueo gris, evento cyan; borde redondeado 6px.
6. **Componentes:** `CalendarToolbar`, `CalendarEvent`, `Legend`.
7. **Layout:** ancho completo; alto responsivo.
8. **Tipografía:** eventos 12; horas tabulares.
9. **Colores:** semántica de estado; cyan para eventos.
10. **Espaciados:** slots según librería, gutter 8.
11. **Iconografía:** `chevron-left/right`, `calendar-days`.
12. **Animaciones:** cambio de vista suave; hover en evento.
13. **Estados:** sin eventos ("Semana libre"); carga skeleton.
14. **Accesibilidad:** navegación teclado; eventos con label (tipo+hora); no solo color.
15. **Responsive:** móvil = vista día/agenda; scroll vertical.
16. **Beneficio:** planificación visual rápida.
17. **Prioridad:** **P3**.
18. **Mockup:** `‹ Semana 7–13 jul ›  [Sem][Mes][Día]  ● Reserva ● Check-in ● Bloqueo ● Evento`.

---

## 7. Organización (Estructura · Labs · Personas)

1. **Problemas:** mucha densidad; 3 pestañas con patrones distintos; escala a 9.5k personas (ya paginado).
2. **UX:** gestión jerárquica clara; búsqueda y filtros consistentes (`nav-hierarchy`, `data-table`).
3. **Mejora:** unificar bajo el `DataTable` (#2) para Personas; Estructura como árbol Facultad→Depto→Lab; Labs en grid de cards; toggles Admin/Alumno y filtros consistentes.
4. **Wireframe:** tabs superiores · toolbar por tab · contenido (árbol / tabla / cards).
5. **Visual:** cards con acento cyan; chips de rol.
6. **Componentes:** `Tabs`, `OrgTree`, `DataTable` (personas), `LabCard`, `PersonModal`, `RoleChip`.
7. **Layout:** tab activo full-width; modales centrados.
8. **Tipografía:** nombres 16; roles 12 muted.
9. **Colores:** rol con chip (no solo color); acciones destructivas en `--danger`.
10. **Espaciados:** grid cards gap 16; tabla como #2.
11. **Iconografía:** `building-2`, `git-branch`, `user-plus`, `pencil`, `trash-2`.
12. **Animaciones:** expandir árbol; modales desde su origen (`modal-motion`).
13. **Estados:** grupo vacío no dibuja header (ya); carga paginada sin parpadeo (ya); error.
14. **Accesibilidad:** árbol con roles `tree`/`treeitem`; modales con foco atrapado y escape; confirmaciones destructivas.
15. **Responsive:** tabs scrollables; cards 1-col; tabla → tarjetas.
16. **Beneficio:** gestión consistente y escalable a miles.
17. **Prioridad:** **P3** (reusa el `DataTable` de #2).
18. **Mockup:** `[Estructura][Laboratorios][Personas]` → árbol / grid / tabla paginada.

---

## Roadmap de implementación (cuando se pase a código)

| Fase | Contenido | Riesgo |
|---|---|---|
| **P0** | Foundation: tokens (color/tipo/espacio), Lucide, dark mode, componentes base (Button/Card/Chip/EmptyState/Skeleton) | Transversal, medio |
| **P1** | Sidebar + Topbar + Login + KpiCards del Dashboard | Bajo-medio |
| **P2** | Dashboard "Hoy" + `DataTable` (Reservas/Usuarios/Bloqueos) + Reserva | Medio-alto (tests) |
| **P3** | Detalle lab + Calendario + Organización + tab Análisis | Medio |

Cada fase reescribe sus tests a la par para mantener el CI verde (ratchet branches 70).

# UTEC Labs — Design System (MASTER)

> Fuente de verdad de diseño. Anclado al **Manual de Identidad Visual de UTEC**
> (no se inventan colores ni tipografías). Modo: **diseño** — este documento NO es código.
> Generado con apoyo del skill `ui-ux-pro-max` (estilo *Data-Dense Dashboard*), pero la
> paleta y tipografía provienen del manual oficial, no de las recomendaciones genéricas.

---

## 1. Color (Manual UTEC)

### Primarios
| Rol | HEX | Origen manual |
|---|---|---|
| Cyan marca | `#00BFFF` | Pantone 638 C · RGB 0,191,255 |
| Negro | `#231F20` | Pantone Black C · RGB 35,31,32 |
| Blanco | `#FFFFFF` | — |
| Metálico | Pantone 877 (gris `#8F8F8F`) | uso exclusivo/decorativo |

### Secundarios (soporte, menor proporción)
| Rol | HEX |
|---|---|
| Amarillo | `#FBBC05` |
| Verde | `#34A853` |
| Azul degradado | `#00BFFF → #015EEA` |

### Terciarios (solo digital)
`#82E1FF` · `#8F8F8F` · `#7FDFFF` · `#96D2AA` · `#BFF0FF` · `#C8C8C8` · `#FFF0BE` · `#CDEBD2`

### ⚠️ Regla de accesibilidad crítica
El cyan `#00BFFF` sobre blanco da contraste **≈1.9:1 → REPRUEBA WCAG para texto**.
- **Cyan = marca / relleno / dato**, nunca texto sobre blanco.
- **Texto = negro `#231F20`** (o sobre fondo cyan, negro — regla del manual).
- **Links / acciones con texto = cyan tinta `#015EEA`** (≈4.8:1 ✓ AA).

### Proporción del manual (70 / 20 / 5 / 5) → UI
70% superficies blancas · 20% negro (texto + sidebar) · 5% cyan (marca/CTA/datos) · 5% secundarios (estados).

### Tokens semánticos — LIGHT
```
--utec-cyan     #00BFFF   marca, rellenos, series de datos, foco
--utec-cyan-ink #015EEA   links, botones-texto, acentos con texto (AA)
--ink           #231F20   texto principal
--ink-muted     #5B5F63   texto secundario
--surface       #FFFFFF   cards
--bg            #F7F9FB   fondo app
--border        #E6EAEE   1px (uso mínimo; separar por espacio)
--ok            #34A853   éxito
--warn          #FBBC05   alerta / almuerzo / feriado
--danger        #E5484D   error / destructivo  (ver nota)
```
> ⚠️ **UTEC no tiene rojo.** `--danger` es una **excepción funcional** (WCAG exige rojo de error),
> usada SOLO en errores/acciones destructivas, nunca como color de marca.

### Tokens semánticos — DARK (desaturado, no invertido)
```
--bg #0E1218 · --surface #171C24 · --border #262D37
--ink #EEF2F6 · --ink-muted #9BA3AD
--utec-cyan #33CCFF (anti-glare) — pasa AA como acento/texto sobre oscuro (~8:1)
```

### Paleta de datos (charts) on-brand
`#00BFFF · #231F20 · #34A853 · #FBBC05 · #82E1FF · #96D2AA · #8F8F8F · #015EEA`
Diferenciar series también por **forma/estilo de línea** (no solo color) para daltonismo.

---

## 2. Tipografía (Manual UTEC)

| Rol | Fuente | Nota |
|---|---|---|
| Display / títulos | **Adelle** (slab serif corporativa) | sello institucional UTEC |
| UI / cuerpo / datos | **Stag Sans** (sans corporativa) | números **tabulares** en tablas/KPIs |
| Fallback web oficial | **Calibri** | autorizado por el manual, mín. 10px |
| Sustitutos libres (si no hay licencia) | **Inter** (UI) + **Roboto Slab** (títulos) | métrica cercana |

**Escala:** 12 · 14 · 16 (base) · 20 · 24 · 32 — line-height 1.5 cuerpo, 1.2 títulos.
**Pesos:** títulos 600–700 · cuerpo 400 · labels 500.

---

## 3. Espaciado, forma y elevación

- **Grid de 8px:** `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`.
- **Radios:** card 12 · botón/input 8 · chip 999.
- **Sombras muy sutiles:** `0 1px 2px rgba(35,31,32,.06)`, `0 4px 12px rgba(35,31,32,.08)` (hover).
- **Separación por espacio, no por líneas** (bordes 1px al mínimo).
- **Contenedor:** `max-w-[1440px]`, gutter 24px.

---

## 4. Movimiento (transiciones CSS / Tailwind)

> Las animaciones se hacen con **transiciones y `@keyframes` de Tailwind/CSS** (`transition`, `animate-*`). **No** se usa `framer-motion` (se retiró por no aportar sobre CSS nativo).

- Duración 150–250ms · `ease-out` entrada / `ease-in` salida.
- Hover card `translateY(-2px)` + sombra; press scale 0.98.
- Stagger listas 30–50ms. Salida ~70% de la entrada.
- **Siempre** respeta `prefers-reduced-motion`.

---

## 5. Iconografía

- **Lucide** (SVG, stroke 1.5, tamaños 16/20/24 como tokens).
- **Cero emojis** como iconos estructurales. Un solo set, un solo peso de trazo.

---

## 6. Accesibilidad (WCAG 2.2 AA) — checklist base

- [ ] Texto ≥ 4.5:1 (negro sobre blanco ✓; cyan solo en no-texto o con negro).
- [ ] Estados funcionales con **icono + texto**, no solo color.
- [ ] Foco visible 2px `#015EEA`; tab order = orden visual.
- [ ] Touch targets ≥ 44px; spacing ≥ 8px.
- [ ] Gráficas con resumen textual + tabla alterna; leyenda + tooltip.
- [ ] Dark mode con contraste verificado por separado.
- [ ] `prefers-reduced-motion` respetado.

---

## 7. Responsive

Desktop-first (1440 / 1024) → tablet 768 → móvil 375. `min-h-dvh`, sin scroll horizontal.
Sidebar 240px → drawer en < 1024. Grids de KPIs y tablas colapsan por breakpoint.

---

## 8. Índice de pantallas

Ver `pantallas.md` para el análisis de 18 puntos por pantalla:
Dashboard · Sidebar/Navegación · Tablas · Reserva de lab · Login · Detalle de lab · Calendario · Organización.

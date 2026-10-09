# 11. Wireframes

> Bocetos de baja fidelidad (ASCII) de las pantallas reales (`frontend/src/pages`). El diseño real usa TailwindCSS y es responsive (menú móvil).

## Login (`auth/LoginPage`)
```
┌────────────────────────────────────────────┐
│                  UTEC Labs                   │
│        Reserva y bloqueo de laboratorios     │
│                                              │
│        ┌──────────────────────────────┐      │
│        │  G  Iniciar sesión con Google │      │
│        └──────────────────────────────┘      │
│        Solo correos @utec.edu.pe             │
└────────────────────────────────────────────┘
```

## Layout principal (`layouts/MainLayout`)
```
┌──────────────────────────────────────────────────────┐
│ ☰ UTEC Labs   Labs  Reservas  Check-in  Dashboard  ⌄ │ ← nav (según rol)
├──────────────────────────────────────────────────────┤
│                                                        │
│                  <contenido de la página>              │
│                                                        │
└──────────────────────────────────────────────────────┘
```

## Listado de laboratorios (`laboratorios/LaboratoriosPage`)
```
┌──────────────────────────────────────────────────────┐
│  Laboratorios            [Piso ▾][Fase ▾][Disp. ▾]    │
├──────────────────────────────────────────────────────┤
│  ┌───────────┐ ┌───────────┐ ┌───────────┐            │
│  │ L-101     │ │ L-108     │ │ A-201     │            │
│  │ Piso 1    │ │ Piso 1    │ │ Piso 2    │            │
│  │ 🟢 Activo │ │ 🟢 Activo │ │ ⚪ Inact. │ ← admin   │
│  │ 👔 Dir.   │ │ 👔 Dir.   │ │           │ ← gestión: │
│  │ 🔧 Resp.  │ │ 🔧 Resp.  │ │           │   dir+resp │
│  │ cargo·@   │ │ cargo·@   │ │           │   cargo+@  │
│  │ [Ver]     │ │ [Ver]     │ │ [Ver]     │            │
│  └───────────┘ └───────────┘ └───────────┘            │
└──────────────────────────────────────────────────────┘
```
> En las tarjetas, los **roles de gestión** (responsable+) ven la info **completa** de director y responsables (**cargo + correo**, como texto); el **alumno** ve solo el/los **responsable(s)** del lab, por nombre (sin director ni contacto).

## Detalle del laboratorio (`laboratorios/LaboratorioDetallePage`)
```
┌──────────────────────────────────────────────────────┐
│ L-108 · Piso 1 · Fase 1        [📅 Ver calendario]    │
│ Decanato/Departamento (oculto a estudiante)           │
│ ┌── 👥 Director y responsables ──────────────────┐    │
│ │ 👔 Director: Nombre — cargo — correo            │    │ ← estudiante ve
│ │ 🔧 Responsable(s): Nombre — cargo — correo      │    │   SOLO responsables
│ └────────────────────────────────────────────────┘    │
│ Fecha [__]  ← arriba de la grilla (si cierra ese día: 🚫 CERRADO) │
│ Contador "N de M disponibles" = según la FECHA elegida  │
│   (día tomado por evento TOTAL → 0 · mesas ⬛ BLOQUEADA) │
│ Recursos disponibles            [+ Agregar recurso]    │
│ ┌─────┬─────┬─────┬─────┐   Reservar:                  │
│ │MESA1│MESA2│ PC1 │ PC2 │   Hora [__]  Dur. [__]       │
│ │ 🟢  │ 🟠  │ 🔴  │ ⬛  │   Particip. [N] Carrera [▾]  │
│ └─────┴─────┴─────┴─────┘   Correos: tú(fijo)+ (N-1)   │
│                             cada uno @utec, registrado │
│ 🟢 Disp. 🟠 Reservada 🔴 Check-in ⬛ Bloqueada 🚫 Cerrado │
│                                            [Reservar]  │
└──────────────────────────────────────────────────────┘
```

## Mis reservas (`reservas/ReservasPage`)
```
┌──────────────────────────────────────────────────────┐
│  Mis Reservas                                          │
│  ── Hoy ────────────────────────────────────────────  │
│  L-108 · MESA1 · 10:00–11:00 · PENDIENTE  [QR][Editar][Cancelar]
│    👥 David Lazo [titular] ·✉ d.lazo@utec · 🎓 CС      │
│       Abel Chuquillanqui ·✉ a.chuqui@utec · 🎓 Mecatr. │
│  ── Próximas ───────────────────────────────────────  │
│  A-201 · PC3 · mañana 14:00–15:00         [Editar][Cancelar]
│  ── Pasadas ────────────────────────────────────────  │
│  L-101 · MESA2 · ayer · COMPLETADA                     │
└──────────────────────────────────────────────────────┘
```

## Check-in (`checkin/CheckinPage`)
```
┌──────────────────────────────────────────────────────┐
│  Check-in por QR                                       │
│  ┌────────────────────────┐                           │
│  │   [ cámara / escáner ]  │  Apunta al QR del recurso │
│  │        @zxing           │                           │
│  └────────────────────────┘                           │
│  Resultado: ✅ Check-in OK / ❌ motivo                 │
└──────────────────────────────────────────────────────┘
```

## Dashboard (`dashboard/DashboardPage`)
```
┌──────────────────────────────────────────────────────┐
│ Dashboard   [Lab▾][Ciclo▾][Año▾][Vista▾][Carrera▾]    │
│             [⬇ Descargar gráficos] [⬇Respaldo][⬆Rest.] │ ← admin
│ ┌ KPIs ───────────────────────────────────────────┐   │
│ │ Reservas: 616 │ Check-in %: ── │ No-show: ──     │   │
│ └─────────────────────────────────────────────────┘   │
│ [Barras: reservas/día]   [Heatmap horas]              │
│ [Pie: por estado]        [Barras: por carrera]        │
│ Tabla de reservas (export CSV)                        │
└──────────────────────────────────────────────────────┘
```

## Organización (`admin/OrganizacionPage`) — 3 pestañas
```
┌──────────────────────────────────────────────────────┐
│  Organización   [ Estructura | Labs | Personas ]      │
│  Estructura:  Facultad ▸ Departamento ▸ Carrera ▸ Lab │
│      [+ Facultad][+ Depto][+ Carrera]  buscar [____]  │
│      asignar decano/director · [+ Crear Lab] (modal)  │
│  Personas:  ( Administrativos | Alumnos )  [+ Persona] │
│      [Activos|Inactivos|Todos]                        │
│      Admin: nombre·rol·cargo·depto [Editar][Desactiv.]│
│      Alumno: nombre·🎓 carrera     [Editar][Desactiv.]│
└──────────────────────────────────────────────────────┘
```

## Bloqueos (`admin/BloqueosPage` + `CrearBloqueoPage`)
```
┌──────────────────────────────────────────────────────┐
│  Bloqueos                              [+ Crear]       │
│  ── Hoy ──   L-108 · 12:00–13:00 · ALMUERZO  [Elim.]  │
│  ── Programados ──  A-201 · 2026-06-20 · CLASE        │
│  ── Pasados ──  ...                                    │
│                                                        │
│  Crear: Título[__] Resp[__] Correo[__] Fecha[__]      │
│         Franja 07:00–23:00   Tipo (TOTAL/PARCIAL)     │
│         [recursos puntuales si PARCIAL]   [Guardar]   │
└──────────────────────────────────────────────────────┘
```

> Estados de color (NFR-19): 🟢 Disponible · 🟠 Reservada · 🔴 Check-in hecho · ⬛ Bloqueada.

# 5. Diagrama de Casos de Uso

> **Versión visual:** [diagrams/use-cases.svg](diagrams/use-cases.svg)
>
> ![Diagrama de casos de uso](diagrams/use-cases.svg)

> Vista global actor ↔ caso de uso. Detalle de cada CU en [04-casos-de-uso.md](04-casos-de-uso.md).
> Mermaid no tiene un tipo nativo "use case", así que se modela con un grafo (actores → casos de uso).
> Por **herencia de roles**: cada rol superior puede todo lo del inferior (un COORDINADOR también reserva, etc.).

## Vista por actor

```mermaid
flowchart LR
    EST(["👤 Estudiante"])
    RESP(["🔧 Responsable_Lab"])
    DIR(["👔 Director"])
    COOR(["🧭 Coordinador"])
    ADM(["🛡️ Admin"])
    DOC(["📚 Docencia"])
    SYS{{"⚙️ Sistema / Scheduler"}}

    subgraph Sesion["Sesión"]
        UC1["CU-01 Login OAuth2"]
        UC2["CU-02 Rehidratar sesión"]
        UC3["CU-03 Logout"]
    end
    subgraph Reservas["Reservas y check-in"]
        UC4["CU-04 Reservar recurso"]
        UC6["CU-06 Cancelar/editar reserva"]
        UC7["CU-07 Check-in QR"]
        UC8["CU-08 Check-in manual"]
        UC12["CU-12 Ver calendario"]
    end
    subgraph Bloqueos["Bloqueos (labs y aulas)"]
        UC10["CU-10 Crear bloqueo (lab o aula)"]
        UC11["CU-11 Editar/eliminar bloqueo"]
    end
    subgraph Academico["Programación académica / Calendario"]
        UC21["CU-21 Consultar horario de clases / calendario"]
        UC22["CU-22 Buscar ambientes libres"]
        UC23["CU-23 Importar horarios (Excel/CSV)"]
        UC24["CU-24 Gestionar aulas"]
        UC25["CU-25 Configurar ciclos académicos y excepciones"]
    end
    subgraph Gestion["Gestión y gobernanza"]
        UC13["CU-13 Labs y recursos"]
        UC14["CU-14 Asignar dir/resp"]
        UC15["CU-15 Jerarquía académica (incl. carreras)"]
        UC16["CU-16 Usuarios"]
        UC17["CU-17 Dashboard"]
        UC18["CU-18 Respaldo"]
        UC19["CU-19 Auditoría"]
    end

    EST --> UC1 & UC2 & UC3 & UC4 & UC7 & UC12 & UC21 & UC22
    EST -. "solo propias" .-> UC6
    RESP --> UC6 & UC8 & UC10 & UC11 & UC13
    DIR --> UC10 & UC11 & UC17
    COOR --> UC8 & UC13 & UC14 & UC16 & UC17 & UC23 & UC24 & UC25
    ADM --> UC15 & UC16 & UC18 & UC19
    DOC --> UC10 & UC11 & UC23 & UC24 & UC25
    SYS --> UC20["CU-20 No-show / completar / liberar"]
```

> **Docencia (📚):** rol nuevo que gestiona la **programación académica** (importar horarios, aulas, ciclos) y puede **bloquear aulas** (no labs). El **alumno** consulta el horario/calendario y busca ambientes libres (CU-21/22).

## Notas de autorización
- **Herencia:** las flechas muestran *lo nuevo* que aporta cada rol; los superiores heredan lo de los inferiores.
- **Pertenencia (¹):** `RESPONSABLE_LAB` solo opera CU-08/10/11/13 sobre **sus** labs (`asegurarAccesoAlLab` → 403).
- **Propiedad (anti-IDOR):** CU-06 lo limita el `ReservaService` al dueño o rol elevado.
- **Solo ADMIN:** CU-15 (jerarquía), CU-18 (respaldo), CU-19 (auditoría) y los vínculos director↔responsable.
- **Actor sistema:** CU-20 lo ejecuta el `ReservaScheduler` (sin intervención humana), con ShedLock.

## Relaciones «include» / «extend»
```mermaid
flowchart TB
    UC4["CU-04 Reservar"] -. include .-> UC5["CU-05 Validar disponibilidad/aforo"]
    UC4 -. include .-> PART["Participantes por correo (@utec, registrados)"]
    UC4 -. extend .-> HF["Hora flexible (malla 30 min)"]
    UC7["CU-07 Check-in QR"] -. include .-> QR["CU-09 Generar/validar QR"]
    UC10["CU-10 Crear bloqueo"] -. extend .-> PARC["Bloqueo parcial (recursos puntuales, solo labs)"]
    UC10 -. extend .-> AULA["Bloqueo de aula (siempre total; ADMIN/COORD/DOCENCIA)"]
    UC10 -. extend .-> ALM["Motivo operativo: ALMUERZO/MANTENIMIENTO/FERIADO (excluido del dashboard)"]
    UC23["CU-23 Importar horarios"] -. include .-> CLASE["Clase = bloqueo recurrente (día, frecuencia A/B, ciclo)"]
```

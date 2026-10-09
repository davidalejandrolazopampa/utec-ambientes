# 6. Diagramas de Actividades

> Flujos de proceso (Mermaid `flowchart`). Basados en `ReservaService`, `QrCheckinService`, `BloqueoService` y `ReservaScheduler`.

## 6.1 Crear reserva
```mermaid
flowchart TD
    A([Inicio]) --> B[Estudiante elige recurso, fecha, hora, cantidad de participantes y carrera]
    B --> B2[Ingresa el correo de cada participante:<br/>el 1º es el titular fijo, los demás acompañantes<br/>@utec.edu.pe y registrados]
    B2 --> C[POST /reservas con participantesEmails]
    C --> D{¿Fecha válida?<br/>no pasada y ≤ 1 día}
    D -- No --> X1[/Error INVALID_DATE o DATE_TOO_FAR/]
    D -- Sí --> E{¿El lab atiende ese día?}
    E -- No --> X2[/Error LAB_CLOSED_DAY/]
    E -- Sí --> F{¿Hora dentro de apertura–cierre?}
    F -- No --> X3[/Error fuera de horario/]
    F -- Sí --> G{¿Participantes ≤ capacidad?}
    G -- No --> X4[/Error EXCEEDS_CAPACITY/]
    G -- Sí --> G2{¿Correos completos, válidos<br/>y registrados?}
    G2 -- No --> X6[/Error PARTICIPANTS_MISMATCH /<br/>PARTICIPANT_NOT_FOUND / INVALID_EMAIL/]
    G2 -- Sí --> H[SELECT ... FOR UPDATE del recurso]
    H --> I{¿Choque con reserva o bloqueo?}
    I -- Sí --> X5[/Error doble-booking/]
    I -- No --> J[Guardar reserva PENDIENTE + version<br/>+ una fila por participante con su carrera]
    J --> K[[Encolar correo @Async: recuerda check-in]]
    K --> L([Fin: reserva creada])
    X1 & X2 & X3 & X4 & X5 & X6 --> Z([Fin con error])
```
> La carrera de cada participante (titular = la elegida; acompañantes = la de su perfil) se guarda en `reserva_participantes` y alimenta la gráfica "Reservas por carrera" del dashboard (cuenta por persona).

## 6.2 Check-in (QR y manual)
```mermaid
flowchart TD
    A([Inicio]) --> B{¿Origen?}
    B -- QR escaneado --> C[POST /checkin/qr/qrCode]
    B -- Manual responsable --> D[POST /checkin/manual/reservaId]
    C --> E{¿Recurso pertenece a la reserva?}
    D --> E
    E -- No --> X1[/Error pertenencia/]
    E -- Sí --> F{¿Reserva es de hoy?}
    F -- No --> X2[/Error: no es de hoy/]
    F -- Sí --> G{¿Dentro de ventana?<br/>desde 10 min antes}
    G -- No --> X3[/"Se habilita 10 min antes"/]
    G -- Sí --> H{¿Estado PENDIENTE o CONFIRMADA?}
    H -- No --> X4[/Error estado inválido/]
    H -- Sí --> I[Reserva → EN_CURSO]
    I --> J[Recurso → OCUPADO]
    J --> K[Registrar en qr_validaciones resultado=VALIDO]
    K --> M[[Correo @Async best-effort:<br/>Check-in confirmado al titular]]
    M --> L([Fin: check-in OK])
    X1 & X2 & X3 & X4 --> Z([Fin con error])
```

## 6.3 Crear bloqueo (total / parcial)
```mermaid
flowchart TD
    A([Inicio]) --> B[Actor define título, motivo, fecha, franja, tipo]
    B --> C{¿Franja dentro de 07:00–23:00?}
    C -- No --> X1[/Error OUT_OF_WINDOW/]
    C -- Sí --> D{¿Tipo?}
    D -- PARCIAL --> E[Seleccionar recursosIds]
    D -- TOTAL --> F[Tomar todos los recursos del lab]
    E --> G{¿Reservas activas en conflicto<br/>en los recursos elegidos?}
    F --> G
    G -- Sí --> X2[/Error: hay reservas en conflicto/]
    G -- No --> H[Guardar bloqueo + bloqueo_recursos si parcial]
    H --> I[[Correo @Async al responsable]]
    I --> L([Fin: bloqueo creado])
    X1 & X2 --> Z([Fin con error])
```

## 6.4 Scheduler (no-show / completar / liberar)
```mermaid
flowchart TD
    A([Tick @Scheduled]) --> L{¿ShedLock adquirido?<br/>solo una instancia}
    L -- No --> Z([Otra instancia ya corre])
    L -- Sí --> M[Protección de medianoche:<br/>fijar 'ahora' del día correcto]
    M --> N[Buscar reservas PENDIENTE<br/>sin check-in > 15 min]
    N --> O[Cancelarlas + liberar recurso → DISPONIBLE]
    O --> P[Buscar reservas EN_CURSO vencidas]
    P --> Q[Marcar COMPLETADA + liberar recurso]
    Q --> S[Reconciliación horaria:<br/>mesas OCUPADO sin reserva EN_CURSO de hoy<br/>→ DISPONIBLE]
    S --> R([Fin del tick])
```
> La **reconciliación** (`liberarRecursosCompletados`, cada hora) es una red de seguridad: si una mesa quedó pegada en `OCUPADO` por un check-in cuya reserva ya terminó, la devuelve a `DISPONIBLE`. Los bloqueos no tocan `recurso.estado`, así que es seguro.

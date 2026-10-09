# 7. Diagramas de Secuencia

> **Versiones visuales:** [reserva](diagrams/reservation-flow-sequence.svg) · [check-in](diagrams/checkin-flow-sequence.svg)
>
> ![Secuencia de creación de reserva](diagrams/reservation-flow-sequence.svg)
>
> ![Secuencia de check-in por QR](diagrams/checkin-flow-sequence.svg)

> Interacción entre componentes reales (Mermaid `sequenceDiagram`).

## 7.1 Login con Google OAuth2 + JWT
```mermaid
sequenceDiagram
    actor U as Usuario
    participant FE as Frontend (React)
    participant G as Google Identity
    participant AC as AuthController
    participant GV as GoogleTokenVerifier
    participant AS as AuthService
    participant DB as PostgreSQL
    participant JP as JwtTokenProvider

    U->>FE: Click "Iniciar sesión con Google"
    FE->>G: Solicita id_token
    G-->>FE: id_token
    FE->>AC: POST /auth/google { idToken }
    AC->>GV: verificar(idToken)
    GV->>G: GET tokeninfo (token URL-encoded)
    G-->>GV: payload (email, dominio)
    GV-->>AC: email válido @utec.edu.pe
    AC->>AS: login(email)
    AS->>DB: buscar/crear usuario (rol según patrón de correo)
    DB-->>AS: Usuario
    AS->>JP: generar access (15m) + refresh (7d)
    JP-->>AS: tokens
    AS-->>AC: AuthResponse
    AC-->>FE: 200 + access (body) + Set-Cookie refresh (HttpOnly)
    FE->>AC: GET /auth/me (Bearer access)
    AC-->>FE: perfil del usuario
```

## 7.2 Crear reserva
```mermaid
sequenceDiagram
    actor E as Estudiante
    participant FE as Frontend
    participant RC as ReservaController
    participant RS as ReservaService
    participant DB as PostgreSQL
    participant MQ as RabbitMQ / @Async
    participant ES as EmailService

    E->>FE: Completa formulario (incl. correo de cada participante)
    FE->>RC: POST /reservas (Bearer, participantesEmails)
    RC->>RS: crear(request, correo)
    RS->>RS: validarFecha / diaAtencion / horario / participantes
    RS->>DB: resolver acompañantes por correo (deben estar registrados)
    RS->>DB: SELECT recurso FOR UPDATE (lock pesimista)
    RS->>DB: ¿choque con reservas/bloqueos?
    alt Sin conflicto
        RS->>DB: INSERT reserva (PENDIENTE, version=0)
        RS->>DB: INSERT reserva_participantes (titular + acompañantes, con carrera)
        RS->>MQ: publicar evento correo
        MQ->>ES: enviarReservaConfirmada (@Async)
        ES-->>E: Correo "recuerda tu check-in"
        RS-->>RC: ReservaResponse
        RC-->>FE: 200 OK
    else Conflicto / validación
        RS-->>RC: BusinessException (code)
        RC-->>FE: 4xx + mensaje
    end
```

## 7.2b Revertir cancelación (reactivar reserva)
```mermaid
sequenceDiagram
    actor G as Rol de gestión (no estudiante)
    participant FE as Frontend
    participant CD as ConfirmDialog (modal)
    participant RC as ReservaController
    participant RS as ReservaService
    participant DB as PostgreSQL

    G->>FE: Clic "↩ Reactivar" (reserva CANCELADA de hoy)
    FE->>CD: confirm("¿Reactivar?")
    CD-->>FE: true
    FE->>RC: POST /reservas/{id}/reactivar (Bearer)
    RC->>RS: reactivar(id, correo)
    RS->>RS: rol elevado? · estado CANCELADA? · fecha == hoy?
    RS->>DB: ¿otra reserva tomó la franja? (lock)
    alt Permitido y sin solape
        RS->>DB: UPDATE reserva → CONFIRMADA
        RS-->>RC: ReservaResponse
        RC-->>FE: 200 OK
    else FORBIDDEN / INVALID_STATE / EXPIRED / RESOURCE_NOT_AVAILABLE
        RS-->>RC: BusinessException (code)
        RC-->>FE: 4xx + mensaje
    end
```

## 7.3 Check-in por QR
```mermaid
sequenceDiagram
    actor E as Estudiante
    participant FE as Frontend (@zxing)
    participant QC as QrCheckinController
    participant QS as QrCheckinService
    participant DB as PostgreSQL
    participant ES as EmailService

    E->>FE: Escanea QR del recurso
    FE->>QC: POST /checkin/qr/{qrCode} (Bearer)
    QC->>QS: checkinPorQr(qrCode, correo)
    QS->>DB: localizar recurso + reserva de hoy
    QS->>QS: validar pertenencia, fecha, ventana (10 min), estado
    alt Válido
        QS->>DB: reserva → EN_CURSO, recurso → OCUPADO
        QS->>DB: INSERT qr_validaciones (VALIDO)
        QS->>ES: enviarCheckinConfirmado (@Async, best-effort)
        ES-->>E: Correo "Check-in confirmado — estás En curso"
        QS-->>QC: CheckinResponse OK
        QC-->>FE: 200 OK
    else Inválido
        QS-->>QC: BusinessException
        QC-->>FE: 4xx + motivo
    end
```
> El mismo correo se envía en el **check-in manual** del responsable (`POST /checkin/manual/{reservaId}`) y en el auto-scan; va al **titular** de la reserva.

## 7.4 Refresh de token (rehidratar sesión)
```mermaid
sequenceDiagram
    participant FE as Frontend (interceptor api.ts)
    participant API as Cualquier endpoint
    participant AC as AuthController
    participant JP as JwtTokenProvider

    FE->>API: GET /... (sin access en memoria)
    API-->>FE: 401 Unauthorized
    FE->>AC: POST /auth/refresh (cookie HttpOnly)
    AC->>JP: validar refresh + rotar
    JP-->>AC: nuevo access + nuevo refresh
    AC-->>FE: 200 + access (body) + Set-Cookie refresh
    FE->>API: reintento GET /... (Bearer nuevo)
    API-->>FE: 200 OK
```

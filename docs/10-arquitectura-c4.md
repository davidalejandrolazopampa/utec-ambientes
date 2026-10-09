# 10. Arquitectura C4

> **Versión visual:** [diagrams/system-architecture.svg](diagrams/system-architecture.svg)
>
> ![Arquitectura del sistema](diagrams/system-architecture.svg)

> Modelo C4 (Contexto → Contenedor → Componente). Representado con Mermaid `flowchart`.

## C1 — Contexto del sistema
```mermaid
flowchart TB
    EST([👤 Estudiante])
    STAFF([👔 Responsable / Director / Coordinador])
    ADM([🛡️ Admin])
    SYS["🏛️ UTEC Lab Reservation<br/>(reserva, bloqueo y check-in de laboratorios)"]
    GOOGLE["🔐 Google OAuth2<br/>(identidad @utec.edu.pe)"]
    GMAIL["✉️ Gmail SMTP<br/>(notificaciones)"]

    EST -->|reserva, check-in QR| SYS
    STAFF -->|bloqueos, gestión, dashboard| SYS
    ADM -->|organización, usuarios, respaldo| SYS
    SYS -->|verifica id_token| GOOGLE
    SYS -->|envía correos| GMAIL
```

## C2 — Contenedores
```mermaid
flowchart TB
    subgraph Cliente
        FE["🖥️ Frontend SPA<br/>React 18 + Vite + Tailwind<br/>:5173"]
    end
    subgraph Servidor
        BE["⚙️ Backend API<br/>Spring Boot 3 / Java 21<br/>:8080"]
        DB[("🐘 PostgreSQL 16<br/>:5432")]
        REDIS[("⚡ Redis 7<br/>caché")]
        MQ[("🐰 RabbitMQ 3.13<br/>correos async")]
    end
    GOOGLE["Google OAuth2"]
    GMAIL["Gmail SMTP"]

    FE -->|REST /api/v1 (JWT Bearer + cookie refresh)| BE
    BE --> DB
    BE --> REDIS
    BE --> MQ
    MQ -->|@Async| GMAIL
    FE -->|id_token| GOOGLE
    BE -->|tokeninfo| GOOGLE
```

## C3 — Componentes del backend
```mermaid
flowchart LR
    subgraph Security
        SC[SecurityConfig]
        JF[JwtAuthenticationFilter]
        JTP[JwtTokenProvider]
        CUDS[CustomUserDetailsService]
    end
    subgraph Módulos
        AUTH[auth<br/>AuthController/Service<br/>GoogleTokenVerifier]
        IAM[iam<br/>UsuarioController/Service]
        LAB[laboratorios<br/>Lab/Recurso/Estructura/Organizacion]
        RES[reservas<br/>ReservaController/Service]
        BLO[bloqueos<br/>BloqueoController/Service]
        QR[qr<br/>QrController + QrCheckin]
        AUL[aulas<br/>Aula/Curso/Ciclo<br/>HorarioImport + clases]
        ANA[analytics<br/>Dashboard/KPIs]
        AUD[audit<br/>AuditoriaService]
        NOT[notificaciones<br/>EmailService]
        RESP[respaldo<br/>RespaldoController]
        RT[realtime<br/>RealtimeService SSE]
    end
    SCHED[schedulers<br/>ReservaScheduler + ShedLock]
    REPO[(Repositorios JPA)]
    CACHE[("Redis<br/>caché analytics")]

    JF --> JTP
    JF --> CUDS
    AUTH --> JTP
    RES --> REPO
    BLO --> REPO
    QR --> REPO
    LAB --> REPO
    AUL --> REPO
    ANA --> REPO
    ANA --> CACHE
    RES --> NOT
    BLO --> NOT
    SCHED --> RES
    RES -->|LabActivityEvent| RT
    BLO -->|LabActivityEvent| RT
    QR -->|LabActivityEvent| RT
    RT -->|invalida| CACHE
```

## Decisiones de arquitectura (resumen)
- **Capas estrictas**: controller → service → repository; DTOs en los bordes.
- **Stateless auth**: JWT + refresh en cookie `HttpOnly`; autoridades reconstruidas desde BD por request.
- **Async desacoplado**: correos por RabbitMQ + `@Async` (no bloquean la request).
- **Escalado horizontal**: ShedLock garantiza que cada `@Scheduled` corra en una sola instancia.
- **Esquema versionado**: Flyway con baseline inmutable + migraciones incrementales.
- **Despliegue**: `docker-compose` (5 servicios), imágenes multi-stage, cabeceras de seguridad en nginx + Spring.

# 8. Diagrama de Clases

> Entidades del dominio y servicios principales (Mermaid `classDiagram`). Campos derivados de las entidades JPA reales en `modules/**/model`.

## 8.1 Modelo de dominio (entidades)
```mermaid
classDiagram
    class Usuario {
        +Long id
        +String correoUtec
        +String nombres
        +String apellidos
        +String cargo
        +String carrera
        +Long departamentoId
        +Boolean activo
        +Role rol
    }
    class Role {
        +Long id
        +String nombre
        +Boolean activo
        +Set~Permiso~ permisos
    }
    class Permiso {
        +Long id
        +String nombre
        +String descripcion
    }
    class Facultad {
        +Long id
        +String nombre
        +Long decanoId
        +String tipo
        +Boolean activo
    }
    class Departamento {
        +Long id
        +String nombre
        +Long facultadId
        +Long directorId
        +Boolean activo
    }
    class Carrera {
        +Long id
        +String nombre
        +Long facultadId
        +Long departamentoId
        +Boolean activo
    }
    class Laboratorio {
        +Long id
        +String codigoLab
        +String nombre
        +Long departamentoId
        +Long carreraId
        +Integer piso
        +String ubicacionFase
        +List~String~ diasAtencion
        +LocalTime horaApertura
        +LocalTime horaCierre
        +String aforoTipo
        +Integer aforoCapacidad
        +String estado
    }
    class RecursoLab {
        +Long id
        +String tipo
        +String nombre
        +Integer numero
        +String qrCode
        +String estado
        +Integer capacidadPersonas
        +Boolean activo
    }
    class Reserva {
        +Long id
        +LocalDate fecha
        +LocalTime horaInicio
        +LocalTime horaFin
        +Integer participantes
        +String estado
        +String carrera
        +Long version
    }
    class ReservaParticipante {
        +Long id
        +String correo
        +String nombreCompleto
        +String carrera
        +Boolean esTitular
    }
    class Bloqueo {
        +Long id
        +String tipo
        +String motivo
        +String descripcion
        +LocalDate fechaInicio
        +LocalDate fechaFin
        +LocalTime horaInicio
        +LocalTime horaFin
        +Boolean activo
        +Boolean esClase
        +String diaSemana
        +String frecuencia
    }
    class Aula {
        +Long id
        +String codigo
        +String nombre
        +String tipo
        +Integer capacidad
        +Boolean activo
    }
    class Curso {
        +Long id
        +String codCurso
        +String nombre
        +String area
    }
    class CicloAcademico {
        +Integer anio
        +Integer ciclo
        +LocalDate fechaInicio
        +LocalDate fechaFin
    }
    class CicloExcepcion {
        +String ciclo
        +LocalDate fechaInicio
        +LocalDate fechaFin
        +String tipo
    }
    class QrValidacion {
        +Long id
        +String resultado
        +LocalDateTime validadoEn
    }
    class AuditoriaReserva {
        +Long id
        +String accion
        +LocalDateTime fecha
    }

    Usuario "*" --> "1" Role : rol
    Role "*" --> "*" Permiso : permisos
    Facultad "1" --> "*" Departamento
    Facultad "1" --> "*" Carrera
    Departamento "1" --> "*" Laboratorio
    Laboratorio "1" --> "*" RecursoLab : recursos
    Laboratorio "*" --> "1" Usuario : director
    Laboratorio "*" --> "*" Usuario : responsables
    Reserva "*" --> "1" RecursoLab : recurso
    Reserva "*" --> "1" Usuario : usuario
    Reserva "1" --> "*" ReservaParticipante : participantes
    ReservaParticipante "*" --> "1" Usuario : usuario
    Bloqueo "*" --> "0..1" Laboratorio : lab (o aula)
    Bloqueo "*" --> "0..1" Aula : aula (o lab)
    Bloqueo "*" --> "*" RecursoLab : bloqueo_recursos (parcial)
    Bloqueo "*" --> "0..1" Curso : clase (es_clase)
    CicloAcademico "1" --> "*" CicloExcepcion : excepciones
    QrValidacion "*" --> "1" Reserva
    AuditoriaReserva "*" --> "1" Reserva
```

> **Espacio del bloqueo:** un `Bloqueo` recae en un **laboratorio** *o* en un **aula** (constraint `chk_bloqueo_espacio` = exactamente uno). Una **clase** del horario académico es un `Bloqueo` recurrente (`esClase=true`, `diaSemana`, `frecuencia` SEMANA_A/B/GENERAL, opcionalmente ligado a un `Curso`).

## 8.2 Capa de servicios (arquitectura por capas)
```mermaid
classDiagram
    class ReservaController
    class ReservaService {
        +crear(req, correo)
        +cancelar(id, correo)
        +reactivar(id, correo)
        +editar(id, req, correo)
        +listarMisReservas(correo)
        +buscarMisReservas(correo, q, labId, page, size)
        +listarPorRecursoYFecha()
        -enriquecer(reservas, usuarioId)
        -validarFecha()
        -validarDiaAtencion()
        -validarParticipantes()
    }
    class ReservaRepository
    class CalendarioAccessGuard {
        +asegurarAccesoCalendario(labId, correo)
    }
    class BloqueoService {
        +crear(req)
        +editar()
        +eliminar()
        +listarTodosActivos(correo)
        +listarPorAula(aulaId)
        -crearAula(req, correo)
        -asegurarAccesoAlLab(labId, usuario)
        -asegurarAccesoAlAula(usuario)
        -labIdsDeUsuario(usuario)
    }
    class AulaService {
        +listar(tipo)
        +crear()
        +actualizar()
        +desactivar()
        +buscarClases(ciclo, aula, lab, area, q)
        +laboratoriosConOcupacion(ciclo)
        +buscarLibres()
        +ocupacionDia()
    }
    class HorarioImportService {
        +importar(archivo, correo)
    }
    class CicloService {
        +listar()
        +crearAnio(anio)
        +actualizar(id, req)
        +agregarExcepcion()
        +eliminarExcepcion()
    }
    class QrCheckinService {
        +checkin()
        +checkinPorQr()
        +checkinManual()
    }
    class LaboratorioService {
        +crear()
        +editar()
        +asignarDirector()
        +asignarResponsable()
        +asegurarAccesoAlLab()
    }
    class EmailService {
        +enviarReservaConfirmada()
        +enviarBloqueo()
    }
    class ReservaScheduler {
        +procesarNoShow()
        +completarVencidas()
    }
    ReservaController --> ReservaService
    ReservaController --> CalendarioAccessGuard
    BloqueoController --> CalendarioAccessGuard
    ReservaService --> ReservaRepository
    ReservaService --> EmailService
    BloqueoService --> EmailService
    QrCheckinService --> ReservaRepository
    LaboratorioService --> ReservaRepository
    ReservaScheduler --> ReservaService
    AulaService --> BloqueoRepository
    HorarioImportService --> BloqueoRepository
    CicloService --> CicloRepository
```

> **Módulo de aulas/horario:** `AulaService` consulta clases y ocupación (las clases son bloqueos `es_clase=true`); `HorarioImportService` carga el Excel de horarios; `CicloService` gestiona el calendario académico (`ciclos_academicos` + excepciones). El bloqueo de **aulas** se crea con `BloqueoService.crearAula` (siempre TOTAL, solo ADMIN/COORDINADOR/DOCENCIA).

> **Patrón:** controller → service → repository; DTOs para entrada/salida (no se exponen entidades). La regla de **auto-cascada** responsable→director→departamento vive en `LaboratorioService`. La validación de **propiedad** (anti-IDOR) vive en `ReservaService.cancelar/editar`; `reactivar` revierte una cancelación solo para roles de gestión y solo el mismo día.
>
> **Escalabilidad (jul-2026):** `ReservaService.buscarMisReservas` es la versión **paginada** de Gestión de Reservas (page/size/q en el servidor; enriquece participantes/`esMia` solo de la página vía `enriquecer()`, compartido con `listarMisReservas`). `CalendarioAccessGuard.asegurarAccesoCalendario` acota los endpoints de calendario (`/reservas|/bloqueos/laboratorio/{id}`) por rol → 403 en labs ajenos para director/responsable.
>
> **Datos denormalizados (snapshot):** `reserva_participantes.nombre_completo`/`.carrera` y `reservas.carrera` son **copias congeladas** tomadas al reservar, no un join vivo a `Usuario`. Por eso `UsuarioService.actualizar`, cuando cambia `nombres`/`apellidos`/`carrera`, **propaga** el valor actual del perfil a todas esas filas (UPDATE nativo) para que la corrección se vea en Gestión de Reservas. El listado de gestión (`/reservas/mis-reservas`) adjunta `ReservaResponse.participantesLista` (DTO `ParticipanteResumen`) en una query batch; los endpoints de calendario la dejan `null` (no exponen la composición de la reserva).

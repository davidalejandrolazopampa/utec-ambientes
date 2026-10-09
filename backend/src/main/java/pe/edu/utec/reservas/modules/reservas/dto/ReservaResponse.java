package pe.edu.utec.reservas.modules.reservas.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReservaResponse {

    private Long id;
    private Long recursoId;
    private String recursoNombre;
    private String recursoQrCode;
    private String laboratorioNombre;
    private String laboratorioCodigo;
    private LocalDate fecha;
    private LocalTime horaInicio;
    private LocalTime horaFin;
    private String estado;
    private String tipoReserva;
    private Integer participantes;
    private String motivo;
    private String usuarioNombre;
    // usuarioCorreo se eliminó a propósito (PII): los endpoints de calendario
    // (/reservas/laboratorio, /reservas/recurso) devuelven este DTO a cualquier
    // autenticado. Para el detalle con correo está /analytics/tabla (Director+).
    private LocalDateTime createdAt;
    // Lista de participantes (nombre + carrera, SIN correo). Solo se llena en el
    // listado de gestión (/reservas/mis-reservas); en los endpoints de calendario
    // queda null para no exponer la composición de cada reserva a cualquiera.
    private List<ParticipanteResumen> participantesLista;
    // ¿El usuario que consulta es el TITULAR de la reserva? Solo se setea en
    // /reservas/mis-reservas. Un acompañante ve la reserva (esMia=false) pero de
    // SOLO LECTURA: el frontend le oculta Cancelar/Editar/Check-in (acciones del
    // titular o de un rol de gestión). Null en los endpoints de calendario.
    private Boolean esMia;
}
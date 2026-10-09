package pe.edu.utec.reservas.modules.reservas.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Resumen de un participante para la lista de "Gestión de Reservas".
 * Incluye el correo para poder pre-cargarlo en el modal de editar (y que no se
 * vea confuso). Solo se llena en el listado de gestión (/reservas/mis-reservas),
 * cuyo alcance es el dueño de la reserva o quien la gestiona (rol elevado); NUNCA
 * en los endpoints de calendario (/reservas/laboratorio, /reservas/recurso), que
 * son visibles para cualquier autenticado.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ParticipanteResumen {
    private String nombreCompleto;
    private String correo;
    private String carrera;
    private boolean esTitular;
}

package pe.edu.utec.reservas.modules.laboratorios.dto;

import jakarta.validation.constraints.*;
import lombok.Data;

import java.time.LocalTime;
import java.util.List;

@Data
public class CreateLaboratorioRequest {

    @NotBlank(message = "El código del laboratorio es obligatorio")
    @Size(max = 10, message = "El código no puede exceder 10 caracteres")
    private String codigoLab;

    @NotBlank(message = "El nombre es obligatorio")
    @Size(max = 200, message = "El nombre no puede exceder 200 caracteres")
    private String nombre;

    private Long departamentoId;
    private Long carreraId;

    @NotNull(message = "El piso es obligatorio")
    @Min(value = -2, message = "Piso mínimo: Sótano 2")
    @Max(value = 11, message = "Piso máximo: 11")
    private Integer piso;

    @NotBlank(message = "La fase es obligatoria")
    private String ubicacionFase;

    private String resena;

    private List<String> diasAtencion;

    @NotNull(message = "La hora de apertura es obligatoria")
    private LocalTime horaApertura;

    @NotNull(message = "La hora de cierre es obligatoria")
    private LocalTime horaCierre;

    @NotBlank(message = "El tipo de aforo es obligatorio")
    private String aforoTipo; // MESA, PC, ESTACION

    @NotNull(message = "La cantidad de recursos es obligatoria")
    @Min(value = 0, message = "Mínimo 0 recursos")
    private Integer aforoCantidad;

    @NotNull(message = "La capacidad por recurso es obligatoria")
    @Min(value = 1, message = "Mínimo 1 persona por recurso")
    private Integer aforoCapacidad;

    private Long directorId;

    private List<Long> responsablesIds;

    // Grupos de recursos reservables (mesas, PCs, mezclados). Si viene no vacío, se generan
    // estos; si no, se cae al aforo* legacy (un solo tipo). aforoTipo/Cantidad/Capacidad siguen
    // poblando el "aforo principal" del lab (para la tarjeta).
    private List<RecursoGrupoRequest> recursos;

    // Equipos especializados reservables
    private List<EquipoRequest> equiposEspecializados;

    // Servicios que ofrece el lab (nombre + enlace externo opcional).
    private List<ServicioRequest> servicios;

    @Data
    public static class ServicioRequest {
        private String nombre;
        private String url;
        private String descripcion;
    }

    @Data
    public static class RecursoGrupoRequest {
        private String tipo; // MESA, PC
        @Min(value = 0, message = "Mínimo 0") private Integer cantidad = 0;
        @Min(value = 1, message = "Mínimo 1 persona") private Integer capacidadPersonas = 1;
    }

    @Data
    public static class EquipoRequest {
        @NotBlank(message = "El nombre del equipo es obligatorio")
        private String nombre;

        private String tipo; // Maquinaria, Impresora 3D, Infraestructura, etc.

        @Min(value = 1, message = "Mínimo 1 unidad")
        private Integer cantidad = 1;

        @Min(value = 1, message = "Mínimo 1 persona")
        private Integer capacidadPersonas = 1;
    }
}
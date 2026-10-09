package pe.edu.utec.reservas.modules.laboratorios.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LaboratorioResponse {
    private Long id;
    private String codigoLab;
    private String nombre;
    private Integer piso;
    private String ubicacionFase;
    private String resena;
    private List<String> diasAtencion;
    private LocalTime horaApertura;
    private LocalTime horaCierre;
    private String aforoTipo;
    private Integer aforoCantidad;
    private Integer aforoCapacidad;
    private String estado;
    private String directorNombre;
    private Long directorId;
    private String directorCorreo;
    private String directorCargo;
    private List<String> responsables;
    private List<PersonaResumen> responsablesInfo;
    private Integer totalRecursos;
    private Integer recursosDisponibles;       // recursos con estado DISPONIBLE AHORA mismo
    private Integer recursosDisponiblesHoy;    // recursos con ≥1 hueco libre HOY (descuenta reservas activas y bloqueos)
    private Long departamentoId;
    private Long carreraId;
    private String departamentoNombre;
    private String facultadNombre;
    private String carreraNombre;

    // Servicios que ofrece el lab (p. ej. "Impresiones 3D" con su enlace externo).
    private List<ServicioResumen> servicios;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ServicioResumen {
        private String nombre;
        private String url;
        private String descripcion;
    }
}
package pe.edu.utec.reservas.modules.sanciones.dto;

import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;

@Getter @Builder
public class SancionResponse {
    private Long id;
    private Long usuarioId;
    private String usuarioNombre;
    private Long laboratorioId;      // null = todos los labs
    private String laboratorioCodigo; // null = "Todos los laboratorios"
    private String motivo;
    private LocalDate fechaInicio;
    private LocalDate fechaFin;      // null = indefinida
    private String creadoPor;
    private Boolean activo;
    private Boolean vigente;         // activa y cubre HOY
}

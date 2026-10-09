package pe.edu.utec.reservas.modules.sanciones.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Sanción/castigo a un alumno que le impide RESERVAR (no el login: sigue consultando).
 * laboratorioId NULL = veta todos los labs; con id = solo ese lab.
 * fechaFin NULL = indefinida (hasta que un admin la levante); con fecha se levanta sola al vencer.
 * activo = permite "levantar" conservando el historial.
 */
@Entity @Table(name = "sanciones")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Sancion {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "usuario_id", nullable = false) private Long usuarioId;
    @Column(name = "laboratorio_id") private Long laboratorioId;
    @Column(nullable = false, length = 400) private String motivo;
    @Column(name = "fecha_inicio", nullable = false) private LocalDate fechaInicio;
    @Column(name = "fecha_fin") private LocalDate fechaFin;
    @Column(name = "creado_por", nullable = false, length = 100) private String creadoPor;
    @Builder.Default private Boolean activo = true;
    @Column(name = "created_at", updatable = false) private LocalDateTime createdAt;
    @PrePersist protected void onCreate() { createdAt = LocalDateTime.now(); }
}

package pe.edu.utec.reservas.modules.reservas.model;
import jakarta.persistence.*;
import lombok.*;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.laboratorios.model.RecursoLab;
import java.time.*;
@Entity @Table(name = "reservas")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Reserva {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "recurso_id", nullable = false) private RecursoLab recurso;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "usuario_id", nullable = false) private Usuario usuario;
    @Column(nullable = false) private LocalDate fecha;
    @Column(name = "hora_inicio", nullable = false) private LocalTime horaInicio;
    @Column(name = "hora_fin", nullable = false) private LocalTime horaFin;
    @Column(nullable = false, length = 20) @Builder.Default private String estado = "PENDIENTE";
    @Column(name = "tipo_reserva", nullable = false, length = 20) @Builder.Default private String tipoReserva = "ALUMNO";
    @Column(nullable = false) @Builder.Default private Integer participantes = 1;
    @Column(columnDefinition = "TEXT") private String motivo;
    @Column(length = 150) private String carrera;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "creado_por", nullable = false) private Usuario creadoPor;
    @Version @Column(nullable = false) @Builder.Default private Integer version = 0;
    @Column(name = "created_at", updatable = false) private LocalDateTime createdAt;
    @Column(name = "updated_at") private LocalDateTime updatedAt;
    @PrePersist protected void onCreate() { createdAt = updatedAt = LocalDateTime.now(); }
    @PreUpdate protected void onUpdate() { updatedAt = LocalDateTime.now(); }
}

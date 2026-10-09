package pe.edu.utec.reservas.modules.laboratorios.model;
import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
@Entity @Table(name = "recursos_lab")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class RecursoLab {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "laboratorio_id", nullable = false) private Laboratorio laboratorio;
    @Column(nullable = false, length = 20) private String tipo;
    @Column(nullable = false, length = 100) private String nombre;
    @Column(nullable = false) private Integer numero;
    @Column(name = "qr_code", nullable = false, unique = true, length = 255) private String qrCode;
    @Column(nullable = false, length = 20) @Builder.Default private String estado = "DISPONIBLE";
    @Column(name = "capacidad_personas", nullable = false) @Builder.Default private Integer capacidadPersonas = 1;
    @Builder.Default private Boolean activo = true;
    @Column(name = "created_at", updatable = false) private LocalDateTime createdAt;
    @Column(name = "updated_at") private LocalDateTime updatedAt;
    @PrePersist protected void onCreate() { createdAt = updatedAt = LocalDateTime.now(); }
    @PreUpdate protected void onUpdate() { updatedAt = LocalDateTime.now(); }
}

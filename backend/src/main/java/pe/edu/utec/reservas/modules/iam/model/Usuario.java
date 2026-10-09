package pe.edu.utec.reservas.modules.iam.model;
import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
@Entity @Table(name = "usuarios")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Usuario {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "correo_utec", nullable = false, unique = true, length = 100) private String correoUtec;
    @Column(nullable = false, length = 100) private String nombres;
    @Column(nullable = false, length = 100) private String apellidos;
    @ManyToOne(fetch = FetchType.EAGER) @JoinColumn(name = "rol_id", nullable = false) private Role rol;
    @Column(length = 150) private String cargo;
    @Column(length = 150) private String carrera;
    @Column(name = "departamento_id") private Long departamentoId;
    @Column(name = "avatar_url", length = 500) private String avatarUrl;
    @Builder.Default private Boolean activo = true;
    @Column(name = "last_login") private LocalDateTime lastLogin;
    @Column(name = "created_at", updatable = false) private LocalDateTime createdAt;
    @Column(name = "updated_at") private LocalDateTime updatedAt;
    @PrePersist protected void onCreate() { createdAt = updatedAt = LocalDateTime.now(); }
    @PreUpdate protected void onUpdate() { updatedAt = LocalDateTime.now(); }
    @Transient public String getNombreCompleto() { return nombres + " " + apellidos; }
}

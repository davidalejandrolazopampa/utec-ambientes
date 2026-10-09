package pe.edu.utec.reservas.modules.laboratorios.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

/** Servicio que ofrece un laboratorio (nombre + enlace externo). Uno por fila, por lab. */
@Entity @Table(name = "laboratorio_servicios")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class LaboratorioServicio {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "laboratorio_id", nullable = false) private Long laboratorioId;
    @Column(nullable = false, length = 120) private String nombre;
    @Column(length = 500) private String url;
    @Column(length = 400) private String descripcion;
    @Column(name = "created_at", updatable = false) private LocalDateTime createdAt;
    @PrePersist protected void onCreate() { createdAt = LocalDateTime.now(); }
}

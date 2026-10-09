package pe.edu.utec.reservas.modules.aulas.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Espacio NO laboratorio donde se dictan clases o se hacen reservas: aula (A/M), auditorio,
 * aula magna, sala de estudio/SUM, estudio de grabación, losa deportiva… Los laboratorios
 * siguen en su propia entidad {@code Laboratorio}. El {@code tipo} clasifica el ambiente.
 */
@Entity
@Table(name = "aulas")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Aula {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 30)
    private String codigo;

    @Column(length = 120)
    private String nombre;

    /** AULA, AULA_MIXTA, AULA_POSGRADO, AUDITORIO, AULA_MAGNA, ESTUDIO_GRABACION, SALA_ESTUDIO_SUM, LOSA_DEPORTIVA */
    @Column(nullable = false, length = 30)
    private String tipo;

    private Integer capacidad;

    private Integer piso;

    @Builder.Default
    private Boolean activo = true;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() { createdAt = updatedAt = LocalDateTime.now(); }

    @PreUpdate
    protected void onUpdate() { updatedAt = LocalDateTime.now(); }
}

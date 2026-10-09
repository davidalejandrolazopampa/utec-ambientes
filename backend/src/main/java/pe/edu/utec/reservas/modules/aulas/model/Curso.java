package pe.edu.utec.reservas.modules.aulas.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Curso del horario académico. La carrera/área se deriva del prefijo del código
 * ({@code area}, p. ej. CC, AD, ME) y opcionalmente se mapea a una carrera concreta.
 */
@Entity
@Table(name = "cursos")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Curso {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "cod_curso", nullable = false, unique = true, length = 20)
    private String codCurso;

    @Column(nullable = false, length = 200)
    private String nombre;

    /** Prefijo del código del curso (CC, AD, ME…) para agrupar por área/carrera. */
    @Column(length = 10)
    private String area;

    @Column(name = "carrera_id")
    private Long carreraId;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() { createdAt = LocalDateTime.now(); }
}

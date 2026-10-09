package pe.edu.utec.reservas.modules.aulas.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** Rango de fechas sin clases regulares dentro de un ciclo: exámenes o feriados. */
@Entity
@Table(name = "ciclo_excepciones")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CicloExcepcion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 10)
    private String ciclo;

    @Column(name = "fecha_inicio", nullable = false)
    private LocalDate fechaInicio;

    @Column(name = "fecha_fin", nullable = false)
    private LocalDate fechaFin;

    /** EXAMEN, FERIADO, OTRO */
    @Column(nullable = false, length = 20)
    private String tipo;

    @Column(length = 120)
    private String descripcion;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() { createdAt = LocalDateTime.now(); }
}

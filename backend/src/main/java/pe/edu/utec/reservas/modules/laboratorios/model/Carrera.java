package pe.edu.utec.reservas.modules.laboratorios.model;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "carreras")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Carrera {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 150)
    private String nombre;

    @Column(name = "facultad_id", nullable = false)
    private Long facultadId;

    @Column(name = "departamento_id")
    private Long departamentoId;

    @Builder.Default
    private Boolean activo = true;
}
package pe.edu.utec.reservas.modules.laboratorios.model;
import jakarta.persistence.*;
import lombok.*;
@Entity
@Table(name = "departamentos")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Departamento {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable = false, unique = true, length = 200)
    private String nombre;
    @Column(name = "facultad_id")
    private Long facultadId;
    @Column(name = "director_id")
    private Long directorId;
    @Builder.Default
    private Boolean activo = true;
}
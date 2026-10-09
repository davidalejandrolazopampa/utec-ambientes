package pe.edu.utec.reservas.modules.laboratorios.model;
import jakarta.persistence.*;
import lombok.*;
@Entity
@Table(name = "facultades")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Facultad {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable = false, unique = true, length = 150)
    private String nombre;
    @Column(name = "decano_id")
    private Long decanoId;
    // FACULTAD (su líder es decano/a) o DIRECCION (área administrativa; su líder es director/a).
    @Builder.Default
    @Column(length = 20, nullable = false)
    private String tipo = "FACULTAD";
    @Builder.Default
    private Boolean activo = true;
}
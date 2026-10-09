package pe.edu.utec.reservas.modules.reservas.model;

import jakarta.persistence.*;
import lombok.*;
import pe.edu.utec.reservas.modules.iam.model.Usuario;

@Entity
@Table(name = "reserva_participantes")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ReservaParticipante {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "reserva_id", nullable = false) private Reserva reserva;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "usuario_id") private Usuario usuario;
    @Column(name = "correo_utec", nullable = false, length = 100) private String correo;
    @Column(name = "nombre_completo", nullable = false, length = 200) private String nombreCompleto;
    @Column(length = 150) private String carrera;
    @Column(name = "es_titular", nullable = false) @Builder.Default private Boolean esTitular = false;
}

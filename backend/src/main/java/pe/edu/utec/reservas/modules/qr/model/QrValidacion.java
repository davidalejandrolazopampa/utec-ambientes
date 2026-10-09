package pe.edu.utec.reservas.modules.qr.model;

import jakarta.persistence.*;
import lombok.*;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.laboratorios.model.RecursoLab;
import pe.edu.utec.reservas.modules.reservas.model.Reserva;

import java.time.LocalDateTime;

@Entity
@Table(name = "qr_validaciones")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class QrValidacion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reserva_id", nullable = false)
    private Reserva reserva;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recurso_id", nullable = false)
    private RecursoLab recurso;

    @Column(name = "qr_escaneado", nullable = false, length = 255)
    private String qrEscaneado;

    @Column(nullable = false, length = 30)
    private String resultado;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "validado_por")
    private Usuario validadoPor;

    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    @Column(name = "validado_en", nullable = false)
    @Builder.Default
    private LocalDateTime validadoEn = LocalDateTime.now();
}
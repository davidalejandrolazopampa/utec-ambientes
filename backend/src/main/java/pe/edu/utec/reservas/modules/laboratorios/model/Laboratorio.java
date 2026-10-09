package pe.edu.utec.reservas.modules.laboratorios.model;

import io.hypersistence.utils.hibernate.type.json.JsonType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Type;
import pe.edu.utec.reservas.modules.iam.model.Usuario;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;

@Entity
@Table(name = "laboratorios")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Laboratorio {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "codigo_lab", nullable = false, unique = true, length = 10)
    private String codigoLab;

    @Column(nullable = false, length = 200)
    private String nombre;

    @Column(name = "departamento_id")
    private Long departamentoId;

    @Column(name = "carrera_id")
    private Long carreraId;

    @Column(nullable = false)
    private Integer piso;

    @Column(name = "ubicacion_fase", nullable = false, length = 20)
    private String ubicacionFase;

    @Column(columnDefinition = "TEXT")
    private String resena;

    @Type(JsonType.class)
    @Column(name = "dias_atencion", columnDefinition = "jsonb")
    private List<String> diasAtencion;

    @Column(name = "hora_apertura", nullable = false)
    private LocalTime horaApertura;

    @Column(name = "hora_cierre", nullable = false)
    private LocalTime horaCierre;

    @Column(name = "aforo_tipo", nullable = false, length = 20)
    private String aforoTipo;

    @Column(name = "aforo_cantidad", nullable = false)
    private Integer aforoCantidad;

    @Column(name = "aforo_capacidad", nullable = false)
    private Integer aforoCapacidad;

    @Column(nullable = false, length = 20)
    @Builder.Default
    private String estado = "ACTIVO";

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "director_id")
    private Usuario director;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(name = "lab_responsables", joinColumns = @JoinColumn(name = "laboratorio_id"), inverseJoinColumns = @JoinColumn(name = "usuario_id"))
    @Builder.Default
    private Set<Usuario> responsables = new HashSet<>();

    @OneToMany(mappedBy = "laboratorio", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private Set<RecursoLab> recursos = new HashSet<>();

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist protected void onCreate() { createdAt = updatedAt = LocalDateTime.now(); }
    @PreUpdate protected void onUpdate() { updatedAt = LocalDateTime.now(); }
}
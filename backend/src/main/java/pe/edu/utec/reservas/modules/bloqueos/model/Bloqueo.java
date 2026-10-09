package pe.edu.utec.reservas.modules.bloqueos.model;

import jakarta.persistence.*;
import lombok.*;
import pe.edu.utec.reservas.modules.aulas.model.Aula;
import pe.edu.utec.reservas.modules.aulas.model.Curso;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.laboratorios.model.Laboratorio;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Entity
@Table(name = "bloqueos")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Bloqueo {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Espacio del bloqueo: un lab O un aula (uno de los dos; ver constraint chk_bloqueo_espacio).
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "laboratorio_id")
    private Laboratorio laboratorio;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "aula_id")
    private Aula aula;

    @Column(nullable = false, length = 20)
    private String tipo; // PARCIAL, TOTAL

    @Column(nullable = false, length = 30)
    private String motivo; // CLASE, ASESORIA, REUNION, EXAMEN, EVENTO, MANTENIMIENTO

    @Column(columnDefinition = "TEXT")
    private String descripcion;

    @Column(name = "responsable_nombre")
    private String responsableNombre;

    @Column(name = "responsable_correo")
    private String responsableCorreo;

    @Column(name = "fecha_inicio", nullable = false)
    private LocalDate fechaInicio;

    @Column(name = "fecha_fin", nullable = false)
    private LocalDate fechaFin;

    @Column(name = "hora_inicio")
    private LocalTime horaInicio;

    @Column(name = "hora_fin")
    private LocalTime horaFin;

    @Builder.Default
    private Boolean activo = true;

    // ── Campos de CLASE (bloqueo recurrente del horario académico) ──
    /** true si el bloqueo es una clase recurrente del horario (motivo CLASE). */
    @Builder.Default
    @Column(name = "es_clase", nullable = false)
    private Boolean esClase = false;

    /** Día de la semana en que se repite la clase (LUNES..DOMINGO). NULL = bloqueo por fecha, no recurrente. */
    @Column(name = "dia_semana", length = 12)
    private String diaSemana;

    /** Ciclo académico al que pertenece la clase (p. ej. 2026-1). */
    @Column(length = 10)
    private String ciclo;

    /** Frecuencia de la clase: SEMANA_GENERAL (todas), SEMANA_A / SEMANA_B (quincenal, semanas alternas). */
    @Column(length = 20)
    private String frecuencia;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "curso_id")
    private Curso curso;

    @Column(length = 40)
    private String seccion;

    @Column(length = 20)
    private String grupo;

    /** TEORICO, LABORATORIO, PRACTICO */
    @Column(name = "tipo_sesion", length = 30)
    private String tipoSesion;

    /** PRESENCIAL, VIRTUAL, SINCRONICO */
    @Column(length = 20)
    private String modalidad;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "creado_por", nullable = false)
    private Usuario creadoPor;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() { createdAt = updatedAt = LocalDateTime.now(); }

    @PreUpdate
    protected void onUpdate() { updatedAt = LocalDateTime.now(); }
}
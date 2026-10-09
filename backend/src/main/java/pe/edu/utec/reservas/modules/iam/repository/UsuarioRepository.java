package pe.edu.utec.reservas.modules.iam.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pe.edu.utec.reservas.modules.iam.model.Usuario;

import java.util.List;
import java.util.Optional;

public interface UsuarioRepository extends JpaRepository<Usuario, Long> {
    Optional<Usuario> findByCorreoUtec(String correoUtec);
    boolean existsByCorreoUtec(String correoUtec);

    // Filtra por rol a nivel de BD (no carga toda la tabla de usuarios para luego filtrar en memoria).
    List<Usuario> findByRol_Nombre(String nombre);

    // Todos los ADMINISTRATIVOS (cualquier rol menos ESTUDIANTE) — lista pequeña, se carga entera
    // para resolver decano/director/responsable sin traer los ~miles de alumnos.
    List<Usuario> findByRol_NombreNot(String nombre);

    // Administrativos de un subconjunto de roles (alcance por rol del directorio de Personas).
    List<Usuario> findByRol_NombreIn(java.util.Collection<String> nombres);

    // Búsqueda PAGINADA con filtros (evita traer 9500 alumnos de golpe). rol/activo/q opcionales.
    // ⚠️ Postgres (con stringtype=unspecified) no infiere el tipo de un parámetro null suelto:
    // los `:param IS NULL` y el `:patron` del LIKE van con CAST(...) (gotcha de la documentación técnica). El
    // patrón `%q%` se arma en el servicio (ya en minúsculas) para no meter :q en un CONCAT.
    @Query("SELECT u FROM Usuario u WHERE "
            + "(CAST(:rol AS string) IS NULL OR u.rol.nombre = :rol) "
            + "AND (CAST(:activo AS boolean) IS NULL OR u.activo = :activo) "
            + "AND (CAST(:patron AS string) IS NULL "
            + "     OR LOWER(u.nombres) LIKE CAST(:patron AS string) "
            + "     OR LOWER(u.apellidos) LIKE CAST(:patron AS string) "
            + "     OR LOWER(u.correoUtec) LIKE CAST(:patron AS string))")
    Page<Usuario> buscar(String patron, String rol, Boolean activo, Pageable pageable);

    // Conteo por rol (para los chips del encabezado sin cargar todos los usuarios). → (rol, cantidad).
    @Query("SELECT u.rol.nombre, COUNT(u) FROM Usuario u GROUP BY u.rol.nombre")
    List<Object[]> contarPorRol();

    @Query(value = "SELECT responsable_id FROM director_responsables WHERE director_id = :directorId", nativeQuery = true)
    List<Long> findResponsableIdsByDirectorId(Long directorId);

    // Director de un responsable (cascada inversa responsable → director).
    @Query(value = "SELECT director_id FROM director_responsables WHERE responsable_id = :responsableId LIMIT 1", nativeQuery = true)
    Optional<Long> findDirectorIdByResponsableId(Long responsableId);

    // Directores de una facultad: los que dirigen un departamento de esa facultad.
    @Query(value = "SELECT DISTINCT u.* FROM usuarios u "
            + "JOIN departamentos d ON d.director_id = u.id "
            + "WHERE d.facultad_id = :facultadId", nativeQuery = true)
    List<Usuario> findDirectoresByFacultadId(Long facultadId);

    // Desvincula (departamento_id → null) a los usuarios de un departamento antes de borrarlo.
    @Modifying
    @Query("UPDATE Usuario u SET u.departamentoId = null WHERE u.departamentoId = :departamentoId")
    int desvincularDepartamento(@Param("departamentoId") Long departamentoId);
}
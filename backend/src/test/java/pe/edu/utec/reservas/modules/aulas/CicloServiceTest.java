package pe.edu.utec.reservas.modules.aulas;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.utec.reservas.modules.aulas.dto.CicloResponse;
import pe.edu.utec.reservas.modules.aulas.dto.UpdateCicloRequest;
import pe.edu.utec.reservas.modules.aulas.service.CicloService;
import pe.edu.utec.reservas.shared.exceptions.BusinessException;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class CicloServiceTest {

    @Autowired private CicloService cicloService;

    @Test
    @DisplayName("Agregar un año crea los ciclos 0/1/2; editar cambia las fechas; validaciones")
    void crudCiclos() {
        List<CicloResponse> creados = cicloService.crearAnio(2099);
        List<CicloResponse> del2099 = creados.stream().filter(c -> c.getAnio() == 2099).toList();
        assertEquals(3, del2099.size());
        assertEquals(List.of(0, 1, 2), del2099.stream().map(CicloResponse::getCiclo).sorted().toList());
        assertEquals("2099-1", del2099.stream().filter(c -> c.getCiclo() == 1).findFirst().orElseThrow().getCodigo());

        // Año duplicado → error
        assertThrows(BusinessException.class, () -> cicloService.crearAnio(2099));

        // Editar fechas de un ciclo
        CicloResponse c1 = del2099.stream().filter(c -> c.getCiclo() == 1).findFirst().orElseThrow();
        var req = new UpdateCicloRequest();
        req.setFechaInicio(LocalDate.of(2099, 3, 30));
        req.setFechaFin(LocalDate.of(2099, 7, 10));
        CicloResponse editado = cicloService.actualizar(c1.getId(), req);
        assertEquals(LocalDate.of(2099, 3, 30), editado.getFechaInicio());

        // Fechas invertidas → error
        var mala = new UpdateCicloRequest();
        mala.setFechaInicio(LocalDate.of(2099, 7, 1));
        mala.setFechaFin(LocalDate.of(2099, 3, 1));
        assertThrows(BusinessException.class, () -> cicloService.actualizar(c1.getId(), mala));
    }

    @Test
    @DisplayName("Agregar/eliminar excepciones (exámenes/feriados) + listar")
    void excepciones() {
        cicloService.crearAnio(2098);

        // Agregar una excepción de examen al ciclo 2098-1
        CicloResponse conExc = cicloService.agregarExcepcion("2098-1",
                LocalDate.of(2098, 5, 10), LocalDate.of(2098, 5, 15), "EXAMEN", "Parciales");
        assertFalse(conExc.getExcepciones().isEmpty());
        Long excId = conExc.getExcepciones().get(0).getId();

        // listar incluye el ciclo con su código
        assertTrue(cicloService.listar().stream().anyMatch(c -> "2098-1".equals(c.getCodigo())));

        // Eliminar la excepción no lanza
        assertDoesNotThrow(() -> cicloService.eliminarExcepcion(excId));

        // Fechas invertidas → error
        assertThrows(BusinessException.class, () -> cicloService.agregarExcepcion(
                "2098-1", LocalDate.of(2098, 5, 15), LocalDate.of(2098, 5, 10), "FERIADO", "X"));
        // Tipo inválido → error
        assertThrows(BusinessException.class, () -> cicloService.agregarExcepcion(
                "2098-1", LocalDate.of(2098, 6, 1), LocalDate.of(2098, 6, 2), "NOEXISTE", "X"));
    }

    @Autowired private pe.edu.utec.reservas.modules.iam.repository.RoleRepository roleRepository;
    @Autowired private pe.edu.utec.reservas.modules.iam.repository.UsuarioRepository usuarioRepository;
    @Autowired private pe.edu.utec.reservas.modules.laboratorios.repository.LaboratorioRepository laboratorioRepository;
    @Autowired private pe.edu.utec.reservas.modules.bloqueos.repository.BloqueoRepository bloqueoRepository;

    @Test
    @DisplayName("crearAnio DERIVA las excepciones FERIADO desde los feriados operativos del año (auto-V9)")
    void crearAnio_derivaFeriadosOperativos() {
        // Feriado OPERATIVO (bloqueo por-lab motivo FERIADO) el 1-may-2097 → cae en el ciclo 2097-1.
        var admin = usuarioRepository.save(pe.edu.utec.reservas.modules.iam.model.Usuario.builder()
                .correoUtec("ciclo-fer@utec.edu.pe").nombres("Ci").apellidos("Fer")
                .rol(roleRepository.findByNombre("ADMIN").orElseThrow()).activo(true).build());
        var lab = laboratorioRepository.save(pe.edu.utec.reservas.modules.laboratorios.model.Laboratorio.builder()
                .codigoLab("LFER").nombre("Lab Feriado").piso(1).ubicacionFase("F1")
                .horaApertura(java.time.LocalTime.of(8, 0)).horaCierre(java.time.LocalTime.of(18, 0))
                .aforoTipo("MESA").aforoCantidad(1).aforoCapacidad(4).estado("ACTIVO")
                .diasAtencion(List.of("Lunes")).build());
        bloqueoRepository.save(pe.edu.utec.reservas.modules.bloqueos.model.Bloqueo.builder()
                .laboratorio(lab).tipo("TOTAL").motivo("FERIADO").descripcion("Día del Trabajo")
                .esClase(false).fechaInicio(LocalDate.of(2097, 5, 1)).fechaFin(LocalDate.of(2097, 5, 1))
                .activo(true).creadoPor(admin).build());

        // Al crear el año, el ciclo 2097-1 nace con la excepción FERIADO derivada (sin migración manual).
        List<CicloResponse> creados = cicloService.crearAnio(2097);
        CicloResponse c1 = creados.stream().filter(c -> "2097-1".equals(c.getCodigo())).findFirst().orElseThrow();
        assertTrue(c1.getExcepciones().stream().anyMatch(e ->
                "FERIADO".equals(e.getTipo())
                && LocalDate.of(2097, 5, 1).equals(e.getFechaInicio())
                && "Día del Trabajo".equals(e.getDescripcion())));
    }
}

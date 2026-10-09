package pe.edu.utec.reservas.modules.sanciones;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.iam.repository.UsuarioRepository;
import pe.edu.utec.reservas.modules.laboratorios.model.Laboratorio;
import pe.edu.utec.reservas.modules.laboratorios.repository.LaboratorioRepository;
import pe.edu.utec.reservas.modules.sanciones.dto.CreateSancionRequest;
import pe.edu.utec.reservas.modules.sanciones.dto.SancionResponse;
import pe.edu.utec.reservas.modules.sanciones.model.Sancion;
import pe.edu.utec.reservas.modules.sanciones.repository.SancionRepository;
import pe.edu.utec.reservas.modules.sanciones.service.SancionService;
import pe.edu.utec.reservas.shared.exceptions.BusinessException;
import pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SancionServiceTest {

    @Mock private SancionRepository sancionRepository;
    @Mock private UsuarioRepository usuarioRepository;
    @Mock private LaboratorioRepository laboratorioRepository;
    @InjectMocks private SancionService service;

    private Usuario alumno() {
        return Usuario.builder().id(7L).correoUtec("a@utec.edu.pe").nombres("Ana").apellidos("Ruiz").build();
    }

    private CreateSancionRequest req(List<Long> labIds, String motivo, LocalDate ini, LocalDate fin) {
        CreateSancionRequest r = new CreateSancionRequest();
        r.setUsuarioId(7L);
        r.setLaboratorioIds(labIds);
        r.setMotivo(motivo);
        r.setFechaInicio(ini);
        r.setFechaFin(fin);
        return r;
    }

    private void stubSaveEchoing() {
        when(sancionRepository.save(any(Sancion.class))).thenAnswer(inv -> {
            Sancion s = inv.getArgument(0);
            if (s.getId() == null) s.setId(99L);
            return s;
        });
    }

    @Test
    void crear_global_sinLabs_creaUnaSancionParaTodos() {
        when(usuarioRepository.findById(7L)).thenReturn(Optional.of(alumno()));
        stubSaveEchoing();

        List<SancionResponse> res = service.crear(req(null, "  Reincidencia  ", null, null), "admin@utec.edu.pe");

        assertEquals(1, res.size());
        SancionResponse s = res.get(0);
        assertNull(s.getLaboratorioId());              // NULL = todos los labs
        assertNull(s.getLaboratorioCodigo());
        assertEquals("Reincidencia", s.getMotivo());   // trim aplicado
        assertEquals(LocalDate.now(), s.getFechaInicio()); // fechaInicio null → hoy
        assertTrue(s.getVigente());
        assertEquals("Ana Ruiz", s.getUsuarioNombre());
        verify(sancionRepository, times(1)).save(any(Sancion.class));
    }

    @Test
    void crear_conVariosLabs_creaUnaPorLab() {
        when(usuarioRepository.findById(7L)).thenReturn(Optional.of(alumno()));
        when(laboratorioRepository.existsById(anyLong())).thenReturn(true);
        when(laboratorioRepository.findById(1L))
                .thenReturn(Optional.of(Laboratorio.builder().id(1L).codigoLab("L101").build()));
        when(laboratorioRepository.findById(2L))
                .thenReturn(Optional.of(Laboratorio.builder().id(2L).codigoLab("L102").build()));
        stubSaveEchoing();

        List<SancionResponse> res = service.crear(
                req(List.of(1L, 2L), "No-show", LocalDate.now(), null), "admin@utec.edu.pe");

        assertEquals(2, res.size());
        assertEquals("L101", res.get(0).getLaboratorioCodigo());
        assertEquals("L102", res.get(1).getLaboratorioCodigo());
        verify(sancionRepository, times(2)).save(any(Sancion.class));
    }

    @Test
    void crear_labInexistente_lanza404() {
        when(usuarioRepository.findById(7L)).thenReturn(Optional.of(alumno()));
        when(laboratorioRepository.existsById(999L)).thenReturn(false);

        assertThrows(ResourceNotFoundException.class,
                () -> service.crear(req(List.of(999L), "x", null, null), "admin@utec.edu.pe"));
        verify(sancionRepository, never()).save(any());
    }

    @Test
    void crear_usuarioInexistente_lanza404() {
        when(usuarioRepository.findById(7L)).thenReturn(Optional.empty());
        assertThrows(ResourceNotFoundException.class,
                () -> service.crear(req(null, "x", null, null), "admin@utec.edu.pe"));
    }

    @Test
    void crear_motivoVacio_lanzaBusiness() {
        when(usuarioRepository.findById(7L)).thenReturn(Optional.of(alumno()));
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.crear(req(null, "   ", null, null), "admin@utec.edu.pe"));
        assertEquals("MISSING_REASON", ex.getErrorCode());
    }

    @Test
    void crear_finAntesDeInicio_lanzaBusiness() {
        when(usuarioRepository.findById(7L)).thenReturn(Optional.of(alumno()));
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.crear(req(null, "x", LocalDate.now(), LocalDate.now().minusDays(1)), "admin@utec.edu.pe"));
        assertEquals("INVALID_RANGE", ex.getErrorCode());
    }

    // ── Flag "vigente" (activa + cubre HOY) vía listarPorUsuario ──

    @Test
    void listarPorUsuario_calculaVigenteSegunEstadoYFechas() {
        LocalDate hoy = LocalDate.now();
        Sancion activaHoy = base().fechaInicio(hoy.minusDays(1)).fechaFin(null).activo(true).build();
        Sancion levantada = base().fechaInicio(hoy.minusDays(1)).fechaFin(null).activo(false).build();
        Sancion futura = base().fechaInicio(hoy.plusDays(2)).fechaFin(null).activo(true).build();
        Sancion vencida = base().fechaInicio(hoy.minusDays(5)).fechaFin(hoy.minusDays(1)).activo(true).build();
        when(sancionRepository.findByUsuarioIdOrderByActivoDescFechaInicioDesc(7L))
                .thenReturn(List.of(activaHoy, levantada, futura, vencida));
        when(usuarioRepository.findById(7L)).thenReturn(Optional.of(alumno()));

        List<SancionResponse> res = service.listarPorUsuario(7L);

        assertEquals(4, res.size());
        assertTrue(res.get(0).getVigente(), "activa y cubre hoy");
        assertFalse(res.get(1).getVigente(), "levantada");
        assertFalse(res.get(2).getVigente(), "aún no empieza");
        assertFalse(res.get(3).getVigente(), "ya venció");
    }

    @Test
    void listarActivas_mapea() {
        when(sancionRepository.findByActivoTrueOrderByFechaInicioDesc())
                .thenReturn(List.of(base().activo(true).build()));
        when(usuarioRepository.findById(7L)).thenReturn(Optional.of(alumno()));
        assertEquals(1, service.listarActivas().size());
    }

    @Test
    void misVigentes_devuelveSoloLasEnEfectoHoy() {
        LocalDate hoy = LocalDate.now();
        Sancion vigente = base().fechaInicio(hoy.minusDays(1)).activo(true).build();
        Sancion vencida = base().fechaInicio(hoy.minusDays(5)).fechaFin(hoy.minusDays(1)).activo(true).build();
        when(usuarioRepository.findByCorreoUtec("a@utec.edu.pe")).thenReturn(Optional.of(alumno()));
        when(sancionRepository.findByUsuarioIdOrderByActivoDescFechaInicioDesc(7L))
                .thenReturn(List.of(vigente, vencida));
        when(usuarioRepository.findById(7L)).thenReturn(Optional.of(alumno()));

        List<SancionResponse> res = service.misVigentes("a@utec.edu.pe");
        assertEquals(1, res.size());
        assertTrue(res.get(0).getVigente());
    }

    @Test
    void misVigentes_usuarioInexistente_lanza404() {
        when(usuarioRepository.findByCorreoUtec("no@utec.edu.pe")).thenReturn(Optional.empty());
        assertThrows(ResourceNotFoundException.class, () -> service.misVigentes("no@utec.edu.pe"));
    }

    @Test
    void levantar_desactivaYConservaHistorial() {
        Sancion s = base().activo(true).build();
        s.setId(3L);
        when(sancionRepository.findById(3L)).thenReturn(Optional.of(s));
        when(sancionRepository.save(any(Sancion.class))).thenAnswer(inv -> inv.getArgument(0));
        when(usuarioRepository.findById(7L)).thenReturn(Optional.of(alumno()));

        SancionResponse res = service.levantar(3L);
        assertFalse(res.getActivo());
        assertFalse(res.getVigente());
        verify(sancionRepository).save(s);
    }

    @Test
    void levantar_inexistente_lanza404() {
        when(sancionRepository.findById(404L)).thenReturn(Optional.empty());
        assertThrows(ResourceNotFoundException.class, () -> service.levantar(404L));
    }

    private Sancion.SancionBuilder base() {
        return Sancion.builder().usuarioId(7L).laboratorioId(null).motivo("m")
                .fechaInicio(LocalDate.now()).creadoPor("admin@utec.edu.pe");
    }
}

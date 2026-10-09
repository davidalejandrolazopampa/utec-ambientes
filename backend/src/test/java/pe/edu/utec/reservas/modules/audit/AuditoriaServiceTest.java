package pe.edu.utec.reservas.modules.audit;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import pe.edu.utec.reservas.modules.audit.model.AuditoriaReserva;
import pe.edu.utec.reservas.modules.audit.repository.AuditoriaRepository;
import pe.edu.utec.reservas.modules.audit.service.AuditoriaService;
import pe.edu.utec.reservas.modules.iam.model.Usuario;
import pe.edu.utec.reservas.modules.reservas.model.Reserva;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuditoriaServiceTest {

    @Mock private AuditoriaRepository auditoriaRepository;
    @InjectMocks private AuditoriaService service;

    private AuditoriaReserva sampleAudit() {
        Reserva reserva = Reserva.builder().build();
        reserva.setId(1L);
        Usuario usuario = Usuario.builder().correoUtec("u@utec.edu.pe").nombres("Leo").apellidos("Diaz").build();
        return AuditoriaReserva.builder()
                .reserva(reserva).usuario(usuario).accion("CREAR")
                .valoresAnteriores(Map.of()).valoresNuevos(Map.of("k", "v")).ipAddress("127.0.0.1")
                .build();
    }

    @Test
    void registrar_guarda() {
        Reserva reserva = Reserva.builder().build();
        reserva.setId(5L);
        Usuario usuario = Usuario.builder().correoUtec("u@utec.edu.pe").build();
        service.registrar(reserva, usuario, "EDITAR", Map.of(), Map.of(), "10.0.0.1");
        verify(auditoriaRepository).save(any(AuditoriaReserva.class));
    }

    @Test
    void listar_mapeaResponse() {
        Page<AuditoriaReserva> page = new PageImpl<>(List.of(sampleAudit()));
        when(auditoriaRepository.findAllByOrderByCreatedAtDesc(any(Pageable.class))).thenReturn(page);
        var r = service.listar(0, 20);
        assertEquals(1, r.getTotalElements());
        assertEquals("CREAR", r.getContent().get(0).getAccion());
        assertEquals("u@utec.edu.pe", r.getContent().get(0).getUsuarioCorreo());
    }

    @Test
    void historialReserva_mapea() {
        when(auditoriaRepository.findByReservaIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(sampleAudit()));
        var r = service.historialReserva(1L);
        assertEquals(1, r.size());
        assertEquals(1L, r.get(0).getReservaId());
    }

    @Test
    void historialUsuario_mapea() {
        when(auditoriaRepository.findByUsuarioIdOrderByCreatedAtDesc(2L)).thenReturn(List.of(sampleAudit()));
        var r = service.historialUsuario(2L);
        assertEquals(1, r.size());
    }
}

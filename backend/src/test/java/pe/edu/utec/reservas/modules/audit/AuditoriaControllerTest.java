package pe.edu.utec.reservas.modules.audit;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import pe.edu.utec.reservas.modules.audit.controller.AuditoriaController;
import pe.edu.utec.reservas.modules.audit.dto.AuditoriaResponse;
import pe.edu.utec.reservas.modules.audit.service.AuditoriaService;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuditoriaControllerTest {

    @Mock private AuditoriaService auditoriaService;
    @InjectMocks private AuditoriaController controller;

    @Test
    void listar() {
        Page<AuditoriaResponse> page = new PageImpl<>(List.of(new AuditoriaResponse()));
        when(auditoriaService.listar(0, 20)).thenReturn(page);
        var r = controller.listar(0, 20);
        assertEquals(1, r.getBody().getData().getTotalElements());
    }

    @Test
    void historialReserva() {
        when(auditoriaService.historialReserva(5L)).thenReturn(List.of(new AuditoriaResponse()));
        assertEquals(1, controller.historialReserva(5L).getBody().getData().size());
    }

    @Test
    void historialUsuario() {
        when(auditoriaService.historialUsuario(8L)).thenReturn(List.of());
        assertTrue(controller.historialUsuario(8L).getBody().getData().isEmpty());
    }
}

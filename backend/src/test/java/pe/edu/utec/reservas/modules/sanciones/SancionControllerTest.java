package pe.edu.utec.reservas.modules.sanciones;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.userdetails.UserDetails;
import pe.edu.utec.reservas.modules.sanciones.controller.SancionController;
import pe.edu.utec.reservas.modules.sanciones.dto.CreateSancionRequest;
import pe.edu.utec.reservas.modules.sanciones.dto.SancionResponse;
import pe.edu.utec.reservas.modules.sanciones.service.SancionService;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SancionControllerTest {

    @Mock private SancionService sancionService;
    @Mock private UserDetails userDetails;
    @InjectMocks private SancionController controller;

    private SancionResponse sample() {
        return SancionResponse.builder().id(1L).usuarioId(7L).motivo("m").activo(true).vigente(true).build();
    }

    @Test
    void crear_delegaConElUsuarioLogueado() {
        when(userDetails.getUsername()).thenReturn("admin@utec.edu.pe");
        CreateSancionRequest req = new CreateSancionRequest();
        when(sancionService.crear(req, "admin@utec.edu.pe")).thenReturn(List.of(sample()));

        var r = controller.crear(req, userDetails);
        assertEquals(1, r.getBody().getData().size());
        verify(sancionService).crear(req, "admin@utec.edu.pe");
    }

    @Test
    void porUsuario() {
        when(sancionService.listarPorUsuario(7L)).thenReturn(List.of(sample()));
        assertEquals(1, controller.porUsuario(7L).getBody().getData().size());
    }

    @Test
    void activas() {
        when(sancionService.listarActivas()).thenReturn(List.of(sample()));
        assertEquals(1, controller.activas().getBody().getData().size());
    }

    @Test
    void mias_usaElCorreoDelPrincipal() {
        when(userDetails.getUsername()).thenReturn("a@utec.edu.pe");
        when(sancionService.misVigentes("a@utec.edu.pe")).thenReturn(List.of(sample()));
        assertEquals(1, controller.mias(userDetails).getBody().getData().size());
    }

    @Test
    void levantar() {
        when(sancionService.levantar(5L)).thenReturn(sample());
        var r = controller.levantar(5L);
        assertEquals(1L, r.getBody().getData().getId());
        verify(sancionService).levantar(5L);
    }
}

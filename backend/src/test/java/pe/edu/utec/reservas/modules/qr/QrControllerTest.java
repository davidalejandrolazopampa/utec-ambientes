package pe.edu.utec.reservas.modules.qr;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import pe.edu.utec.reservas.modules.laboratorios.model.RecursoLab;
import pe.edu.utec.reservas.modules.laboratorios.repository.RecursoLabRepository;
import pe.edu.utec.reservas.modules.qr.controller.QrController;
import pe.edu.utec.reservas.modules.qr.service.QrCodeService;
import pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class QrControllerTest {

    @Mock private QrCodeService qrCodeService;
    @Mock private RecursoLabRepository recursoLabRepository;
    @InjectMocks private QrController controller;

    @Test
    void generarQrRecurso() {
        ReflectionTestUtils.setField(controller, "frontendUrl", "http://localhost:5173");
        RecursoLab recurso = RecursoLab.builder().qrCode("Q1").build();
        when(recursoLabRepository.findById(1L)).thenReturn(Optional.of(recurso));
        when(qrCodeService.generateQrCode("http://localhost:5173/checkin/Q1", 300, 300))
                .thenReturn(new byte[]{1, 2, 3});
        var r = controller.generarQrRecurso(1L, 300);
        assertEquals(200, r.getStatusCode().value());
        assertArrayEquals(new byte[]{1, 2, 3}, r.getBody());
    }

    @Test
    void generarQrRecurso_noEncontrado() {
        when(recursoLabRepository.findById(9L)).thenReturn(Optional.empty());
        assertThrows(ResourceNotFoundException.class, () -> controller.generarQrRecurso(9L, 300));
    }

    @Test
    void generarQrLaboratorio() {
        when(qrCodeService.generateQrCode(contains("LAB-5"), eq(300), eq(300)))
                .thenReturn(new byte[]{9});
        var r = controller.generarQrLaboratorio(5L, 300);
        assertEquals(200, r.getStatusCode().value());
        assertArrayEquals(new byte[]{9}, r.getBody());
    }
}

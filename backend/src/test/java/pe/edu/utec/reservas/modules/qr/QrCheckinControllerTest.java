package pe.edu.utec.reservas.modules.qr;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.userdetails.UserDetails;
import pe.edu.utec.reservas.modules.qr.controller.QrCheckinController;
import pe.edu.utec.reservas.modules.qr.dto.CheckinRequest;
import pe.edu.utec.reservas.modules.qr.dto.CheckinResponse;
import pe.edu.utec.reservas.modules.qr.service.QrCheckinService;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class QrCheckinControllerTest {

    @Mock private QrCheckinService qrCheckinService;
    @Mock private UserDetails userDetails;
    @InjectMocks private QrCheckinController controller;

    private final CheckinResponse resp = CheckinResponse.builder().resultado("VALIDO").build();

    private void user() { when(userDetails.getUsername()).thenReturn("u@utec.edu.pe"); }

    @Test
    void checkin() {
        user();
        CheckinRequest req = new CheckinRequest();
        when(qrCheckinService.checkin(req, "u@utec.edu.pe")).thenReturn(resp);
        var r = controller.checkin(req, userDetails);
        assertEquals(200, r.getStatusCode().value());
        assertSame(resp, r.getBody().getData());
    }

    @Test
    void checkinPorQr() {
        user();
        when(qrCheckinService.checkinPorQr("LQR-001", "u@utec.edu.pe")).thenReturn(resp);
        assertSame(resp, controller.checkinPorQr("LQR-001", userDetails).getBody().getData());
    }

    @Test
    void checkinManual() {
        user();
        when(qrCheckinService.checkinManual(4L, "u@utec.edu.pe")).thenReturn(resp);
        assertSame(resp, controller.checkinManual(4L, userDetails).getBody().getData());
    }
}

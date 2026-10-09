package pe.edu.utec.reservas.modules.qr;

import org.junit.jupiter.api.Test;
import pe.edu.utec.reservas.modules.qr.service.QrCodeService;

import static org.junit.jupiter.api.Assertions.*;

class QrCodeServiceTest {

    private final QrCodeService service = new QrCodeService();

    @Test
    void generateQrCode_devuelvePngValido() {
        byte[] png = service.generateQrCode("https://utec.edu.pe/checkin/Q1", 200, 200);
        assertNotNull(png);
        assertTrue(png.length > 0);
        // Firma PNG: 0x89 'P' 'N' 'G'
        assertEquals((byte) 0x89, png[0]);
        assertEquals('P', png[1]);
        assertEquals('N', png[2]);
        assertEquals('G', png[3]);
    }

    @Test
    void generateQrCode_contenidoVacio_lanzaRuntime() {
        // ZXing rechaza contenido vacío → se envuelve en RuntimeException
        assertThrows(RuntimeException.class, () -> service.generateQrCode("", 200, 200));
    }
}

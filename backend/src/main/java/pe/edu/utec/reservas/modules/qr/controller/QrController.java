package pe.edu.utec.reservas.modules.qr.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import pe.edu.utec.reservas.modules.laboratorios.model.RecursoLab;
import pe.edu.utec.reservas.modules.laboratorios.repository.RecursoLabRepository;
import pe.edu.utec.reservas.modules.qr.service.QrCodeService;
import pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException;

@RestController
@RequestMapping("/api/v1/qr")
@RequiredArgsConstructor
@Tag(name = "QR Codes", description = "Generación de códigos QR para recursos")
public class QrController {

    private final QrCodeService qrCodeService;
    private final RecursoLabRepository recursoLabRepository;

    // URL base del frontend para el enlace de check-in embebido en el QR.
    // Configurable por entorno; en prod debe apuntar al dominio real, no a localhost.
    @Value("${app.frontend.url:http://localhost:5173}")
    private String frontendUrl;

    @GetMapping(value = "/recurso/{recursoId}", produces = MediaType.IMAGE_PNG_VALUE)
    @Operation(summary = "Generar QR de recurso")
    @Transactional(readOnly = true)
    public ResponseEntity<byte[]> generarQrRecurso(
            @PathVariable Long recursoId,
            @RequestParam(defaultValue = "300") int size) {

        RecursoLab recurso = recursoLabRepository.findById(recursoId)
                .orElseThrow(() -> new ResourceNotFoundException("Recurso", "id", recursoId));

        String qrContent = frontendUrl + "/checkin/" + recurso.getQrCode();

        byte[] qrImage = qrCodeService.generateQrCode(qrContent, size, size);

        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_PNG)
                .body(qrImage);
    }

    @GetMapping(value = "/laboratorio/{labId}", produces = MediaType.IMAGE_PNG_VALUE)
    @Operation(summary = "Generar QR de laboratorio")
    public ResponseEntity<byte[]> generarQrLaboratorio(
            @PathVariable Long labId,
            @RequestParam(defaultValue = "300") int size) {

        String qrContent = "UTEC-LAB|LAB-" + labId + "|CHECK-IN";
        byte[] qrImage = qrCodeService.generateQrCode(qrContent, size, size);

        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_PNG)
                .body(qrImage);
    }
}
package pe.edu.utec.reservas.modules.qr.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import pe.edu.utec.reservas.modules.qr.dto.CheckinRequest;
import pe.edu.utec.reservas.modules.qr.dto.CheckinResponse;
import pe.edu.utec.reservas.modules.qr.service.QrCheckinService;
import pe.edu.utec.reservas.shared.dto.ApiResponse;

@RestController
@RequestMapping("/api/v1/checkin")
@RequiredArgsConstructor
@Tag(name = "QR Check-in", description = "Validación de check-in mediante código QR")
public class QrCheckinController {

    private final QrCheckinService qrCheckinService;

    @PostMapping
    @Operation(summary = "Check-in con reservaId + QR")
    public ResponseEntity<ApiResponse<CheckinResponse>> checkin(
            @Valid @RequestBody CheckinRequest request,
            @AuthenticationPrincipal UserDetails userDetails) {
        CheckinResponse response = qrCheckinService.checkin(request, userDetails.getUsername());
        return ResponseEntity.ok(ApiResponse.ok(response));
    }

    @PostMapping("/qr/{qrCode}")
    @Operation(summary = "Check-in automático por QR", description = "El alumno escanea el QR, el sistema busca su reserva activa")
    public ResponseEntity<ApiResponse<CheckinResponse>> checkinPorQr(
            @PathVariable String qrCode,
            @AuthenticationPrincipal UserDetails userDetails) {
        CheckinResponse response = qrCheckinService.checkinPorQr(qrCode, userDetails.getUsername());
        return ResponseEntity.ok(ApiResponse.ok(response));
    }

    @PostMapping("/manual/{reservaId}")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR','RESPONSABLE_LAB')")
    @Operation(summary = "Check-in manual por responsable", description = "El responsable confirma la asistencia del alumno sin QR")
    public ResponseEntity<ApiResponse<CheckinResponse>> checkinManual(
            @PathVariable Long reservaId,
            @AuthenticationPrincipal UserDetails userDetails) {
        CheckinResponse response = qrCheckinService.checkinManual(reservaId, userDetails.getUsername());
        return ResponseEntity.ok(ApiResponse.ok(response));
    }
}
package pe.edu.utec.reservas.shared;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.BindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import pe.edu.utec.reservas.shared.exceptions.BusinessException;
import pe.edu.utec.reservas.shared.exceptions.GlobalExceptionHandler;
import pe.edu.utec.reservas.shared.exceptions.ResourceNotFoundException;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    private HttpServletRequest req() {
        HttpServletRequest req = mock(HttpServletRequest.class);
        when(req.getRequestURI()).thenReturn("/api/v1/x");
        return req;
    }

    @Test
    void notFound_404() {
        var r = handler.handleNotFound(new ResourceNotFoundException("Reserva", "id", 1L), req());
        assertEquals(404, r.getStatusCode().value());
        assertFalse(r.getBody().isSuccess());
    }

    @Test
    void business_409() {
        var r = handler.handleBusiness(new BusinessException("conflicto", "CONFLICT"), req());
        assertEquals(409, r.getStatusCode().value());
    }

    @Test
    void validation_400() {
        MethodArgumentNotValidException ex = mock(MethodArgumentNotValidException.class);
        BindingResult br = mock(BindingResult.class);
        when(ex.getBindingResult()).thenReturn(br);
        when(br.getFieldErrors()).thenReturn(List.of(
                new FieldError("obj", "campo", "no debe ser nulo")));
        var r = handler.handleValidation(ex, req());
        assertEquals(400, r.getStatusCode().value());
        assertTrue(r.getBody().getMessage().contains("campo"));
    }

    @Test
    void validation_400_sinErrores() {
        MethodArgumentNotValidException ex = mock(MethodArgumentNotValidException.class);
        BindingResult br = mock(BindingResult.class);
        when(ex.getBindingResult()).thenReturn(br);
        when(br.getFieldErrors()).thenReturn(List.of());
        var r = handler.handleValidation(ex, req());
        assertEquals(400, r.getStatusCode().value());
    }

    @Test
    void accessDenied_403() {
        HttpServletRequest req = req();
        when(req.getMethod()).thenReturn("DELETE");
        var r = handler.handleAccessDenied(new AccessDeniedException("denegado"), req);
        assertEquals(403, r.getStatusCode().value());
    }

    @Test
    void accessDenied_403_mensajeNull() {
        HttpServletRequest req = req();
        when(req.getMethod()).thenReturn("GET");
        var r = handler.handleAccessDenied(new AccessDeniedException(null), req);
        assertEquals(403, r.getStatusCode().value());
    }

    @Test
    void general_500() {
        var r = handler.handleGeneral(new RuntimeException("boom"), req());
        assertEquals(500, r.getStatusCode().value());
        assertEquals("Error interno", r.getBody().getMessage());
    }
}

package pe.edu.utec.reservas.shared.exceptions;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import pe.edu.utec.reservas.shared.dto.ApiResponse;
@Slf4j @RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiResponse<?>> handleNotFound(ResourceNotFoundException ex, HttpServletRequest req) {
        return ResponseEntity.status(404).body(ApiResponse.error(ex.getMessage(),"NOT_FOUND",404,req.getRequestURI()));
    }
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<?>> handleBusiness(BusinessException ex, HttpServletRequest req) {
        return ResponseEntity.status(409).body(ApiResponse.error(ex.getMessage(),ex.getErrorCode(),409,req.getRequestURI()));
    }
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<?>> handleValidation(MethodArgumentNotValidException ex, HttpServletRequest req) {
        String msg = ex.getBindingResult().getFieldErrors().stream().map(e -> e.getField()+": "+e.getDefaultMessage()).reduce((a,b)->a+"; "+b).orElse("Error de validacion");
        return ResponseEntity.badRequest().body(ApiResponse.error(msg,"VALIDATION_ERROR",400,req.getRequestURI()));
    }
    @ExceptionHandler(org.springframework.dao.DataIntegrityViolationException.class)
    public ResponseEntity<ApiResponse<?>> handleDataIntegrity(org.springframework.dao.DataIntegrityViolationException ex, HttpServletRequest req) {
        log.warn("Violación de integridad en {} {}: {}", req.getMethod(), req.getRequestURI(), ex.getMostSpecificCause().getMessage());
        String msg = "No se puede completar la operación porque este registro está en uso por otros datos relacionados.";
        return ResponseEntity.status(409).body(ApiResponse.error(msg,"DATA_IN_USE",409,req.getRequestURI()));
    }
    @ExceptionHandler(org.springframework.security.access.AccessDeniedException.class)
    public ResponseEntity<ApiResponse<?>> handleAccessDenied(org.springframework.security.access.AccessDeniedException ex, HttpServletRequest req) {
        String msg = ex.getMessage() != null ? ex.getMessage() : "Acceso denegado";
        log.warn("Acceso denegado (403) en {} {}", req.getMethod(), req.getRequestURI());
        return ResponseEntity.status(403).body(ApiResponse.error(msg,"FORBIDDEN",403,req.getRequestURI()));
    }
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<?>> handleGeneral(Exception ex, HttpServletRequest req) {
        log.error("Error: {}", ex.getMessage(), ex);
        return ResponseEntity.status(500).body(ApiResponse.error("Error interno","INTERNAL_ERROR",500,req.getRequestURI()));
    }
}

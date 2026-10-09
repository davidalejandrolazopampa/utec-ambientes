package pe.edu.utec.reservas.shared.dto;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.*;
import java.time.LocalDateTime;
@Data @Builder @NoArgsConstructor @AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ApiResponse<T> {
    private boolean success;
    private String message;
    private T data;
    private String error;
    private Integer status;
    private String path;
    @Builder.Default private LocalDateTime timestamp = LocalDateTime.now();
    public static <T> ApiResponse<T> ok(T data) { return ApiResponse.<T>builder().success(true).message("OK").data(data).status(200).build(); }
    public static <T> ApiResponse<T> created(T data, String msg) { return ApiResponse.<T>builder().success(true).message(msg).data(data).status(201).build(); }
    public static <T> ApiResponse<T> error(String msg, String err, int st, String path) { return ApiResponse.<T>builder().success(false).message(msg).error(err).status(st).path(path).build(); }
}

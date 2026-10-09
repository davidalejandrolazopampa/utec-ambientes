package pe.edu.utec.reservas.modules.respaldo;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class RespaldoServiceTest {

    @Autowired
    private RespaldoService respaldoService;

    @Test
    @DisplayName("exportar trae alumnos, reservas y bloqueos con sus IDs")
    void exportar_traeDatos() {
        RespaldoDto bk = respaldoService.exportar();
        assertFalse(bk.usuarios().isEmpty());
        assertFalse(bk.reservas().isEmpty());
        assertNotNull(bk.reservas().get(0).get("id"));
        // bloqueos y bloqueoRecursos no son null (pueden venir vacíos según los datos de test).
        assertNotNull(bk.bloqueos());
        assertNotNull(bk.bloqueoRecursos());
    }

    @Test
    @DisplayName("restaurar el mismo respaldo NO duplica (dedup por ID)")
    void restaurar_deduplicaPorId() {
        RespaldoDto bk = respaldoService.exportar();
        Map<String, Object> res = respaldoService.importar(bk);
        // Todo ya existe → ON CONFLICT DO NOTHING → 0 insertados.
        assertEquals(0, ((Number) res.get("usuariosInsertados")).intValue());
        assertEquals(0, ((Number) res.get("reservasInsertadas")).intValue());
        assertEquals(0, ((Number) res.get("bloqueosInsertados")).intValue());
        assertEquals(0, ((Number) res.get("bloqueoRecursosInsertados")).intValue());
    }
}

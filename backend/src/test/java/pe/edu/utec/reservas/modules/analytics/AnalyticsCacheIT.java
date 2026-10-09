package pe.edu.utec.reservas.modules.analytics;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import pe.edu.utec.reservas.modules.analytics.dto.AnalyticsFilterRequest;
import pe.edu.utec.reservas.modules.analytics.service.AnalyticsService;
import pe.edu.utec.reservas.modules.realtime.LabActivityEvent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Verifica el cacheado de analytics con Redis REAL: (1) la serialización JSON de los DTOs del
 * dashboard hace round-trip (put + hit sin excepción), y (2) el listener invalida la caché en
 * cada mutación. Fuerza {@code spring.cache.type=redis} (el perfil test lo tiene en none).
 * Se salta solo si no hay Redis accesible (p. ej. CI sin el contenedor).
 */
@SpringBootTest
@ActiveProfiles("test")
@TestPropertySource(properties = "spring.cache.type=redis")
class AnalyticsCacheIT {

    @Autowired private AnalyticsService analyticsService;
    @Autowired private CacheManager cacheManager;
    @Autowired private CacheInvalidationListener listener;
    @Autowired private RedisConnectionFactory redisFactory;

    private boolean redisArriba() {
        try {
            redisFactory.getConnection().ping();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @Test
    @DisplayName("Redis cachea y deserializa los DTOs del dashboard (round-trip)")
    void cacheaYDeserializa() {
        assumeTrue(redisArriba(), "Redis no disponible → se salta el IT de caché");
        assertTrue(cacheManager instanceof RedisCacheManager, "debe usar RedisCacheManager");
        AnalyticsFilterRequest filter = new AnalyticsFilterRequest();
        cacheManager.getCache("analytics").clear();
        var r1 = analyticsService.getDashboardFull(filter);   // computa + serializa a Redis
        var r2 = analyticsService.getDashboardFull(filter);   // cache HIT → deserializa (si falla, lanza)
        assertNotNull(r1);
        assertNotNull(r2);
        assertEquals(r1.getFiltroDescripcion(), r2.getFiltroDescripcion());
    }

    @Test
    @DisplayName("LabActivityEvent invalida la caché analytics")
    void invalidaEnMutacion() {
        assumeTrue(redisArriba(), "Redis no disponible → se salta el IT de caché");
        Cache cache = cacheManager.getCache("analytics");
        cache.put("k-test", "valor");
        assertNotNull(cache.get("k-test"));
        listener.onLabActivity(new LabActivityEvent("RESERVA", 1L));
        assertNull(cache.get("k-test"), "el listener debió vaciar la caché");
    }
}

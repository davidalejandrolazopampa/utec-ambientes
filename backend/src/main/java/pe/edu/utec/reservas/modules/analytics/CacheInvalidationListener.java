package pe.edu.utec.reservas.modules.analytics;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import pe.edu.utec.reservas.modules.realtime.LabActivityEvent;

/**
 * Invalida la caché "analytics" cuando cambia la actividad de un laboratorio. Reusa el
 * {@link LabActivityEvent} que ya emiten reservas/bloqueos/check-in: tras el COMMIT vacía la
 * caché para que el dashboard vuelva a recalcular con datos frescos. {@code fallbackExecution}
 * = true para cubrir también las mutaciones fuera de una transacción.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CacheInvalidationListener {

    private final CacheManager cacheManager;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onLabActivity(LabActivityEvent ev) {
        Cache cache = cacheManager.getCache("analytics");
        if (cache != null) {
            cache.clear();
            log.debug("Caché analytics invalidada por {} (lab {})", ev.tipo(), ev.labId());
        }
    }
}

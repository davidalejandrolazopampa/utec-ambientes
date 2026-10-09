package pe.edu.utec.reservas.config;

import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.jsontype.impl.LaissezFaireSubTypeValidator;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;

import java.time.Duration;

/**
 * Redis se usa como caché de las agregaciones caras del dashboard (analytics). No se define un
 * RedisTemplate: nada lo consume directamente; el cacheado va por el {@link RedisCacheManager}.
 */
@Configuration
@EnableCaching
public class RedisConfig {

    /**
     * Caché de las agregaciones caras del dashboard (analytics). Los valores se serializan como
     * JSON con tipado (@class) para reconstruir los DTOs, con JavaTimeModule para los LocalDate.
     * TTL de 10 min como red de seguridad; la invalidación fina la hace CacheInvalidationListener
     * en cada LabActivityEvent (reserva/bloqueo/check-in).
     *
     * <p>Solo cuando {@code spring.cache.type} está ausente (local/prod) o es {@code redis}.
     * En tests {@code spring.cache.type=none} → no se crea este bean y Boot deja un
     * NoOpCacheManager, para que los tests no cacheen resultados entre casos (falsos positivos).
     */
    @Bean
    @ConditionalOnProperty(prefix = "spring.cache", name = "type", havingValue = "redis", matchIfMissing = true)
    public RedisCacheManager cacheManager(RedisConnectionFactory factory) {
        ObjectMapper mapper = new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
                .activateDefaultTyping(LaissezFaireSubTypeValidator.instance,
                        ObjectMapper.DefaultTyping.NON_FINAL, JsonTypeInfo.As.PROPERTY);

        RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
                .entryTtl(Duration.ofMinutes(10))
                .disableCachingNullValues()
                .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(
                        new GenericJackson2JsonRedisSerializer(mapper)));

        return RedisCacheManager.builder(factory).cacheDefaults(config).build();
    }
}

package pe.edu.utec.reservas.config;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
@Configuration
public class RabbitMQConfig {
    public static final String NOTIFICATION_EXCHANGE = "utec.notifications";
    public static final String EMAIL_QUEUE = "utec.email.queue";
    public static final String DLQ_QUEUE = "utec.notifications.dlq";
    public static final String DLX_EXCHANGE = "utec.notifications.dlx";
    @Bean public TopicExchange notificationExchange() { return new TopicExchange(NOTIFICATION_EXCHANGE); }
    @Bean public TopicExchange dlxExchange() { return new TopicExchange(DLX_EXCHANGE); }
    @Bean public Queue emailQueue() {
        return QueueBuilder.durable(EMAIL_QUEUE)
            .withArgument("x-dead-letter-exchange", DLX_EXCHANGE)
            .withArgument("x-dead-letter-routing-key", "dlq").build();
    }
    @Bean public Queue dlq() { return QueueBuilder.durable(DLQ_QUEUE).build(); }
    @Bean public Binding emailBinding() { return BindingBuilder.bind(emailQueue()).to(notificationExchange()).with("notification.email.#"); }
    @Bean public Binding dlqBinding() { return BindingBuilder.bind(dlq()).to(dlxExchange()).with("dlq"); }
    @Bean public MessageConverter jsonConverter() { return new Jackson2JsonMessageConverter(); }
    @Bean public RabbitTemplate rabbitTemplate(ConnectionFactory cf) {
        RabbitTemplate t = new RabbitTemplate(cf); t.setMessageConverter(jsonConverter()); return t;
    }
}

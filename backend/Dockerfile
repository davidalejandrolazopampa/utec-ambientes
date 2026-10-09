# ═══════════════════════════════════════════════════
# UTEC Lab Reservation - Backend Dockerfile
# ═══════════════════════════════════════════════════

# ── Development ───────────────────────────────────
FROM maven:3.9-eclipse-temurin-21-alpine AS development
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY src ./src
EXPOSE 8080 5005
CMD ["mvn", "spring-boot:run", "-Dspring-boot.run.jvmArguments=-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=127.0.0.1:5005"]

# ── Build ─────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-21-alpine AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY src ./src
RUN mvn clean package -DskipTests -B

# ── Production ────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine AS production
RUN addgroup -S utec && adduser -S utec -G utec
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
RUN chown -R utec:utec /app
USER utec
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:8080/actuator/health || exit 1
ENTRYPOINT ["java", "-jar", "app.jar"]

# 📖 Manual de Instalación — UTEC Lab Reservation System

Guía paso a paso para replicar el proyecto en **macOS** y **Windows**.

---

## 📋 Requisitos previos

| Herramienta | Versión mínima | Descarga |
|------------|---------------|----------|
| Java JDK | 21+ | https://adoptium.net/temurin/releases/ |
| Node.js | 20+ | https://nodejs.org/ |
| Docker Desktop | 4.25+ | https://www.docker.com/products/docker-desktop/ |
| Git | 2.40+ | https://git-scm.com/downloads |

> **Nota**: Docker Desktop incluye Docker Compose. En Windows, habilitar WSL2 cuando Docker lo solicite.

---

## 🍎 Instalación en macOS

### 1. Instalar herramientas

```bash
# Homebrew (si no lo tienes)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Java 21
brew install openjdk@21
echo 'export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Verificar Java
java -version
# Debe mostrar: openjdk version "21.x.x"

# Node.js 20+
brew install node@20
# o usar nvm:
# curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
# nvm install 20

# Verificar Node
node -v
npm -v

# Git (normalmente ya viene con macOS)
git --version

# Docker Desktop: descargar desde https://www.docker.com/products/docker-desktop/
# Instalar el .dmg y abrir Docker Desktop
```

### 2. Clonar el proyecto

```bash
cd ~/Documents/GitHub    # o tu carpeta preferida
git clone https://github.com/tu-usuario/utec-lab-reservation.git
cd utec-lab-reservation
```

### 3. Levantar infraestructura con Docker

```bash
# Crear y arrancar PostgreSQL
docker run -d \
  --name utec-postgres \
  -e POSTGRES_USER=utec_admin \
  -e POSTGRES_PASSWORD=utec_secret_2026 \
  -e POSTGRES_DB=utec_labs \
  -p 5432:5432 \
  postgres:16-alpine

# Crear y arrancar Redis
docker run -d \
  --name utec-redis \
  -p 6379:6379 \
  redis:7-alpine

# Crear y arrancar RabbitMQ
docker run -d \
  --name utec-rabbitmq \
  -e RABBITMQ_DEFAULT_USER=utec_rabbit \
  -e RABBITMQ_DEFAULT_PASS=utec_rabbit_2026 \
  -e RABBITMQ_DEFAULT_VHOST=utec \
  -p 5672:5672 \
  -p 15672:15672 \
  rabbitmq:3.13-management-alpine

# Verificar que todos están corriendo
docker ps
# Debes ver 3 contenedores: utec-postgres, utec-redis, utec-rabbitmq
```

### 4. Configurar Google OAuth2

Para que el login funcione, necesitas credenciales de Google Cloud Console:

1. Ir a https://console.cloud.google.com/
2. Crear proyecto o seleccionar existente
3. APIs & Services → Credentials → Create OAuth 2.0 Client ID
4. Application type: Web application
5. Authorized JavaScript origins: `http://localhost:5173` (sin esto, Google rechaza el login)
6. Authorized redirect URIs: `http://localhost:5173`
7. Copiar el **Client ID** (termina en `.apps.googleusercontent.com`)

El proyecto trae **plantillas** versionadas; copia cada una a su archivo real (que está en `.gitignore`) y rellena tus valores:

```bash
# Variables de entorno (raíz) — usado por docker-compose
cp .env.example .env

# Config del backend (perfil local)
cp backend/src/main/resources/application-local.yml.example \
   backend/src/main/resources/application-local.yml
```

El Client ID debe quedar configurado en **dos lugares**:

**a) Backend** — en `.env` (`GOOGLE_CLIENT_ID=...`) o directamente en `application-local.yml` (`app.google.client-id`).

**b) Frontend** — crear `frontend/.env.local` (lo lee `LoginPage.tsx`):
```bash
echo "VITE_GOOGLE_CLIENT_ID=TU_GOOGLE_CLIENT_ID_AQUI" > frontend/.env.local
```

> ⚠️ Si falta la variable del frontend, la pantalla de login muestra *"Google Client ID no configurado"* y solo aparece el botón **"Continuar sin login (dev)"**. Tras crear/editar `.env.local`, **reinicia Vite** (`npm run dev`) para que tome el cambio.
>
> 🔐 **Secretos**: `.env`, `.env.local` y `application-local.yml` están en `.gitignore` y **no deben subirse**. Solo se versionan los `*.example`.
>
> 📧 **App Password de Gmail (doble fuente)**: el `MAIL_PASSWORD` (y el `JWT_SECRET` de dev) hay que ponerlos **en dos sitios**: `.env` (lo usa docker-compose) **y** `application-local.yml` (perfil `local`, que es el que arranca con `mvnw`). Si solo lo cambias en uno, el otro queda desactualizado → al arrancar con `mvnw`, `GET /actuator/health` reporta `mail` **DOWN** (`535 BadCredentials`). Genera el App Password en la cuenta de Google (Seguridad → Contraseñas de aplicaciones), **sin espacios**.
>
> 🔑 **`JWT_SECRET`**: en **local no hace falta** (el perfil `local` trae un default de desarrollo en `application-local.yml`). En **producción es obligatorio**: exporta `JWT_SECRET` con ≥32 caracteres (`openssl rand -base64 48`) o el backend **no arrancará** (validación en `JwtTokenProvider`).

### 5. Ejecutar el Backend

```bash
cd backend
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
```

Esperar a ver:
El backend estará disponible en `http://localhost:8080`.
Swagger UI en `http://localhost:8080/swagger-ui.html`.

### 6. Ejecutar el Frontend (otra terminal)

```bash
cd frontend
npm install
npm run dev
```

Debe mostrar:
  Local:   http://localhost:5173/

### 7. Acceder al sistema

1. Abrir `http://localhost:5173` en el navegador
2. Click en "Iniciar sesión con Google"
3. Usar una cuenta `@utec.edu.pe`
4. La primera vez se registra automáticamente como ESTUDIANTE

---

## 🪟 Instalación en Windows

### 1. Instalar herramientas

**Java 21:**
1. Descargar de https://adoptium.net/temurin/releases/ (Windows x64, .msi)
2. Ejecutar el instalador, marcar "Set JAVA_HOME variable"
3. Verificar: abrir PowerShell → `java -version`

**Node.js 20+:**
1. Descargar de https://nodejs.org/ (LTS, Windows Installer)
2. Ejecutar el instalador
3. Verificar: `node -v` y `npm -v`

**Docker Desktop:**
1. Descargar de https://www.docker.com/products/docker-desktop/
2. Ejecutar instalador → Habilitar WSL2 cuando lo solicite
3. Reiniciar Windows si lo pide
4. Abrir Docker Desktop y esperar a que el engine esté "Running"

**Git:**
1. Descargar de https://git-scm.com/download/win
2. Instalar con opciones por defecto
3. Verificar: `git --version`

### 2. Clonar el proyecto

```powershell
cd C:\Users\TuUsuario\Documents\GitHub
git clone https://github.com/tu-usuario/utec-lab-reservation.git
cd utec-lab-reservation
```

### 3. Levantar infraestructura con Docker

Abrir PowerShell como Administrador:

```powershell
# PostgreSQL
docker run -d --name utec-postgres -e POSTGRES_USER=utec_admin -e POSTGRES_PASSWORD=utec_secret_2026 -e POSTGRES_DB=utec_labs -p 5432:5432 postgres:16-alpine

# Redis
docker run -d --name utec-redis -p 6379:6379 redis:7-alpine

# RabbitMQ
docker run -d --name utec-rabbitmq -e RABBITMQ_DEFAULT_USER=utec_rabbit -e RABBITMQ_DEFAULT_PASS=utec_rabbit_2026 -e RABBITMQ_DEFAULT_VHOST=utec -p 5672:5672 -p 15672:15672 rabbitmq:3.13-management-alpine

# Verificar
docker ps
```

### 4. Configurar Google OAuth2

Mismo proceso que macOS (ver paso 4 arriba): Client ID en `application-local.yml` **y** en `frontend\.env.local`. En PowerShell, crear el archivo del frontend con:

```powershell
"VITE_GOOGLE_CLIENT_ID=TU_GOOGLE_CLIENT_ID_AQUI" | Out-File -Encoding ascii frontend\.env.local
```

### 5. Ejecutar el Backend

```powershell
cd backend
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=local"
```

> **Nota Windows**: usar `.\mvnw.cmd` en lugar de `./mvnw`, y las comillas dobles alrededor del parámetro -D.

### 6. Ejecutar el Frontend (otra terminal PowerShell)

```powershell
cd frontend
npm install
npm run dev
```

### 7. Acceder al sistema

Mismo que macOS: abrir `http://localhost:5173`.

---

## 🔄 Comandos útiles del día a día

### ⚡ Atajo: levantar TODO en segundo plano (`demo.sh`)

Una vez completada la instalación (Docker creado, `.env` y `application-local.yml` configurados), un solo script arranca infra + backend + frontend en background (macOS/Linux):

```bash
./demo.sh start          # Docker + backend + frontend dev (espera a que cada uno responda)
./demo.sh start --cf     # ...y expone la web por Cloudflare (build de prod, SIN límite de banda)
./demo.sh start --tunnel # ...y expone la web por el dominio fijo de ngrok (free: límite mensual)
./demo.sh status         # estado de cada componente (incluye los túneles)
./demo.sh logs backend   # seguir el log del backend (o: logs frontend | logs ngrok | logs cf)
./demo.sh stop           # detener backend + frontend + túneles (los contenedores quedan vivos)
```

Los logs y PIDs quedan en `logs/` (ignorado por git). En Windows usa los pasos manuales de abajo.

**Exponer la web a los alumnos — dos opciones** (ambas arrancan el backend con el CORS y `FRONTEND_URL` del origen público; si no, el login da 403 por CORS). Mantén la Mac despierta (`caffeinate -s`). Hay un **banner A4 imprimible** con el QR de acceso en `docs/assets/banner-reserva-a4.svg`:

- **`--cf` (Cloudflare, recomendado):** `./demo.sh start --cf` compila el **build de producción** del frontend, lo sirve con `vite preview` (`:4173`) y levanta un **túnel de Cloudflare** (`brew install cloudflared`) — gratis y **sin límite de ancho de banda**. La URL es **aleatoria** (`https://…trycloudflare.com`) en cada arranque, así que hay que **añadirla a *Orígenes de JavaScript autorizados*** del OAuth de Google cada vez (Google no acepta comodines).
- **`--tunnel` (ngrok):** `./demo.sh start --tunnel` levanta **ngrok** con el dominio **fijo** (`https://unmolded-hedge-concierge.ngrok-free.dev`) contra el frontend dev (`:5173`). Requiere `ngrok` instalado (`brew install ngrok` + authtoken). Ventaja: URL estable (se autoriza en Google **una sola vez**). Desventaja: el **plan free limita el ancho de banda** (si lo agotas → `ERR_NGROK_725`; se reinicia al inicio del ciclo mensual de tu cuenta).

### 💾 Respaldo de la base de datos (`db/ops/backup.sh` / `db/ops/restore.sh`)

Respaldo **completo** de toda la BD con `pg_dump` (esquema + todas las tablas), independiente del botón ⬇ Respaldo operativo del dashboard (que solo cubre alumnos/reservas/bloqueos en JSON):

```bash
./db/ops/backup.sh                 # vuelca utec_labs a db/backups/ (rotación: últimas 7) + latest.sql
./db/ops/restore.sh                # restaura desde db/backups/latest.sql (pide confirmación)
./db/ops/restore.sh archivo.sql    # restaura desde un respaldo concreto
```

Los `.sql` de `db/backups/` están en `.gitignore` (no se versionan).

### 📝 Insertar una reserva a mano (`db/ops/reservar.sh`) — espejo de Affluences

Crea **una** reserva directamente en la BD (resuelve mesa y alumno por nombre/correo, sin IDs) en estado `CONFIRMADA`, para luego darle **check-in en la plataforma**. Útil para reflejar en el sistema una reserva hecha en Affluences sin perderla. Respeta el anti-solape.

```bash
./db/ops/reservar.sh <lab_id> "<MESA N>" <hora_inicio> <hora_fin> [correo] [fecha] [estado]

# Ejemplos:
./db/ops/reservar.sh 127 "MESA 5" 15:00 16:30                         # hoy, alumno demo, CONFIRMADA
./db/ops/reservar.sh 127 "MESA 5" 15:00 16:30 david.lazo@utec.edu.pe  # alumno concreto
./db/ops/reservar.sh 127 "MESA 5" 15:00 16:30 david.lazo@utec.edu.pe 2026-06-20 PENDIENTE
```

Defaults: `fecha`=hoy, `estado`=CONFIRMADA, `correo`=`david.lazo@utec.edu.pe`. Para hacer check-in en la app la reserva debe ser de **hoy** y la hora actual estar entre `(inicio − 10 min)` y `fin`. `127` = Concept Lab (ver ids con `SELECT id, nombre FROM laboratorios;`).

### Iniciar servicios manualmente (después de reiniciar la computadora)

```bash
# Los contenedores Docker se detienen al apagar. Reiniciarlos:
docker start utec-postgres utec-redis utec-rabbitmq

# Verificar que están corriendo
docker ps
```

### Detener todo

```bash
# Detener contenedores (no los elimina)
docker stop utec-postgres utec-redis utec-rabbitmq

# Ctrl+C en la terminal del backend
# Ctrl+C en la terminal del frontend
```

### Ejecutar tests

**Backend (~250 tests · JaCoCo ~94% instrucción):**
```bash
cd backend

# Crear BD de test (solo la primera vez)
docker exec utec-postgres psql -U utec_admin -d postgres -c "CREATE DATABASE utec_labs_test OWNER utec_admin;"

# Ejecutar tests (o `./mvnw verify` para incluir el gate de cobertura jacoco:check)
./mvnw test
# Windows:  .\mvnw.cmd test
```
Los tests corren con el perfil `test` sobre la BD `utec_labs_test` (Flyway aplica el baseline único `V1__baseline.sql`) y hacen rollback (`@Transactional`). La zona horaria se fija en `America/Lima` (surefire) para que coincidan local y CI.

**Frontend (180 tests · Vitest · cobertura ~87% líneas):**
```bash
cd frontend
npx vitest run            # solo tests (o: npm test)
npm run test:coverage     # tests + cobertura (CI exige el umbral "ratchet")
```

### Ver logs de la BD

```bash
# Conectarse a PostgreSQL
docker exec -it utec-postgres psql -U utec_admin -d utec_labs

# Listar tablas
\dt

# Ver datos
SELECT * FROM usuarios;
SELECT * FROM reservas;

# Salir
\q
```

### Resetear la BD (desde cero)

```bash
docker exec utec-postgres psql -U utec_admin -d postgres -c "DROP DATABASE utec_labs;"
docker exec utec-postgres psql -U utec_admin -d postgres -c "CREATE DATABASE utec_labs OWNER utec_admin;"
# Luego reiniciar el backend — Flyway aplica V1→V5 automáticamente:
#   V1 (baseline) = esquema + datos semilla (roles/permisos/usuarios base,
#   directorio de 54 labs e import de 616 reservas Affluences L108)
```

---

## ⚠️ Solución de problemas comunes

| Problema | Solución |
|----------|----------|
| `Connection refused localhost:5432` | Docker no está corriendo. Abrir Docker Desktop y ejecutar `docker start utec-postgres` |
| `password authentication failed` | La contraseña es `utec_secret_2026`. Verificar en `application-local.yml` |
| `Port 8080 already in use` | Otro proceso usa el puerto. En Mac: `lsof -i :8080 \| grep java \| awk '{print $2}' \| xargs kill -9`. En Windows: `netstat -ano \| findstr :8080` y `taskkill /PID <PID> /F` |
| `Port 5173 already in use` | Cerrar otra instancia de Vite, o cambiar puerto en `vite.config.ts` |
| `Google OAuth error` | Verificar que el Client ID está configurado en `application-local.yml` y que `http://localhost:5173` está en los orígenes autorizados de Google Console |
| `Flyway migration failed` | La BD tiene datos inconsistentes. Resetear con el comando de arriba |
| `operator does not exist: estado_laboratorio = character varying` | Falta `?stringtype=unspecified` en la URL JDBC. Verificar `spring.datasource.url` en `application-local.yml` (necesario para los ENUM nativos de Postgres) |
| `Google Client ID no configurado` (pantalla de login) | Falta `frontend/.env.local` con `VITE_GOOGLE_CLIENT_ID`. Crearlo (paso 4) y reiniciar `npm run dev` |
| Los laboratorios aparecen como **Inactivos** | Es lo esperado: el baseline (`V1`) deja todos los labs en `INACTIVO` excepto **Concept Lab**. Actívalos desde la gestión de laboratorios |
| No cargan datos en **Organización/Personas** tras reiniciar el backend (401) | El JWT guardado en el navegador quedó inválido (cambió el secreto al reiniciar). **Cierra sesión y vuelve a iniciar sesión** |
| `/actuator/health` da **503** con `mail` DOWN (`535 BadCredentials`) | El App Password de `application-local.yml` está desactualizado/revocado. Pega el App Password nuevo (sin espacios) en `application-local.yml` **y** `.env`, y reinicia el backend |
| `/actuator/health` da **503** con `rabbit`/`redis` DOWN | Falta un contenedor. `docker start utec-postgres utec-redis utec-rabbitmq` (RabbitMQ tarda unos segundos en quedar "fully booted"; reinicia el backend después) |
| **QR roto** / se "descarga dañado" (`.png` ilegible) | La sesión del navegador es vieja (cambió `JWT_SECRET`) → el QR responde 401 JSON. **DevTools → Application → Clear site data**, hard refresh (`Cmd+Shift+R`) y volver a iniciar sesión |
| **"Error interno"** al asignar un responsable a un lab | Falta la tabla `director_responsables` (incluida en el baseline `V1`). Reinicia el backend para que Flyway aplique las migraciones |
| `npm install fails` | Borrar `node_modules` y `package-lock.json`, ejecutar `npm install` de nuevo |
| Maven no encontrado (Windows) | Usar `.\mvnw.cmd` en lugar de `./mvnw` |

---

## 📧 Contacto

Para dudas sobre la instalación, contactar a `dlazo@utec.edu.pe`.
  
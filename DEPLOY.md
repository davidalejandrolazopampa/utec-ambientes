# 🚀 Deploy de demo — gratis, desde tu MacBook (Cloudflare Tunnel + QR)

Guía para exponer el proyecto **gratis** desde tu MacBook Pro M1, sin comprar dominio,
para que los alumnos entren desde su laptop o teléfono (desde cualquier internet) y reserven.

> **Tipo de deploy:** demo. La app corre en tu Mac; un túnel le da una **URL pública HTTPS**.
> La URL gratis **cambia cada vez que reinicias el túnel** (mientras esté corriendo, se mantiene).
> Para un QR permanente necesitarías un dominio (ver "URL fija" al final).

> ⚡ **Atajo (recomendado):** `./demo.sh start --cf` hace TODO lo de esta guía automáticamente
> (build de producción + `vite preview` :4173 + túnel Cloudflare + backend con el CORS/FRONTEND_URL
> de la URL del túnel). Solo te queda el paso de **Google** (añadir la URL `*.trycloudflare.com` a los
> Orígenes JS). El backend se sirve con **build de producción**, que gasta mucha menos banda que el
> modo dev. La guía manual de abajo es por si quieres entender o ajustar cada paso.
> Alternativa con **dominio fijo** (sin re-autorizar Google cada vez): `./demo.sh start --tunnel` (ngrok),
> pero el plan free de ngrok limita el ancho de banda.

---

## 0. Requisitos
- Docker Desktop corriendo (Postgres, Redis, RabbitMQ).
- Java 21 + Node 20 (igual que en `INSTALL.md`).
- `cloudflared` (se instala abajo).
- Tu `GOOGLE_CLIENT_ID` (Google Cloud Console).

---

## 1. Levanta la app en tu Mac

> ⚠️ **Orden importante:** primero el **frontend** y el **túnel** (pasos 1-2) para obtener la URL pública;
> luego arranca el **backend** (paso 3) **con esa URL** en `CORS_ORIGINS` y `FRONTEND_URL`. Si no, el
> backend rechaza el login del túnel con **403 de CORS** (su lista por defecto solo tiene `localhost`).

```bash
# Infra (si no están arriba)
docker start utec-postgres utec-redis utec-rabbitmq

# Frontend (terminal 1)
cd frontend
npm run dev          # sirve en :5173 y proxea /api → backend:8080
```

> Vite ya está configurado para aceptar túneles (`allowedHosts` en `vite.config.ts`).

---

## 2. Instala y arranca el túnel (Cloudflare, gratis, sin cuenta)

```bash
brew install cloudflared

# Túnel rápido apuntando al frontend (que ya proxea la API)
cloudflared tunnel --url http://localhost:5173
```

Cloudflared imprime una URL como:
```
https://algo-aleatorio.trycloudflare.com
```
**Esa es la URL pública.** Déjalo corriendo (no cierres esta terminal).

---

## 3. Autoriza la URL en Google (para que funcione el login)

En **https://console.cloud.google.com → APIs & Services → Credentials → tu OAuth Client ID**:
- En **Authorized JavaScript origins** agrega la URL del túnel **exacta** (ej. `https://algo-aleatorio.trycloudflare.com`).
- Guarda. (Tarda ~1–2 min en propagar.)

> ⚠️ Como la URL del túnel cambia al reiniciarlo, hay que actualizar este origen cada vez.
> Por eso, para la clase, **deja el túnel corriendo** y haz esto una sola vez.

**Arranca (o reinicia) el backend con la URL del túnel en `CORS_ORIGINS` y `FRONTEND_URL`** (terminal 3):
```bash
cd backend
CORS_ORIGINS="http://localhost:5173,https://*.trycloudflare.com" \
FRONTEND_URL="https://algo-aleatorio.trycloudflare.com" \
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
```
- `CORS_ORIGINS` ← **imprescindible**: sin el origen del túnel aquí, el login da **403 de CORS**. Usa el comodín `https://*.trycloudflare.com` (el backend soporta patrones) para no tener que reiniciar el backend cada vez que cambie la URL del túnel.
- `FRONTEND_URL` ← para que los QR de check-in de las mesas apunten al público.

> Verifica el CORS (debe responder el origen del túnel):
> ```bash
> curl -s -D - -o /dev/null -X OPTIONS http://localhost:8080/api/v1/auth/google \
>   -H "Origin: https://algo-aleatorio.trycloudflare.com" -H "Access-Control-Request-Method: POST" | grep -i allow-origin
> ```

---

## 4. Genera el QR para los alumnos

Con la URL del túnel, genera un QR que ellos escanean (abre la app directo):

```bash
# Opción A: con qrencode (brew install qrencode)
qrencode -o acceso.png "https://algo-aleatorio.trycloudflare.com"

# Opción B: cualquier generador online (pega la URL).
```
Proyecta/imprime `acceso.png`. El alumno escanea → abre la app → inicia sesión con su correo `@utec.edu.pe` → reserva.

---

## 5. Antes y después: respaldo de datos

- **Antes de la clase / por si acaso**: en el **Dashboard** (como ADMIN) → botón **"⬇ Respaldo"** descarga un JSON con alumnos y reservas. Guárdalo.
- **Si se pierden datos**: Dashboard → **"⬆ Restaurar"** → sube ese JSON. No duplica (deduplica por ID).
- Respaldo completo de la BD (opcional, más robusto):
  ```bash
  docker exec utec-postgres pg_dump -U utec_admin -d utec_labs -Fc -f /tmp/utec.dump
  docker cp utec-postgres:/tmp/utec.dump ./db/backups/utec.dump   # gitignored
  ```

---

## 6. Apagar
- Ctrl+C en el túnel, el frontend y el backend.
- Los contenedores siguen; para detenerlos: `docker stop utec-postgres utec-redis utec-rabbitmq`.
- Los datos quedan en el volumen de Postgres (no se borran al detener).

---

## ⭐ Opción "URL fija" (QR permanente) — requiere dominio
Si quieres que el QR **no cambie nunca**:
1. Cuenta gratis en Cloudflare + un dominio (uno propio, o un subdominio gratis tipo **DuckDNS**).
2. `cloudflared tunnel login` → `cloudflared tunnel create utec` → asocia un hostname fijo (ej. `labs.tudominio.com`) con `cloudflared tunnel route dns utec labs.tudominio.com`.
3. Corre `cloudflared tunnel run utec` apuntando a `http://localhost:5173`.
4. Autorizas `https://labs.tudominio.com` en Google una sola vez → el QR es permanente.

---

## Notas
- La MacBook debe estar **encendida y sin dormir** mientras se use (`caffeinate -s` ayuda).
- El túnel gratis sirve para demos; para algo "siempre encendido" considera Render/Railway (free tier).
- Nunca subas a git el `.env`, el `application-local.yml` ni los `.dump` (ya están en `.gitignore`).

---

> **Documentación relacionada:** instalación → [INSTALL.md](INSTALL.md) · runbook rápido de demo → [INICIAR-DEMO.md](INICIAR-DEMO.md) · arquitectura y despliegue → [docs/16-manual-tecnico.md](docs/16-manual-tecnico.md).

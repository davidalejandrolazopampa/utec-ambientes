#!/usr/bin/env bash
#
# demo.sh — Levanta TODO el sistema UTEC Lab Reservation en segundo plano.
#
#   ./demo.sh start              Docker + backend + frontend dev (solo local)
#   ./demo.sh start --cf         ...y expone la web por Cloudflare (build de prod, sin límite de BW)
#   ./demo.sh start --tunnel     ...y expone la web por el dominio fijo de ngrok (free: 1GB/mes)
#   ./demo.sh stop               Detiene backend + frontend + túneles (los contenedores quedan vivos)
#   ./demo.sh status             Muestra el estado de cada componente
#   ./demo.sh logs [backend|frontend|ngrok|cf]   Sigue los logs (tail -f)
#
# Backend, frontend y túneles corren con nohup; sus PIDs y logs viven en logs/.
# Los contenedores Docker NO se apagan con `stop` (los datos no se pierden);
# si quieres apagarlos: docker stop utec-postgres utec-redis utec-rabbitmq
#
# Demo pública — dos opciones (el backend arranca con el CORS/FRONTEND_URL del origen
# público; si no, el login da 403 por CORS):
#   --cf     Cloudflare quick tunnel (gratis, SIN límite de ancho de banda). Sirve el
#            build de producción con `vite preview` (:4173). URL ALEATORIA *.trycloudflare.com
#            en cada arranque → hay que añadirla a los Orígenes JavaScript del OAuth de Google.
#   --tunnel ngrok con dominio fijo (https://unmolded-hedge-concierge.ngrok-free.dev). URL
#            estable (se autoriza en Google una vez), pero el plan free limita el ancho de banda.
#
set -euo pipefail

# Raíz del repo = carpeta de este script (funciona desde cualquier cwd).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"

BACK_LOG="$LOG_DIR/backend.log"
FRONT_LOG="$LOG_DIR/frontend.log"
NGROK_LOG="$LOG_DIR/ngrok.log"
CF_LOG="$LOG_DIR/cloudflared.log"
BACK_PID="$LOG_DIR/backend.pid"
FRONT_PID="$LOG_DIR/frontend.pid"
NGROK_PID="$LOG_DIR/ngrok.pid"
CF_PID="$LOG_DIR/cloudflared.pid"
CF_URL_FILE="$LOG_DIR/cf_url.txt"

CONTAINERS="utec-postgres utec-redis utec-rabbitmq"
BACKEND_URL="http://localhost:8080"
FRONTEND_URL="http://localhost:5173"

# Túnel público (ngrok dominio estático). Apunta al frontend dev (:5173).
NGROK_DOMAIN="unmolded-hedge-concierge.ngrok-free.dev"
PUBLIC_URL="https://${NGROK_DOMAIN}"
TUNNEL=0   # se pone a 1 con `start --tunnel`

# Modo Cloudflare + build de producción (sin límite de ancho de banda).
# Sirve el build con `vite preview` (:4173) y lo expone con un túnel rápido de
# Cloudflare (URL aleatoria *.trycloudflare.com en cada arranque).
CF=0
PREVIEW_PORT=4173
PREVIEW_URL="http://localhost:${PREVIEW_PORT}"
PUB_ORIGIN=""   # origen público efectivo (ngrok fijo o cloudflare aleatorio)

# Colores (sin dependencias externas).
c_ok="\033[0;32m"; c_warn="\033[0;33m"; c_err="\033[0;31m"; c_info="\033[0;36m"; c_off="\033[0m"
ok()   { echo -e "${c_ok}✓${c_off} $*"; }
warn() { echo -e "${c_warn}!${c_off} $*"; }
err()  { echo -e "${c_err}✗${c_off} $*"; }
info() { echo -e "${c_info}▸${c_off} $*"; }

pid_alive() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }
port_in_use() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

start_infra() {
    info "Infra Docker ($CONTAINERS)…"
    if ! docker info >/dev/null 2>&1; then
        err "Docker no está corriendo. Abre Docker Desktop y reintenta."
        exit 1
    fi
    # shellcheck disable=SC2086
    docker start $CONTAINERS >/dev/null
    info "Esperando a PostgreSQL…"
    until docker exec utec-postgres pg_isready -U utec_admin -d utec_labs >/dev/null 2>&1; do sleep 1; done
    ok "PostgreSQL listo"
    info "Esperando a RabbitMQ…"
    until docker exec utec-rabbitmq rabbitmq-diagnostics -q ping >/dev/null 2>&1; do sleep 1; done
    ok "RabbitMQ listo"
    ok "Redis arriba (parte de los contenedores)"
}

start_backend() {
    if pid_alive "$BACK_PID"; then
        warn "Backend ya corriendo (PID $(cat "$BACK_PID"))"
        if [ "$TUNNEL" = "1" ] || [ "$CF" = "1" ]; then
            warn "Para el túnel el backend necesita el CORS del origen público. Reinícialo: ./demo.sh stop && ./demo.sh start <modo>"
        fi
        return
    fi
    if port_in_use 8080; then
        warn "El puerto 8080 ya está ocupado (¿backend corriendo en IntelliJ?). No lo relanzo."
        return
    fi
    # JWT_SECRET FUERTE Y PRIVADO para la demo: NUNCA usar el secreto de dev del repo
    # (que es público → cualquiera podría forjar un JWT de admin en el túnel). Se genera
    # uno aleatorio la primera vez y se persiste en logs/ (gitignored, estable entre
    # reinicios). El backend lo toma por env (override de application-local.yml) y el tool
    # de capturas lee el mismo archivo. Rótalo borrando el archivo.
    local JWT_SECRET_FILE="$LOG_DIR/jwt-secret"
    if [ ! -s "$JWT_SECRET_FILE" ]; then
        openssl rand -base64 48 | tr -d '\n' > "$JWT_SECRET_FILE"
        chmod 600 "$JWT_SECRET_FILE" 2>/dev/null || true
        info "Generado JWT_SECRET aleatorio para la demo ($JWT_SECRET_FILE)"
    fi
    local DEMO_JWT_SECRET; DEMO_JWT_SECRET="$(cat "$JWT_SECRET_FILE")"

    # En modo túnel, el backend debe permitir el origen público (CORS) y emitir QR con la URL pública.
    local back_env=(JWT_SECRET="$DEMO_JWT_SECRET")
    if [ "$TUNNEL" = "1" ] || [ "$CF" = "1" ]; then
        local wildcard="https://*.ngrok-free.dev"
        [ "$CF" = "1" ] && wildcard="https://*.trycloudflare.com"
        info "Backend (Spring Boot, perfil local) con CORS/QR para $PUB_ORIGIN → $BACK_LOG"
        back_env+=(CORS_ORIGINS="http://localhost:5173,http://localhost:${PREVIEW_PORT},${PUB_ORIGIN},${wildcard}"
                   FRONTEND_URL="$PUB_ORIGIN")
    else
        info "Backend (Spring Boot, perfil local) → $BACK_LOG"
    fi
    # ${arr[@]+"..."} evita el "unbound variable" del Bash 3.2 de macOS con arrays vacíos y set -u.
    ( cd "$ROOT/backend" && env ${back_env[@]+"${back_env[@]}"} nohup ./mvnw spring-boot:run -Dspring-boot.run.profiles=local >"$BACK_LOG" 2>&1 & echo $! >"$BACK_PID" )
    info "Esperando a que el backend responda en $BACKEND_URL/actuator/health…"
    for _ in $(seq 1 90); do
        if curl -sf "$BACKEND_URL/actuator/health" >/dev/null 2>&1; then ok "Backend arriba ($BACKEND_URL)"; return; fi
        if ! pid_alive "$BACK_PID"; then err "El backend murió al arrancar. Revisa: tail -n 50 $BACK_LOG"; exit 1; fi
        sleep 2
    done
    warn "El backend tarda más de lo normal; revisa $BACK_LOG (puede estar compilando)."
}

start_frontend() {
    if pid_alive "$FRONT_PID"; then warn "Frontend ya corriendo (PID $(cat "$FRONT_PID"))"; return; fi
    if port_in_use 5173; then
        warn "El puerto 5173 ya está ocupado (¿frontend corriendo en WebStorm?). No lo relanzo."
        return
    fi
    if [ ! -d "$ROOT/frontend/node_modules" ]; then
        info "Instalando dependencias del frontend (primera vez)…"
        ( cd "$ROOT/frontend" && npm install )
    fi
    info "Frontend (Vite) → $FRONT_LOG"
    ( cd "$ROOT/frontend" && nohup npm run dev >"$FRONT_LOG" 2>&1 & echo $! >"$FRONT_PID" )
    for _ in $(seq 1 30); do
        if curl -sf "$FRONTEND_URL" >/dev/null 2>&1; then ok "Frontend arriba ($FRONTEND_URL)"; return; fi
        if ! pid_alive "$FRONT_PID"; then err "El frontend murió al arrancar. Revisa: tail -n 50 $FRONT_LOG"; exit 1; fi
        sleep 1
    done
    warn "El frontend tarda más de lo normal; revisa $FRONT_LOG."
}

start_ngrok() {
    if ! command -v ngrok >/dev/null 2>&1; then
        err "ngrok no está instalado. Instálalo con: brew install ngrok  (y configura tu authtoken: ngrok config add-authtoken <TOKEN>)"
        exit 1
    fi
    if pid_alive "$NGROK_PID"; then warn "ngrok ya corriendo (PID $(cat "$NGROK_PID"))"; return; fi
    info "Túnel ngrok → $PUBLIC_URL  (apunta al frontend :5173) → $NGROK_LOG"
    ( nohup ngrok http --url="$PUBLIC_URL" 5173 >"$NGROK_LOG" 2>&1 & echo $! >"$NGROK_PID" )
    # La API local de ngrok (puerto 4040) confirma que el túnel quedó establecido.
    for _ in $(seq 1 20); do
        if curl -sf http://localhost:4040/api/tunnels >/dev/null 2>&1; then ok "Túnel arriba ($PUBLIC_URL)"; return; fi
        if ! pid_alive "$NGROK_PID"; then err "ngrok murió al arrancar (¿authtoken? ¿dominio en uso?). Revisa: tail -n 50 $NGROK_LOG"; exit 1; fi
        sleep 1
    done
    warn "ngrok tarda en responder; revisa $NGROK_LOG."
}

# Build de producción + `vite preview` (:4173). Mucho menos ancho de banda que el
# servidor de desarrollo → ideal para exponer la demo por un túnel.
start_frontend_preview() {
    if pid_alive "$FRONT_PID"; then warn "Frontend ya corriendo (PID $(cat "$FRONT_PID")); reinícialo para servir el build"; return; fi
    if port_in_use "$PREVIEW_PORT"; then warn "El puerto $PREVIEW_PORT ya está ocupado. No lo relanzo."; return; fi
    if [ ! -d "$ROOT/frontend/node_modules" ]; then
        info "Instalando dependencias del frontend (primera vez)…"
        ( cd "$ROOT/frontend" && npm install )
    fi
    info "Compilando build de producción del frontend…"
    ( cd "$ROOT/frontend" && npm run build >"$FRONT_LOG" 2>&1 ) || { err "Falló el build. Revisa: tail -n 50 $FRONT_LOG"; exit 1; }
    info "Sirviendo build (vite preview :$PREVIEW_PORT) → $FRONT_LOG"
    ( cd "$ROOT/frontend" && nohup npm run preview -- --port "$PREVIEW_PORT" --host >>"$FRONT_LOG" 2>&1 & echo $! >"$FRONT_PID" )
    for _ in $(seq 1 30); do
        if curl -sf "$PREVIEW_URL" >/dev/null 2>&1; then ok "Frontend (build) arriba ($PREVIEW_URL)"; return; fi
        if ! pid_alive "$FRONT_PID"; then err "El preview murió al arrancar. Revisa: tail -n 50 $FRONT_LOG"; exit 1; fi
        sleep 1
    done
    warn "El preview tarda más de lo normal; revisa $FRONT_LOG."
}

# Túnel rápido de Cloudflare (gratis, sin límite de ancho de banda). URL aleatoria
# *.trycloudflare.com que capturamos del log y guardamos en PUB_ORIGIN.
start_cloudflared() {
    if ! command -v cloudflared >/dev/null 2>&1; then
        err "cloudflared no está instalado. Instálalo con: brew install cloudflared"
        exit 1
    fi
    if pid_alive "$CF_PID"; then warn "cloudflared ya corriendo (PID $(cat "$CF_PID"))"; return; fi
    : > "$CF_LOG"
    info "Túnel Cloudflare → preview :$PREVIEW_PORT → $CF_LOG"
    ( nohup cloudflared tunnel --url "$PREVIEW_URL" >"$CF_LOG" 2>&1 & echo $! >"$CF_PID" )
    PUB_ORIGIN=""
    for _ in $(seq 1 30); do
        PUB_ORIGIN="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$CF_LOG" 2>/dev/null | head -1 || true)"
        [ -n "$PUB_ORIGIN" ] && break
        if ! pid_alive "$CF_PID"; then err "cloudflared murió al arrancar. Revisa: tail -n 50 $CF_LOG"; exit 1; fi
        sleep 1
    done
    if [ -z "$PUB_ORIGIN" ]; then err "No se pudo obtener la URL de Cloudflare. Revisa: tail -n 50 $CF_LOG"; exit 1; fi
    echo "$PUB_ORIGIN" > "$CF_URL_FILE"
    ok "Túnel Cloudflare arriba ($PUB_ORIGIN)"
}

cmd_start() {
    for arg in "$@"; do
        case "$arg" in
            --tunnel|--public)    TUNNEL=1 ;;
            --cf|--cloudflare)    CF=1 ;;
            *) warn "Opción desconocida para start: $arg (se ignora)" ;;
        esac
    done
    echo "═══ Levantando UTEC Lab Reservation ═══"
    start_infra

    if [ "$CF" = "1" ]; then
        # Cloudflare + build de producción. Orden: preview → túnel (capturar URL) → backend.
        start_frontend_preview
        start_cloudflared          # fija PUB_ORIGIN
        start_backend              # usa PUB_ORIGIN + comodín trycloudflare
        echo
        ok "Todo arriba. Público (Cloudflare): $PUB_ORIGIN   ·   Local: $PREVIEW_URL"
        warn "URL NUEVA en cada arranque → añádela a 'Orígenes de JavaScript autorizados' del OAuth de Google."
        info "Mantén la Mac despierta (caffeinate -s)."
        info "Logs:   ./demo.sh logs backend | frontend | cf"
        info "Apagar: ./demo.sh stop"
        return
    fi

    [ "$TUNNEL" = "1" ] && PUB_ORIGIN="$PUBLIC_URL"
    start_backend
    start_frontend
    [ "$TUNNEL" = "1" ] && start_ngrok
    echo
    if [ "$TUNNEL" = "1" ]; then
        ok "Todo arriba. Público: $PUBLIC_URL   ·   Local: $FRONTEND_URL"
        info "Recuerda: mantener la Mac despierta (caffeinate -s) y el dominio autorizado en Google OAuth."
        info "Logs:   ./demo.sh logs backend | frontend | ngrok"
    else
        ok "Todo arriba. Abre: $FRONTEND_URL"
        info "Demo pública: ./demo.sh start --cf (Cloudflare, recomendado) · ./demo.sh start --tunnel (ngrok)"
        info "Logs:   ./demo.sh logs backend   |   ./demo.sh logs frontend"
    fi
    info "Apagar: ./demo.sh stop"
}

stop_one() {
    local name="$1" pidf="$2"
    if pid_alive "$pidf"; then
        local pid; pid="$(cat "$pidf")"
        # Mata el árbol de procesos (mvn/node lanzan hijos).
        pkill -TERM -P "$pid" 2>/dev/null || true
        kill -TERM "$pid" 2>/dev/null || true
        ok "$name detenido (PID $pid)"
    else
        warn "$name no estaba corriendo"
    fi
    rm -f "$pidf"
}

cmd_stop() {
    echo "═══ Deteniendo backend + frontend + túnel ═══"
    stop_one "Backend" "$BACK_PID"
    stop_one "Frontend" "$FRONT_PID"
    stop_one "ngrok" "$NGROK_PID"
    stop_one "cloudflared" "$CF_PID"
    rm -f "$CF_URL_FILE"
    info "Contenedores Docker siguen vivos (datos intactos)."
    info "Para apagarlos: docker stop $CONTAINERS"
}

cmd_restart() {
    echo "═══ Reiniciando (stop + start) ═══"
    cmd_stop
    # Esperar a que mvn/node liberen los puertos antes de re-arrancar (máx 15s).
    info "Esperando a que se liberen los puertos 8080/5173…"
    for _ in $(seq 1 15); do
        if ! port_in_use 8080 && ! port_in_use 5173; then break; fi
        sleep 1
    done
    cmd_start "$@"
}

cmd_status() {
    echo "═══ Estado ═══"
    for c in $CONTAINERS; do
        if [ "$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null)" = "true" ]; then ok "Docker $c"; else err "Docker $c apagado"; fi
    done
    if pid_alive "$BACK_PID"; then ok "Backend (PID $(cat "$BACK_PID"), por demo.sh) · $BACKEND_URL"
    elif port_in_use 8080; then warn "Backend arriba en 8080 (externo, p. ej. IntelliJ — no lo gestiona demo.sh)"
    else err "Backend apagado"; fi
    if pid_alive "$FRONT_PID"; then ok "Frontend (PID $(cat "$FRONT_PID"), por demo.sh) · $FRONTEND_URL"
    elif port_in_use 5173; then warn "Frontend arriba en 5173 (externo, p. ej. WebStorm — no lo gestiona demo.sh)"
    else err "Frontend apagado"; fi
    if pid_alive "$NGROK_PID"; then ok "Túnel ngrok (PID $(cat "$NGROK_PID")) · $PUBLIC_URL"
    else err "Túnel ngrok apagado (usa: ./demo.sh start --tunnel)"; fi
    if pid_alive "$CF_PID"; then ok "Túnel Cloudflare (PID $(cat "$CF_PID")) · $(cat "$CF_URL_FILE" 2>/dev/null || echo '¿url?')"
    else err "Túnel Cloudflare apagado (usa: ./demo.sh start --cf)"; fi
}

cmd_logs() {
    case "${1:-}" in
        backend)  tail -f "$BACK_LOG" ;;
        frontend) tail -f "$FRONT_LOG" ;;
        ngrok)    tail -f "$NGROK_LOG" ;;
        cf)       tail -f "$CF_LOG" ;;
        *)        echo "Uso: ./demo.sh logs [backend|frontend|ngrok|cf]"; exit 1 ;;
    esac
}

case "${1:-}" in
    start)   shift; cmd_start "$@" ;;
    stop)    cmd_stop ;;
    restart) shift; cmd_restart "$@" ;;
    status)  cmd_status ;;
    logs)    cmd_logs "${2:-}" ;;
    *) echo "Uso: ./demo.sh [start [--cf|--tunnel]|stop|restart [--cf|--tunnel]|status|logs]"; exit 1 ;;
esac

#!/usr/bin/env bash
#
# reservar.sh — Inserta UNA reserva directamente en la BD (espejo manual de Affluences).
#
# Crea la reserva en estado CONFIRMADA (sin check-in) para que luego TÚ le des
# check-in en la plataforma. Resuelve la mesa y el alumno por nombre/correo, así
# que no necesitas IDs. Respeta la restricción anti-solape (no deja dos reservas
# activas pisándose en la misma mesa/franja el mismo día).
#
#   ./db/reservar.sh <lab_id> "<MESA N>" <hora_inicio> <hora_fin> [correos] [fecha] [estado]
#
# [correos] = uno o VARIOS correos separados por COMA. El 1º es el TITULAR y los
# demás son ACOMPAÑANTES (igual que en la plataforma). Todos deben estar
# registrados como alumnos (@utec.edu.pe). La cantidad de participantes de la
# reserva se ajusta sola al número de correos.
#
# Ejemplos:
#   # 1 alumno (titular = alumno demo)
#   ./db/reservar.sh 127 "MESA 5" 15:00 16:30
#   # 1 alumno específico
#   ./db/reservar.sh 127 "MESA 5" 15:00 16:30 david.lazo@utec.edu.pe
#   # 2 alumnos (titular + 1 acompañante) — OJO: comillas y SIN espacios tras la coma
#   ./db/reservar.sh 127 "MESA 5" 15:00 16:30 "david.lazo@utec.edu.pe,alvaro.alagon@utec.edu.pe"
#   # 3 alumnos
#   ./db/reservar.sh 127 "MESA 5" 15:00 16:30 "a.uno@utec.edu.pe,b.dos@utec.edu.pe,c.tres@utec.edu.pe"
#   # con fecha y estado
#   ./db/reservar.sh 127 "MESA 5" 15:00 16:30 david.lazo@utec.edu.pe 2026-06-18 PENDIENTE
#
# Notas:
#   - fecha    por defecto = HOY.
#   - estado   por defecto = CONFIRMADA (también admite PENDIENTE).
#   - correos  por defecto = david.lazo@utec.edu.pe (alumno demo).
#   - El nº de correos no puede superar la capacidad de la mesa.
#   - CORREO: al crear la reserva envía al TITULAR el mismo correo "Reserva
#     registrada — recuerda tu check-in" que manda la app (Gmail SMTP, usando
#     MAIL_USERNAME/MAIL_PASSWORD del entorno/.env/application-local.yml).
#     Desactívalo con  SEND_EMAIL=0 ./db/reservar.sh ...  (p. ej. en cargas masivas).
#   - Para hacer CHECK-IN en la app: la reserva debe ser de HOY y la hora actual
#     estar entre (hora_inicio - 10 min) y hora_fin.
#
set -euo pipefail

CONTAINER="utec-postgres"; DB_USER="utec_admin"; DB_NAME="utec_labs"
psql() { docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 "$@"; }
q()    { docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tA -c "$1" 2>/dev/null; }

c_ok="\033[0;32m"; c_err="\033[0;31m"; c_info="\033[0;36m"; c_off="\033[0m"
ok(){ echo -e "${c_ok}✓${c_off} $*"; }; err(){ echo -e "${c_err}✗${c_off} $*"; }; info(){ echo -e "${c_info}▸${c_off} $*"; }

if [ "$#" -lt 4 ]; then
  err "Uso: ./db/reservar.sh <lab_id> \"<MESA N>\" <hora_inicio> <hora_fin> [correo] [fecha] [estado]"
  exit 1
fi

LAB="$1"; MESA="$2"; HINI="$3"; HFIN="$4"
CORREOS_RAW="${5:-david.lazo@utec.edu.pe}"
FECHA="${6:-$(date +%F)}"
ESTADO="${7:-CONFIRMADA}"

# Separar correos por coma, recortar espacios, quitar vacíos y deduplicar
# (conservando el orden: el 1º es el titular).
IFS=',' read -ra _RAW <<< "$CORREOS_RAW"
CORREOS=(); _SEEN=" "
for _c in "${_RAW[@]}"; do
  _c="$(printf '%s' "$_c" | tr -d '[:space:]')"
  [ -z "$_c" ] && continue
  case "$_SEEN" in *" $_c "*) continue;; esac
  _SEEN="$_SEEN$_c "; CORREOS+=("$_c")
done
[ "${#CORREOS[@]}" -eq 0 ] && { err "No diste ningún correo válido."; exit 1; }
TITULAR="${CORREOS[0]}"

# Normaliza HH:MM → HH:MM:00
[[ "$HINI" =~ ^[0-9]{1,2}:[0-9]{2}$ ]] && HINI="${HINI}:00"
[[ "$HFIN" =~ ^[0-9]{1,2}:[0-9]{2}$ ]] && HFIN="${HFIN}:00"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  err "El contenedor '$CONTAINER' no está corriendo (docker start $CONTAINER)"; exit 1
fi

# Resolver mesa (+ su capacidad)
RECURSO="$(q "SELECT id||'|'||capacidad_personas FROM recursos_lab WHERE laboratorio_id=${LAB} AND nombre='${MESA//\'/\'\'}' AND activo=true LIMIT 1;")"
[ -z "$RECURSO" ] && { err "No existe la mesa '${MESA}' (activa) en el lab ${LAB}."; exit 1; }
RECURSO_ID="${RECURSO%%|*}"; CAPACIDAD="${RECURSO##*|}"

# Resolver TODOS los alumnos (titular + acompañantes). Todos deben existir.
USUARIO_IDS=()
for _c in "${CORREOS[@]}"; do
  _id="$(q "SELECT id FROM usuarios WHERE correo_utec='${_c//\'/\'\'}' LIMIT 1;")"
  [ -z "$_id" ] && { err "No existe el alumno con correo '${_c}' (regístralo primero)."; exit 1; }
  USUARIO_IDS+=("$_id")
done
TITULAR_ID="${USUARIO_IDS[0]}"
N="${#CORREOS[@]}"

# La cantidad de participantes no puede superar la capacidad de la mesa.
if [ "$N" -gt "$CAPACIDAD" ]; then
  err "La mesa '${MESA}' tiene capacidad ${CAPACIDAD} y diste ${N} correos."; exit 1
fi

info "Reservando ${MESA} (recurso ${RECURSO_ID}, cap ${CAPACIDAD}) · lab ${LAB} · ${FECHA} ${HINI}–${HFIN} · ${N} alumno(s): ${CORREOS[*]} · titular ${TITULAR} (id ${TITULAR_ID}) · ${ESTADO}"

# Insert de la reserva (participantes=N; carrera y creado_por = el titular). Falla con
# 'excl_reserva_solape' si choca con otra reserva activa en esa mesa/franja.
NEW_ID="$(psql -tA -c "
  INSERT INTO reservas (recurso_id, usuario_id, fecha, hora_inicio, hora_fin, estado, tipo_reserva,
                        participantes, motivo, carrera, creado_por, version)
  SELECT ${RECURSO_ID}, ${TITULAR_ID}, '${FECHA}', '${HINI}', '${HFIN}', '${ESTADO}', 'ALUMNO',
         ${N}, 'Sync Affluences', u.carrera, ${TITULAR_ID}, 0
  FROM usuarios u WHERE u.id=${TITULAR_ID}
  RETURNING id;" 2>&1)" || {
    echo "$NEW_ID" | grep -q "excl_reserva_solape" \
      && err "Choca con otra reserva activa en ${MESA} en esa franja (anti-solape)." \
      || err "No se pudo insertar: $NEW_ID"
    exit 1
  }

RESERVA_ID="$(printf '%s' "$NEW_ID" | grep -Eo '[0-9]+' | head -1)"

# Participantes (reserva_participantes, V10): una fila por alumno. Sin estas filas la
# reserva NO aparece en la gráfica "Reservas por carrera" (cuenta POR participante).
# El 1er correo es titular (es_titular=true); el resto, acompañantes. La carrera de
# cada uno sale de su propio perfil.
for i in "${!USUARIO_IDS[@]}"; do
  _uid="${USUARIO_IDS[$i]}"
  [ "$i" -eq 0 ] && _tit="true" || _tit="false"
  PART_OUT="$(psql -tA -c "
    INSERT INTO reserva_participantes (reserva_id, usuario_id, correo_utec, nombre_completo, carrera, es_titular)
    SELECT ${RESERVA_ID}, u.id, u.correo_utec, trim(u.nombres||' '||u.apellidos), u.carrera, ${_tit}
    FROM usuarios u WHERE u.id=${_uid}
    ON CONFLICT (reserva_id, correo_utec) DO NOTHING;" 2>&1)" \
    || { err "Reserva #${RESERVA_ID} creada, pero falló el participante id ${_uid}: $PART_OUT"; exit 1; }
done

ok "Reserva #${RESERVA_ID} creada en ${ESTADO} con ${N} participante(s) [titular: ${TITULAR}]. Ahora dale CHECK-IN en la plataforma (Gestión de Reservas → 📷 Check-in)."

# ── Correo "Reserva registrada" al titular (mismo que envía la app) ──────────────
# Reusa las credenciales Gmail de TU entorno (MAIL_USERNAME/MAIL_PASSWORD del .env o
# de application-local.yml, ambos gitignored). El secreto NO se hornea en este script:
# se lee en tiempo de ejecución. Desactívalo con SEND_EMAIL=0 (útil en cargas masivas).
if [ "${SEND_EMAIL:-1}" != "0" ]; then
  ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  _yml="$ROOT_DIR/backend/src/main/resources/application-local.yml"
  # Orden de resolución: variable de entorno → .env → default de application-local.yml
  MAIL_USER="${MAIL_USERNAME:-}"; MAIL_PASS="${MAIL_PASSWORD:-}"
  [ -z "$MAIL_USER" ] && MAIL_USER="$(grep -m1 '^MAIL_USERNAME=' "$ROOT_DIR/.env" 2>/dev/null | cut -d= -f2-)"
  [ -z "$MAIL_PASS" ] && MAIL_PASS="$(grep -m1 '^MAIL_PASSWORD=' "$ROOT_DIR/.env" 2>/dev/null | cut -d= -f2-)"
  [ -z "$MAIL_USER" ] && MAIL_USER="$(grep -m1 'MAIL_USERNAME' "$_yml" 2>/dev/null | sed -E 's/.*\$\{MAIL_USERNAME:?([^}]*)\}.*/\1/')"
  [ -z "$MAIL_PASS" ] && MAIL_PASS="$(grep -m1 'MAIL_PASSWORD' "$_yml" 2>/dev/null | sed -E 's/.*\$\{MAIL_PASSWORD:?([^}]*)\}.*/\1/')"

  LAB_INFO="$(q "SELECT nombre||'|'||codigo_lab FROM laboratorios WHERE id=${LAB};")"
  LAB_NOMBRE="${LAB_INFO%%|*}"; LAB_CODIGO="${LAB_INFO##*|}"
  TIT_NOMBRE="$(q "SELECT trim(nombres||' '||apellidos) FROM usuarios WHERE id=${TITULAR_ID};")"

  if [ -z "$MAIL_USER" ] || [ -z "$MAIL_PASS" ]; then
    info "Correo omitido: no encontré MAIL_USERNAME/MAIL_PASSWORD (env, .env o application-local.yml)."
  elif ! command -v python3 >/dev/null 2>&1; then
    info "Correo omitido: no hay python3 disponible."
  elif MAIL_USER="$MAIL_USER" MAIL_PASS="$MAIL_PASS" TO="$TITULAR" NOMBRE="$TIT_NOMBRE" \
       LABFULL="$LAB_NOMBRE ($LAB_CODIGO)" RECURSO="$MESA" FECHA="$FECHA" \
       HINI="${HINI%:*}" HFIN="${HFIN%:*}" python3 - <<'PY'
import os, ssl, smtplib, html as H
from email.mime.text import MIMEText
from email.utils import formataddr
from datetime import datetime, timedelta

E = lambda s: H.escape(s or "")
hi, hf = os.environ["HINI"], os.environ["HFIN"]
try:    hc = (datetime.strptime(hi, "%H:%M") - timedelta(minutes=10)).strftime("%H:%M")
except Exception: hc = hi
lab, rec, fecha, nombre = (E(os.environ[k]) for k in ("LABFULL", "RECURSO", "FECHA", "NOMBRE"))
asunto = f"Reserva registrada — recuerda tu check-in · {os.environ['RECURSO']}, {os.environ['LABFULL']}"
html = f'''<div style="font-family:Calibri,Arial,sans-serif;max-width:600px;margin:0 auto;color:#231F20;">
  <div style="background:#231F20;padding:22px;text-align:center;"><span style="color:#00BFFF;font-size:26px;font-weight:bold;">UTEC Labs</span></div>
  <div style="padding:30px;border:1px solid #eee;border-top:none;">
    <div style="display:inline-block;background:#fff7ed;color:#c2410c;border:1px solid #fdba74;border-radius:999px;padding:5px 14px;font-size:13px;font-weight:bold;">&#9203; Pendiente de check-in</div>
    <h2 style="margin:16px 0 4px;">&iexcl;Reserva registrada, {nombre}!</h2>
    <p style="color:#555;margin-top:0;">Tu espacio est&aacute; apartado. <strong>A&uacute;n no est&aacute; confirmada</strong>: se confirma cuando hagas el check-in.</p>
    <div style="background:#f8fafc;border-left:4px solid #00BFFF;padding:16px;margin:22px 0;border-radius:6px;">
      <p style="margin:6px 0;">&#127979; <strong>Laboratorio:</strong> {lab}</p>
      <p style="margin:6px 0;">&#129681; <strong>Recurso:</strong> {rec}</p>
      <p style="margin:6px 0;">&#128197; <strong>Fecha:</strong> {fecha}</p>
      <p style="margin:6px 0;">&#128344; <strong>Horario:</strong> {hi} &mdash; {hf}</p>
    </div>
    <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:18px;margin:22px 0;">
      <p style="margin:0 0 8px;font-weight:bold;color:#b45309;">&#9989; C&oacute;mo confirmar tu asistencia (check-in)</p>
      <p style="margin:6px 0;color:#92400e;">El check-in se habilita <strong>10 minutos antes</strong>, es decir <strong>desde las {hc}</strong>.</p>
      <p style="margin:6px 0;color:#92400e;">Escanea el <strong>QR del recurso</strong> al llegar, o pide al responsable que confirme tu asistencia.</p>
      <p style="margin:6px 0;color:#92400e;">&#9888;&#65039; Si no haces check-in en los <strong>primeros 15 minutos</strong>, la reserva se cancelar&aacute; autom&aacute;ticamente.</p>
    </div>
  </div>
  <div style="background:#f0f2f5;padding:18px;text-align:center;border-top:2px solid #00BFFF;">
    <p style="color:#231F20;font-size:13px;font-weight:bold;margin:0 0 2px;">Equipo de UTEC Labs &middot; Concept Lab</p>
    <p style="color:#999;font-size:12px;margin:0;">Universidad de Ingenier&iacute;a y Tecnolog&iacute;a &mdash; UTEC</p>
    <p style="color:#bbb;font-size:11px;margin:8px 0 0;">Este es un mensaje autom&aacute;tico, por favor no respondas a este correo.</p>
  </div>
</div>'''
msg = MIMEText(html, "html", "utf-8")
msg["Subject"] = asunto
msg["From"] = formataddr(("UTEC Labs", os.environ["MAIL_USER"]))
msg["To"] = os.environ["TO"]
ctx = ssl.create_default_context()
with smtplib.SMTP("smtp.gmail.com", 587, timeout=20) as s:
    s.starttls(context=ctx); s.login(os.environ["MAIL_USER"], os.environ["MAIL_PASS"]); s.send_message(msg)
PY
  then
    ok "Correo de reserva enviado a ${TITULAR}."
  else
    err "No se pudo enviar el correo a ${TITULAR} (la reserva #${RESERVA_ID} sí quedó creada). Revisa MAIL_PASSWORD / conexión."
  fi
fi

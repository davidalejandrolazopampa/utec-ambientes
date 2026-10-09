#!/usr/bin/env bash
#
# backup.sh — Respaldo COMPLETO de la base de datos (pg_dump) con rotación.
#
#   ./db/backup.sh
#
# Genera un volcado SQL completo de utec_labs desde el contenedor utec-postgres,
# lo guarda con timestamp en db/backups/, actualiza db/backups/latest.sql y
# conserva solo los últimos N respaldos (rotación), borrando los más antiguos.
#
# Restaurar:  ./db/restore.sh [archivo.sql]   (sin argumento usa latest.sql)
#
set -euo pipefail

# --- Configuración ---------------------------------------------------------
CONTAINER="utec-postgres"
DB_USER="utec_admin"
DB_NAME="utec_labs"
KEEP=7                        # cuántos respaldos conservar (rotación)

# Copia off-machine (recuperación ante fallo del disco). Se copia latest.sql +
# el respaldo con timestamp a esta carpeta tras cada backup. Por defecto iCloud
# Drive; sobreescribible con  BACKUP_OFFSITE_DIR=/ruta ./db/ops/backup.sh
OFFSITE_DIR="${BACKUP_OFFSITE_DIR:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/utec-backups}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_DIR="$ROOT/db/backups"
mkdir -p "$BACKUP_DIR"

c_ok="\033[0;32m"; c_err="\033[0;31m"; c_warn="\033[0;33m"; c_info="\033[0;36m"; c_off="\033[0m"
ok()   { echo -e "${c_ok}✓${c_off} $*"; }
err()  { echo -e "${c_err}✗${c_off} $*"; }
warn() { echo -e "${c_warn}!${c_off} $*"; }
info() { echo -e "${c_info}▸${c_off} $*"; }

# --- Comprobaciones --------------------------------------------------------
if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  err "El contenedor '$CONTAINER' no está corriendo. Levántalo con: docker start $CONTAINER"
  exit 1
fi

# --- Volcado ---------------------------------------------------------------
TS="$(date +%Y%m%d_%H%M%S)"
FILE="$BACKUP_DIR/${DB_NAME}_backup_${TS}.sql"

info "Respaldando $DB_NAME → $FILE"
# --clean --if-exists: el dump incluye los DROP, así la restauración es idempotente.
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner > "$FILE"

# Verifica que no salió vacío (pg_dump puede fallar en mitad y dejar un archivo trunco).
if [ ! -s "$FILE" ] || ! grep -q "PostgreSQL database dump complete" "$FILE"; then
  err "El respaldo parece incompleto. Conservando el archivo para inspección: $FILE"
  exit 1
fi

SIZE="$(du -h "$FILE" | cut -f1)"
cp "$FILE" "$BACKUP_DIR/latest.sql"
ok "Respaldo OK ($SIZE) · también copiado a db/backups/latest.sql"

# --- Rotación: conserva los últimos $KEEP, borra los más viejos -----------
# (portable; el Bash 3.2 de macOS no trae `mapfile`).
OLD="$(ls -1t "$BACKUP_DIR"/${DB_NAME}_backup_*.sql 2>/dev/null | tail -n +$((KEEP + 1)))"
if [ -n "$OLD" ]; then
  N="$(echo "$OLD" | wc -l | tr -d ' ')"
  echo "$OLD" | while IFS= read -r f; do rm -f "$f"; done
  info "Rotación: borrados $N respaldo(s) antiguo(s) (se conservan $KEEP)."
fi

COUNT="$(ls -1 "$BACKUP_DIR"/${DB_NAME}_backup_*.sql 2>/dev/null | wc -l | tr -d ' ')"
ok "Respaldos guardados: $COUNT (máx. $KEEP)."

# --- Copia off-machine (si hay destino) ------------------------------------
# Un backup que vive solo en el mismo disco que la BD no protege ante fallo del
# disco. Copiamos latest + el timestamp a OFFSITE_DIR (iCloud por defecto).
_icloud_base="$HOME/Library/Mobile Documents/com~apple~CloudDocs"
if [ -n "${BACKUP_OFFSITE_DIR:-}" ] || [ -d "$_icloud_base" ]; then
  if mkdir -p "$OFFSITE_DIR" 2>/dev/null; then
    if { cp "$BACKUP_DIR/latest.sql" "$OFFSITE_DIR/latest.sql" && cp "$FILE" "$OFFSITE_DIR/$(basename "$FILE")"; }; then
      ok "Copia off-machine → $OFFSITE_DIR"
      # rota también off-machine (conserva los últimos $KEEP)
      OLD_OFF="$(ls -1t "$OFFSITE_DIR"/${DB_NAME}_backup_*.sql 2>/dev/null | tail -n +$((KEEP + 1)))"
      [ -n "$OLD_OFF" ] && echo "$OLD_OFF" | while IFS= read -r f; do rm -f "$f"; done
    else
      warn "No pude copiar off-machine a $OFFSITE_DIR (backup local OK, copia externa omitida)."
    fi
  else
    warn "No pude crear $OFFSITE_DIR (backup local OK, copia externa omitida)."
  fi
else
  info "Sin copia off-machine: no hay iCloud ni BACKUP_OFFSITE_DIR. Actívala con BACKUP_OFFSITE_DIR=/ruta."
fi

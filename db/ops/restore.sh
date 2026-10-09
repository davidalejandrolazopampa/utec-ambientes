#!/usr/bin/env bash
#
# restore.sh — Restaura la base de datos desde un respaldo de backup.sh.
#
#   ./db/restore.sh                 # restaura desde db/backups/latest.sql
#   ./db/restore.sh archivo.sql     # restaura desde un archivo concreto
#
# ⚠️  SOBRESCRIBE el contenido de utec_labs (el dump trae DROP ... IF EXISTS).
#     Pide confirmación antes de continuar.
#
set -euo pipefail

CONTAINER="utec-postgres"
DB_USER="utec_admin"
DB_NAME="utec_labs"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_DIR="$ROOT/db/backups"
FILE="${1:-$BACKUP_DIR/latest.sql}"

c_ok="\033[0;32m"; c_err="\033[0;31m"; c_warn="\033[0;33m"; c_info="\033[0;36m"; c_off="\033[0m"
ok()   { echo -e "${c_ok}✓${c_off} $*"; }
err()  { echo -e "${c_err}✗${c_off} $*"; }
warn() { echo -e "${c_warn}!${c_off} $*"; }
info() { echo -e "${c_info}▸${c_off} $*"; }

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  err "El contenedor '$CONTAINER' no está corriendo."; exit 1
fi
if [ ! -s "$FILE" ]; then
  err "No existe o está vacío el archivo: $FILE"; exit 1
fi

warn "Vas a RESTAURAR '$DB_NAME' desde: $FILE"
warn "Esto SOBRESCRIBE los datos actuales. Escribe 'si' para continuar:"
read -r ans
[ "$ans" = "si" ] || { echo "Cancelado."; exit 0; }

# El origen se copia a un temporal ANTES del auto-backup: si restauras desde
# latest.sql, el backup previo sobreescribiría latest.sql y restaurarías el
# estado actual en vez del respaldo elegido.
SRC="$(mktemp -t utec_restore)"
cp "$FILE" "$SRC"
trap 'rm -f "$SRC"' EXIT

# Red de seguridad: respalda el estado ACTUAL antes de pisarlo (para poder
# deshacer un restore equivocado). No aborta el restore si el backup falla.
info "Respaldando el estado actual antes de restaurar…"
if "$(dirname "${BASH_SOURCE[0]}")/backup.sh"; then
  ok "Estado actual respaldado (recuperable en db/backups/)."
else
  warn "No se pudo respaldar el estado actual; continúo con la restauración de todos modos."
fi

cat "$SRC" | docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" >/dev/null
ok "Restauración completada desde $(basename "$FILE")."

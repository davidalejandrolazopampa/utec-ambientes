#!/usr/bin/env bash
#
# agregar_alumnos.sh — Da de alta ALUMNOS (rol ESTUDIANTE) con correo y carrera.
#
# Inserta en la tabla `usuarios` (rol ESTUDIANTE, activo=true). Es IDEMPOTENTE:
# si el correo ya existe NO lo duplica; solo le actualiza la carrera (si das una).
# No pisa el nombre de un alumno ya registrado.
#
# DOS MODOS:
#
#  1) UNO suelto (das nombres y apellidos por separado, lo más exacto):
#       ./db/agregar_alumnos.sh <correo> "<Nombres>" "<Apellidos>" "[Carrera]"
#     Ej:
#       ./db/agregar_alumnos.sh ana.perez@utec.edu.pe "Ana María" "Pérez Soto" "Ciencia de la Computación"
#
#  2) En LOTE desde un CSV (separado por COMAS):
#       ./db/agregar_alumnos.sh --csv <archivo.csv>
#     Cada línea admite (se detecta el correo por el '@'):
#       nombre_completo, correo, carrera          (3 columnas; carrera opcional)
#       nombres, apellidos, correo, carrera       (4 columnas; lo más exacto)
#     Ej de archivo:
#       Ana María, Pérez Soto, ana.perez@utec.edu.pe, Ciencia de la Computación
#       Juan Quispe Mamani, juan.quispe@utec.edu.pe, Ingeniería Mecatrónica
#     - Se ignoran líneas vacías, las que empiezan con '#' y una cabecera que diga "correo".
#     - Con 1 sola columna de nombre, se parte en nombres/apellidos con heurística
#       (revisa el resumen que imprime; si algo quedó mal, usa el formato de 4 columnas).
#
# Notas:
#   - La carrera debe coincidir con la lista oficial (tabla `carreras`) para que el
#     dashboard la agrupe bien; si no coincide, se inserta igual pero te avisa.
#   - Para ver las carreras oficiales: ./db/agregar_alumnos.sh --carreras
#
set -euo pipefail

CONTAINER="utec-postgres"; DB_USER="utec_admin"; DB_NAME="utec_labs"
psql() { docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 "$@"; }
q()    { docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tA -c "$1" 2>/dev/null; }

c_ok="\033[0;32m"; c_err="\033[0;31m"; c_info="\033[0;36m"; c_warn="\033[0;33m"; c_off="\033[0m"
ok(){ echo -e "${c_ok}✓${c_off} $*"; }; err(){ echo -e "${c_err}✗${c_off} $*"; }
info(){ echo -e "${c_info}▸${c_off} $*"; }; warn(){ echo -e "${c_warn}⚠${c_off} $*"; }

trim(){ local s="$1"; s="${s#"${s%%[![:space:]]*}"}"; s="${s%"${s##*[![:space:]]}"}"; printf '%s' "$s"; }
esc(){ printf '%s' "$1" | sed "s/'/''/g"; }   # escapa comillas simples para SQL
correo_ok(){ [[ "$1" =~ ^[A-Za-z0-9._%+-]+@utec\.edu\.pe$ ]]; }

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  err "El contenedor '$CONTAINER' no está corriendo (docker start $CONTAINER)"; exit 1
fi

# --- utilidades ---------------------------------------------------------------
if [ "${1:-}" = "--carreras" ]; then
  info "Carreras oficiales (usa estos nombres exactos):"
  q "SELECT '  · '||nombre FROM carreras ORDER BY nombre;"
  exit 0
fi

# Parte "Nombre1 Nombre2 Apellido1 Apellido2" en "nombres|apellidos" (heurística).
split_nombre() {
  local full; full="$(trim "$1")"
  # shellcheck disable=SC2206
  local -a t=($full); local n=${#t[@]} na
  if   [ "$n" -ge 4 ]; then na=2
  elif [ "$n" -eq 3 ]; then na=2     # 1 nombre + 2 apellidos (común en Perú)
  elif [ "$n" -eq 2 ]; then na=1
  else printf '%s|' "$full"; return; fi   # 1 token → sin apellidos (se descarta luego)
  local nn=$((n - na))
  printf '%s|%s' "${t[*]:0:nn}" "${t[*]:nn:na}"
}

# Carreras oficiales (para avisar si una no coincide).
OFICIALES="$(q "SELECT nombre FROM carreras;")"
carrera_oficial(){ [ -z "$1" ] && return 0; grep -qxF "$1" <<< "$OFICIALES"; }

# Acumuladores de filas válidas (correo|nombres|apellidos|carrera) ya escapadas.
ROWS=(); OMITIDOS=0

# Agrega una fila al lote tras validar. $1=correo $2=nombres $3=apellidos $4=carrera
agregar_fila() {
  local correo nombres apellidos carrera
  correo="$(trim "$1")"; nombres="$(trim "$2")"; apellidos="$(trim "$3")"; carrera="$(trim "${4:-}")"
  if ! correo_ok "$correo"; then err "Correo inválido (no es @utec.edu.pe): '${correo}' → omitido"; OMITIDOS=$((OMITIDOS+1)); return; fi
  if [ -z "$nombres" ] || [ -z "$apellidos" ]; then
    err "Faltan nombres/apellidos para '${correo}' → omitido (usa el formato de 4 columnas)"; OMITIDOS=$((OMITIDOS+1)); return; fi
  if ! carrera_oficial "$carrera"; then warn "Carrera no oficial para '${correo}': '${carrera}' (se inserta igual; revisa con --carreras)"; fi
  printf -v line "  ('%s','%s','%s','%s')" "$(esc "$correo")" "$(esc "$nombres")" "$(esc "$apellidos")" "$(esc "$carrera")"
  ROWS+=("$line")
  printf "  %-34s %-22s %-22s %s\n" "$correo" "$nombres" "$apellidos" "${carrera:-—}"
}

# --- recolección según el modo ------------------------------------------------
if [ "${1:-}" = "--csv" ]; then
  CSV="${2:-}"; [ -z "$CSV" ] && { err "Falta el archivo: ./db/agregar_alumnos.sh --csv <archivo.csv>"; exit 1; }
  [ -f "$CSV" ] || { err "No existe el archivo '${CSV}'."; exit 1; }
  info "Leyendo '${CSV}'…"
  echo "  ── correo ──────────────────────── nombres ───────────── apellidos ──────────── carrera ──"
  while IFS= read -r raw || [ -n "$raw" ]; do
    line="$(trim "$raw")"
    [ -z "$line" ] && continue
    case "$line" in \#*) continue;; esac
    # cabecera tipo "nombre,correo,carrera"
    shopt -s nocasematch; if [[ "$line" == *correo* && "$line" != *@* ]]; then shopt -u nocasematch; continue; fi; shopt -u nocasematch
    # separar por comas
    IFS=',' read -ra F <<< "$line"
    # localizar el campo que tiene el '@' (correo)
    ci=-1; for i in "${!F[@]}"; do case "${F[$i]}" in *@*) ci=$i; break;; esac; done
    if [ "$ci" -lt 0 ]; then err "Línea sin correo: '${raw}' → omitida"; OMITIDOS=$((OMITIDOS+1)); continue; fi
    correo="$(trim "${F[$ci]}")"
    carrera="$(trim "${F[$((ci+1))]:-}")"
    if [ "$ci" -ge 2 ]; then                      # 2 columnas de nombre antes del correo
      agregar_fila "$correo" "${F[0]}" "${F[1]}" "$carrera"
    elif [ "$ci" -eq 1 ]; then                    # 1 columna de nombre completo
      np="$(split_nombre "${F[0]}")"
      agregar_fila "$correo" "${np%%|*}" "${np#*|}" "$carrera"
    else
      err "No encuentro el nombre antes del correo en: '${raw}' → omitida"; OMITIDOS=$((OMITIDOS+1))
    fi
  done < "$CSV"
else
  # modo UNO suelto: <correo> <nombres> <apellidos> [carrera]
  if [ "$#" -lt 3 ]; then
    err "Uso: ./db/agregar_alumnos.sh <correo> \"<Nombres>\" \"<Apellidos>\" \"[Carrera]\""
    err "  o: ./db/agregar_alumnos.sh --csv <archivo.csv>   ·   --carreras para ver la lista"
    exit 1
  fi
  echo "  ── correo ──────────────────────── nombres ───────────── apellidos ──────────── carrera ──"
  agregar_fila "$1" "$2" "$3" "${4:-}"
fi

# --- inserción ----------------------------------------------------------------
if [ "${#ROWS[@]}" -eq 0 ]; then
  err "No hay alumnos válidos para insertar (omitidos: ${OMITIDOS})."; exit 1
fi

# Unir las filas con coma (cada ROW es "  ('correo','nombres','apellidos','carrera')").
# $(...) ya recorta el salto final, así que solo queda quitar la última coma.
VALUES="$(printf '%s,\n' "${ROWS[@]}")"; VALUES="${VALUES%,}"

info "Insertando ${#ROWS[@]} alumno(s)…"
# ⚠️ El SQL se manda por STDIN (no como argumento `-c`) para no toparse con el límite
# ARG_MAX del SO en cargas GRANDES (miles de filas → el INSERT como argumento fallaba con
# "argument list too long"). Por STDIN aguanta decenas de miles sin problema.
# DISTINCT ON deduplica correos repetidos en el mismo archivo (si no, ON CONFLICT tira
# "cannot affect row a second time") y `lower()` normaliza el correo.
SQL="WITH datos(correo, nombres, apellidos, carrera) AS (VALUES
${VALUES}
),
ins AS (
  INSERT INTO usuarios (correo_utec, nombres, apellidos, rol_id, activo, carrera)
  SELECT DISTINCT ON (lower(d.correo))
         lower(d.correo), d.nombres, d.apellidos,
         (SELECT id FROM roles WHERE nombre='ESTUDIANTE'), true, NULLIF(d.carrera,'')
  FROM datos d
  ORDER BY lower(d.correo)
  ON CONFLICT (correo_utec) DO UPDATE
     SET carrera = COALESCE(NULLIF(EXCLUDED.carrera,''), usuarios.carrera),
         updated_at = now()
  RETURNING (xmax = 0) AS inserted
)
SELECT count(*) FILTER (WHERE inserted) || '|' || count(*) FILTER (WHERE NOT inserted) FROM ins;"
RES="$(printf '%s\n' "$SQL" | psql -tA)"

NUEVOS="${RES%%|*}"; ACTUALIZADOS="${RES##*|}"
ok "Listo: ${NUEVOS} nuevo(s), ${ACTUALIZADOS} ya existían (carrera actualizada si la diste), ${OMITIDOS} omitido(s)."

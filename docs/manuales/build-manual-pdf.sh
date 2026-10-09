#!/usr/bin/env bash
# Genera los PDF de los manuales de usuario a partir del Markdown.
#   docs/15a-manual-alumnos.md          → docs/15a-manual-alumnos.pdf
#   docs/15b-manual-administrativos.md  → docs/15b-manual-administrativos.pdf
#
# Pipeline (sin dependencias instaladas en el repo):
#   1) marked (vía npx) convierte el Markdown a HTML (GitHub-flavored, tablas incluidas).
#   2) Se envuelve en una plantilla HTML con CSS de impresión (A4, centrado, figuras).
#   3) Un navegador Chromium headless (Brave/Chrome/Chromium) imprime el HTML a PDF.
#
# Uso:  bash docs/build-manual-pdf.sh                 # construye ambos
#       bash docs/build-manual-pdf.sh 15a-manual-alumnos   # construye uno
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGETS=("15a-manual-alumnos" "15b-manual-administrativos" "15c-manual-programacion-academica")
[ -n "${1:-}" ] && TARGETS=("$1")   # si pasan un nombre, solo ese

# Navegador Chromium headless
BROWSER=""
for cand in \
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "$(command -v google-chrome || true)" \
  "$(command -v chromium || true)"; do
  if [ -n "$cand" ] && [ -x "$cand" ]; then BROWSER="$cand"; break; fi
done
[ -z "$BROWSER" ] && { echo "No se encontró Brave/Chrome/Chromium." >&2; exit 1; }

build_one() {
  local base="$1"
  local MD="$DIR/$base.md" HTML="$DIR/.$base.tmp.html" PDF="$DIR/$base.pdf"
  [ -f "$MD" ] || { echo "No existe $MD" >&2; return 1; }

  local BODY; BODY="$(npx -y marked --gfm < "$MD")"

  cat > "$HTML" <<HTMLDOC
<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>$base</title>
<style>
  @page { size: A4; margin: 16mm 0; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
         color:#1f2933; line-height:1.5; font-size:11pt;
         width:172mm; margin:0 auto; padding:0; }            /* contenido CENTRADO en la página */
  h1 { color:#0e7490; font-size:24pt; text-align:center; margin:0 0 2px; }
  h1 + h2 { text-align:center; color:#155e75; font-size:13pt; font-weight:600;
            border:0; margin:0 0 18px; padding:0; }
  h2 { color:#0e7490; font-size:15pt; margin:24px 0 8px; border-bottom:1px solid #e5e7eb;
       padding-bottom:4px; break-after:avoid; }
  h3 { color:#155e75; font-size:12.5pt; margin:16px 0 6px; break-after:avoid; }
  p,li { font-size:11pt; }
  p { margin:7px 0; }
  ul,ol { padding-left:22px; margin:7px 0; }
  li { margin:2px 0; }
  code { background:#f1f5f9; padding:1px 5px; border-radius:4px; font-size:10pt; }
  blockquote { border-left:4px solid #06b6d4; background:#f0fdff; margin:12px 0; padding:8px 14px; color:#334155; break-inside:avoid; }
  table { border-collapse:collapse; width:100%; margin:12px 0; font-size:10pt; break-inside:avoid; }
  th,td { border:1px solid #cbd5e1; padding:6px 9px; text-align:left; vertical-align:top; }
  th { background:#ecfeff; color:#0e7490; }
  hr { border:0; border-top:1px solid #e5e7eb; margin:20px 0; }
  /* Figuras: imagen pegada a su título y a su pie, sin cortarse entre páginas.
     Se acota el tamaño para que cada sección (título + figura + pasos) quepa en
     menos espacio y NO deje grandes huecos al saltar de página. */
  img { display:block; margin:6px auto 2px; max-width:100%; height:auto; width:auto;
        border:1px solid #cbd5e1; border-radius:6px; box-shadow:0 1px 4px rgba(0,0,0,.08); }
  img[src$=".png"] { max-height:104mm; }                  /* capturas de pantalla, compactas */
  img[src$=".svg"] { max-height:112mm; max-width:82%; }   /* diagramas de flujo: legibles sin dominar la página */
  p:has(> img) { break-inside:avoid; break-before:avoid; text-align:center; margin:8px 0 0; }
  /* Pie de figura = el párrafo que sigue a una imagen. Se estiliza por posición (no por
     su contenido) para que funcione aunque el pie lleve **negrita** dentro de la cursiva. */
  p:has(> img) + p { break-before:avoid; margin-top:2px; text-align:center; color:#64748b; font-size:9.5pt; }
  p:has(> img) + p strong { color:#64748b; }
  p > em:only-child { display:block; text-align:center; color:#64748b; font-size:9.5pt; }
</style></head>
<body>
$BODY
</body></html>
HTMLDOC

  "$BROWSER" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="$PDF" "file://$HTML" >/dev/null 2>&1 || \
  "$BROWSER" --headless --disable-gpu --print-to-pdf="$PDF" "file://$HTML" >/dev/null 2>&1
  rm -f "$HTML"
  echo "✅ $PDF"
}

for t in "${TARGETS[@]}"; do build_one "$t"; done

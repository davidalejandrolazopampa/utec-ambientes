#!/usr/bin/env python3
"""
ETL: reconstruye las 124 reservas de `avasqueze@` (typo de `avasquez@` =
Alexandra Vasquez Espinoza, RESPONSABLE_LAB) del CSV DataLabs.csv como
**bloqueos PARCIAL de "Actividad personal"** en el Garage (L107), en vez de
reservas de alumno (no eran demanda estudiantil).

Genera la migración Flyway V19__bloqueos_actividad_personal.sql:
  - tipo = PARCIAL, motivo = REUNION, descripcion = 'Actividad personal'.
  - responsable = avasquez@ (nombre/correo tomados de `usuarios`).
  - cada bloqueo afecta SU mesa (bloqueo_recursos); recursos_afectados queda NULL
    (igual que los PARCIAL creados por la app).
  - NO envía correos: la inserción es SQL directa, el código de EmailService no
    corre. ADD-ONLY e idempotente (NOT EXISTS por recurso+fecha+hora+descripcion).

Uso:
    python3 db/etl/import_actividad_personal.py ["/ruta/DataLabs.csv"]
"""
import csv
import os
import re
import sys
from datetime import datetime, timedelta

DEFAULT_CSV = os.path.expanduser("~/Downloads/DataLabs.csv")
# Artefacto de referencia en db/generated/ (NO en migration/: ya está en el
# baseline V1; reintroducirlo duplicaría datos / rompería Flyway por versión).
OUT = os.path.join(
    os.path.dirname(__file__),
    "..", "generated", "bloqueos-actividad-personal.sql",
)

TITULAR = "avasqueze@utec.edu.pe"      # correo mal escrito en el CSV
RESPONSABLE = "avasquez@utec.edu.pe"   # correo real existente en `usuarios`


def norm_email(raw: str) -> str:
    e = (raw or "").replace("\r", "").replace('"', "").replace(" ", "").replace("\t", "").strip().lower()
    if not e:
        return ""
    local = e.split("@", 1)[0]
    return (local + "@utec.edu.pe") if local else ""


def parse_garage(rec: str):
    m = re.search(r"Garage\s+(\d+)", rec or "", re.I)
    if m:
        n = int(m.group(1))
        if 1 <= n <= 11:
            return n
    return None


def hora_fin(hi: str, dur: str) -> str:
    t0 = datetime.strptime(hi.strip(), "%H:%M:%S")
    h, m, s = (int(x) for x in dur.strip().split(":"))
    t1 = t0 + timedelta(hours=h, minutes=m, seconds=s)
    if t1.day != t0.day:
        return "23:59:59"
    return t1.strftime("%H:%M:%S")


def main():
    csv_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV
    if not os.path.exists(csv_path):
        sys.exit(f"No existe el CSV: {csv_path}")

    rows = []  # (qr, fecha, hi, hf)
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f, delimiter=";")
        next(reader, None)
        for row in reader:
            if len(row) < 8:
                continue
            recurso, correo_raw, dia, hi, dur = row[0], row[3], row[4], row[5], row[6]
            if norm_email(correo_raw) != TITULAR:
                continue
            mesa = parse_garage(recurso)
            if not mesa or not dia.strip() or not hi.strip():
                continue
            try:
                hf = hora_fin(hi, dur)
            except (ValueError, IndexError):
                continue
            if hf <= hi.strip():
                continue
            rows.append((f"L107-MESA-{mesa:03d}", dia.strip(), hi.strip(), hf))

    L = []
    L.append("-- V19: reconstruye las 124 'reservas' de avasqueze@ (typo de avasquez@ =")
    L.append("-- Alexandra Vasquez Espinoza, RESPONSABLE_LAB) como BLOQUEOS PARCIAL de")
    L.append("-- 'Actividad personal' en el Garage (L107). No eran demanda de alumnos.")
    L.append("-- Generado por db/etl/import_actividad_personal.py desde DataLabs.csv.")
    L.append(f"-- {len(rows)} bloqueos. motivo=REUNION (cuenta como uso del lab, no operativo).")
    L.append("-- NO envía correos (inserción SQL directa). ADD-ONLY e idempotente.")
    L.append("")
    L.append("CREATE TEMP TABLE _ap(qr text, fecha date, hi time, hf time) ON COMMIT DROP;")
    L.append("INSERT INTO _ap VALUES")
    L.append(",\n".join(f"  ('{qr}','{fecha}','{hi}','{hf}')" for qr, fecha, hi, hf in rows) + ";")
    L.append("")
    L.append("DO $$")
    L.append("DECLARE")
    L.append("  r RECORD; v_resp_id bigint; v_resp_nom text; v_bloqueo_id bigint; v_creados int := 0;")
    L.append("BEGIN")
    L.append(f"  SELECT id, trim(nombres||' '||apellidos) INTO v_resp_id, v_resp_nom")
    L.append(f"    FROM usuarios WHERE correo_utec = '{RESPONSABLE}';")
    L.append("  IF v_resp_id IS NULL THEN")
    L.append(f"    RAISE EXCEPTION 'No existe el responsable {RESPONSABLE}';")
    L.append("  END IF;")
    L.append("  FOR r IN")
    L.append("    SELECT s.fecha, s.hi, s.hf, rl.id AS recurso_id, rl.laboratorio_id")
    L.append("      FROM _ap s JOIN recursos_lab rl ON rl.qr_code = s.qr")
    L.append("  LOOP")
    L.append("    IF EXISTS (SELECT 1 FROM bloqueos b JOIN bloqueo_recursos br ON br.bloqueo_id = b.id")
    L.append("        WHERE br.recurso_id = r.recurso_id AND b.fecha_inicio = r.fecha")
    L.append("          AND b.hora_inicio = r.hi AND b.descripcion = 'Actividad personal') THEN")
    L.append("      CONTINUE;")
    L.append("    END IF;")
    L.append("    INSERT INTO bloqueos (laboratorio_id, tipo, motivo, descripcion, fecha_inicio,")
    L.append("        fecha_fin, hora_inicio, hora_fin, activo, creado_por, responsable_nombre, responsable_correo)")
    L.append("      VALUES (r.laboratorio_id, 'PARCIAL', 'REUNION', 'Actividad personal', r.fecha,")
    L.append(f"        r.fecha, r.hi, r.hf, true, v_resp_id, v_resp_nom, '{RESPONSABLE}')")
    L.append("      RETURNING id INTO v_bloqueo_id;")
    L.append("    INSERT INTO bloqueo_recursos (bloqueo_id, recurso_id) VALUES (v_bloqueo_id, r.recurso_id);")
    L.append("    v_creados := v_creados + 1;")
    L.append("  END LOOP;")
    L.append("  RAISE NOTICE 'V19: % bloqueos de actividad personal creados', v_creados;")
    L.append("END $$;")
    L.append("")

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    print(f"OK -> {os.path.relpath(OUT)}  ({len(rows)} bloqueos)")


if __name__ == "__main__":
    main()

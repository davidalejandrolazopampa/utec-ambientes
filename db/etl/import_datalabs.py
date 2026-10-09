#!/usr/bin/env python3
"""
ETL: importa las reservas históricas de Garage (L107), FabLab (L105/L207) y L101
exportadas de Affluences (archivo "DataLabs.csv") y genera la migración Flyway
V17__reservas_datalabs.sql.

Diferencias con import_affluence_l108*.py:
  - El CSV NO trae columna de mesa limpia: el LAB y la MESA vienen embebidos en
    el nombre del recurso ("Mesa de Trabajo Garage 10", "Reserva de espacio de
    trabajo en FabLab  - 06"). Se parsean con regex y se mapean:
        Garage NN            -> L107 mesa NN         (01-11, directo)
        FabLab 1..5          -> L105 mesa 1..5        (directo)
        FabLab 6..10         -> L207 mesa (n-5)=1..5  (re-mapeo: L207 tiene mesas 1-5)
        L101 (sin nº)        -> L101 mesa 1
  - Tampoco trae nombres ni carrera: la reserva se atribuye a un alumno que YA
    debe existir en `usuarios` (cargado con db/ops/agregar_alumnos.sh). Los titulares
    inexistentes se DESCARTAN (el INNER JOIN a usuarios los omite solo).
  - ADD-ONLY: no borra las reservas existentes. Idempotente (NOT EXISTS por
    recurso+usuario+fecha+hora_inicio; ON CONFLICT DO NOTHING en participantes).
  - Estados: COMPLETADO -> COMPLETADA ; NO_SHOW -> CANCELADA (consistente con L108).
  - Correos escritos a mano: se normaliza forzando el dominio @utec.edu.pe.
  - avasqueze@ (124 reservas) es una cuenta de PERSONAL del lab (responsable), no
    demanda real de alumnos -> se EXCLUYE por completo (BLOQUEADOS) para no sesgar
    la analítica.
  - Acompañantes (cols 9-12): se registran como participantes SOLO si el correo
    (normalizado) existe en `usuarios`; su carrera sale de su perfil.

Uso:
    python3 db/etl/import_datalabs.py ["/ruta/DataLabs.csv"] ["/ruta/salida.sql"]

NOTA: el CSV contiene PII real de alumnos; no se versiona (queda en .gitignore).
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
    "..", "generated", "reservas-datalabs.sql",
)

# Correos mal escritos a mano -> correo real existente en `usuarios`.
ALIAS = {}

# Titulares a EXCLUIR (personal del lab, no demanda de alumnos).
BLOQUEADOS = {"avasqueze@utec.edu.pe"}


def norm_email(raw: str) -> str:
    """Normaliza a <local>@utec.edu.pe (minúsculas, sin espacios/tabs/comillas).
    Devuelve '' si no hay parte local. Aplica el mapa de alias."""
    e = (raw or "").replace("\r", "").replace('"', "").replace(" ", "").replace("\t", "").strip().lower()
    if not e:
        return ""
    local = e.split("@", 1)[0]
    if not local:
        return ""
    email = local + "@utec.edu.pe"
    return ALIAS.get(email, email)


def parse_recurso(rec: str):
    """Devuelve (codigo_lab, numero_mesa) o (None, None) si no se reconoce."""
    rec = (rec or "").strip()
    m = re.search(r"Garage\s+(\d+)", rec, re.I)
    if m:
        n = int(m.group(1))
        return ("L107", n) if 1 <= n <= 11 else (None, None)
    m = re.search(r"FabLab.*?(\d+)\s*$", rec, re.I)
    if m:
        n = int(m.group(1))
        if 1 <= n <= 5:
            return "L105", n
        if 6 <= n <= 10:
            return "L207", n - 5
        return None, None
    if rec.upper() == "L101":
        return "L101", 1
    return None, None


def hora_fin(hi: str, dur: str) -> str:
    t0 = datetime.strptime(hi.strip(), "%H:%M:%S")
    h, m, s = (int(x) for x in dur.strip().split(":"))
    t1 = t0 + timedelta(hours=h, minutes=m, seconds=s)
    if t1.day != t0.day:            # desbordó el día -> acota
        return "23:59:59"
    return t1.strftime("%H:%M:%S")


def esc(s: str) -> str:
    return (s or "").strip().replace("'", "''")


def main():
    csv_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV
    out_path = sys.argv[2] if len(sys.argv) > 2 else OUT
    if not os.path.exists(csv_path):
        sys.exit(f"No existe el CSV: {csv_path}")

    rows = []          # (qr, correo, fecha, hi, hf, estado, part, [a1..a4])
    skip_lab = skip_titular = skip_fecha = skip_hora = skip_bloq = 0
    labs_cnt = {}

    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f, delimiter=";")
        next(reader, None)  # cabecera
        for row in reader:
            if len(row) < 8:
                continue
            recurso, _lab_col, _rec2, correo_raw, dia, hi, dur, cancelado = row[:8]
            acomp = [row[i] if i < len(row) else "" for i in (8, 9, 10, 11)]

            lab, mesa = parse_recurso(recurso)
            if not lab:
                skip_lab += 1
                continue
            correo = norm_email(correo_raw)
            if not correo:
                skip_titular += 1
                continue
            if correo in BLOQUEADOS:
                skip_bloq += 1
                continue
            if not dia.strip() or not hi.strip():
                skip_fecha += 1
                continue
            try:
                hf = hora_fin(hi, dur)
            except (ValueError, IndexError):
                skip_hora += 1
                continue
            if hf <= hi.strip():
                skip_hora += 1
                continue

            estado = "CANCELADA" if cancelado.strip().upper() == "NO_SHOW" else "COMPLETADA"
            qr = f"{lab}-MESA-{mesa:03d}"
            a = [norm_email(x) for x in acomp]
            part = 1 + sum(1 for x in a if x)
            rows.append((qr, correo, dia.strip(), hi.strip(), hf, estado, part, a))
            labs_cnt[lab] = labs_cnt.get(lab, 0) + 1

    # ── Generar SQL ──
    L = []
    L.append("-- V17: importa reservas históricas de Garage (L107), FabLab (L105/L207) y L101.")
    L.append("-- Generado por db/etl/import_datalabs.py desde DataLabs.csv (Affluences).")
    L.append(f"-- {len(rows)} reservas. Por lab: " + ", ".join(f"{k}={v}" for k, v in sorted(labs_cnt.items())) + ".")
    L.append("-- ADD-ONLY e idempotente. Los recursos ya existen (V16). Los titulares")
    L.append("-- deben existir en `usuarios` (cargados con db/ops/agregar_alumnos.sh); los")
    L.append("-- inexistentes se descartan solos por el INNER JOIN.")
    L.append(f"-- Descartadas: lab_no_reconocido={skip_lab}, sin_titular={skip_titular}, "
             f"bloqueados={skip_bloq}, sin_fecha={skip_fecha}, hora_invalida={skip_hora}.")
    L.append("")
    L.append("-- Staging temporal (se descarta al COMMIT de la migración).")
    L.append("CREATE TEMP TABLE _dl(qr text, correo text, fecha date, hi time, hf time,")
    L.append("    estado text, part int, a1 text, a2 text, a3 text, a4 text) ON COMMIT DROP;")
    L.append("")
    L.append("INSERT INTO _dl VALUES")

    def row_sql(r):
        qr, correo, fecha, hi, hf, estado, part, a = r
        a = (a + ["", "", "", ""])[:4]
        acols = ",".join("'" + esc(x) + "'" for x in a)
        return f"  ('{qr}','{esc(correo)}','{fecha}','{hi}','{hf}','{estado}',{part},{acols})"

    L.append(",\n".join(row_sql(r) for r in rows) + ";")
    L.append("")
    L.append("-- 1) Reservas (INNER JOIN a usuarios descarta titulares inexistentes;")
    L.append("--    NOT EXISTS evita duplicar si la migración se re-corre).")
    L.append("INSERT INTO reservas (recurso_id, usuario_id, fecha, hora_inicio, hora_fin,")
    L.append("    estado, tipo_reserva, participantes, carrera, creado_por)")
    L.append("SELECT rl.id, u.id, s.fecha, s.hi, s.hf, s.estado::estado_reserva, 'ALUMNO',")
    L.append("       s.part, u.carrera, u.id")
    L.append("FROM _dl s")
    L.append("JOIN recursos_lab rl ON rl.qr_code = s.qr")
    L.append("JOIN usuarios u ON lower(u.correo_utec) = s.correo")
    L.append("WHERE NOT EXISTS (SELECT 1 FROM reservas r WHERE r.recurso_id = rl.id")
    L.append("    AND r.usuario_id = u.id AND r.fecha = s.fecha AND r.hora_inicio = s.hi);")
    L.append("")
    L.append("-- 2) Participante TITULAR por reserva importada (carrera del perfil).")
    L.append("INSERT INTO reserva_participantes (reserva_id, usuario_id, correo_utec,")
    L.append("    nombre_completo, carrera, es_titular)")
    L.append("SELECT r.id, u.id, u.correo_utec, trim(u.nombres||' '||u.apellidos), u.carrera, true")
    L.append("FROM _dl s")
    L.append("JOIN recursos_lab rl ON rl.qr_code = s.qr")
    L.append("JOIN usuarios u ON lower(u.correo_utec) = s.correo")
    L.append("JOIN reservas r ON r.recurso_id = rl.id AND r.usuario_id = u.id")
    L.append("    AND r.fecha = s.fecha AND r.hora_inicio = s.hi")
    L.append("ON CONFLICT (reserva_id, correo_utec) DO NOTHING;")
    L.append("")
    L.append("-- 3) Acompañantes: SOLO los que existen en usuarios (carrera del perfil).")
    L.append("INSERT INTO reserva_participantes (reserva_id, usuario_id, correo_utec,")
    L.append("    nombre_completo, carrera, es_titular)")
    L.append("SELECT r.id, ua.id, ua.correo_utec, trim(ua.nombres||' '||ua.apellidos), ua.carrera, false")
    L.append("FROM _dl s")
    L.append("JOIN recursos_lab rl ON rl.qr_code = s.qr")
    L.append("JOIN usuarios ut ON lower(ut.correo_utec) = s.correo")
    L.append("JOIN reservas r ON r.recurso_id = rl.id AND r.usuario_id = ut.id")
    L.append("    AND r.fecha = s.fecha AND r.hora_inicio = s.hi")
    L.append("CROSS JOIN LATERAL (VALUES (s.a1),(s.a2),(s.a3),(s.a4)) AS ac(correo)")
    L.append("JOIN usuarios ua ON lower(ua.correo_utec) = ac.correo")
    L.append("WHERE ac.correo <> '' AND ua.id <> ut.id")
    L.append("ON CONFLICT (reserva_id, correo_utec) DO NOTHING;")
    L.append("")

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    print(f"OK -> {os.path.relpath(out_path)}")
    print(f"   {len(rows)} reservas | por lab: {labs_cnt}")
    print(f"   descartadas: lab={skip_lab}, titular_vacio={skip_titular}, "
          f"bloqueados={skip_bloq}, fecha={skip_fecha}, hora={skip_hora}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
ETL: importa las reservas reales de L108 exportadas de Affluences (2026) y
genera la migración Flyway V12__import_reservas_l108_2026.sql.

Uso:
    python3 db/etl/import_affluence_l108.py "/ruta/Affluence L108.csv"

La migración generada es autocontenida y reproducible en una BD limpia:
  1) crea los 12 recursos MESA de L108 (idempotente),
  2) da de alta a los alumnos (idempotente por correo),
  3) BORRA las reservas actuales (+ dependientes) para evitar cruces,
  4) inserta las reservas del CSV (estado COMPLETADA, o CANCELADA si aplica).

NOTA: el CSV contiene PII real de alumnos; no se versiona (queda en .gitignore).
"""
import csv
import os
import re
import sys
from datetime import datetime, timedelta

LAB = "L108"
DEFAULT_CSV = os.path.expanduser("~/Downloads/Affluence L108.csv")
# Artefacto de referencia en db/generated/ (NO en migration/: ya está en el
# baseline V1; reintroducirlo duplicaría datos / rompería Flyway por versión).
OUT = os.path.join(
    os.path.dirname(__file__),
    "..", "generated", "reservas-l108-2026.sql",
)


def esc(s: str) -> str:
    return (s or "").strip().replace("'", "''")


def hora_fin(hi: str, dur: str) -> str:
    t0 = datetime.strptime(hi.strip(), "%H:%M:%S")
    h, m, s = (int(x) for x in dur.strip().split(":"))
    t1 = t0 + timedelta(hours=h, minutes=m, seconds=s)
    # Acotar a 23:59:59 por si una duración desborda el día.
    if t1.day != t0.day:
        return "23:59:59"
    return t1.strftime("%H:%M:%S")


def main():
    csv_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV
    out_path = sys.argv[2] if len(sys.argv) > 2 else OUT
    if not os.path.exists(csv_path):
        sys.exit(f"No existe el CSV: {csv_path}")

    alumnos = {}          # correo_lower -> (nombres, apellidos)
    reservas = []         # (qr, correo, fecha, hi, hf, estado, part, motivo, carrera)

    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f, delimiter=";")
        next(reader, None)  # cabecera
        for row in reader:
            if len(row) < 12:
                continue
            mesa, correo, cant, dia, hi, dur, cancelado, nombre, apellido, nota, carrera = (
                row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], row[10], row[11],
            )
            correo = correo.strip().lower()
            mnum = re.search(r"(\d+)", mesa or "")
            if not correo or not mnum or not dia.strip() or not hi.strip():
                continue
            qr = f"{LAB}-MESA-{int(mnum.group(1)):03d}"
            estado = "CANCELADA" if cancelado.strip() else "COMPLETADA"
            try:
                part = int(cant)
            except (ValueError, TypeError):
                part = 1
            alumnos.setdefault(correo, (nombre.strip() or correo.split("@")[0], apellido.strip() or "-"))
            reservas.append((qr, correo, dia.strip(), hi.strip(), hora_fin(hi, dur), estado, max(part, 1), nota.strip(), carrera.strip()))

    # ── Generar SQL ──
    lines = []
    lines.append("-- V13: re-importa L108 (Affluences 2026) AÑADIENDO la carrera por reserva.")
    lines.append("-- Generado por db/etl/import_affluence_l108.py. Autocontenida y reproducible.")
    lines.append(f"-- {len(reservas)} reservas · {len(alumnos)} alumnos.")
    lines.append("")
    lines.append("-- 0) Columna carrera en reservas (idempotente).")
    lines.append("ALTER TABLE reservas ADD COLUMN IF NOT EXISTS carrera VARCHAR(150);")
    lines.append("")
    lines.append("-- 1) Recursos MESA 1..12 de L108 (idempotente por (lab, tipo, numero)).")
    lines.append(
        "INSERT INTO recursos_lab (laboratorio_id, tipo, nombre, numero, qr_code, estado, capacidad_personas, activo)\n"
        "SELECT l.id, 'MESA', 'MESA '||n, n, '" + LAB + "-MESA-'||lpad(n::text,3,'0'), 'DISPONIBLE', 5, true\n"
        "FROM laboratorios l, generate_series(1,12) AS n\n"
        f"WHERE l.codigo_lab='{LAB}'\n"
        "ON CONFLICT (laboratorio_id, tipo, numero) DO NOTHING;"
    )
    lines.append("")
    lines.append("-- 2) Alumnos (idempotente por correo).")
    vals = ",\n".join(
        f"  ('{esc(c)}','{esc(n)}','{esc(a)}',6,true)" for c, (n, a) in sorted(alumnos.items())
    )
    lines.append(
        "INSERT INTO usuarios (correo_utec, nombres, apellidos, rol_id, activo) VALUES\n"
        + vals + "\nON CONFLICT (correo_utec) DO NOTHING;"
    )
    lines.append("")
    lines.append("-- 3) Limpia TODAS las reservas actuales (+ dependientes) para evitar cruces.")
    lines.append("DELETE FROM reserva_participantes;")
    lines.append("DELETE FROM qr_validaciones;")
    lines.append("DELETE FROM auditoria_reservas;")
    lines.append("DELETE FROM reservas;")
    lines.append("")
    lines.append("-- 4) Reservas del CSV (creado_por = el propio alumno).")
    lines.append("-- El CHECK (fecha >= CURRENT_DATE) de V1 bloquea histórico: se quita, se")
    lines.append("-- inserta, y se re-crea NOT VALID (sigue vigente para reservas NUEVAS,")
    lines.append("-- sin revalidar las históricas importadas).")
    lines.append("ALTER TABLE reservas DROP CONSTRAINT IF EXISTS chk_reserva_fecha;")
    def row_sql(r):
        qr, correo, fecha, hi, hf, estado, part, motivo, carrera = r
        motivo_sql = "NULL" if not motivo else "'" + esc(motivo) + "'"
        carrera_sql = "NULL" if not carrera else "'" + esc(carrera) + "'"
        return f"  ('{qr}','{esc(correo)}','{fecha}','{hi}','{hf}','{estado}',{part},{motivo_sql},{carrera_sql})"
    rvals = ",\n".join(row_sql(r) for r in reservas)
    lines.append(
        "INSERT INTO reservas (recurso_id, usuario_id, fecha, hora_inicio, hora_fin, estado, tipo_reserva, participantes, motivo, carrera, creado_por)\n"
        "SELECT rl.id, u.id, v.fecha::date, v.hi::time, v.hf::time, v.estado::estado_reserva, 'ALUMNO', v.part, v.motivo, v.carrera, u.id\n"
        "FROM (VALUES\n" + rvals + "\n) AS v(qr, correo, fecha, hi, hf, estado, part, motivo, carrera)\n"
        "JOIN recursos_lab rl ON rl.qr_code = v.qr\n"
        "JOIN usuarios u ON u.correo_utec = v.correo;"
    )
    lines.append("")
    lines.append("ALTER TABLE reservas ADD CONSTRAINT chk_reserva_fecha CHECK (fecha >= CURRENT_DATE) NOT VALID;")
    lines.append("")
    lines.append("-- 5) Participante TITULAR por reserva (reserva_participantes, V10).")
    lines.append("-- La gráfica \"Reservas por carrera\" cuenta POR participante; sin esta fila")
    lines.append("-- las reservas importadas no aparecerían. Una fila por reserva (titular).")
    lines.append(
        "INSERT INTO reserva_participantes (reserva_id, usuario_id, correo_utec, nombre_completo, carrera, es_titular)\n"
        "SELECT r.id, u.id, u.correo_utec, trim(u.nombres||' '||u.apellidos), r.carrera, true\n"
        "FROM reservas r JOIN usuarios u ON u.id = r.usuario_id\n"
        "ON CONFLICT (reserva_id, correo_utec) DO NOTHING;")
    lines.append("")

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"OK → {os.path.relpath(out_path)}  ({len(reservas)} reservas, {len(alumnos)} alumnos)")


if __name__ == "__main__":
    main()

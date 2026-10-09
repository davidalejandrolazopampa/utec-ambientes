#!/usr/bin/env python3
"""
Genera V7__reservas_l108_2025.sql a partir del CSV de Affluences 2025 de L108.

A diferencia del ETL de 2026 (import_affluence_l108.py), este es ADD-ONLY:
NO borra reservas existentes (conserva los datos de 2026). Solo:
  1) asegura las mesas 1..12 de L108 (ON CONFLICT DO NOTHING),
  2) crea los alumnos del CSV (ON CONFLICT por correo DO NOTHING),
  3) inserta las reservas de 2025.

Reglas (acordadas):
  - estado: vacío -> COMPLETADA ; cualquier valor en "Cancelación por" (p. ej. NO_SHOW) -> CANCELADA.
  - carrera: se normaliza al nombre OFICIAL de la BD (evita duplicados en el dashboard).

Uso: python3 db/etl/import_affluence_l108_2025.py "~/Downloads/Affluence L108 2025.csv"
"""
import csv, os, re, sys
from datetime import datetime, timedelta

LAB = "L108"
DEFAULT_CSV = os.path.expanduser("~/Downloads/Affluence L108 2025.csv")
# Artefacto de referencia en db/generated/ (NO en migration/: la V7 viva es
# ciclo_excepciones → Flyway abortaría por versión duplicada; ya está en baseline).
OUT = os.path.join(os.path.dirname(__file__), "..", "generated", "reservas-l108-2025.sql")

# CSV (sin tilde / nombre antiguo) -> nombre OFICIAL en la tabla `carreras`.
CARRERA_MAP = {
    "ingenieria mecanica": "Ingeniería Mecánica",
    "ciencia de la computacion": "Ciencia de la Computación",
    "ingenieria mecatronica": "Ingeniería Mecatrónica",
    "ingenieria industrial": "Ingeniería Industrial",
    "bioingenieria": "Bioingeniería",
    "ingenieria civil": "Ingeniería Civil",
    "administracion y negocios digitales": "Administración y Negocios Digitales",
    "ciencia de datos": "Ciencia de Datos e Inteligencia Artificial",
    "ingenieria quimica": "Ingeniería Química",
    "ingenieria electronica": "Ingeniería Electrónica",
    "ingenieria de la energia": "Ingeniería de la Energía",
    "ingenieria ambiental": "Ingeniería Ambiental",
}


def esc(s: str) -> str:
    return (s or "").replace("'", "''")


def hora_fin(hi: str, dur: str) -> str:
    t0 = datetime.strptime(hi.strip(), "%H:%M:%S")
    h, m, s = (int(x) for x in dur.strip().split(":"))
    t1 = t0 + timedelta(hours=h, minutes=m, seconds=s)
    if t1.day != t0.day:
        return "23:59:59"
    return t1.strftime("%H:%M:%S")


def norm_carrera(c: str):
    c = (c or "").strip()
    if not c:
        return None, None
    oficial = CARRERA_MAP.get(c.lower())
    return (oficial, None) if oficial else (c, c)  # 2º valor != None => no mapeada


def main():
    csv_path = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV)
    if not os.path.exists(csv_path):
        sys.exit(f"No existe el CSV: {csv_path}")

    alumnos, reservas, sin_mapear = {}, [], set()
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f, delimiter=";")
        next(reader, None)
        for row in reader:
            if len(row) < 12:
                continue
            mesa, correo, cant, dia, hi, dur, cancelado, nombre, apellido, nota, carrera = (
                row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], row[10], row[11])
            correo = correo.strip().lower()
            mnum = re.search(r"(\d+)", mesa or "")
            if not correo or not mnum or not dia.strip() or not hi.strip():
                continue
            qr = f"{LAB}-MESA-{int(mnum.group(1)):03d}"
            estado = "CANCELADA" if cancelado.strip() else "COMPLETADA"
            try:
                part = max(int(cant), 1)
            except (ValueError, TypeError):
                part = 1
            carr, no_map = norm_carrera(carrera)
            if no_map:
                sin_mapear.add(no_map)
            alumnos.setdefault(correo, (nombre.strip() or correo.split("@")[0], apellido.strip() or "-"))
            reservas.append((qr, correo, dia.strip(), hi.strip(), hora_fin(hi, dur), estado, part, nota.strip(), carr))

    if sin_mapear:
        sys.exit("Carreras sin mapear (añádelas a CARRERA_MAP): " + " | ".join(sorted(sin_mapear)))

    L = []
    L.append("-- V7: importa las reservas de Affluences L108 2025 (ADD-ONLY, no borra 2026).")
    L.append("-- Generado por db/etl/import_affluence_l108_2025.py.")
    L.append(f"-- {len(reservas)} reservas · {len(alumnos)} alumnos · estados: vacío=COMPLETADA, NO_SHOW/otro=CANCELADA.")
    L.append("")
    L.append("-- 1) Mesas 1..12 de L108 (idempotente).")
    L.append(
        "INSERT INTO recursos_lab (laboratorio_id, tipo, nombre, numero, qr_code, estado, capacidad_personas, activo)\n"
        "SELECT l.id, 'MESA', 'MESA '||n, n, '" + LAB + "-MESA-'||lpad(n::text,3,'0'), 'DISPONIBLE', 5, true\n"
        "FROM laboratorios l, generate_series(1,12) AS n\n"
        f"WHERE l.codigo_lab='{LAB}'\n"
        "ON CONFLICT (laboratorio_id, tipo, numero) DO NOTHING;")
    L.append("")
    L.append("-- 2) Alumnos del CSV (idempotente por correo).")
    vals = ",\n".join(f"  ('{esc(c)}','{esc(n)}','{esc(a)}',6,true)" for c, (n, a) in sorted(alumnos.items()))
    L.append("INSERT INTO usuarios (correo_utec, nombres, apellidos, rol_id, activo) VALUES\n" + vals +
             "\nON CONFLICT (correo_utec) DO NOTHING;")
    L.append("")
    L.append("-- 3) Reservas 2025 (creado_por = el propio alumno). SIN borrar nada existente.")

    def row_sql(r):
        qr, correo, fecha, hi, hf, estado, part, motivo, carrera = r
        motivo_sql = "NULL" if not motivo else "'" + esc(motivo) + "'"
        carrera_sql = "NULL" if not carrera else "'" + esc(carrera) + "'"
        return f"  ('{qr}','{esc(correo)}','{fecha}','{hi}','{hf}','{estado}',{part},{motivo_sql},{carrera_sql})"

    rvals = ",\n".join(row_sql(r) for r in reservas)
    L.append(
        "INSERT INTO reservas (recurso_id, usuario_id, fecha, hora_inicio, hora_fin, estado, tipo_reserva, participantes, motivo, carrera, creado_por)\n"
        "SELECT rl.id, u.id, v.fecha::date, v.hi::time, v.hf::time, v.estado::estado_reserva, 'ALUMNO', v.part, v.motivo, v.carrera, u.id\n"
        "FROM (VALUES\n" + rvals + "\n) AS v(qr, correo, fecha, hi, hf, estado, part, motivo, carrera)\n"
        "JOIN recursos_lab rl ON rl.qr_code = v.qr\n"
        "JOIN usuarios u ON u.correo_utec = v.correo;")
    L.append("")
    L.append("-- 4) Participante TITULAR por reserva (reserva_participantes, V10). ADD-ONLY:")
    L.append("-- el ON CONFLICT salta las reservas que ya tienen titular (p. ej. las 2026)")
    L.append("-- y solo agrega el de las nuevas 2025. La gráfica de carreras cuenta por participante.")
    L.append(
        "INSERT INTO reserva_participantes (reserva_id, usuario_id, correo_utec, nombre_completo, carrera, es_titular)\n"
        "SELECT r.id, u.id, u.correo_utec, trim(u.nombres||' '||u.apellidos), r.carrera, true\n"
        "FROM reservas r JOIN usuarios u ON u.id = r.usuario_id\n"
        "ON CONFLICT (reserva_id, correo_utec) DO NOTHING;")
    L.append("")

    out = os.path.abspath(OUT)
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    print(f"OK -> {out}\n  {len(reservas)} reservas, {len(alumnos)} alumnos")


if __name__ == "__main__":
    main()

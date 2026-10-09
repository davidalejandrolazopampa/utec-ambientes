#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ETL: importa "directorio-laboratorios.csv" a la BD utec_labs.
- Lee el CSV en Mac Roman para recuperar tildes/ñ (coincide con encoding="mac_roman").
- Genera personas (decanos/directores/responsables) con correo inicial+apellido.
- Construye facultades, departamentos, carreras, laboratorios y lab_responsables.
- Marca todos los labs como INACTIVO excepto "Concept Lab".
- Conserva y reutiliza usuarios de login: conceptlab, david.lazo, dlazo.
Salida: archivo SQL transaccional en db/generated/directorio-laboratorios.sql + resumen por stdout.
"""
import csv
import os
import sys
import unicodedata
from collections import Counter, OrderedDict

# Rutas relativas a este script (db/etl/), portables entre máquinas.
_ETL_DIR = os.path.dirname(os.path.abspath(__file__))
_DB_DIR = os.path.join(_ETL_DIR, "..")            # db/
_ROOT = os.path.join(_ETL_DIR, "..", "..")         # raíz del repo

CSV_PATH = os.path.join(_DB_DIR, "data", "directorio-laboratorios.csv")
SQL_PATH = os.path.join(_DB_DIR, "generated", "directorio-laboratorios.sql")
# ⚠️ La salida NO va a backend/.../db/migration/ (colisionaría con la V5 viva
# = ciclos_academicos y Flyway abortaría por versión duplicada). Este ETL ya se
# consolidó en V1__baseline.sql; su salida es solo un artefacto de referencia.
MIGRATION_PATH = os.path.join(_DB_DIR, "generated", "migracion-directorio-laboratorios.sql")

# Usuarios de login que se conservan (no se borran, se reutilizan por correo)
KEEP_EMAILS = {"conceptlab@utec.edu.pe", "david.lazo@utec.edu.pe", "dlazo@utec.edu.pe"}

VACIOS = {"", "n/a", "sin asignar", "na"}

# Correos para nombres con nombre de pila compuesto (apellido en la ultima palabra)
EMAIL_OVERRIDE = {
    "Juan Carlos Rodríguez": "jrodriguez",
    "Eric Javier Biagioli": "ebiagioli",
}


def strip_accents(s: str) -> str:
    nfkd = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def is_empty(v: str) -> bool:
    return v is None or v.strip().lower() in VACIOS


def clean(v: str) -> str:
    return v.strip() if v else ""


def name_tokens(fullname: str):
    # quita iniciales sueltas tipo "S." y tokens de 1 letra
    return [t for t in fullname.split() if len(t.replace(".", "")) > 1]


def email_base(fullname: str) -> str:
    if fullname in EMAIL_OVERRIDE:
        return EMAIL_OVERRIDE[fullname]
    toks = name_tokens(fullname)
    if not toks:
        toks = fullname.split()
    first = toks[0]
    if len(toks) >= 4:
        last = toks[2]          # [nombre1 nombre2 apellido1 apellido2]
    elif len(toks) == 3:
        last = toks[1]          # [nombre apellido1 apellido2]
    elif len(toks) == 2:
        last = toks[1]
    else:
        last = toks[0]
    base = strip_accents(first[0] + last).lower()
    base = "".join(ch for ch in base if ch.isalnum())
    return base


def split_nombre_apellidos(fullname: str):
    toks = fullname.split()
    if len(toks) >= 4:
        return " ".join(toks[:2]), " ".join(toks[2:])
    if len(toks) == 3:
        return toks[0], " ".join(toks[1:])
    if len(toks) == 2:
        return toks[0], toks[1]
    return fullname, "(s/a)"


def sql_str(v):
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


# ---------------- Parseo del CSV ----------------
rows = []
with open(CSV_PATH, encoding="mac_roman", newline="") as f:
    reader = csv.reader(f, delimiter=";")
    header = next(reader)
    for r in reader:
        if not any(clean(x) for x in r):
            continue
        rows.append(r)

# Estructuras
personas = OrderedDict()   # email_base -> {nombre_completo, emails_taken, rol}
facultades = OrderedDict()  # nombre -> decano_fullname
departamentos = OrderedDict()  # nombre -> {facultad, directores:Counter}
carreras = OrderedDict()    # nombre -> facultad
labs = []                   # dicts

ROL_RANK = {"RESPONSABLE_LAB": 1, "DIRECTOR": 2}


def add_persona(fullname, rol):
    fullname = clean(fullname)
    if is_empty(fullname):
        return None
    base = email_base(fullname)
    if base in personas:
        p = personas[base]
        # se queda con el nombre mas largo (mas completo)
        if len(fullname) > len(p["nombre"]):
            p["nombre"] = fullname
        if ROL_RANK[rol] > ROL_RANK[p["rol"]]:
            p["rol"] = rol
        return base
    personas[base] = {"nombre": fullname, "rol": rol}
    return base


codigos_vistos = Counter()

for r in rows:
    # asegurar longitud
    def col(i):
        return clean(r[i]) if i < len(r) else ""

    facultad = col(1)
    decano = col(2)
    departamento = col(3)
    carrera = col(4)
    codigo = col(5)
    piso = col(6)
    fase = col(7)
    nombre_lab = col(8)
    director = col(9)
    responsables_raw = [r[i] for i in range(10, len(r))]

    # personas
    decano_base = add_persona(decano, "DIRECTOR")
    director_base = add_persona(director, "DIRECTOR")
    resp_bases = []
    for rp in responsables_raw:
        b = add_persona(rp, "RESPONSABLE_LAB")
        if b and b not in resp_bases:
            resp_bases.append(b)

    # facultad
    if not is_empty(facultad):
        if facultad not in facultades:
            facultades[facultad] = decano_base
        elif facultades[facultad] is None and decano_base:
            facultades[facultad] = decano_base

    # departamento
    if not is_empty(departamento):
        d = departamentos.setdefault(
            departamento,
            {"facultad": facultad if not is_empty(facultad) else None, "directores": Counter()},
        )
        if director_base:
            d["directores"][director_base] += 1

    # carrera
    if not is_empty(carrera):
        carreras.setdefault(carrera, facultad if not is_empty(facultad) else None)

    # codigo unico
    cod = codigo
    if codigos_vistos[codigo] > 0:
        cod = (codigo + "-" + str(codigos_vistos[codigo] + 1))[:10]
    codigos_vistos[codigo] += 1

    labs.append({
        "codigo": cod,
        "nombre": nombre_lab,
        "piso": int(piso) if piso.lstrip("-").isdigit() else 0,
        "fase": fase if not is_empty(fase) else "Fase 1",
        "departamento": departamento if not is_empty(departamento) else None,
        "carrera": carrera if not is_empty(carrera) else None,
        "director": director_base,
        "responsables": resp_bases,
        "estado": "ACTIVO" if nombre_lab.strip().lower() == "concept lab" else "INACTIVO",
    })

# Email final por persona (resuelve colisiones de base)
emails = {}
usados = set(e.lower() for e in KEEP_EMAILS)
# reservar dlazo para David Lazo si aparece (reuse): si base 'dlazo' existe, su correo sera dlazo@
for base, p in personas.items():
    correo = base + "@utec.edu.pe"
    if correo.lower() in usados and correo.lower() not in {e.lower() for e in KEEP_EMAILS}:
        i = 2
        while (base + str(i) + "@utec.edu.pe").lower() in usados:
            i += 1
        correo = base + str(i) + "@utec.edu.pe"
    usados.add(correo.lower())
    emails[base] = correo
    p["correo"] = correo

# ---------------- Generar SQL (cuerpo compartido) ----------------
out = []
w = out.append
w("-- 1) Limpiar datos dependientes y de dominio (conservando usuarios de login)")
w("DELETE FROM equipamiento;")
w("DELETE FROM recursos_lab;")
w("DELETE FROM lab_responsables;")
w("UPDATE usuarios SET departamento_id = NULL;")
w("DELETE FROM laboratorios;")
w("DELETE FROM carreras;")
w("DELETE FROM departamentos;")
w("DELETE FROM facultades;")
w("DELETE FROM usuarios WHERE correo_utec NOT IN (" + ", ".join(sql_str(e) for e in sorted(KEEP_EMAILS)) + ");")
w("")
w("-- 2) Personas (decanos, directores, responsables)")
for base, p in personas.items():
    nom, ape = split_nombre_apellidos(p["nombre"])
    rol = p["rol"]
    w(
        "INSERT INTO usuarios (correo_utec, nombres, apellidos, rol_id) "
        f"VALUES ({sql_str(p['correo'])}, {sql_str(nom)}, {sql_str(ape)}, "
        f"(SELECT id FROM roles WHERE nombre='{rol}')) "
        "ON CONFLICT (correo_utec) DO NOTHING;"
    )
w("")
w("-- 3) Facultades (decano)")
for nombre, decano_base in facultades.items():
    dec = sql_str(emails[decano_base]) if decano_base else None
    decano_sql = f"(SELECT id FROM usuarios WHERE correo_utec={dec})" if decano_base else "NULL"
    w(f"INSERT INTO facultades (nombre, decano_id) VALUES ({sql_str(nombre)}, {decano_sql});")
w("")
w("-- 4) Departamentos (facultad + director mas frecuente)")
for nombre, d in departamentos.items():
    fac_sql = (
        f"(SELECT id FROM facultades WHERE nombre={sql_str(d['facultad'])})"
        if d["facultad"] else "NULL"
    )
    if d["directores"]:
        dir_base = d["directores"].most_common(1)[0][0]
        dir_sql = f"(SELECT id FROM usuarios WHERE correo_utec={sql_str(emails[dir_base])})"
    else:
        dir_sql = "NULL"
    w(f"INSERT INTO departamentos (nombre, facultad_id, director_id) VALUES ({sql_str(nombre)}, {fac_sql}, {dir_sql});")
w("")
w("-- 5) Carreras")
for nombre, fac in carreras.items():
    if not fac:
        continue  # facultad_id es NOT NULL; omitir carreras sin facultad
    w(
        f"INSERT INTO carreras (nombre, facultad_id) VALUES ({sql_str(nombre)}, "
        f"(SELECT id FROM facultades WHERE nombre={sql_str(fac)}));"
    )
w("")
w("-- 6) Laboratorios")
for l in labs:
    dep_sql = f"(SELECT id FROM departamentos WHERE nombre={sql_str(l['departamento'])})" if l["departamento"] else "NULL"
    car_sql = f"(SELECT id FROM carreras WHERE nombre={sql_str(l['carrera'])})" if l["carrera"] else "NULL"
    dir_sql = f"(SELECT id FROM usuarios WHERE correo_utec={sql_str(emails[l['director']])})" if l["director"] else "NULL"
    w(
        "INSERT INTO laboratorios (codigo_lab, nombre, piso, ubicacion_fase, departamento_id, carrera_id, director_id, estado) "
        f"VALUES ({sql_str(l['codigo'])}, {sql_str(l['nombre'])}, {l['piso']}, {sql_str(l['fase'])}, "
        f"{dep_sql}, {car_sql}, {dir_sql}, '{l['estado']}');"
    )
w("")
w("-- 7) Responsables de laboratorio")
for l in labs:
    for rb in l["responsables"]:
        w(
            "INSERT INTO lab_responsables (laboratorio_id, usuario_id) VALUES ("
            f"(SELECT id FROM laboratorios WHERE codigo_lab={sql_str(l['codigo'])}), "
            f"(SELECT id FROM usuarios WHERE correo_utec={sql_str(emails[rb])})) "
            "ON CONFLICT (laboratorio_id, usuario_id) DO NOTHING;"
        )
w("")
w("-- 8) Autocompletar departamento_id de cada director (cascada jerarquia)")
w("UPDATE usuarios u SET departamento_id = d.id FROM departamentos d WHERE d.director_id = u.id;")

body = "\n".join(out)

# Bloque que asegura los usuarios de login de forma determinista
login_seed = "\n".join([
    "-- 0) Usuarios de login deterministas (conceptlab ADMIN, david.lazo ESTUDIANTE)",
    "INSERT INTO usuarios (correo_utec, nombres, apellidos, rol_id)",
    "VALUES ('conceptlab@utec.edu.pe', 'Concept', 'Lab', (SELECT id FROM roles WHERE nombre='ADMIN'))",
    "ON CONFLICT (correo_utec) DO UPDATE SET rol_id = EXCLUDED.rol_id;",
    "INSERT INTO usuarios (correo_utec, nombres, apellidos, rol_id)",
    "VALUES ('david.lazo@utec.edu.pe', 'David', 'Lazo', (SELECT id FROM roles WHERE nombre='ESTUDIANTE'))",
    "ON CONFLICT (correo_utec) DO NOTHING;",
])

refresh_views = "\n".join([
    "-- 9) Refrescar vistas materializadas",
    "REFRESH MATERIALIZED VIEW mv_ocupacion_diaria;",
    "REFRESH MATERIALIZED VIEW mv_ausentismo;",
])

# Archivo standalone (ejecutable a mano via psql, con su propia transaccion)
standalone = "-- Generado por import_directorio.py (ejecucion manual)\nBEGIN;\n\n" + body + "\n\nCOMMIT;\n"
with open(SQL_PATH, "w", encoding="utf-8") as f:
    f.write(standalone)

# Migracion Flyway V5 (Flyway gestiona la transaccion; sin BEGIN/COMMIT)
migration_header = (
    "-- ============================================================\n"
    "-- V5 - Importa el Directorio oficial de Laboratorios (CSV)\n"
    "-- Reemplaza el seed de dominio de V2 con los 54 labs reales.\n"
    "-- Todos los labs quedan INACTIVO excepto Concept Lab.\n"
    "-- Generado por db/etl/import_directorio.py\n"
    "-- ============================================================\n\n"
)
migration = migration_header + login_seed + "\n\n" + body + "\n\n" + refresh_views + "\n"
with open(MIGRATION_PATH, "w", encoding="utf-8") as f:
    f.write(migration)

# ---------------- Resumen ----------------
print("=== RESUMEN IMPORTACIÓN ===")
print(f"Laboratorios:   {len(labs)} (ACTIVO: {sum(1 for l in labs if l['estado']=='ACTIVO')}, INACTIVO: {sum(1 for l in labs if l['estado']=='INACTIVO')})")
print(f"Facultades:     {len(facultades)}")
print(f"Departamentos:  {len(departamentos)}")
print(f"Carreras:       {len([c for c,f in carreras.items() if f])} (omitidas sin facultad: {len([c for c,f in carreras.items() if not f])})")
print(f"Personas:       {len(personas)}")
print()
print("Labs ACTIVOS:", [l['codigo']+' '+l['nombre'] for l in labs if l['estado']=='ACTIVO'])
print()
print("=== PERSONAS Y CORREOS GENERADOS ===")
for base, p in personas.items():
    print(f"  {p['correo']:<34} {p['rol']:<16} {p['nombre']}")
print()
# nombres de 3 tokens (correo dudoso) para revisar
dudosos = [p for p in personas.values() if len(name_tokens(p['nombre'])) == 3]
if dudosos:
    print("=== CORREOS A REVISAR (nombres de 3 palabras, apellido ambiguo) ===")
    for p in dudosos:
        print(f"  {p['correo']:<34} {p['nombre']}")
print()
print(f"SQL standalone en: {SQL_PATH}")
print(f"Migración Flyway en: {MIGRATION_PATH}")

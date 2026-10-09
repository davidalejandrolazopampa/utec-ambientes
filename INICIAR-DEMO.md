# ▶️ Iniciar la demo (paso a paso, listo para usar)

Guía rápida para levantar el sistema y compartirlo con los alumnos.
*(Despliegue de demo completo: [DEPLOY.md](DEPLOY.md) · instalación: [INSTALL.md](INSTALL.md). Este es el resumen del día a día.)*

---

## 🔗 EL LINK (esto es lo que copias / compartes)

```
https://unmolded-hedge-concierge.ngrok-free.dev
```

- Es **fijo, no cambia nunca**. Ya está autorizado en Google.
- **QR para los alumnos:** `~/Downloads/acceso_utec.png` (escanean y entran).
- Al abrirlo sale una pantalla de ngrok → clic en **"Visit Site"** (1 vez) → entra a la app.

> ⚡ **Atajo:** en vez de los 4 pasos manuales, `./demo.sh start --tunnel` levanta TODO (Docker + backend + frontend + ngrok) con un comando.
>
> ⚠️ **Si el dominio muestra `ERR_NGROK_725` (banda agotada):** el plan free de ngrok llegó a su límite mensual (se reinicia al inicio del ciclo de tu cuenta — verlo en `dashboard.ngrok.com/billing`). Mientras tanto usa **`./demo.sh start --cf`** (túnel de Cloudflare, sin límite de banda); ojo: da una **URL nueva** que debes **añadir a Orígenes JS del OAuth de Google** y **regenerar el QR** (el QR fijo de ngrok no servirá).

---

## 🚀 Levantar todo (4 pasos)

### 1. Infra (Docker) — abre Docker Desktop y luego:
```bash
docker start utec-postgres utec-redis utec-rabbitmq
```

### 2. Backend → en **IntelliJ**
- Corre la app (`ReservasApplication`).
- ⚠️ La run config debe tener **perfil `local` activo** (*Active profiles: `local`*).
  Sin eso no arranca (no lee la config local ni el `JWT_SECRET` de dev).
- Debe quedar en `http://localhost:8080`.

### 3. Frontend → en **WebStorm** (o terminal)
```bash
cd frontend
npm run dev
```
- Debe quedar en `http://localhost:5173`.

### 4. Túnel → en una **Terminal** (esto NO lo hacen IntelliJ/WebStorm)
```bash
ngrok http --url=https://unmolded-hedge-concierge.ngrok-free.dev 5173
```
- Déjalo corriendo (no cierres esa terminal).

✅ Listo: abre el link / QR y ya funciona.

---

## 👤 Cuentas para probar
- **ADMIN** (ve dashboard, respaldo): `conceptlab@utec.edu.pe`
- **Responsable**: `dlazo@utec.edu.pe`
- **Estudiante**: `david.lazo@utec.edu.pe`
- (Cualquier correo **@utec.edu.pe** entra; un Gmail personal NO — da error de dominio a propósito.)

---

## ✅ Verificar que está OK
- `http://localhost:8080/actuator/health` responde (puede decir 503 solo por el correo, es normal).
- El link público abre la app y deja iniciar sesión con `@utec.edu.pe`.

---

## 💡 Para mostrar en la demo
- **Confirmación en cada acción:** al cancelar/guardar/eliminar aparece un cuadro "¿Confirmar…?" (ninguna acción se ejecuta de un clic).
- **Reactivar una cancelación:** entra como **Responsable/Admin**, cancela una reserva **de hoy** y luego usa el botón **↩ Reactivar** para revertirla (solo aparece el mismo día).

---

## 🛑 Apagar
- Cierra la terminal de **ngrok** (Ctrl+C).
- Detén backend (IntelliJ) y frontend (WebStorm).
- Opcional: `docker stop utec-postgres utec-redis utec-rabbitmq` (los datos NO se pierden).

---

## ⚠️ Importante (que no se te olvide)
- **No cierres la tapa / no dejes dormir la Mac** durante la demo → se congela TODO (backend, frontend, ngrok). Tenla **enchufada y abierta**.
- Si la Mac se durmió: solo vuelve a hacer los **4 pasos** de arriba (el link sigue siendo el mismo, no re-autorizas nada).
- Los **correos de confirmación no se envían** (App Password de Gmail vencido), pero **la reserva funciona igual**.
- Si algún día el dominio de ngrok cambiara (no debería), habría que: actualizarlo aquí, en Google (orígenes JS) y regenerar el QR con:
  ```bash
  qrencode -o ~/Downloads/acceso_utec.png -s 8 "https://unmolded-hedge-concierge.ngrok-free.dev"
  ```

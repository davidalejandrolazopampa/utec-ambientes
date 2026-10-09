# UTEC Ambientes — App nativa (Capacitor)

La app web (Vite + React) ya es **PWA instalable** (ver `vite.config.ts` → `VitePWA`).
Para publicarla en **Google Play** y **App Store** la envolvemos con **Capacitor**, que mete
el MISMO build web (`dist`) dentro de un contenedor nativo. **No se reescribe la app.**

Aquí ya está listo el **andamiaje** (deps + `capacitor.config.ts` + scripts npm). Faltan los
pasos que dependen de tu máquina (SDKs) y de un backend desplegado.

## Requisitos (en la máquina que compila)
- **Android:** Android Studio + Android SDK (definir `ANDROID_HOME`).
- **iOS:** macOS + Xcode + **CocoaPods** (`sudo gem install cocoapods` — aquí no estaba instalado).
- Backend **desplegado en HTTPS** (una URL fija; los túneles de `demo.sh` sirven para probar).

## 1) Apuntar la app al backend
La URL del backend es configurable por env (`services/api.ts` usa `VITE_API_URL`). Para el
build nativo, define la **URL absoluta HTTPS** del backend, p. ej. en `frontend/.env.production`:

```
VITE_API_URL=https://api.tu-dominio-utec.pe/api/v1
```

> ⚠️ **Backend/CORS:** una app Capacitor hace las peticiones desde el origen
> `capacitor://localhost` (iOS) o `https://localhost` (Android). Añade esos orígenes a la
> lista de CORS del backend (`config/`) y a `app.auth.cookie` (SameSite/secure) para que la
> auth por cookie funcione. Si no, el login dará 403 por CORS.

## 2) Agregar las plataformas (una sola vez)
```bash
cd frontend
npx cap add android   # crea ./android  (necesita Android SDK)
npx cap add ios       # crea ./ios      (necesita Xcode + CocoaPods)
```

## 3) Compilar y abrir en el IDE nativo
```bash
npm run cap:android   # build web + sync + abre Android Studio
npm run cap:ios       # build web + sync + abre Xcode
```
(o manual: `npm run build && npx cap sync && npx cap open android|ios`)

Desde Android Studio / Xcode: firmar y **generar el APK/AAB (Play)** o el **archive (App Store)**.

## 4) Publicar
- **Google Play:** cuenta de desarrollador (25 USD única vez) → subir el `.aab`.
- **App Store:** cuenta Apple Developer (99 USD/año) → subir el archive desde Xcode/Transporter.
- Íconos/splash: reusar `public/pwa-512.png` (o generar con `@capacitor/assets`).

## Notas
- `android/` e `ios/` (proyectos nativos) se generan con `cap add`; **NO** están versionados aún
  (se crean en la máquina con SDK). Si el equipo quiere versionarlos, hazlo tras el primer `cap add`.
- Cada cambio de la web: `npm run cap:sync` para copiar el nuevo `dist` a los proyectos nativos.
- La cámara del check-in (QR) y la auth funcionan en Capacitor (WebView nativa) igual que en la PWA.

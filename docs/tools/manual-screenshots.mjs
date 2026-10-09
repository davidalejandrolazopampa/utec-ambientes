#!/usr/bin/env node
/**
 * Captura screenshots DETALLADAS del frontend para los manuales de usuario.
 *
 * Todo LOCAL (sin login manual ni tocar tu navegador):
 *   1) Acuña tokens JWT (HS384, secret de dev local) para un usuario semilla por rol.
 *   2) Lanza Brave/Chromium headless con perfil temporal + cámara simulada.
 *   3) Inyecta el bearer por CDP, navega, **interactúa con la UI** (clic en mesa,
 *      participantes, tipo de bloqueo, etc.) y captura cada paso. Para el dashboard
 *      recorta **cada gráfica por separado**.
 *
 * Requisitos: app corriendo (8080/5173), Docker arriba, `ws` (frontend/node_modules).
 * Uso: node docs/tools/manual-screenshots.mjs
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.join(process.cwd(), 'frontend/node_modules/'));
const WebSocket = require('ws');

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUT = path.join(ROOT, 'docs/manuales/manual-img');
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173';
// El secreto NO se hardcodea (sería público en el repo → forjable). Se toma del entorno
// o del archivo gitignored logs/jwt-secret que genera demo.sh (el mismo con el que firma
// el backend). Debe coincidir con el JWT_SECRET del backend en ejecución.
const SECRET = process.env.JWT_SECRET || (() => {
  try { return fs.readFileSync(path.join(ROOT, 'logs/jwt-secret'), 'utf8').trim(); } catch { return null; }
})();
if (!SECRET) {
  console.error('ERROR: falta JWT_SECRET. Arranca la app con ./demo.sh (genera logs/jwt-secret) o exporta JWT_SECRET con el mismo valor que el backend.');
  process.exit(1);
}
const PORT = 9223;
const LAB_ID = 127;            // Concept Lab (L108), 12 mesas, atiende L–V
const LAB_SERVICIOS = 124;     // L105 FabLab Sustractiva (panel de servicios)
const LAB_QUIET = 120;         // L101 (solo bloqueos operativos + demo) para la lista de Bloqueos
const QR = 'L108-MESA-001';    // QR de una mesa para la página de check-in
const VW = 1280, VH = 800, DSF = 2;
// Usuarios FICTICIOS para las capturas (creados/limpiados por la sesión de manuales):
// nunca capturar con cuentas/nombres reales.
const ALUMNO = process.env.SHOT_ALUMNO || 'valeria.campos@utec.edu.pe';
const COORD  = process.env.SHOT_COORD  || 'cmendozad@utec.edu.pe';
// Reloj SIMULADO del navegador (FAKE_NOW="2026-07-20T10:00:00"): las capturas se ven en
// lunes aunque se generen en domingo. El backend debe correr con TZ acorde (demo.sh + TZ).
const FAKE_NOW = process.env.FAKE_NOW || null;
const clockShim = () => {
  if (!FAKE_NOW) return '';
  const delta = new Date(FAKE_NOW).getTime() - Date.now();
  return `(()=>{const RD=Date,D=${delta};class FD extends RD{constructor(...a){a.length===0?super(RD.now()+D):super(...a);}static now(){return RD.now()+D;}}window.Date=FD;})();`;
};

const BROWSERS = [
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function mint(extra, email) {
  const alg = Buffer.byteLength(SECRET) >= 64 ? 'HS512' : Buffer.byteLength(SECRET) >= 48 ? 'HS384' : 'HS256';
  const sha = { HS256: 'sha256', HS384: 'sha384', HS512: 'sha512' }[alg];
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg, typ: 'JWT' }), p = b64({ sub: email, iat: now, exp: now + 2 * 3600, ...extra });
  return `${h}.${p}.${crypto.createHmac(sha, SECRET).update(`${h}.${p}`).digest('base64url')}`;
}
const mintRefresh = (email) => mint({}, email);
const mintAccess = (email, role) => mint({ roles: `ROLE_${role}` }, email);
const authShim = (t) => `(() => { const T=${JSON.stringify(t)};
  const of=window.fetch; window.fetch=function(i,n){n=n||{};const h=new Headers((n&&n.headers)||(i&&i.headers)||{});h.set('Authorization','Bearer '+T);n.headers=h;return of.call(this,i,n);};
  const oo=XMLHttpRequest.prototype.open,os=XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open=function(...a){return oo.apply(this,a);};
  XMLHttpRequest.prototype.send=function(...a){try{this.setRequestHeader('Authorization','Bearer '+T);}catch(e){}return os.apply(this,a);}; })();`;

// Helper que se inyecta en la página para hacer clics/selects desde el driver.
const PAGE_CTL = `window.__ctl={
  clickText:(sel,txt)=>{const e=[...document.querySelectorAll(sel)].find(x=>x.textContent.replace(/\\s+/g,' ').trim()===txt||x.textContent.replace(/\\s+/g,' ').trim().startsWith(txt+' ')||x.textContent.replace(/\\s+/g,' ').trim().includes(txt));if(e){e.click();return true;}return false;},
  clickPText:(txt)=>{const b=[...document.querySelectorAll('button')].find(x=>{const p=x.querySelector('p');return p&&p.textContent.trim()===txt;});if(b){b.click();return true;}return false;},
  clickExact:(sel,txt)=>{const e=[...document.querySelectorAll(sel)].find(x=>x.textContent.replace(/\\s+/g,' ').trim()===txt);if(e){e.click();return true;}return false;},
  setSelect:(idx,val)=>{const s=document.querySelectorAll('select')[idx];if(!s)return false;const set=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;set.call(s,val);s.dispatchEvent(new Event('change',{bubbles:true}));return true;},
  cardRect:(txt)=>{const h=[...document.querySelectorAll('h1,h2,h3')].find(x=>x.textContent.trim().startsWith(txt));if(!h)return null;const c=h.closest('.card')||h.parentElement;const r=c.getBoundingClientRect();return {x:Math.max(0,r.x+scrollX-8),y:r.y+scrollY-8,width:r.width+16,height:r.height+16};},
  setSelectByOption:(val)=>{const s=[...document.querySelectorAll('select')].find(x=>[...x.options].some(o=>o.value===val));if(!s)return false;const set=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;set.call(s,val);s.dispatchEvent(new Event('change',{bubbles:true}));return true;}
};`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));

class CDP {
  constructor(u) { this.ws = new WebSocket(u); this.id = 0; this.pend = new Map(); this.waiters = []; }
  open() { return new Promise((res, rej) => { this.ws.on('open', res); this.ws.on('error', rej); this.ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.id && this.pend.has(m.id)) { this.pend.get(m.id)(m.result || {}); this.pend.delete(m.id); } if (m.method) this.waiters = this.waiters.filter((w) => (w.method === m.method ? (w.res(m), false) : true)); }); }); }
  send(method, params = {}) { const id = ++this.id; return new Promise((res) => { this.pend.set(id, res); this.ws.send(JSON.stringify({ id, method, params })); }); }
  once(method, t = 9000) { return new Promise((res) => { const w = { method, res }; this.waiters.push(w); setTimeout(() => { this.waiters = this.waiters.filter((x) => x !== w); res(null); }, t); }); }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = BROWSERS.find((b) => fs.existsSync(b));
  if (!browser) throw new Error('No se encontró Brave/Chrome/Chromium');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'brave-shots-'));
  const proc = spawn(browser, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, `--window-size=${VW},${VH}`, 'about:blank',
  ], { stdio: 'ignore' });

  try {
    let target;
    for (let i = 0; i < 40; i++) { try { const l = await getJSON(`http://127.0.0.1:${PORT}/json/list`); target = l.find((t) => t.type === 'page'); if (target) break; } catch {} await sleep(250); }
    if (!target) throw new Error('CDP no respondió');
    const cdp = new CDP(target.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: DSF, mobile: false });

    let shimId = null;
    // Reloj simulado (si FAKE_NOW): se inyecta ANTES de que cargue la app, en todo documento.
    if (FAKE_NOW) await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: clockShim() });
    const setRole = async (email, role) => {
      await cdp.send('Network.clearBrowserCookies');
      if (shimId) { await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: shimId }); shimId = null; }
      if (email) {
        await cdp.send('Network.setCookie', { name: 'refresh_token', value: mintRefresh(email), domain: 'localhost', path: '/api/v1/auth', httpOnly: true, secure: false, sameSite: 'Strict' });
        const r = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: authShim(mintAccess(email, role)) });
        shimId = r.identifier;
      }
    };
    const goto = async (url, wait = 3200) => { await cdp.send('Page.navigate', { url }); await cdp.once('Page.loadEventFired'); await sleep(wait); await cdp.send('Runtime.evaluate', { expression: PAGE_CTL }); };
    const evalJs = async (expr) => (await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.value;
    const cap = async (name, height = VH, clip = null) => {
      const c = clip || { x: 0, y: 0, width: VW, height, scale: 1 };
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...c, scale: 1 } });
      fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64')); console.log('  ✓', name);
    };
    const capCard = async (name, title) => { const r = await evalJs(`__ctl.cardRect(${JSON.stringify(title)})`); if (!r) { console.log('  ⚠ no encontré', title); return; } await cap(name, 0, { ...r, scale: 1 }); };

    // ONLY_ADMIN=1 → captura solo la parte administrativa (no pisa las capturas de
    // alumno al-05/al-06 que se generan con datos en vivo: reserva con participantes y
    // check-in exitoso).
    if (!process.env.ONLY_ADMIN) {
    // ── LOGIN ──
    console.log('· Login'); await setRole(null);
    await goto(`${FRONTEND}/login`, 1800); await cap('00-login.png', 760);

    // ── ALUMNO (usuario ficticio) ──
    console.log('· Alumno'); await setRole(ALUMNO, 'ESTUDIANTE');
    await goto(`${FRONTEND}/laboratorios`); await cap('al-01-laboratorios.png', 980);
    await goto(`${FRONTEND}/laboratorios/${LAB_ID}`);
    await evalJs(`__ctl.clickText('button','Mañana')`); await sleep(1400); await cap('al-02-detalle-grid.png', 1000);
    await evalJs(`__ctl.clickPText('MESA 3')`); await sleep(1000); await capCard('al-03-panel-reservar.png', 'Reservar');
    await evalJs(`__ctl.clickExact('button','09:30')`); await sleep(400);
    await evalJs(`__ctl.clickExact('button','3')`); await sleep(900); await capCard('al-04-participantes.png', 'Reservar');
    await goto(`${FRONTEND}/reservas`); await cap('al-05-mis-reservas.png', 1200);
    // Panel de SERVICIOS del lab (FabLab): "Este laboratorio ofrece servicios" + botón Solicitar.
    await goto(`${FRONTEND}/laboratorios/${LAB_SERVICIOS}`, 2600); await cap('al-09-servicios.png', 760);
    // Check-in: la pantalla muestra el RESULTADO. Para un shot de ÉXITO ("¡Check-in
    // Exitoso!") debe existir una reserva ACTIVA del alumno en ese recurso dentro de la
    // ventana (crea una con db/reservar.sh para HOY a la hora actual y luego corre esto);
    // sin reserva activa muestra la validación. Se recorta a la tarjeta (capCard) para
    // evitar el espacio en blanco. El al-06-checkin.png versionado es el de ÉXITO.
    if (!process.env.SKIP_LIVE) { await goto(`${FRONTEND}/checkin/${QR}`, 3000); await capCard('al-06-checkin.png', '¡Check-in'); }
    await goto(`${FRONTEND}/laboratorios/${LAB_ID}/calendario`, 3800); await cap('al-07-calendario.png', 900);
    } // fin !ONLY_ADMIN

    // ── ADMINISTRATIVO (COORDINADORA ficticia; las funciones solo-ADMIN como
    //    Respaldo/Auditoría se marcan en el texto del manual) ──
    console.log('· Administrativo'); await setRole(COORD, 'COORDINADOR');
    await goto(`${FRONTEND}/laboratorios`); await cap('ad-01-laboratorios.png', 980);
    await goto(`${FRONTEND}/laboratorios/${LAB_ID}`); await cap('ad-02-detalle-qr.png', 1120);
    // Lista de bloqueos FILTRADA al lab tranquilo (evita nombres reales de responsables de eventos).
    await goto(`${FRONTEND}/admin/bloqueos`);
    await evalJs(`__ctl.setSelectByOption('${LAB_QUIET}')`); await sleep(1600);
    await cap('ad-03-bloqueos-lista.png', 820);
    await goto(`${FRONTEND}/admin/bloqueos/crear`);
    // Tras agregar "Tipo de ambiente", el lab es el 2º select → elegimos por VALOR de opción (robusto).
    await evalJs(`__ctl.setSelectByOption('${LAB_ID}')`); await sleep(1400); await cap('ad-04-bloqueo-total.png', 1040);
    await evalJs(`__ctl.clickText('button','Parcial')`); await sleep(1600); await cap('ad-05-bloqueo-parcial.png', 1260);

    // ── Programación Académica (Docencia): importador + aulas ──
    await goto(`${FRONTEND}/admin/docencia`, 3200); await cap('ad-09-programacion.png', 1100);
    // ── Ciclos académicos: tarjeta-por-ciclo (fechas + excepciones + cursos) ──
    await goto(`${FRONTEND}/admin/ciclos`, 3200); await cap('ad-10-ciclos.png', 1150);

    // ── Calendario del alumno (visible para todos): horario de L108 con eventos ──
    await goto(`${FRONTEND}/aulas`, 3200);
    await evalJs(`__ctl.setSelectByOption('LABORATORIO')`); await sleep(1200);
    await evalJs(`__ctl.setSelectByOption('lab:${LAB_ID}')`); await sleep(2200);
    await cap('al-08-horario.png', 1100);
    // Organización (Estructura) es solo-ADMIN (@PreAuthorize de clase): cambiamos a ADMIN y
    // expandimos una facultad para mostrar la jerarquía POBLADA (con COORDINADOR sale vacía).
    await setRole('conceptlab@utec.edu.pe', 'ADMIN');
    await goto(`${FRONTEND}/admin/organizacion`, 3600);
    await evalJs(`__ctl.clickText('h3','FACULTAD DE INGENIERIA')`); await sleep(1400);
    await cap('ad-06-organizacion.png', 1180);

    // ── DASHBOARD: KPIs + cada gráfica por separado ──
    console.log('· Dashboard (gráficas)');
    await goto(`${FRONTEND}/dashboard`, 4500);
    await cap('dash-00-kpis.png', 720);
    await capCard('dash-01-segmentacion.png', 'Segmentación');
    await capCard('dash-08-bloqueos.png', 'Bloqueos');
    await capCard('dash-11-embudo.png', 'Embudo de estados');
    await capCard('dash-12-dia-semana.png', 'Reservas por día de la semana');
    await capCard('dash-13-horas-lab.png', '% de ocupación por laboratorio');
    await capCard('dash-15-disponibilidad.png', 'Disponibilidad por laboratorio');
    await capCard('dash-14-tamano-grupo.png', 'Tamaño de grupo');
    await capCard('dash-09-carrera.png', 'Reservas por carrera');
    await capCard('dash-16-pareto.png', 'Concentración de la demanda');
    await capCard('dash-17-cruce.png', 'Carrera × Laboratorio');
    await capCard('dash-18-capacidad-ociosa.png', 'Capacidad ociosa por laboratorio');
    await capCard('dash-19-proyeccion.png', 'Proyección de demanda');
    await capCard('dash-03-mapacalor.png', 'Mapa de calor');
    await capCard('dash-04-reservas-hora.png', 'Reservas por hora');
    await capCard('dash-05-reservas-dia.png', 'Reservas por día');
    await capCard('dash-07-reservas-mes.png', 'Reservas por mes');
    await capCard('dash-06-tendencia.png', 'Tendencia de reservas');

    // Vista "Solo bloqueos" → sección Operativo (Mantenimiento + Almuerzo + Feriado):
    // se recorta a los KPIs + las dos gráficas apiladas (se omite la tabla de historial,
    // que tiene cientos de filas y haría la captura inservible).
    await evalJs(`__ctl.setSelectByOption('BLOQUEOS')`);
    // 1) Esperar a que la query `operativos` termine de cargar (aparece "Historial (N)"); si
    //    capturamos en pleno fetch, la sección muestra "Sin bloqueos operativos" (datos 0).
    for (let i = 0; i < 25; i++) { if (await evalJs(`document.body.innerText.includes('Historial (')`)) break; await sleep(400); }
    await sleep(600);
    // 2) Recharts (ResponsiveContainer) mide su ancho con ResizeObserver, que SOLO reacciona a
    //    cambios reales de tamaño (no a un Event('resize') sintético): forzamos un relayout
    //    cambiando el ancho del viewport y volviéndolo a VW → pintan las barras apiladas
    //    (Mantenimiento/Almuerzo/Feriado).
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: VW + 40, height: VH, deviceScaleFactor: DSF, mobile: false });
    await sleep(700);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: DSF, mobile: false });
    // 3) Sondear hasta que las barras (recharts-rectangle) tengan ancho REAL — la animación de
    //    Recharts las dibuja desde 0; capturar antes deja las gráficas vacías aunque haya datos.
    for (let i = 0; i < 20; i++) {
      const w = await evalJs(`(()=>{let m=0;document.querySelectorAll('.recharts-rectangle, .recharts-bar-rectangle path').forEach(p=>{try{const b=p.getBBox();m=Math.max(m,b.width,b.height);}catch(e){}});return m;})()`);
      if (w > 6) break; await sleep(400);
    }
    await sleep(500);
    await cdp.send('Runtime.evaluate', { expression: PAGE_CTL });
    const opR = await evalJs(`__ctl.cardRect('Operativo')`);
    if (opR) await cap('dash-10-operativo.png', 0, { ...opR, height: Math.min(opR.height, 560), scale: 1 });
    else console.log('  ⚠ no encontré la sección Operativo');

    console.log('\n✅ Capturas en docs/manuales/manual-img/');
  } finally {
    proc.kill('SIGTERM');
  }
}
main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });

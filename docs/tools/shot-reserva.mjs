#!/usr/bin/env node
/**
 * Captura UNA imagen de ejemplo de "cómo reservar" para la presentación:
 * navega a un lab ABIERTO hoy, selecciona una mesa DISPONIBLE y muestra el
 * panel de reserva con la grilla de horas. Salida: docs/manuales/manual-img/al-reserva-ejemplo.png
 *
 * Reusa el enfoque de manual-screenshots.mjs (token JWT local + CDP headless).
 * Uso: node docs/tools/shot-reserva.mjs   (con la app corriendo en 5173/8080)
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
const SECRET = process.env.JWT_SECRET || fs.readFileSync(path.join(ROOT, 'logs/jwt-secret'), 'utf8').trim();
const PORT = 9224;
const EMAIL = 'david.lazo@utec.edu.pe';
// Labs candidatos a probar (id). Empezamos por L108 (127) y otros comunes; el script
// elige el primero que HOY tenga una mesa disponible.
const CANDIDATOS = (process.env.LAB_IDS || '127,113,114,115,116,117,118,119,120,121,122,123,124,125,126,128,129,130').split(',').map(Number);
const VW = 1280, VH = 900, DSF = 2;
const BROWSERS = [
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function mint(extra) {
  const alg = Buffer.byteLength(SECRET) >= 64 ? 'HS512' : Buffer.byteLength(SECRET) >= 48 ? 'HS384' : 'HS256';
  const sha = { HS256: 'sha256', HS384: 'sha384', HS512: 'sha512' }[alg];
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg, typ: 'JWT' }), p = b64({ sub: EMAIL, iat: now, exp: now + 2 * 3600, ...extra });
  return `${h}.${p}.${crypto.createHmac(sha, SECRET).update(`${h}.${p}`).digest('base64url')}`;
}
const authShim = (t) => `(() => { const T=${JSON.stringify(t)};
  const of=window.fetch; window.fetch=function(i,n){n=n||{};const h=new Headers((n&&n.headers)||(i&&i.headers)||{});h.set('Authorization','Bearer '+T);n.headers=h;return of.call(this,i,n);};
  const os=XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send=function(...a){try{this.setRequestHeader('Authorization','Bearer '+T);}catch(e){}return os.apply(this,a);}; })();`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (u) => new Promise((res, rej) => http.get(u, (r) => { let d=''; r.on('data',(c)=>d+=c); r.on('end',()=>res(JSON.parse(d))); }).on('error', rej));

class CDP {
  constructor(u){ this.ws=new WebSocket(u); this.id=0; this.pend=new Map(); this.waiters=[]; }
  open(){ return new Promise((res,rej)=>{ this.ws.on('open',res); this.ws.on('error',rej); this.ws.on('message',(raw)=>{ const m=JSON.parse(raw); if(m.id&&this.pend.has(m.id)){this.pend.get(m.id)(m.result||{});this.pend.delete(m.id);} if(m.method)this.waiters=this.waiters.filter((w)=>(w.method===m.method?(w.res(m),false):true)); }); }); }
  send(method,params={}){ const id=++this.id; return new Promise((res)=>{ this.pend.set(id,res); this.ws.send(JSON.stringify({id,method,params})); }); }
  once(method,t=9000){ return new Promise((res)=>{ const w={method,res}; this.waiters.push(w); setTimeout(()=>{this.waiters=this.waiters.filter((x)=>x!==w);res(null);},t); }); }
}

// Selecciona la primera mesa DISPONIBLE (no bloqueada/en uso/cerrada) y la clickea.
const CLICK_MESA = `(() => {
  const bad=/BLOQUEAD|CERRAD|EN USO|OCUPAD|MANTENIMIENTO|RESERVAD/i;
  const btns=[...document.querySelectorAll('button')].filter(b=>/\\b(MESA|PC)\\s*\\d+/i.test(b.textContent));
  const ok=btns.find(b=>!bad.test(b.textContent)&&!b.disabled&&b.getAttribute('aria-disabled')!=='true');
  if(ok){ ok.scrollIntoView({block:'center'}); ok.click(); return ok.textContent.replace(/\\s+/g,' ').trim(); }
  return null;
})()`;
// Clickea la primera hora disponible del panel para completar el ejemplo.
const CLICK_HORA = `(() => {
  const btns=[...document.querySelectorAll('button')].filter(b=>/^\\d{1,2}:\\d{2}$/.test(b.textContent.trim())&&!b.disabled);
  if(btns[0]){ btns[0].click(); return btns[0].textContent.trim(); }
  return null;
})()`;

async function main(){
  fs.mkdirSync(OUT,{recursive:true});
  const browser=BROWSERS.find((b)=>fs.existsSync(b));
  if(!browser) throw new Error('No se encontró Brave/Chrome/Chromium');
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'shot-reserva-'));
  const proc=spawn(browser,['--headless=new','--disable-gpu','--hide-scrollbars','--no-first-run','--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,`--user-data-dir=${profile}`,`--window-size=${VW},${VH}`,'about:blank'],{stdio:'ignore'});
  try{
    let target;
    for(let i=0;i<40;i++){ try{ const l=await getJSON(`http://127.0.0.1:${PORT}/json/list`); target=l.find((t)=>t.type==='page'); if(target)break; }catch{} await sleep(250); }
    if(!target) throw new Error('CDP no respondió');
    const cdp=new CDP(target.webSocketDebuggerUrl); await cdp.open();
    await cdp.send('Page.enable'); await cdp.send('Network.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:VW,height:VH,deviceScaleFactor:DSF,mobile:false});
    await cdp.send('Network.setCookie',{name:'refresh_token',value:mint({}),domain:'localhost',path:'/api/v1/auth',httpOnly:true,secure:false,sameSite:'Strict'});
    await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:authShim(mint({roles:'ROLE_ESTUDIANTE'}))});
    const goto=async(url,wait=3200)=>{ await cdp.send('Page.navigate',{url}); await cdp.once('Page.loadEventFired'); await sleep(wait); };
    const evalJs=async(expr)=>(await cdp.send('Runtime.evaluate',{expression:expr,returnByValue:true})).result?.value;
    const cap=async(name,height)=>{ const {data}=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:VW,height,scale:1}}); fs.writeFileSync(path.join(OUT,name),Buffer.from(data,'base64')); console.log('  ✓',name,`(${height}px)`); };

    // Autenticar (primera navegación para que el shim quede activo).
    await goto(`${FRONTEND}/laboratorios`,2500);
    // Modo CLARO para que combine con la presentación (el toggle dice "Modo claro" cuando está oscuro).
    await evalJs(`(()=>{const b=[...document.querySelectorAll('button,div,span,a')].find(x=>x.textContent.trim()==='Modo claro');if(b)b.click();})()`);
    await sleep(600);

    const clickFecha=async(txt)=>evalJs(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(txt)});if(b){b.click();return true;}return false;})()`);
    const contarHoras=async()=>evalJs(`[...document.querySelectorAll('button')].filter(b=>/^\\d{1,2}:\\d{2}$/.test(b.textContent.trim())&&!b.disabled).length`);

    let elegido=null, mesa=null, cuandoTxt=null;
    outer:
    for(const id of CANDIDATOS){
      await goto(`${FRONTEND}/laboratorios/${id}`,2600);
      for(const dia of ['Hoy','Mañana']){
        await clickFecha(dia); await sleep(1100);
        const m=await evalJs(CLICK_MESA);
        if(!m) continue;
        await sleep(1000);
        const nh=await contarHoras();
        if(nh>0){ elegido=id; mesa=m; cuandoTxt=dia; break outer; }
        console.log(`  · lab ${id} (${dia}): mesa ${m} pero 0 horas disponibles, sigo…`);
      }
    }
    if(!elegido){ throw new Error('Ningún lab candidato tiene mesa+hora disponible hoy/mañana. Ajusta LAB_IDS o corre de día.'); }
    console.log(`· Lab ${elegido} · ${cuandoTxt} · mesa: ${mesa}`);
    const hora=await evalJs(CLICK_HORA);
    if(hora) console.log(`· hora seleccionada: ${hora}`);
    await sleep(900);
    // Elegir participantes (3, o 2 si la capacidad es menor) → aparecen las casillas de correo.
    let np=await evalJs(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='3');if(b){b.click();return 3;}return 0;})()`);
    if(!np) np=await evalJs(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='2');if(b){b.click();return 2;}return 0;})()`);
    console.log(`· participantes: ${np||1}`);
    await sleep(700);
    // Rellenar los correos de los acompañantes con ejemplos (el 1º es el titular, readonly).
    await evalJs(`(()=>{const ej=['juan.perez@utec.edu.pe','maria.gomez@utec.edu.pe'];const ins=[...document.querySelectorAll('input')].filter(i=>/utec\\.edu\\.pe/i.test(i.placeholder||'')&&!i.readOnly&&!i.disabled);const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;ins.slice(0,2).forEach((i,k)=>{set.call(i,ej[k]);i.dispatchEvent(new Event('input',{bubbles:true}));});return ins.length;})()`);
    await sleep(900);
    // DOS recortes: (1) lab + grilla de recursos, (2) panel de reserva (hora/duración/correos).
    const capClip=async(name,c)=>{ const {data}=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{...c,scale:1}}); fs.writeFileSync(path.join(OUT,name),Buffer.from(data,'base64')); console.log('  ✓',name,`(${Math.round(c.width)}×${Math.round(c.height)})`); };
    const panel=await evalJs(`(()=>{const h=[...document.querySelectorAll('h1,h2,h3')].find(x=>x.textContent.trim()==='Reservar');if(!h)return null;const c=h.closest('.card')||h.parentElement||h;const r=c.getBoundingClientRect();return {x:r.x+scrollX, y:r.y+scrollY, w:r.width, h:r.height};})()`);
    const gridBottom=await evalJs(`(()=>{const b=[...document.querySelectorAll('button')].filter(x=>/\\bMESA\\s*\\d+/i.test(x.textContent));if(!b.length)return 640;const r=b[b.length-1].getBoundingClientRect();return r.bottom+scrollY;})()`);
    if(panel){
      await capClip('al-reserva-1-recurso.png', {x:0, y:0, width: Math.max(360, Math.round(panel.x)-16), height: Math.round(gridBottom)+28});
      await capClip('al-reserva-2-panel.png', {x: Math.max(0,Math.round(panel.x)-10), y: Math.max(0,Math.round(panel.y)-10), width: Math.round(panel.w)+20, height: Math.round(panel.h)+20});
    } else {
      console.log('  ⚠ no ubiqué el panel Reservar; capturo completo');
      await cap('al-reserva-ejemplo.png', 1900);
    }
    console.log('\\n✅ Listo: 2 imágenes en docs/manuales/manual-img/');
  } finally { proc.kill('SIGTERM'); }
}
main().catch((e)=>{ console.error('ERROR:',e.message); process.exit(1); });

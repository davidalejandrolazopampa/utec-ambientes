#!/usr/bin/env node
/**
 * Recaptura SOLO el login en MODO CLARO → docs/manuales/manual-img/00-login.png
 * (el login siempre debe verse claro). Uso: node docs/tools/shot-login.mjs
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
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
const PORT = 9226, VW = 1280, VH = 800, DSF = 2;
const BROWSERS = [
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (u) => new Promise((res, rej) => http.get(u, (r) => { let d=''; r.on('data',(c)=>d+=c); r.on('end',()=>res(JSON.parse(d))); }).on('error', rej));
class CDP {
  constructor(u){ this.ws=new WebSocket(u); this.id=0; this.pend=new Map(); this.waiters=[]; }
  open(){ return new Promise((res,rej)=>{ this.ws.on('open',res); this.ws.on('error',rej); this.ws.on('message',(raw)=>{ const m=JSON.parse(raw); if(m.id&&this.pend.has(m.id)){this.pend.get(m.id)(m.result||{});this.pend.delete(m.id);} if(m.method)this.waiters=this.waiters.filter((w)=>(w.method===m.method?(w.res(m),false):true)); }); }); }
  send(method,params={}){ const id=++this.id; return new Promise((res)=>{ this.pend.set(id,res); this.ws.send(JSON.stringify({id,method,params})); }); }
  once(method,t=12000){ return new Promise((res)=>{ const w={method,res}; this.waiters.push(w); setTimeout(()=>{this.waiters=this.waiters.filter((x)=>x!==w);res(null);},t); }); }
}
async function main(){
  const browser=BROWSERS.find((b)=>fs.existsSync(b));
  if(!browser) throw new Error('No se encontró navegador');
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'shot-login-'));
  const proc=spawn(browser,['--headless=new','--disable-gpu','--hide-scrollbars','--no-first-run','--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,`--user-data-dir=${profile}`,`--window-size=${VW},${VH}`,'about:blank'],{stdio:'ignore'});
  try{
    let target;
    for(let i=0;i<40;i++){ try{ const l=await getJSON(`http://127.0.0.1:${PORT}/json/list`); target=l.find((t)=>t.type==='page'); if(target)break; }catch{} await sleep(250); }
    if(!target) throw new Error('CDP no respondió');
    const cdp=new CDP(target.webSocketDebuggerUrl); await cdp.open();
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:VW,height:VH,deviceScaleFactor:DSF,mobile:false});
    // Fuerza esquema de color CLARO (por si no hay localStorage → el fallback no toma "dark").
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
    // Preferencia de tema clara antes de cargar la app.
    await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`try{localStorage.setItem('utec-theme','light');}catch(e){}`});
    await cdp.send('Page.navigate',{url:`${FRONTEND}/login`});
    await cdp.once('Page.loadEventFired');
    await sleep(2200);
    // Refuerzo: quita la clase dark si quedara.
    await cdp.send('Runtime.evaluate',{expression:`document.documentElement.classList.remove('dark')`});
    await sleep(400);
    const { data } = await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:VW,height:760,scale:1}});
    fs.writeFileSync(path.join(OUT,'00-login.png'), Buffer.from(data,'base64'));
    console.log('✅ 00-login.png (modo claro)');
  } finally { proc.kill('SIGTERM'); }
}
main().catch((e)=>{ console.error('ERROR:',e.message); process.exit(1); });

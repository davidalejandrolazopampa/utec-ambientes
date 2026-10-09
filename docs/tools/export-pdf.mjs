#!/usr/bin/env node
/**
 * Exporta docs/presentacion/presentacion.html a PDF CON las notas del orador (para leer en el celular).
 * Carga la presentación en modo ?print-pdf, espera a que reveal.js termine de maquetar
 * y usa Page.printToPDF (CDP). Salida: docs/presentacion/presentacion.pdf
 * Uso: node docs/tools/export-pdf.mjs
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
const HTML = path.join(ROOT, 'docs/presentacion/presentacion.html');
const OUT = path.join(ROOT, 'docs/presentacion/presentacion.pdf');
const PORT = 9225;
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
  once(method,t=15000){ return new Promise((res)=>{ const w={method,res}; this.waiters.push(w); setTimeout(()=>{this.waiters=this.waiters.filter((x)=>x!==w);res(null);},t); }); }
}

async function main(){
  const browser=BROWSERS.find((b)=>fs.existsSync(b));
  if(!browser) throw new Error('No se encontró Brave/Chrome/Chromium');
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'pdf-'));
  const proc=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,`--user-data-dir=${profile}`,'--window-size=1280,720','about:blank'],{stdio:'ignore'});
  try{
    let target;
    for(let i=0;i<40;i++){ try{ const l=await getJSON(`http://127.0.0.1:${PORT}/json/list`); target=l.find((t)=>t.type==='page'); if(target)break; }catch{} await sleep(250); }
    if(!target) throw new Error('CDP no respondió');
    const cdp=new CDP(target.webSocketDebuggerUrl); await cdp.open();
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate',{url:`file://${HTML}?print-pdf`});
    await cdp.once('Page.loadEventFired');
    // Esperar a que reveal.js aplique la vista de impresión y termine de maquetar.
    const evalJs=async(expr)=>(await cdp.send('Runtime.evaluate',{expression:expr,returnByValue:true})).result?.value;
    let ready=false;
    for(let i=0;i<40;i++){
      const ok=await evalJs(`(()=>{try{return document.documentElement.classList.contains('print-pdf') && document.querySelectorAll('.slides section').length>0;}catch(e){return false;}})()`);
      if(ok){ ready=true; break; } await sleep(300);
    }
    if(!ready) console.log('  ⚠ reveal no marcó print-pdf; imprimo igual');
    await sleep(2500); // que carguen imágenes/SVG y se maqueten las notas
    const { data } = await cdp.send('Page.printToPDF',{
      printBackground:true, preferCSSPageSize:true,
      marginTop:0, marginBottom:0, marginLeft:0, marginRight:0,
    });
    fs.writeFileSync(OUT, Buffer.from(data,'base64'));
    console.log(`✅ PDF: ${OUT} (${(fs.statSync(OUT).size/1024/1024).toFixed(1)} MB)`);
  } finally { proc.kill('SIGTERM'); }
}
main().catch((e)=>{ console.error('ERROR:',e.message); process.exit(1); });

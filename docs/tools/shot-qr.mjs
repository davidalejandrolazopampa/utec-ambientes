#!/usr/bin/env node
/** Captura la vista "QR de mesas" (recursos + su código QR) → docs/manuales/manual-img/ad-08-qr-recursos.png */
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
const EMAIL = 'conceptlab@utec.edu.pe', LAB_ID = process.env.LAB_ID || 127, PORT = 9228, VW = 1280, VH = 900, DSF = 2;
const BROWSERS = ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Chromium.app/Contents/MacOS/Chromium'];
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function mint(extra){ const alg=Buffer.byteLength(SECRET)>=64?'HS512':Buffer.byteLength(SECRET)>=48?'HS384':'HS256'; const sha={HS256:'sha256',HS384:'sha384',HS512:'sha512'}[alg]; const now=Math.floor(Date.now()/1000); const h=b64({alg,typ:'JWT'}),p=b64({sub:EMAIL,iat:now,exp:now+2*3600,...extra}); return `${h}.${p}.${crypto.createHmac(sha,SECRET).update(`${h}.${p}`).digest('base64url')}`; }
const authShim=(t)=>`(()=>{const T=${JSON.stringify(t)};const of=window.fetch;window.fetch=function(i,n){n=n||{};const h=new Headers((n&&n.headers)||(i&&i.headers)||{});h.set('Authorization','Bearer '+T);n.headers=h;return of.call(this,i,n);};const os=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.send=function(...a){try{this.setRequestHeader('Authorization','Bearer '+T);}catch(e){}return os.apply(this,a);};})();`;
const sleep=(ms)=>new Promise((r)=>setTimeout(r,ms));
const getJSON=(u)=>new Promise((res,rej)=>http.get(u,(r)=>{let d='';r.on('data',(c)=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej));
class CDP{constructor(u){this.ws=new WebSocket(u);this.id=0;this.pend=new Map();this.waiters=[];}open(){return new Promise((res,rej)=>{this.ws.on('open',res);this.ws.on('error',rej);this.ws.on('message',(raw)=>{const m=JSON.parse(raw);if(m.id&&this.pend.has(m.id)){this.pend.get(m.id)(m.result||{});this.pend.delete(m.id);}if(m.method)this.waiters=this.waiters.filter((w)=>(w.method===m.method?(w.res(m),false):true));});});}send(method,params={}){const id=++this.id;return new Promise((res)=>{this.pend.set(id,res);this.ws.send(JSON.stringify({id,method,params}));});}once(method,t=12000){return new Promise((res)=>{const w={method,res};this.waiters.push(w);setTimeout(()=>{this.waiters=this.waiters.filter((x)=>x!==w);res(null);},t);});}}
async function main(){
  const browser=BROWSERS.find((b)=>fs.existsSync(b)); if(!browser) throw new Error('No hay navegador');
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'shot-qr-'));
  const proc=spawn(browser,['--headless=new','--disable-gpu','--hide-scrollbars','--no-first-run','--no-default-browser-check',`--remote-debugging-port=${PORT}`,`--user-data-dir=${profile}`,`--window-size=${VW},${VH}`,'about:blank'],{stdio:'ignore'});
  try{
    let target; for(let i=0;i<40;i++){try{const l=await getJSON(`http://127.0.0.1:${PORT}/json/list`);target=l.find((t)=>t.type==='page');if(target)break;}catch{}await sleep(250);}
    if(!target) throw new Error('CDP no respondió');
    const cdp=new CDP(target.webSocketDebuggerUrl); await cdp.open();
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:VW,height:VH,deviceScaleFactor:DSF,mobile:false});
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
    await cdp.send('Network.setCookie',{name:'refresh_token',value:mint({}),domain:'localhost',path:'/api/v1/auth',httpOnly:true,secure:false,sameSite:'Strict'});
    await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`try{localStorage.setItem('utec-theme','light');}catch(e){}`});
    await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:authShim(mint({roles:'ROLE_ADMIN'}))});
    const evalJs=async(expr)=>(await cdp.send('Runtime.evaluate',{expression:expr,returnByValue:true})).result?.value;
    await cdp.send('Page.navigate',{url:`${FRONTEND}/laboratorios/${LAB_ID}`}); await cdp.once('Page.loadEventFired'); await sleep(3000);
    await evalJs(`document.documentElement.classList.remove('dark')`);
    const ok=await evalJs(`(()=>{const e=[...document.querySelectorAll('button,a')].find(x=>/QR de mesas/i.test(x.textContent));if(e){e.click();return true;}return false;})()`);
    console.log('click "QR de mesas":', ok);
    await sleep(2600);
    // Si abre un modal/diálogo, recórtalo; si no, captura la página.
    const modal=await evalJs(`(()=>{const m=document.querySelector('[role="dialog"], .modal, .fixed');if(!m)return null;const r=m.getBoundingClientRect();return {x:Math.max(0,r.x+scrollX),y:Math.max(0,r.y+scrollY),w:r.width,h:r.height};})()`);
    let clip;
    if(modal && modal.w>200 && modal.h>200){ clip={x:Math.round(modal.x),y:Math.round(modal.y),width:Math.round(modal.w),height:Math.round(modal.h),scale:1}; console.log('modal', clip); }
    else { const H=await evalJs(`Math.min(2200, Math.ceil(document.documentElement.scrollHeight))`); clip={x:0,y:0,width:VW,height:H||1200,scale:1}; console.log('página', clip.height); }
    const { data }=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip});
    fs.writeFileSync(path.join(OUT,'ad-08-qr-recursos.png'), Buffer.from(data,'base64'));
    console.log('✅ ad-08-qr-recursos.png');
  } finally { proc.kill('SIGTERM'); }
}
main().catch((e)=>{ console.error('ERROR:',e.message); process.exit(1); });

#!/usr/bin/env node
/**
 * Renderiza a PNG el HTML REAL de los correos (copiado de EmailService.java) con
 * datos de ejemplo, para mostrarlos en los manuales:
 *   docs/manuales/manual-img/email-reserva.png         (correo al ALUMNO al reservar)
 *   docs/manuales/manual-img/email-bloqueo-total.png   (correo al responsable, bloqueo TOTAL)
 *   docs/manuales/manual-img/email-bloqueo-parcial.png (correo al responsable, bloqueo PARCIAL)
 *
 * Uso: node docs/tools/manual-emails.mjs
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.join(process.cwd(), 'frontend/node_modules/'));
const WebSocket = require('ws');
const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUT = path.join(ROOT, 'docs/manuales/manual-img');
const PORT = 9231;
const BROWSER = ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((b) => fs.existsSync(b));

const pie = () => `<div style="background:#f0f2f5;padding:18px;text-align:center;border-top:2px solid #00BFFF;"><p style="color:#231F20;font-size:13px;font-weight:bold;margin:0 0 2px;">Equipo de UTEC Labs · Concept Lab</p><p style="color:#999;font-size:12px;margin:0;">Universidad de Ingeniería y Tecnología — UTEC</p><p style="color:#bbb;font-size:11px;margin:8px 0 0;">Este es un mensaje automático, por favor no respondas a este correo.</p><p style="color:#bbb;font-size:11px;margin:2px 0 0;">© ${new Date().getFullYear()} UTEC. Todos los derechos reservados.</p></div>`;
const reglas = () => `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:16px;margin:0 30px 24px;"><p style="margin:0 0 8px;font-weight:bold;color:#92400e;">📋 Indicaciones para el uso del espacio</p><ul style="margin:0;padding-left:18px;color:#555;font-size:13px;line-height:1.6;"><li>El horario reservado <strong>incluye 1 hora de armado</strong> al inicio y <strong>1 hora de desmontaje</strong> al final.</li><li>El responsable deberá estar presente durante toda la actividad.</li><li>Los requerimientos adicionales se gestionan mediante <strong>ticket</strong> con anticipación.</li><li>Las pizarras móviles: <strong>4 pares a la derecha y 3 pares a la izquierda</strong> del proyector.</li><li>No se brindará tiempo adicional bajo ninguna circunstancia.</li></ul></div>`;

const emailReserva = () => `<div style="font-family:Calibri,Arial,sans-serif;max-width:600px;margin:0 auto;color:#231F20;"><div style="background:#231F20;padding:22px;text-align:center;"><span style="color:#00BFFF;font-size:26px;font-weight:bold;">UTEC Labs</span></div><div style="padding:30px;border:1px solid #eee;border-top:none;"><div style="display:inline-block;background:#fff7ed;color:#c2410c;border:1px solid #fdba74;border-radius:999px;padding:5px 14px;font-size:13px;font-weight:bold;">⏳ Pendiente de check-in</div><h2 style="margin:16px 0 4px;">¡Reserva registrada, Valeria Campos!</h2><p style="color:#555;margin-top:0;">Tu espacio está apartado. <strong>Aún no está confirmada</strong>: se confirma cuando hagas el check-in.</p><div style="background:#f8fafc;border-left:4px solid #00BFFF;padding:16px;margin:22px 0;border-radius:6px;"><p style="margin:6px 0;">🏫 <strong>Laboratorio:</strong> Concept Lab (L108)</p><p style="margin:6px 0;">🪑 <strong>Recurso:</strong> MESA 1</p><p style="margin:6px 0;">📅 <strong>Fecha:</strong> 2026-07-20</p><p style="margin:6px 0;">🕘 <strong>Horario:</strong> 10:00 — 11:00</p></div><div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:18px;margin:22px 0;"><p style="margin:0 0 8px;font-weight:bold;color:#b45309;">✅ Cómo confirmar tu asistencia (check-in)</p><p style="margin:6px 0;color:#92400e;">El check-in se habilita <strong>10 minutos antes</strong>, es decir <strong>desde las 09:50</strong>.</p><p style="margin:6px 0;color:#92400e;">Escanea el <strong>QR del recurso</strong> al llegar, o pide al responsable que confirme tu asistencia.</p><p style="margin:6px 0;color:#92400e;">⚠️ Si no haces check-in en los <strong>primeros 15 minutos</strong>, la reserva se cancelará automáticamente.</p></div></div>${pie()}</div>`;

const emailBloqueo = (total) => {
  const tipoTexto = total ? 'Bloqueo TOTAL (todo el laboratorio)' : 'Bloqueo PARCIAL (recursos específicos)';
  const uso = total
    ? 'Durante el horario indicado, <strong>todo el laboratorio queda reservado para tu actividad</strong>: puedes usar todos sus recursos y <strong>nadie más podrá reservar</strong> en ese periodo.'
    : 'Durante el horario indicado, <strong>los recursos que reservaste son para tu actividad</strong>; el resto del laboratorio <strong>sigue disponible</strong> para que otras personas hagan sus reservas.';
  const recursos = total ? '' : `<p style="margin:6px 0;">🪑 <strong>Recursos reservados (3):</strong></p><ul style="margin:4px 0 6px 20px;padding:0;color:#333;"><li>MESA 1</li><li>MESA 2</li><li>MESA 3</li></ul>`;
  return `<div style="font-family:Calibri,Arial,sans-serif;max-width:600px;margin:0 auto;color:#231F20;"><div style="background:#231F20;padding:22px;text-align:center;"><span style="color:#00BFFF;font-size:26px;font-weight:bold;">UTEC Labs</span></div><div style="padding:30px;border:1px solid #eee;border-top:none;"><div style="display:inline-block;background:#fef2f2;color:#b91c1c;border:1px solid #fca5a5;border-radius:999px;padding:5px 14px;font-size:13px;font-weight:bold;">🔒 ${tipoTexto}</div><h2 style="margin:16px 0 4px;">Hola Renato Salas,</h2><p style="color:#555;margin-top:0;">Se registró la reserva del laboratorio según el siguiente detalle. ${uso}</p><div style="background:#f8fafc;border-left:4px solid #dc2626;padding:16px;margin:22px 0;border-radius:6px;"><p style="margin:6px 0;">🏫 <strong>Laboratorio:</strong> Concept Lab (L108)</p><p style="margin:6px 0;">📌 <strong>Motivo:</strong> ${total ? 'EVENTO' : 'CLASE'}</p><p style="margin:6px 0;">📅 <strong>Fecha:</strong> 2026-07-20</p><p style="margin:6px 0;">🕘 <strong>Horario:</strong> 10:00 — 13:00</p>${recursos}<p style="margin:6px 0;">📝 <strong>Detalle:</strong> ${total ? 'Taller de Innovación' : 'Clase de Física'}</p></div></div>${reglas()}${pie()}</div>`;
};

const page = (inner) => `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#e9eef3;padding:16px;">${inner}</body></html>`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mail-'));
  const proc = spawn(BROWSER, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=680,1000', 'about:blank'], { stdio: 'ignore' });
  try {
    let t; for (let i = 0; i < 40; i++) { try { const l = await getJSON(`http://127.0.0.1:${PORT}/json/list`); t = l.find((x) => x.type === 'page'); if (t) break; } catch {} await sleep(250); }
    const ws = new WebSocket(t.webSocketDebuggerUrl); let id = 0; const pend = new Map();
    await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); ws.on('message', (m) => { const j = JSON.parse(m); if (j.id && pend.has(j.id)) { pend.get(j.id)(j.result); pend.delete(j.id); } }); });
    const send = (m, p = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 680, height: 1000, deviceScaleFactor: 2, mobile: false });
    const render = async (name, html) => {
      const f = path.join(profile, name + '.html'); fs.writeFileSync(f, page(html));
      await send('Page.navigate', { url: 'file://' + f }); await sleep(900);
      const m = await send('Page.getLayoutMetrics'); const cs = m.cssContentSize || m.contentSize;
      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: cs.width, height: cs.height, scale: 1 } });
      fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(data, 'base64')); console.log('  ✓', name + '.png');
    };
    await render('email-reserva', emailReserva());
    await render('email-bloqueo-total', emailBloqueo(true));
    await render('email-bloqueo-parcial', emailBloqueo(false));
    console.log('✅ Correos en docs/manuales/manual-img/');
  } finally { proc.kill('SIGTERM'); }
}
main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });

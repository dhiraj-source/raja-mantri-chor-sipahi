// Freeze Tag UI check: asli Chrome (headless) me poora round khelta hai — mode select -> room
// banao -> 2 bot players join -> start -> role banner dikhe -> freeze -> saathi ka unfreeze ->
// HUD/timer verify -> round result. Screenshots leta hai, console errors pakadta hai.
//
// Pehle (alag terminals me): npm run build ; npm run dev:api ; npm run dev:web
// Phir:                       node scripts/ui-check-ft.mjs
// Env (optional): CHROME_PATH, OUT (screenshots ka folder, default ./ui-screenshots-ft).
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const WebSocket = require('ws');

const OUT = process.env.OUT ?? join(process.cwd(), 'ui-screenshots-ft');
mkdirSync(OUT, { recursive: true });
const WEB = process.env.WEB_URL ?? 'http://localhost:5173';
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const log = (m) => console.log(m);

// ---------- Chrome + CDP ----------
const profileDir = mkdtempSync(join(tmpdir(), 'rmc-chrome-ft-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=9336', `--user-data-dir=${profileDir}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 40 && !targets; i++) {
  await sleep(500);
  try { targets = await (await fetch('http://127.0.0.1:9336/json')).json(); } catch { /* wait */ }
}
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.on('open', r));
let nextId = 0;
const pending = new Map();
ws.on('message', (raw) => {
  const d = JSON.parse(raw);
  if (d.id && pending.has(d.id)) {
    const { res, rej } = pending.get(d.id);
    pending.delete(d.id);
    if (d.error) rej(new Error(JSON.stringify(d.error)));
    else res(d.result);
  } else if (d.method === 'Runtime.exceptionThrown') {
    errors.push('EXCEPTION: ' + (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text));
  } else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') {
    errors.push('console.error: ' + d.params.args.map((a) => a.value ?? a.description).join(' '));
  }
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++nextId;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed');
  return r.result.value;
};
await send('Page.enable');
await send('Runtime.enable');
const viewport = async (w, h, mobile = true) => {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  // `mobile: true` akela navigator.maxTouchPoints/ontouchstart set nahi karta — joystick ke
  // "touch-capable" detection ke liye ye alag se zaroori hai.
  await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, configuration: mobile ? 'mobile' : 'desktop' });
};
const goto = async (url) => { await send('Page.navigate', { url }); await sleep(1800); };
const shot = async (name) => {
  const h = await evaluate('document.documentElement.scrollHeight');
  const w = await evaluate('document.documentElement.clientWidth');
  const overflowX = await evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth');
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: Math.min(h, 3000), scale: 1 } });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.data, 'base64'));
  log(`shot ${name}  (${w}x${h}${overflowX ? ', HORIZONTAL OVERFLOW!' : ''})`);
  return { overflowX };
};

// ---------- DOM helpers ----------
const waitFor = async (expr, label, timeout = 12000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(`Boolean(${expr})`)) return;
    await sleep(150);
  }
  throw new Error(`timeout: ${label}`);
};
const clickText = (text) => evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find((el) => el.textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())}));
  if (!b) return false; b.click(); return true; })()`);
const hasText = (text) => `document.body.innerText.toLowerCase().includes(${JSON.stringify(text.toLowerCase())})`;


// ---------- Bots (raw WebSocket, Freeze Tag events) ----------
function ftBot(name) {
  const b = { name, room: null, game: null };
  b.ws = new WebSocket('ws://localhost:3000/ws');
  b.ready = new Promise((resolve) => b.ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.event === 'CONNECTED') { b.id = m.data.playerId; resolve(); }
    if (m.event === 'FT_ROOM_STATE') b.room = m.data;
    if (m.event === 'FT_GAME_VIEW') b.game = m.data;
  }));
  b.send = (event, data) => b.ws.send(JSON.stringify({ event, data }));
  b.me = () => b.game?.players.find((p) => p.id === b.id) ?? null;
  return b;
}

/** Bot ko kisi player ke paas (sign=1) ya door (sign=-1) le jaata hai, server ki asli positions se. */
async function move(bot, targetId, ms, sign = 1) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const me = bot.me();
    const target = bot.game?.players.find((p) => p.id === targetId);
    if (me && target) {
      const dx = (target.x - me.x) * sign;
      const dy = (target.y - me.y) * sign;
      const len = Math.hypot(dx, dy) || 1;
      bot.send('FT_INPUT', { x: dx / len, y: dy / len });
    }
    await sleep(60);
  }
  bot.send('FT_INPUT', { x: 0, y: 0 });
}

try {
  await viewport(390, 844);
  await goto(WEB);
  await waitFor(hasText('choose a game'), 'mode select loaded');

  await clickText('Freeze Tag');
  await waitFor(hasText('create room'), 'ft home loaded');
  await evaluate(`(() => { const i = document.querySelector('input[placeholder="Enter your name"]'); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(i, 'Host'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await shot('01-ft-home-mobile');
  await clickText('Create room');
  await waitFor(`document.querySelector('[data-testid=ft-room-code]')`, 'ft lobby loaded');
  const code = await evaluate(`document.querySelector('[data-testid=ft-room-code]').textContent`);
  log(`room code: ${code}`);
  await shot('02-ft-lobby-mobile');

  const bots = ['Bina', 'Charu'].map(ftBot);
  await Promise.all(bots.map((b) => b.ready));
  bots.forEach((b) => b.send('FT_JOIN_ROOM', { code, name: b.name }));
  await waitFor(all('true', hasText('bina'), hasText('charu')), 'dono bots join hue');
  bots.forEach((b) => b.send('FT_READY', { ready: true }));
  await waitFor(hasText('start game'), 'start button enabled');
  await sleep(300);
  await shot('03-ft-lobby-full-mobile');

  await clickText('Start game');
  await waitFor(hasText('get ready'), 'COUNTDOWN dikha', 6000);
  await shot('04-ft-countdown-mobile');

  await waitFor(`document.querySelector('[data-testid=ft-timer]')`, 'PLAYING shuru, timer dikha', 8000);
  await sleep(400);
  const arena = await evaluate(`document.querySelector('canvas[aria-label="Freeze Tag arena"]') !== null`);
  if (!arena) throw new Error('arena canvas render nahi hua');
  log('ok - arena canvas render hua');

  const role = await evaluate(`document.querySelector('[data-testid=ft-role]')?.textContent ?? ''`);
  if (!role.trim()) throw new Error('role banner nahi dikha');
  log(`ok - role banner dikha: "${role.trim()}"`);

  const live = await evaluate(`document.querySelector('[aria-live="polite"]')?.textContent ?? ''`);
  if (!live.trim()) throw new Error('aria-live status khaali hai (accessibility)');
  log(`ok - aria-live status: "${live.trim()}"`);
  await shot('05-ft-playing-mobile');

  const timerText = await evaluate(`document.querySelector('[data-testid=ft-timer]').textContent`);
  if (!/\d\d:\d\d/.test(timerText)) throw new Error(`timer mm:ss format me nahi: ${timerText}`);
  log(`ok - timer mm:ss format me hai: "${timerText.trim()}"`);

  // ---- Freeze + unfreeze ----
  const hostId = bots[0].game?.players.find((p) => !bots.some((b) => b.id === p.id))?.id ?? null;
  if (!hostId) throw new Error('host ka playerId nahi mila');
  const itId = bots[0].game.itId;
  const itBot = bots.find((b) => b.id === itId) ?? null;

  if (itBot) {
    log(`ok - IT ek bot hai (${itBot.name}), wo host ka peecha karega`);
    await move(itBot, hostId, 9000, 1);
    await waitFor(hasText('you are frozen'), 'host FROZEN hua aur UI me turant dikha', 10000);
    log('ok - freeze UI me sync hua (host ko "YOU ARE FROZEN" dikha)');
    await shot('06-ft-frozen-mobile');

    const rescuer = bots.find((b) => b.id !== itId);
    await move(itBot, hostId, 2500, -1);
    await move(rescuer, hostId, 9000, 1);
    await waitFor(hasText('run!'), 'saathi ne unfreeze kiya, host wapas RUN state me', 12000);
    log('ok - unfreeze UI me sync hua (host wapas active)');
    await shot('07-ft-unfrozen-mobile');
  } else {
    log('ok - host hi IT hai, ab ek bot ko host ke paas laakar freeze karwate hain');
    const victim = bots[0];
    await move(victim, hostId, 9000, 1);
    await waitFor(
      `(() => { const t = document.body.innerText.toLowerCase(); return t.includes('you are it'); })()`,
      'host IT ka role dikh raha hai',
      5000,
    );
    if (victim.me()?.status !== 'FROZEN') throw new Error('bot host ke paas aakar bhi freeze nahi hua');
    log('ok - IT (host) ke paas aate hi bot FROZEN ho gaya');
    await shot('06-ft-frozen-by-host-mobile');

    const rescuer = bots[1];
    await move(rescuer, victim.id, 9000, 1);
    if (victim.me()?.status !== 'ACTIVE') throw new Error('saathi bot unfreeze nahi kar paya');
    log('ok - doosre bot ne aakar use unfreeze kar diya');
    await shot('07-ft-unfrozen-mobile');
  }

  // ---- Round end -> result screen ----
  await clickText('End round');
  await sleep(700);
  await shot('08-ft-after-end');
  log('ok - host ne round end kiya, koi crash nahi');

  await viewport(1200, 800, false);
  await sleep(400);
  const desktop = await shot('09-ft-desktop-wide');
  log(desktop.overflowX ? 'FAIL: desktop par horizontal overflow' : 'ok: desktop par koi overflow nahi');
  if (desktop.overflowX) process.exitCode = 1;

  // ---- Hindi ----
  await clickText('हिन्दी');
  await sleep(400);
  // 'End round' ke baad hum lobby me hote hain (home par nahi) — isliye lobby ka text check karo.
  await waitFor(hasText('रूम कोड'), 'Hindi me ft lobby dikha', 8000);
  await shot('10-ft-lobby-hindi');
  log('ok - Freeze Tag Hindi me sahi render hua');

  log('checks done');
} catch (e) {
  log('CHECK FAILED: ' + e.message);
  await shot('99-failure').catch(() => undefined);
  process.exitCode = 1;
} finally {
  log(errors.length ? `BROWSER ERRORS (${errors.length}):\n` + errors.slice(0, 10).join('\n') : 'no browser console errors');
  if (errors.length) process.exitCode = 1;
  ws.close();
  chrome.kill();
  process.exit(process.exitCode ?? 0);
}

function all(...exprs) {
  return exprs.map((e) => `(${e})`).join(' && ');
}

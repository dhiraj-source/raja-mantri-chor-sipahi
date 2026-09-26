// Draw & Guess UI check: asli Chrome (headless) me app chalakar poora game UI se khelta hai
// (mode select -> create room -> 2 bot players join -> start -> word choose -> stroke draw ->
// bot guesses correctly -> round result), screenshots leta hai, console errors pakadta hai.
//
// Pehle (alag terminals me): npm run build ; npm run dev:api ; npm run dev:web
// Phir:                       node scripts/ui-check-dg.mjs
// Env (optional): CHROME_PATH, OUT (screenshots ka folder, default ./ui-screenshots-dg).
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const WebSocket = require('ws');

const OUT = process.env.OUT ?? join(process.cwd(), 'ui-screenshots-dg');
mkdirSync(OUT, { recursive: true });
const WEB = process.env.WEB_URL ?? 'http://localhost:5173';
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const log = (m) => console.log(m);

// ---------- Chrome + CDP ----------
const profileDir = mkdtempSync(join(tmpdir(), 'rmc-chrome-dg-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=9334', `--user-data-dir=${profileDir}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 40 && !targets; i++) {
  await sleep(500);
  try { targets = await (await fetch('http://127.0.0.1:9334/json')).json(); } catch { /* wait */ }
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
const viewport = async (w, h, mobile = true) =>
  send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
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

// ---------- Bots (raw WebSocket, Draw & Guess events) ----------
function dgBot(name) {
  const b = { name, room: null, game: null, chat: [], strokeCount: 0 };
  b.ws = new WebSocket('ws://localhost:3000/ws');
  b.ready = new Promise((resolve) => b.ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.event === 'CONNECTED') { b.id = m.data.playerId; resolve(); }
    if (m.event === 'DG_ROOM_STATE') b.room = m.data;
    if (m.event === 'DG_GAME_VIEW') b.game = m.data;
    if (m.event === 'DG_CHAT_MESSAGE') b.chat.push(m.data);
    if (m.event === 'DG_STROKE') b.strokeCount++;
  }));
  b.send = (event, data) => b.ws.send(JSON.stringify({ event, data }));
  return b;
}

try {
  await viewport(390, 844);
  await goto(WEB);
  await waitFor(hasText('choose a game'), 'mode select loaded');
  await shot('01-mode-select-mobile');

  await clickText('Draw & Guess');
  await waitFor(hasText('create room'), 'dg home loaded');
  await evaluate(`(() => { const i = document.querySelector('input[placeholder="Enter your name"]'); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(i, 'Host'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await shot('02-dg-home-mobile');
  await clickText('Create room');
  await waitFor(`document.querySelector('[data-testid=dg-room-code]')`, 'dg lobby loaded');
  const code = await evaluate(`document.querySelector('[data-testid=dg-room-code]').textContent`);
  log(`room code: ${code}`);
  await shot('03-dg-lobby-host-mobile');

  const bots = ['Bina', 'Charu'].map(dgBot);
  await Promise.all(bots.map((b) => b.ready));
  bots.forEach((b) => b.send('DG_JOIN_ROOM', { code, name: b.name }));
  await waitFor(all('true', hasText('bina'), hasText('charu')), 'both bots joined');
  bots.forEach((b) => b.send('DG_READY', { ready: true }));
  await waitFor(hasText('start game'), 'start button enabled (host UI)');
  await sleep(300);
  await shot('04-dg-lobby-full-mobile');

  await clickText('Start game');
  // Countdown sirf 3s ka hai (cosmetic) — race se bachne ke liye seedha agle phase (word choice)
  // ka intezaar karte hain, "Get ready" dikhna zaroori nahi hai.
  await waitFor(hasText('choose a word to draw'), 'host is drawer, word choices shown', 8000);
  await shot('05-dg-choosing-word-mobile');
  const word = await evaluate(`(() => {
    const heading = [...document.querySelectorAll('p')].find((p) => p.textContent.trim() === 'Choose a word to draw');
    const buttons = heading ? [...heading.parentElement.querySelectorAll('button')] : [];
    return buttons[0]?.textContent.trim() ?? null;
  })()`);
  if (!word) throw new Error('word choice button nahi mila (CHOOSING_WORD UI galat hai?)');

  await clickText(word);
  await waitFor(`document.querySelector('[data-testid=dg-word]')`, 'drawing phase, word shown to drawer');
  const shownWord = await evaluate(`document.querySelector('[data-testid=dg-word]').textContent`);
  if (shownWord !== word) throw new Error(`drawer's shown word "${shownWord}" != selected "${word}"`);
  await sleep(300); // bots ke DG_GAME_VIEW ko bhi pahunchne ka thoda waqt do
  await shot('06-dg-drawing-host-mobile');

  // Bots ko kabhi asli word na milne ka seedha proof (server se aaya raw payload check).
  for (const b of bots) {
    const wire = JSON.stringify(b.game);
    if (wire.toLowerCase().includes(word.toLowerCase())) throw new Error(`SECURITY: bot ${b.name} ki GAME_VIEW me asli word leak hua`);
  }
  log('ok - guesser bots ke GAME_VIEW me kahin bhi asli word nahi mila');

  // Canvas par ek real pointer stroke draw karo (host = drawer).
  const canvasBox = await evaluate(`(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  const cx = canvasBox.x + canvasBox.w * 0.3;
  const cy = canvasBox.y + canvasBox.h * 0.3;
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx + 60, y: cy + 40, button: 'left' });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx + 120, y: cy + 80, button: 'left' });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx + 120, y: cy + 80, button: 'left' });
  await sleep(500); // StrokeBatcher ka 60ms batch window + network round-trip

  const strokeCounts = bots.map((b) => b.strokeCount);
  if (strokeCounts.every((c) => c === 0)) throw new Error('koi bhi bot ko DG_STROKE nahi mila — drawing sync kaam nahi kar raha');
  log(`ok - dono guessers ko DG_STROKE mila (${strokeCounts.join(', ')})`);
  await shot('07-dg-after-stroke-mobile');

  // Bot sahi guess karta hai.
  bots[0].send('DG_CHAT', { text: word });
  await waitFor(hasText('guessed correctly'), 'correct-guess chat entry shown to drawer');
  await sleep(200);
  await shot('08-dg-correct-guess-mobile');

  bots[1].send('DG_CHAT', { text: word });
  await waitFor(hasText('the word was'), 'round results shown (all guessed, turn auto-ended)', 8000);
  await shot('09-dg-round-results-mobile');

  await viewport(1200, 800, false);
  await sleep(300);
  const desktop = await shot('10-dg-desktop-wide');

  log(desktop.overflowX ? 'FAIL: desktop has horizontal overflow' : 'ok: no horizontal overflow on desktop');
  if (desktop.overflowX) process.exitCode = 1;
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

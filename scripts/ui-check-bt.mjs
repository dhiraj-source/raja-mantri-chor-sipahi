// Bomb Tag UI check: asli Chrome (headless) me app chalakar poora game UI se khelta hai
// (mode select -> create room -> 2 bot players join -> start -> COUNTDOWN -> PLAYING -> real
// keyboard input (CDP) se host ko move karta hai -> ek bot disconnect -> round-over -> match end),
// screenshots leta hai, console errors pakadta hai.
//
// Pehle (alag terminals me): npm run build ; npm run dev:api ; npm run dev:web
// Phir:                       node scripts/ui-check-bt.mjs
// Env (optional): CHROME_PATH, OUT (screenshots ka folder, default ./ui-screenshots-bt).
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const WebSocket = require('ws');

const OUT = process.env.OUT ?? join(process.cwd(), 'ui-screenshots-bt');
mkdirSync(OUT, { recursive: true });
const WEB = process.env.WEB_URL ?? 'http://localhost:5173';
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const log = (m) => console.log(m);

// ---------- Chrome + CDP ----------
const profileDir = mkdtempSync(join(tmpdir(), 'rmc-chrome-bt-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=9335', `--user-data-dir=${profileDir}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 40 && !targets; i++) {
  await sleep(500);
  try { targets = await (await fetch('http://127.0.0.1:9335/json')).json(); } catch { /* wait */ }
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

// ---------- Bots (raw WebSocket, Bomb Tag events) ----------
function btBot(name) {
  const b = { name, room: null, game: null };
  b.ws = new WebSocket('ws://localhost:3000/ws');
  b.ready = new Promise((resolve) => b.ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.event === 'CONNECTED') { b.id = m.data.playerId; resolve(); }
    if (m.event === 'BT_ROOM_STATE') b.room = m.data;
    if (m.event === 'BT_GAME_VIEW') b.game = m.data;
  }));
  b.send = (event, data) => b.ws.send(JSON.stringify({ event, data }));
  return b;
}

// Real keyboard press+release via CDP (not a synthetic DOM event) — simulates an actual player.
async function pressKey(code, ms) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code });
  await sleep(ms);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code });
}

/**
 * Bot ko host ke peeche (`sign = 1`) ya ulta door (`sign = -1`) bhejta hai, server-given positions se.
 * Paas jaane se proximity-warning trigger hoti hai; door jaana zaroori hai kyunki dono players ek
 * doosre ke upar khade rahein to bomb baar-baar transfer hoti rehti hai aur timer kabhi ghatta hi nahi.
 */
async function move(bot, targetId, ms, sign = 1) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const me = bot.game?.players.find((p) => p.id === bot.id);
    const target = bot.game?.players.find((p) => p.id === targetId);
    if (me && target && me.alive && target.alive) {
      const dx = (target.x - me.x) * sign;
      const dy = (target.y - me.y) * sign;
      const len = Math.hypot(dx, dy) || 1;
      bot.send('BT_INPUT', { x: dx / len, y: dy / len });
    }
    await sleep(80);
  }
  bot.send('BT_INPUT', { x: 0, y: 0 });
}

try {
  await viewport(390, 844);
  await goto(WEB);
  await waitFor(hasText('choose a game'), 'mode select loaded');
  await shot('01-mode-select-mobile');

  await clickText('Bomb Tag');
  await waitFor(hasText('create room'), 'bt home loaded');
  await evaluate(`(() => { const i = document.querySelector('input[placeholder="Enter your name"]'); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(i, 'Host'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await shot('02-bt-home-mobile');
  await clickText('Create room');
  await waitFor(`document.querySelector('[data-testid=bt-room-code]')`, 'bt lobby loaded');
  const code = await evaluate(`document.querySelector('[data-testid=bt-room-code]').textContent`);
  log(`room code: ${code}`);
  await shot('03-bt-lobby-host-mobile');

  const bots = ['Bina', 'Charu'].map(btBot);
  await Promise.all(bots.map((b) => b.ready));
  bots.forEach((b) => b.send('BT_JOIN_ROOM', { code, name: b.name }));
  await waitFor(all('true', hasText('bina'), hasText('charu')), 'both bots joined');
  bots.forEach((b) => b.send('BT_READY', { ready: true }));
  await waitFor(hasText('start game'), 'start button enabled (host UI)');
  await sleep(300);
  await shot('04-bt-lobby-full-mobile');

  await clickText('Start game');
  await waitFor(hasText('get ready'), 'COUNTDOWN phase shown', 6000);
  await shot('05-bt-countdown-mobile');

  await waitFor(`document.querySelector('[data-testid=bt-bomb-timer]')`, 'PLAYING phase, bomb timer shown', 6000);
  await sleep(300);
  await shot('06-bt-playing-mobile');

  const arenaPresent = await evaluate(`document.querySelector('canvas[aria-label="Bomb Tag arena"]') !== null`);
  if (!arenaPresent) throw new Error('arena canvas render nahi hua');
  log('ok - arena canvas render hua PLAYING phase me');

  // Milestone 5 (polish): screen-reader ke liye aria-live status region non-empty hona chahiye.
  const liveStatus = await evaluate(`document.querySelector('[aria-live="polite"]')?.textContent ?? ''`);
  if (!liveStatus.trim()) throw new Error('aria-live status region khaali hai (accessibility regression)');
  log(`ok - aria-live status region me text hai: "${liveStatus}"`);

  // Real keyboard input (CDP) se host player ko move karo (synthetic DOM event nahi, asli input).
  await pressKey('KeyD', 400); // 400ms right movement — chhoti bhi position badalne ke liye kaafi
  await pressKey('KeyS', 400);
  await sleep(300);
  await shot('07-bt-after-movement-mobile');
  log('ok - real keyboard input (CDP) bheja gaya, koi crash nahi hua');

  // Mobile viewport (mobile:true) => touch-capable => virtual joystick dikhna chahiye.
  const joystickBox = await evaluate(`(() => {
    const j = document.querySelector('[aria-label="Movement joystick"]');
    if (!j) return null;
    const r = j.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!joystickBox) throw new Error('mobile viewport par virtual joystick nahi dikha');
  log('ok - virtual joystick mobile viewport par dikha');
  // Real pointer drag (mouse events yahan bhi Pointer Events fire karte hain) — joystick ko
  // center se bahar khींचke hold karo, phir chhodo.
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: joystickBox.x, y: joystickBox.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: joystickBox.x + 40, y: joystickBox.y, button: 'left' });
  await sleep(200);
  await shot('07b-bt-joystick-dragged');
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: joystickBox.x + 40, y: joystickBox.y, button: 'left' });
  await sleep(200);
  log('ok - virtual joystick par real pointer drag bheja gaya, koi crash nahi hua');

  // ---- Enhancement 1: bomb holder ke paas aate hi warning/pulse ----
  // Host ka player id = game view ka wo player jo kisi bot ka nahi hai.
  const hostPlayerId = bots[0].game?.players.find((p) => !bots.some((b) => b.id === p.id))?.id ?? null;
  if (!hostPlayerId) throw new Error('host ka playerId game view se nahi mila');
  log(`ok - host player id mila (${hostPlayerId.slice(0, 6)}…), ab bot uske paas jaayega`);
  // Warning tabhi aati hai jab BOMB WALA paas ho — isliye jis bot ke paas bomb hai wahi chase kare.
  // (Bomb host ke apne paas ho to warning bina chase ke hi dikhni chahiye.)
  const holderId = bots[0].game?.bombHolderId ?? null;
  const chaser = bots.find((b) => b.id === holderId) ?? null;
  if (chaser) {
    log(`ok - bomb ${chaser.name} ke paas hai, wahi host ka peecha karega`);
    await move(chaser, hostPlayerId, 4000, 1);
  } else {
    log('ok - bomb host ke apne paas hai, warning bina chase ke hi aani chahiye');
  }
  await waitFor(`document.querySelector('[data-testid=bt-danger-warning]')`, 'proximity/bomb warning dikhi', 6000);
  const warningText = await evaluate(`document.querySelector('[data-testid=bt-danger-warning]').textContent`);
  log(`ok - khatra warning dikhi: "${warningText.trim()}"`);
  await shot('07c-bt-danger-warning');

  // ---- Enhancement 2: aakhri 5 second me timer urgent (bada + red + pulse) ----
  // Pehle chaser ko door bhejo, warna dono ke chipke rehne se bomb baar-baar transfer hoti rahegi
  // aur timer har baar 15s par reset hota rahega (kabhi 5s tak pahunchega hi nahi).
  if (chaser) await move(chaser, hostPlayerId, 2500, -1);
  await waitFor(
    `(() => { const el = document.querySelector('[data-testid=bt-bomb-timer]');
       if (!el) return false;
       const secs = parseInt(el.textContent.replace(/[^0-9]/g, ''), 10);
       return Number.isFinite(secs) && secs <= 5; })()`,
    'bomb timer aakhri 5 second me pahuncha',
    20000,
  );
  const timerClass = await evaluate(`document.querySelector('[data-testid=bt-bomb-timer]').className`);
  if (!timerClass.includes('text-red-400') || !timerClass.includes('animate-pulse')) {
    throw new Error(`aakhri 5 second me timer urgent nahi dikha (class: ${timerClass})`);
  }
  log('ok - aakhri 5 second me timer red + pulse ho gaya (beep bhi isi window me tez hoti hai)');
  await shot('07d-bt-timer-urgent');

  // Dono bots disconnect (koi grace time nahi) — sirf host zinda bachta hai, round turant khatam
  // hona chahiye (3-player room me sirf 1 bot disconnect karne se round khatam nahi hota, kyunki
  // 2 log abhi bhi zinda rehte — isliye dono ko hataana zaroori hai).
  bots.forEach((b) => b.ws.close());
  await waitFor(hasText('round winner'), 'dono bots disconnect ke baad round turant khatam hua', 6000);
  await sleep(500); // AnimatePresence exit/enter transition settle hone do
  await shot('08-bt-round-over-mobile');

  // Round-result ke baad server khud agla round shuru karta hai (aur bots wapas nahi aaye to
  // service ka "ghost fix" cascading resolve karta hai jab tak match khatam na ho jaaye).
  await waitFor(`${hasText('you won')} || ${hasText('game over')}`, 'match resolve ho gaya', 15000);
  await sleep(600); // AnimatePresence exit/enter transition settle hone do
  await shot('09-bt-game-over-mobile');
  if (!(await evaluate(hasText('play again')))) throw new Error('host ko "Play again" button nahi dikha — final result card sahi render nahi hua');
  log('ok - final result card (winner + Play again) sahi render hua');

  await viewport(1200, 800, false);
  await sleep(300);
  const desktop = await shot('10-bt-desktop-wide');

  log(desktop.overflowX ? 'FAIL: desktop has horizontal overflow' : 'ok: no horizontal overflow on desktop');
  if (desktop.overflowX) process.exitCode = 1;

  // Hindi check: poore Bomb Tag home+lobby screens ka text. Pehle room chhodo — "mode" state
  // 'bomb_tag' hi rehta hai (mode-select par nahi jaata), isliye seedha BT Home dikhta hai.
  await clickText('हिन्दी');
  await sleep(300);
  await clickText('रूम छोड़ें'); // "Leave room", ab Hindi me
  await waitFor(hasText('रूम बनाएं'), 'bt home Hindi me load hua (room chhodne ke baad)');
  await shot('11-bt-home-hindi');
  await evaluate(`(() => { const i = document.querySelector('input[placeholder="अपना नाम लिखें"]'); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(i, 'होस्ट'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await clickText('रूम बनाएं');
  await waitFor(`document.querySelector('[data-testid=bt-room-code]')`, 'bt lobby Hindi me load hua');
  await shot('12-bt-lobby-hindi');
  log('ok - Bomb Tag Hindi me sahi render hua, koi layout tootha nahi');

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

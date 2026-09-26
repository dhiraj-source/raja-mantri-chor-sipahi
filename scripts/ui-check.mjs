// UI check: asli Chrome (headless) me app chalakar poora game UI se khelta hai aur har screen ka screenshot leta hai.
// Mobile (390px) par horizontal overflow, browser console errors, login/shop/lobby/game/result sab check hote hain.
//
// Pehle (alag terminals me): npm run db:up ; npm run build ; npm run dev:api ; npm run dev:web
// Phir:                       npm run ui:check
// Env (optional): CHROME_PATH (Chrome/Edge ka path), OUT (screenshots ka folder, default ./ui-screenshots).
// Ye script dev database me ek "ui_xxxxxx" account banati hai (baad me delete kar sakte ho).
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
// `ws` package apps/api ke saath install hota hai.
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const WebSocket = require('ws');

const OUT = process.env.OUT ?? join(process.cwd(), 'ui-screenshots');
mkdirSync(OUT, { recursive: true });
const WEB = 'http://localhost:5173';
const API = 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const log = (m) => console.log(m);

// ---------- Chrome + CDP ----------
const profileDir = mkdtempSync(join(tmpdir(), 'rmc-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=9333', `--user-data-dir=${profileDir}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 40 && !targets; i++) {
  await sleep(500);
  try { targets = await (await fetch('http://127.0.0.1:9333/json')).json(); } catch { /* wait */ }
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
const waitFor = async (expr, label, timeout = 10000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(`Boolean(${expr})`)) return;
    await sleep(150);
  }
  throw new Error(`timeout: ${label}`);
};
const clickText = (text, exact = false) => evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find((el) => { const t = el.textContent.trim(); return ${exact ? 't === ' + JSON.stringify(text) : 't.includes(' + JSON.stringify(text) + ')'}; });
  if (!b) return false; b.click(); return true; })()`);
/** Button dabao aur tab tak ruko jab tak wo purana button DOM se hat na jaye (animation ke baad naya screen). */
const clickAndDetach = async (text) => {
  const ok = await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].filter((el) => el.textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())})).pop();
    if (!b) return false; window.__clicked = b; b.click(); return true; })()`);
  if (!ok) throw new Error('button not found: ' + text);
  await waitFor('!document.body.contains(window.__clicked)', `screen change after "${text}"`);
};
const hasText = (text) => `document.body.innerText.toLowerCase().includes(${JSON.stringify(text.toLowerCase())})`;
/** Kai browser-side conditions ek saath (sab sach ho). */
const all = (...exprs) => exprs.map((e) => `(${e})`).join(' && ');
const any = (...exprs) => exprs.map((e) => `(${e})`).join(' || ');

// ---------- Bots (3 nakli players) ----------
function bot(name) {
  const b = { name, game: null, room: null };
  b.ws = new WebSocket('ws://localhost:3000/ws');
  b.ready = new Promise((resolve) => b.ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.event === 'CONNECTED') { b.id = m.data.playerId; resolve(); }
    if (m.event === 'ROOM_STATE') b.room = m.data;
    if (m.event === 'GAME_VIEW') {
      b.game = m.data;
      if (b.game?.canGuess) {
        const raja = Object.entries(b.game.visibleRoles).find(([, r]) => r === 'RAJA')?.[0];
        const target = b.game.players.find((p) => p.id !== raja && p.id !== b.id);
        b.ws.send(JSON.stringify({ event: 'SUBMIT_GUESS', data: { guessedChorId: target.id } }));
      }
    }
  }));
  b.send = (event, data) => b.ws.send(JSON.stringify({ event, data }));
  return b;
}

try {
  // 1) Guest home: mobile + desktop + Hindi
  await viewport(390, 844);
  await goto(WEB);
  await waitFor(hasText('Quick match'), 'home loaded');
  const guest = await shot('01-home-guest-mobile');
  await clickText('हिन्दी');
  await sleep(300);
  await shot('02-home-guest-mobile-hindi');
  await clickText('English');
  await viewport(1100, 900, false);
  await goto(WEB);
  await waitFor(hasText('Quick match'), 'home desktop');
  await shot('03-home-guest-desktop');

  // 2) Naya account (API se) + login state
  const suffix = Date.now().toString(36).slice(-6);
  const username = `ui_${suffix}`;
  const reg = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: 'password123', displayName: 'Tester' }) })).json();
  await viewport(390, 844);
  await goto(WEB);
  await evaluate(`localStorage.setItem('rmc:auth', ${JSON.stringify(reg.authToken)}); localStorage.setItem('rmc:name','Tester')`);
  await goto(WEB);
  await waitFor(all(hasText('Character shop'), hasText('Friends')), 'logged-in home');
  await shot('04-home-loggedin-mobile');

  // 3) Room banao, 3 bots join
  await clickText('Create a new room');
  await waitFor(`document.querySelector('[data-testid=room-code]')`, 'lobby');
  const code = await evaluate(`document.querySelector('[data-testid=room-code]').textContent`);
  const bots = ['Asha', 'Bina', 'Charu'].map(bot);
  await Promise.all(bots.map((b) => b.ready));
  bots.forEach((b) => b.send('JOIN_ROOM', { code, name: b.name }));
  await waitFor(all(hasText('Charu'), hasText('Start game')), 'lobby full');
  await shot('05-lobby-mobile');

  // 4) Game khelo
  await clickText('Start game');
  for (let round = 1; round <= 4; round++) {
    await waitFor(hasText(`Round ${round} / 4`), `round ${round} started`);
    let shotActive = false;
    // Bots turant guess karte hain, isliye "active" ya "result" jo bhi pehle dikhe.
    for (let i = 0; i < 60; i++) {
      if (await evaluate(any(hasText('Next round'), hasText('See final result')))) break;
      if (!shotActive && round === 1 && (await evaluate(`Boolean(document.querySelector('[data-testid=my-role]'))`))) {
        await shot('06-round-active-mobile');
        shotActive = true;
      }
      if (await evaluate(hasText('Who is the Chor?'))) {
        if (round === 1) await shot('07-mantri-guess-mobile');
        await evaluate(`(() => { const p = [...document.querySelectorAll('p')].find((e) => e.textContent.includes('Who is the Chor?')); const b = p && p.nextElementSibling && p.nextElementSibling.querySelector('button'); if (b) b.click(); })()`);
      }
      await sleep(150);
    }
    await waitFor(any(hasText('Next round'), hasText('See final result')), `round ${round} result`);
    if (round === 1) await shot('08-round-result-mobile');
    await clickAndDetach(round === 4 ? 'See final result' : 'Next round');
  }
  await waitFor(hasText('Play again'), 'final result');
  await sleep(600);
  await shot('09-final-result-mobile');
  const rewardShown = await evaluate(`Boolean(document.querySelector('[data-testid=reward]'))`);
  log(`reward box shown: ${rewardShown}`);

  // 5) Room chhodo, shop me character kharido (coins kam ho sakte hain: CAT 10)
  await clickText('Leave room');
  await waitFor(hasText('Character shop'), 'back home');
  await sleep(800);
  await shot('10-home-after-game-mobile');
  const bought = await evaluate(`(() => { const li = [...document.querySelectorAll('li')].find((e) => e.textContent.includes('Cat')); const b = li && [...li.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Buy' && !x.disabled); if (!b) return false; b.click(); return true; })()`);
  log(`buy Cat clicked: ${bought}`);
  await sleep(1000);
  await shot('11-shop-after-buy-mobile');

  log(guest.overflowX ? 'FAIL: mobile home has horizontal overflow' : 'ok: no horizontal overflow on mobile home');
  if (guest.overflowX) process.exitCode = 1;
  log('checks done');
} catch (e) {
  log('CHECK FAILED: ' + e.message);
  await shot('99-failure').catch(() => undefined);
  process.exitCode = 1;
} finally {
  log(errors.length ? `BROWSER ERRORS (${errors.length}):\n` + errors.slice(0, 10).join('\n') : 'no browser console errors');
  ws.close();
  chrome.kill();
  process.exit(process.exitCode ?? 0);
}

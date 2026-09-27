// Freeze Tag smoke test: asli WebSocket clients ek asli chalte hue server ke against poora round
// khelte hain (create -> join -> ready -> start -> COUNTDOWN -> PLAYING -> IT ka tag se freeze ->
// saathi ka unfreeze -> disconnect par naya IT -> round khatam). Pehle server chalao:
//   node apps/api/dist/main.js
// phir: npm run smoke:ft -w @rmc/api
import WebSocket from 'ws';

const URL = process.env.WS_URL ?? 'ws://localhost:3000/ws';
let failed = false;

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    failed = true;
    return;
  }
  console.log(`ok - ${msg}`);
}

class Client {
  constructor(name, token) {
    this.name = name;
    this.room = null;
    this.game = null;
    this.errors = [];
    this.waiters = [];
    this.ws = new WebSocket(token ? `${URL}?token=${token}` : URL);
    this.ready = new Promise((resolve) => {
      this.ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.event === 'CONNECTED') {
          this.id = msg.data.playerId;
          this.token = msg.data.token;
          resolve();
        }
        if (msg.event === 'FT_ROOM_STATE') this.room = msg.data;
        if (msg.event === 'FT_GAME_VIEW') this.game = msg.data;
        if (msg.event === 'FT_ERROR') this.errors.push(msg.data.code);
        this.waiters = this.waiters.filter((w) => !w());
      });
    });
  }
  send(event, data) {
    this.ws.send(JSON.stringify({ event, data }));
  }
  me() {
    return this.game?.players.find((p) => p.id === this.id) ?? null;
  }
  waitFor(check, label, timeoutMs = 20_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout: ${label}`)), timeoutMs);
      const test = () => {
        if (check()) {
          clearTimeout(timer);
          resolve();
          return true;
        }
        return false;
      };
      if (!test()) this.waiters.push(test);
    });
  }
}

/** Ek client ko doosre player ke paas (sign=1) ya door (sign=-1) le jaata hai. */
async function move(client, targetId, ms, sign = 1) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const me = client.me();
    const target = client.game?.players.find((p) => p.id === targetId);
    if (me && target) {
      const dx = (target.x - me.x) * sign;
      const dy = (target.y - me.y) * sign;
      const len = Math.hypot(dx, dy) || 1;
      client.send('FT_INPUT', { x: dx / len, y: dy / len });
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  client.send('FT_INPUT', { x: 0, y: 0 });
}

async function main() {
  const a = new Client('Asha');
  const b = new Client('Bina');
  const c = new Client('Charu');
  await Promise.all([a.ready, b.ready, c.ready]);
  assert(a.id && b.id && c.id, 'teeno clients CONNECTED (playerId mila)');

  a.send('FT_CREATE_ROOM', { name: 'Asha', settings: { roundDurationMs: 60_000 } });
  await a.waitFor(() => a.room?.code, 'room create hui');
  const code = a.room.code;
  assert(a.room.hostId === a.id, 'Asha host hai');

  b.send('FT_JOIN_ROOM', { code, name: 'Bina' });
  c.send('FT_JOIN_ROOM', { code, name: 'Charu' });
  await c.waitFor(() => c.room?.players.length === 3, 'teeno players room me aaye');

  // Sab ready hone se pehle start reject hona chahiye.
  a.send('FT_START_GAME', {});
  await a.waitFor(() => a.errors.includes('NEED_MORE_PLAYERS'), 'sab ready hone se pehle start reject hua');
  a.errors.length = 0;

  b.send('FT_READY', { ready: true });
  c.send('FT_READY', { ready: true });
  await a.waitFor(() => a.room.players.every((p) => p.ready), 'sab ready ho gaye');

  a.send('FT_START_GAME', {});
  await a.waitFor(() => a.game?.phase === 'COUNTDOWN', 'game shuru: COUNTDOWN');
  await a.waitFor(() => a.game?.phase === 'PLAYING', 'COUNTDOWN khatam: PLAYING shuru', 8000);
  await b.waitFor(() => b.game?.phase === 'PLAYING', 'Bina ke socket par bhi PLAYING pahunchi');

  const clients = [a, b, c];
  const itId = a.game.itId;
  assert(a.game.players.filter((p) => p.status === 'IT').length === 1, 'sirf ek hi player IT hai');
  assert(typeof a.game.roundEndsAt === 'number', 'round timer set ho chuka hai');
  assert(
    a.game.players.filter((p) => p.status === 'ACTIVE').length === 2,
    'baaki dono players ACTIVE hain',
  );

  const it = clients.find((x) => x.id === itId);
  const runners = clients.filter((x) => x.id !== itId);
  const victim = runners[0];
  const rescuer = runners[1];

  // ---- IT ka tag => freeze ----
  await move(it, victim.id, 6000, 1);
  await it.waitFor(
    () => it.game?.players.find((p) => p.id === victim.id)?.status === 'FROZEN',
    'IT ne chhoo kar player ko FROZEN kar diya',
    8000,
  );
  await victim.waitFor(
    () => victim.me()?.status === 'FROZEN',
    'frozen player ke apne socket par bhi FROZEN sync hua',
  );

  // Frozen player hil nahi sakta — server hi rokta hai.
  const posBefore = { ...victim.me() };
  for (let i = 0; i < 20; i++) {
    victim.send('FT_INPUT', { x: 1, y: 1 });
    await new Promise((r) => setTimeout(r, 50));
  }
  const posAfter = victim.me();
  assert(
    posBefore.x === posAfter.x && posBefore.y === posAfter.y,
    'FROZEN player input bhejne par bhi nahi hilta (server ignore karta hai)',
  );

  // ---- Saathi ka rescue => unfreeze ----
  // IT ko door bhejo taaki wo turant dobara freeze na kar de.
  await move(it, victim.id, 2500, -1);
  await move(rescuer, victim.id, 6000, 1);
  await rescuer.waitFor(
    () => rescuer.game?.players.find((p) => p.id === victim.id)?.status === 'ACTIVE',
    'saathi ne paas jaakar frozen player ko UNFREEZE kar diya',
    8000,
  );
  assert(
    rescuer.game.stats.find((s) => s.id === rescuer.id)?.unfreezes >= 1,
    'rescuer ke stats me unfreeze count badha',
  );
  assert(
    rescuer.game.stats.find((s) => s.id === itId)?.freezes >= 1,
    'IT ke stats me freeze count badha',
  );

  // ---- IT disconnect => naya IT ----
  it.ws.close();
  await rescuer.waitFor(
    () => rescuer.game?.itId && rescuer.game.itId !== itId,
    'IT disconnect: naya IT turant chun liya gaya',
    20000,
  );
  assert(
    !rescuer.game.players.some((p) => p.id === itId),
    'chala gaya player game view se poori tarah hat gaya (koi bhoot nahi)',
  );

  a.ws.close();
  b.ws.close();
  c.ws.close();

  if (failed) {
    console.error('\nSMOKE TEST FAILED');
    process.exit(1);
  }
  console.log('\nAll Freeze Tag smoke checks passed.');
  process.exit(0);
}

main().catch((e) => {
  console.error('SMOKE TEST ERROR:', e);
  process.exit(1);
});

// Bomb Tag smoke test: real WebSocket clients ek asli chalte hue server ke against poora game
// khelte hain (create -> join -> ready -> start -> COUNTDOWN -> PLAYING -> disconnect se turant
// forfeit, koi grace time nahi -> ROUND_OVER -> agla round apne aap -> disconnected opponent
// wapas nahi aaya to match khud hi GAME_OVER tak resolve ho jaata hai). Pehle server chalao:
//   BT_ROUND_RESULT_MS=1500 node apps/api/dist/main.js
// (chhota round-transition delay taaki ye jaldi chalein), phir: node scripts/smoke-bt.mjs
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
        if (msg.event === 'BT_ROOM_STATE') this.room = msg.data;
        if (msg.event === 'BT_GAME_VIEW') this.game = msg.data;
        if (msg.event === 'BT_ERROR') this.errors.push(msg.data.code);
        this.waiters = this.waiters.filter((w) => !w());
      });
    });
  }
  send(event, data) {
    this.ws.send(JSON.stringify({ event, data }));
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

async function main() {
  const roundWaitMs = Number(process.env.ROUND_TRANSITION_WAIT_MS ?? 8000);

  const a = new Client('Asha');
  const b = new Client('Bina');
  await Promise.all([a.ready, b.ready]);
  assert(a.id && b.id, 'dono clients CONNECTED (playerId mila)');

  a.send('BT_CREATE_ROOM', { name: 'Asha', settings: { roundsToWin: 2 } });
  await a.waitFor(() => a.room?.code, 'room create hui');
  const code = a.room.code;
  assert(a.room.hostId === a.id, 'Asha host hai');
  assert(a.room.players[0]?.ready === true, 'host auto-ready hota hai');

  b.send('BT_JOIN_ROOM', { code, name: 'Bina' });
  await b.waitFor(() => b.room?.players.length === 2, 'Bina room me join hui');
  assert(b.room.players.find((p) => p.id === b.id)?.ready === false, 'naya player by default ready nahi hota');

  // Host ke alawa koi ready na ho to game shuru nahi hona chahiye.
  a.send('BT_START_GAME', {});
  await a.waitFor(() => a.errors.includes('NEED_MORE_PLAYERS'), 'Bina ready hone se pehle start reject hua');
  a.errors.length = 0; // is expected error ko clear karo, aage "koi error nahi aaya" check ke liye

  b.send('BT_READY', { ready: true });
  await a.waitFor(() => a.room.players.find((p) => p.id === b.id)?.ready, 'Bina ready hui');

  a.send('BT_START_GAME', {});
  await a.waitFor(() => a.game?.phase === 'COUNTDOWN', 'game shuru: COUNTDOWN');

  await a.waitFor(() => a.game?.phase === 'PLAYING', 'COUNTDOWN khatam: PLAYING shuru');
  await b.waitFor(() => b.game?.phase === 'PLAYING', 'Bina ke socket par bhi PLAYING pahunchi'); // alag connections, alag wait zaroori
  assert(a.game.players.length === 2, 'dono players game view me hain');
  assert(typeof a.game.bombEndsAt === 'number', 'bomb ka timer set ho chuka hai');
  assert(a.game.bombHolderId === a.id || a.game.bombHolderId === b.id, 'kisi ek player ke paas bomb hai');

  a.send('BT_INPUT', { x: 1, y: 0.3 });
  await new Promise((r) => setTimeout(r, 250)); // kuch server ticks guzarne do
  assert(a.errors.length === 0, 'movement input se koi error nahi aaya');
  const moved = a.game.players.find((p) => p.id === a.id);
  assert(typeof moved?.x === 'number' && typeof moved?.y === 'number', 'server se taaza position mili (tick loop chal raha hai)');

  // Regression (reported bug): tez movement input (joystick drag jaisa, ~100 msg/sec) pehle
  // gateway ki flood-limit paar kar ke socket terminate kar deta tha -> Bomb Tag ka
  // "disconnect = turant forfeit" -> saamne wala player bina kisi elimination ke jeet jaata tha.
  // Movement ab apni alag limit par chalta hai: connection zinda rehni chahiye, koi bhi player
  // eliminate nahi hona chahiye, aur round PLAYING me hi rehna chahiye.
  for (let i = 0; i < 100; i++) {
    a.send('BT_INPUT', { x: 1, y: 0.1 * (i % 5) });
    await new Promise((r) => setTimeout(r, 10));
  }
  await new Promise((r) => setTimeout(r, 300));
  assert(a.ws.readyState === 1, 'tez movement par bhi socket OPEN rehta hai (flood-limit se nahi kata)');
  assert(a.game?.phase === 'PLAYING', 'tez movement se round khatam nahi hota (PLAYING hi rehta hai)');
  assert(
    a.game.players.every((p) => p.alive),
    'tez movement se koi player eliminate nahi hota',
  );
  assert(a.game.roundWinnerId === null, 'tez movement se koi winner declare nahi hota');

  // Disconnect = turant forfeit (Bomb Tag me RMCS/DG jaisa grace time jaan-boojh kar nahi hai).
  b.ws.close();
  await a.waitFor(() => a.game?.phase === 'ROUND_OVER', 'Bina disconnect: round turant khatam ho gaya');
  assert(a.game.roundWinnerId === a.id, 'Asha round jeet gayi');
  assert(a.room.players.find((p) => p.id === b.id)?.connected === false, 'Bina disconnected dikhti hai, hati nahi');

  // Round-result screen ke baad server khud agla round shuru karta hai. 'Bina' wapas nahi aayi —
  // service-level fix ke saath wo agle round me bhi turant dobara forfeit ho jaani chahiye, isliye
  // match (roundsToWin: 2) khud hi GAME_OVER tak resolve ho jaata hai, kahin atakta nahi.
  await a.waitFor(() => a.game?.phase === 'GAME_OVER', 'agla round apne aap chala aur match khud khatam ho gaya', roundWaitMs);
  assert(a.game.matchWinnerId === a.id, 'Asha match jeet gayi');
  assert(a.game.round === 2, 'dusra round shuru hokar turant khud resolve hua');

  a.ws.close();

  // ---- Reconnect: 3-player room, ek player disconnect + same-token reconnect (round beech me hi) ----
  const h = new Client('Host2');
  const p1 = new Client('P1');
  const p2 = new Client('P2');
  await Promise.all([h.ready, p1.ready, p2.ready]);
  h.send('BT_CREATE_ROOM', { name: 'Host2', settings: { roundsToWin: 5 } });
  await h.waitFor(() => h.room?.code, 'teesra room bana');
  const code3 = h.room.code;
  p1.send('BT_JOIN_ROOM', { code: code3, name: 'P1' });
  p2.send('BT_JOIN_ROOM', { code: code3, name: 'P2' });
  await p2.waitFor(() => p2.room?.players.length === 3, '3 players room me aaye');
  p1.send('BT_READY', { ready: true });
  p2.send('BT_READY', { ready: true });
  await h.waitFor(() => h.room.players.every((p) => p.ready), 'sab ready hue');
  h.send('BT_START_GAME', {});
  await h.waitFor(() => h.game?.phase === 'PLAYING', '3-player match PLAYING me pahuncha');

  const p1Token = p1.token;
  p1.ws.close();
  await h.waitFor(
    () => h.room?.players.find((p) => p.id === p1.id)?.connected === false,
    'p1 disconnect: room me connected=false dikhta hai',
  );
  await h.waitFor(() => h.game?.phase === 'PLAYING', '3-player round abhi bhi chal raha hai (2 alive bache)');

  const p1Again = new Client('P1-rejoined', p1Token);
  await p1Again.ready;
  assert(p1Again.id === p1.id, 'same token se reconnect par wahi playerId wapas mila');
  await h.waitFor(
    () => h.room?.players.find((p) => p.id === p1.id)?.connected === true,
    'reconnect ke baad room me connected=true dikhta hai',
  );
  assert(p1Again.room?.code === code3, 'reconnect hone par purana room state seedha wapas mila');
  assert(p1Again.game?.phase === 'PLAYING', 'reconnect hone par purana game view bhi seedha wapas mila');

  h.ws.close();
  p2.ws.close();
  p1Again.ws.close();

  if (failed) {
    console.error('\nSMOKE TEST FAILED');
    process.exit(1);
  }
  console.log('\nAll Bomb Tag smoke checks passed.');
  process.exit(0);
}

main().catch((e) => {
  console.error('SMOKE TEST ERROR:', e);
  process.exit(1);
});

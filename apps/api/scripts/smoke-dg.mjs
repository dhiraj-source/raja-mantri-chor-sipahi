// Draw & Guess smoke test: real WebSocket clients ek asli chalte hue server ke against poora
// game khelte hain (create -> join -> ready -> start -> word select -> guess -> round result ->
// host disconnect -> grace expire). Pehle server chalao:
//   RECONNECT_GRACE_MS=1500 node apps/api/dist/main.js
// (chhota grace time taaki disconnect-handling checks jaldi chalein), phir: node scripts/smoke-dg.mjs
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
  constructor(name) {
    this.name = name;
    this.room = null;
    this.game = null;
    this.errors = [];
    this.chat = [];
    this.waiters = [];
    this.ws = new WebSocket(URL);
    this.ready = new Promise((resolve) => {
      this.ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.event === 'CONNECTED') {
          this.id = msg.data.playerId;
          resolve();
        }
        if (msg.event === 'DG_ROOM_STATE') this.room = msg.data;
        if (msg.event === 'DG_GAME_VIEW') this.game = msg.data;
        if (msg.event === 'DG_ERROR') this.errors.push(msg.data.code);
        if (msg.event === 'DG_CHAT_MESSAGE') this.chat.push(msg.data);
        this.waiters = this.waiters.filter((w) => !w());
      });
    });
  }
  send(event, data) {
    this.ws.send(JSON.stringify({ event, data }));
  }
  waitFor(check, label) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout: ${label}`)), 20_000);
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
  const a = new Client('Asha');
  const b = new Client('Bina');
  await Promise.all([a.ready, b.ready]);
  assert(a.id && b.id, 'dono clients CONNECTED (playerId mila)');

  a.send('DG_CREATE_ROOM', { name: 'Asha' });
  await a.waitFor(() => a.room?.code, 'room create hui');
  const code = a.room.code;

  b.send('DG_JOIN_ROOM', { code, name: 'Bina' });
  await b.waitFor(() => b.room?.players.length === 2, 'Bina room me join hui');
  assert(a.room.hostId === a.id, 'Asha host hai');

  b.send('DG_READY', { ready: true });
  await a.waitFor(() => a.room.players.find((p) => p.id === b.id)?.ready, 'Bina ready hui');

  a.send('DG_START_GAME', {});
  await a.waitFor(() => a.game?.phase === 'COUNTDOWN', 'game shuru: COUNTDOWN');

  await a.waitFor(() => a.game?.phase === 'CHOOSING_WORD', 'CHOOSING_WORD tak pahunche', );
  const drawer = a.game.isDrawer ? a : b;
  const guesser = a.game.isDrawer ? b : a;
  assert(drawer.game.wordChoices?.length === 3, 'drawer ko 3 word choices mile');
  assert(guesser.game.wordChoices === null, 'guesser ko wordChoices bilkul nahi mile');

  const word = drawer.game.wordChoices[0];
  drawer.send('DG_SELECT_WORD', { word });
  // drawer aur guesser alag WebSocket connections hain — dono ka apna message alag time par
  // pahunchta hai, isliye dono ka apna wait zaroori hai (sirf ek ka wait karke doosre ka state
  // check karna race condition hai, jaisa yahan pehle ek baar dikha bhi).
  await drawer.waitFor(() => drawer.game?.phase === 'DRAWING', 'drawer ke socket par bhi DRAWING pahunchi');
  await guesser.waitFor(() => guesser.game?.phase === 'DRAWING', 'DRAWING shuru hui');
  assert(guesser.game.word === null, 'guesser ko asli word kabhi nahi mila');
  assert(drawer.game.word === word, 'drawer ko apna word dikhta hai');
  const wire = JSON.stringify(guesser.game);
  assert(!wire.toLowerCase().includes(word.toLowerCase()), 'guesser ki GAME_VIEW wire payload me kahin bhi asli word nahi hai');

  guesser.send('DG_CHAT', { text: 'totally wrong guess' });
  await drawer.waitFor(() => drawer.chat.some((c) => c.kind === 'CHAT'), 'galat guess normal chat ki tarah dikha');

  guesser.send('DG_CHAT', { text: word });
  await drawer.waitFor(() => drawer.chat.some((c) => c.kind === 'CORRECT_GUESS'), 'sahi guess CORRECT_GUESS event bana');
  const correctMsg = drawer.chat.find((c) => c.kind === 'CORRECT_GUESS');
  assert(!('text' in correctMsg), 'CORRECT_GUESS entry me guess ka text kabhi nahi bheja jaata');

  await drawer.waitFor(() => drawer.game?.phase === 'ROUND_RESULTS', 'sab guess kar chuke: turn khud khatam hua');
  await guesser.waitFor(() => guesser.game?.phase === 'ROUND_RESULTS', 'guesser ke socket par bhi ROUND_RESULTS pahunchi'); // dono clients alag messages hain, dono ka wait alag se zaroori hai
  assert(drawer.game.history[0]?.word === word, 'ROUND_RESULTS me word ab reveal ho chuka hai');
  assert(guesser.game.players.find((p) => p.id === guesser.id).score > 0, 'guesser ko points mile');
  assert(drawer.game.players.find((p) => p.id === drawer.id).score > 0, 'drawer ko bhi points mile');

  a.ws.close();
  b.ws.close();

  // ---- Disconnect handling: host disconnect -> turant naya host; grace expire -> seat khali ----
  // Naya, alag room (lobby-only, koi game nahi) — taaki JOIN_ROOM "GAME_IN_PROGRESS" na de.
  // Server ka RECONNECT_GRACE_MS chhota (jaise 1500) set karke chalao taaki ye jaldi check ho —
  // production (default 60s grace) ke against SKIP_GRACE_CHECK=1 se is hisse ko skip kar sakte ho.
  const graceWaitMs = Number(process.env.GRACE_WAIT_MS ?? 5000);
  const h = new Client('Host2');
  const g1 = new Client('G1');
  const g2 = new Client('G2');
  await Promise.all([h.ready, g1.ready, g2.ready]);
  h.send('DG_CREATE_ROOM', { name: 'Host2' });
  await h.waitFor(() => h.room?.code, 'dusra room bana');
  const code2 = h.room.code;
  g1.send('DG_JOIN_ROOM', { code: code2, name: 'G1' });
  g2.send('DG_JOIN_ROOM', { code: code2, name: 'G2' });
  await g2.waitFor(() => g2.room?.players.length === 3, 'dono naye players room me aaye');
  const hostIdBefore = h.room.hostId;

  h.ws.close(); // host disconnect (bina LEAVE bheje)
  await g1.waitFor(() => g1.room?.hostId && g1.room.hostId !== hostIdBefore, 'host disconnect: turant naya host bana');
  const newHostId = g1.room.hostId;
  assert(g1.room.players.find((p) => p.id === hostIdBefore)?.connected === false, 'purana host disconnected dikhta hai, hata nahi');

  const newHostClient = newHostId === g1.id ? g1 : g2;
  const otherClient = newHostId === g1.id ? g2 : g1;
  if (process.env.SKIP_GRACE_CHECK === '1') {
    console.log('skipped - grace-expiry check (SKIP_GRACE_CHECK=1, server ka grace time lamba hai)');
    newHostClient.ws.close();
  } else {
    newHostClient.ws.close(); // naya host bhi disconnect (grace expire hone dete hain)
    await otherClient.waitFor(
      () => !otherClient.room?.players.some((p) => p.id === newHostId),
      'grace time khatam: disconnected host ki seat khali ho gayi',
      graceWaitMs,
    );
    assert(otherClient.room.players.length === 1, 'sirf ek hi connected player bacha room me');
  }

  otherClient.ws.close();

  if (failed) {
    console.error('\nSMOKE TEST FAILED');
    process.exit(1);
  }
  console.log('\nAll Draw & Guess smoke checks passed.');
  process.exit(0);
}

main().catch((e) => {
  console.error('SMOKE TEST ERROR:', e);
  process.exit(1);
});

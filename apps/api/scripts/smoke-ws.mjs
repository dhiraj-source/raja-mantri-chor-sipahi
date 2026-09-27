// Smoke test: 4 fake players asli server par poora game khelte hain.
// Pehle server chalao (npm run build && node apps/api/dist/main.js), phir: npm run smoke -w @rmc/api
import WebSocket from 'ws';

const URL = process.env.WS_URL ?? 'ws://localhost:3000/ws';

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`ok - ${msg}`);
}

class Client {
  constructor(name, token) {
    this.name = name;
    this.room = null;
    this.game = null;
    this.errors = [];
    this.reactions = [];
    this.friendsChanged = 0;
    this.invites = [];
    this.queueSizes = [];
    this.voiceSignals = [];
    this.voiceMutes = [];
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
        if (msg.event === 'ROOM_STATE') this.room = msg.data;
        if (msg.event === 'GAME_VIEW') this.game = msg.data;
        if (msg.event === 'ERROR') this.errors.push(msg.data.code);
        if (msg.event === 'REACTION') this.reactions.push(msg.data);
        if (msg.event === 'GAME_REWARD') this.reward = msg.data;
        if (msg.event === 'FRIENDS_CHANGED') this.friendsChanged++;
        if (msg.event === 'INVITE') this.invites.push(msg.data);
        if (msg.event === 'AUTH_STATE') this.authState = msg.data === null ? 'guest' : msg.data.displayName;
        if (msg.event === 'QUEUE_STATE') {
          this.queueSizes.push(msg.data ? msg.data.size : null);
          this.queueNames = msg.data ? msg.data.names : null;
        }
        if (msg.event === 'VOICE_SIGNAL') this.voiceSignals.push(msg.data);
        if (msg.event === 'VOICE_MUTE') this.voiceMutes.push(msg.data);
        this.waiters = this.waiters.filter((w) => !w());
      });
    });
  }
  send(event, data) {
    this.ws.send(JSON.stringify({ event, data }));
  }
  waitFor(check, label) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout: ${label}`)), 3000);
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

const names = ['Asha', 'Bina', 'Charu', 'Dev'];
const [a, b, c, d] = names.map((n) => new Client(n));
const all = [a, b, c, d];
await Promise.all(all.map((x) => x.ready));
assert(all.every((x) => x.id), 'sabko guest playerId mila');

a.send('CREATE_ROOM', { name: 'Asha' });
await a.waitFor(() => a.room, 'room created');
const code = a.room.code;
assert(code.length === 4 && a.room.hostId === a.id, `room ${code} bana, Asha host hai`);

for (const x of [b, c]) x.send('JOIN_ROOM', { code, name: x.name });
await c.waitFor(() => c.room?.players.length === 3, '3 players');

a.send('START_GAME');
await a.waitFor(() => a.errors.includes('NEED_FULL_ROOM'), 'NEED_FULL_ROOM');
assert(true, '3 players ke saath start reject hua');

d.send('JOIN_ROOM', { code, name: 'Dev' });
await d.waitFor(() => d.room?.players.length === 4, '4 players');
b.send('START_GAME');
await b.waitFor(() => b.errors.includes('NOT_HOST'), 'NOT_HOST');
assert(true, 'non-host ka start reject hua');

a.send('START_GAME');
await Promise.all(all.map((x) => x.waitFor(() => x.game?.phase === 'ROUND_ACTIVE', 'round active')));
assert(true, 'game shuru, sabko ROUND_ACTIVE view mila');

// Secret leak check: kisi ko 3 se zyada roles nahi dikhne chahiye, aur apna role hona chahiye.
assert(
  all.every((x) => x.game.myRole && Object.keys(x.game.visibleRoles).length <= 3),
  'har player ko max Raja+Mantri+apna role dikhta hai (Sipahi/Chor hidden)',
);

for (let round = 1; round <= 4; round++) {
  const mantri = all.find((x) => x.game.myRole === 'MANTRI');
  const target = all.find((x) => x.game.myRole !== 'RAJA' && x !== mantri);
  const raja = all.find((x) => x.game.myRole === 'RAJA');
  raja.send('SUBMIT_GUESS', { guessedChorId: target.id });
  await raja.waitFor(() => raja.errors.includes('GAME_RULE'), 'non-mantri guess reject');
  raja.errors = [];
  mantri.send('SUBMIT_GUESS', { guessedChorId: target.id });
  await Promise.all(all.map((x) => x.waitFor(() => x.game?.phase === 'ROUND_RESULT' && x.game.history.length === round, `result ${round}`)));
  assert(Object.keys(a.game.visibleRoles).length === 4, `round ${round}: result me sab roles khule`);
  a.send('NEXT_ROUND');
  await Promise.all(
    all.map((x) =>
      x.waitFor(() => x.game?.phase === (round === 4 ? 'GAME_RESULT' : 'ROUND_ACTIVE'), `after round ${round}`),
    ),
  );
}
const total = Object.values(a.game.totals).reduce((s, n) => s + n, 0);
assert(a.game.phase === 'GAME_RESULT' && a.game.history.length === 4 && total > 0, `GAME_RESULT, total points = ${total}`);

// ---- Rematch ----
b.send('REMATCH');
await b.waitFor(() => b.errors.includes('NOT_HOST'), 'rematch NOT_HOST');
assert(true, 'non-host ka rematch reject hua');
a.send('REMATCH');
await Promise.all(all.map((x) => x.waitFor(() => x.room?.status === 'LOBBY' && x.game === null, 'back to lobby')));
assert(true, 'REMATCH: sab lobby me wapas, same room');
a.send('START_GAME');
await Promise.all(all.map((x) => x.waitFor(() => x.game?.phase === 'ROUND_ACTIVE' && x.game.history.length === 0, 'game 2')));
assert(all.every((x) => Object.values(x.game.totals).every((n) => n === 0)), 'naya game fresh 0 points se shuru');

// ---- Reconnect: Charu ka connection toot jaye, token se wapas aaye ----
const roleBefore = c.game.myRole;
const idBefore = c.id;
const tokenC = c.token;
c.ws.close();
await a.waitFor(() => a.room?.players.find((p) => p.id === idBefore)?.connected === false, 'shows disconnected');
assert(a.game !== null && a.room.players.length === 4, 'disconnect par player room me rehta hai (connected=false), game chalta hai');

const c2 = new Client('Charu', tokenC);
await c2.ready;
await c2.waitFor(() => c2.game?.phase === 'ROUND_ACTIVE', 'state restored');
assert(c2.id === idBefore && c2.game.myRole === roleBefore, 'reconnect: wahi player, wahi role wapas mila');
await a.waitFor(() => a.room?.players.every((p) => p.connected), 'all connected again');
assert(true, 'baaki players ko dobara connected=true dikha');

// Galat token = naya guest, koi room nahi
const stranger = new Client('Chor', 'not-a-real-token');
await stranger.ready;
assert(stranger.id !== idBefore && stranger.room === null, 'galat token se kisi ka session nahi milta');
stranger.ws.close();

// Purana token do baar (tab replace): naya socket purane ko replace kare
const c3 = new Client('Charu', tokenC);
await c3.ready;
await c3.waitFor(() => c3.game?.phase === 'ROUND_ACTIVE', 'c3 restored');
await new Promise((r) => setTimeout(r, 300));
assert(c3.id === idBefore, 'dusra tab bhi same player, purana socket replace hua');
assert(a.room.players.find((p) => p.id === idBefore).connected, 'replace ke baad bhi player connected dikhta hai');

// ---- Disconnect + VOTE (game chal raha hai): Dev gayab, baaki 3 vote karte hain ----
d.ws.close();
await a.waitFor(() => a.room?.players.find((p) => p.id === d.id)?.connected === false, 'd disconnected');
assert(a.game !== null && a.room.vote === null, 'grace ke dauran vote nahi, game waisa hi');
await a.waitFor(() => a.room?.vote != null, 'vote opened');
assert(
  a.room.vote.missingIds.includes(d.id) && a.room.vote.eligibleIds.length === 3,
  'grace ke baad vote khula: 3 voters, Dev gayab',
);
a.send('VOTE', { choice: 'CANCEL' });
await b.waitFor(() => b.room?.vote?.votes?.[a.id] === 'CANCEL', 'vote visible');
assert(b.room.vote !== null && b.game !== null, 'ek CANCEL vote se faisla nahi (majority chahiye)');
b.send('VOTE', { choice: 'CANCEL' });
await a.waitFor(() => a.room?.players.length === 3 && a.game === null && a.room.vote === null, 'vote cancelled game');
assert(true, 'majority CANCEL: Dev hata, game cancel, room lobby me');
c3.send('VOTE', { choice: 'WAIT' });
await c3.waitFor(() => c3.errors.includes('NO_VOTE'), 'no vote');
assert(true, 'vote khatam hone ke baad VOTE -> NO_VOTE');
const late = new Client('Dev', d.token);
await late.ready;
assert(late.id !== d.id && late.room === null, 'expire ke baad purana token kaam nahi karta');

// ---- Reactions (room me a, b, c3 hain) ----
a.send('REACTION', { emoji: '😂' });
await b.waitFor(() => b.reactions.length === 1, 'reaction reached b');
await a.waitFor(() => a.reactions.length === 1, 'reaction reached a');
assert(b.reactions[0].playerId === a.id, 'reaction room ke sabhi ko mila (bhejne wale ko bhi)');
a.send('REACTION', { emoji: '😂' });
await a.waitFor(() => a.errors.includes('RATE_LIMITED'), 'rate limited');
assert(true, 'jaldi-jaldi reaction par RATE_LIMITED');
b.send('REACTION', { emoji: 'DROP TABLE' });
await b.waitFor(() => b.errors.includes('BAD_REACTION'), 'bad reaction');
assert(true, 'allowed list ke bahar ka reaction reject');

// ---- Quick match: 4 naye players ----
const qs = ['Q1', 'Q2', 'Q3', 'Q4'].map((n) => new Client(n));
const queueSizes = qs.map((x) => x.queueSizes);
await Promise.all(qs.map((x) => x.ready));
qs[0].send('QUICK_MATCH', { name: 'Q1' });
qs[1].send('QUICK_MATCH', { name: 'Q2' });
await qs[1].waitFor(() => queueSizes[1].includes(2), 'queue size 2');
// Q1 aur Q2 alag WebSocket connections hain — Q2 ka update dekhne ka matlab ye nahi ki Q1 ka
// apna socket bhi already pahunch chuka hai (RMC-0025 me isi tarah ka race pehle bhi mil chuka
// hai), isliye Q1 ke apne socket ka bhi alag se wait zaroori hai.
await qs[0].waitFor(() => queueSizes[0].includes(2), 'queue size 2 (Q1 ke apne socket par bhi)');
assert(queueSizes[0].includes(2), 'queue me wait kar rahe sabko size update mila');
// Order check nahi (Q1/Q2 alag WebSocket connections hain — kaunsa message pehle server tak
// pahunchta hai ye real network timing par depend karta hai, exact order kabhi guaranteed nahi
// hota, khaaskar Docker jaisi virtualized network ke upar). Sirf ye check karna kaafi/sahi hai
// ki dono naam maujood hain (sirf count nahi) — server khud apne paas jis order me aaya wahi
// order rakhta hai (matchmaking.service.ts), yahi asal guarantee hai.
assert(
  new Set(qs[0].queueNames).size === 2 && ['Q1', 'Q2'].every((n) => qs[0].queueNames.includes(n)),
  'queue naam bhi bhejta hai (sirf count nahi)',
);
qs[0].send('QUICK_MATCH', { name: 'Q1' });
await qs[0].waitFor(() => qs[0].errors.includes('ALREADY_QUEUED'), 'already queued');
assert(true, 'do baar queue me jaana reject');
qs[1].send('CANCEL_QUICK_MATCH');
await qs[1].waitFor(() => queueSizes[1].at(-1) === null, 'cancelled');
await qs[0].waitFor(() => queueSizes[0].at(-1) === 1, 'size back to 1');
assert(true, 'cancel se queue se hata, baaki ko size 1 dikha');
for (const x of qs.slice(1)) x.send('QUICK_MATCH', { name: x.name });
await Promise.all(qs.map((x) => x.waitFor(() => x.game?.phase === 'ROUND_ACTIVE', 'matched game')));
assert(
  new Set(qs.map((x) => x.room.code)).size === 1 && qs[0].room.hostId === qs[0].id && qs.every((x) => queueSizes[qs.indexOf(x)].at(-1) === null),
  'QUICK MATCH: 4 players ka room bana, game turant shuru, queue khaali',
);

// ---- Bots: solo play, room fill, aur bot Mantri ka auto-guess ----
const solo = new Client('Solo');
await solo.ready;
solo.send('PLAY_WITH_BOTS', { name: 'Solo' });
await solo.waitFor(() => solo.game?.phase === 'ROUND_ACTIVE', 'solo vs bots started');
assert(solo.room.players.length === 4 && solo.room.players.filter((p) => p.isBot).length === 3, 'PLAY_WITH_BOTS: 3 bots ne room bhar diya');
assert(solo.room.players.every((p) => p.id === solo.id || p.isBot), 'baaki sab bots hain');
for (let round = 1; round <= 4; round++) {
  if (solo.game.canGuess) {
    const raja = Object.entries(solo.game.visibleRoles).find(([, r]) => r === 'RAJA')?.[0];
    const target = solo.game.players.find((p) => p.id !== raja && p.id !== solo.id);
    solo.send('SUBMIT_GUESS', { guessedChorId: target.id });
  }
  // Insaan Mantri ho ya bot Mantri ho, dono soorat me result kuch second me aa jana chahiye
  // (bot khud guess kar leta hai — koi sahi guess bhejne ki zaroorat nahi).
  await solo.waitFor(() => solo.game?.phase === 'ROUND_RESULT' && solo.game.history.length === round, `solo round ${round} result`);
  solo.send('NEXT_ROUND');
  await solo.waitFor(() => solo.game?.phase === (round === 4 ? 'GAME_RESULT' : 'ROUND_ACTIVE'), `solo after round ${round}`);
}
assert(true, 'bot Mantri ne khud guess kiya (bina insaan input ke round result aaya)');
solo.ws.close();

// Room create karke host bots se bhare (dusra tarika)
const host = new Client('Host');
await host.ready;
host.send('CREATE_ROOM', { name: 'Host' });
await host.waitFor(() => host.room, 'host room created');
host.send('ADD_BOT');
host.send('ADD_BOT');
host.send('ADD_BOT');
await host.waitFor(() => host.room?.players.length === 4, 'room bots se bhara');
const firstBot = host.room.players.find((p) => p.isBot).id;
host.send('REMOVE_BOT', { botId: firstBot });
await host.waitFor(() => host.room?.players.length === 3, 'ek bot hataya');
assert(!host.room.players.some((p) => p.id === firstBot), 'REMOVE_BOT se seat khaali hui');
host.send('ADD_BOT');
await host.waitFor(() => host.room?.players.length === 4, 'seat dobara bot se bhari');
host.send('START_GAME');
await host.waitFor(() => host.game?.phase === 'ROUND_ACTIVE', 'mixed room game started');
for (let round = 1; round <= 4; round++) {
  if (host.game.canGuess) {
    const raja = Object.entries(host.game.visibleRoles).find(([, r]) => r === 'RAJA')?.[0];
    const target = host.game.players.find((p) => p.id !== raja && p.id !== host.id);
    host.send('SUBMIT_GUESS', { guessedChorId: target.id });
  }
  await host.waitFor(() => host.game?.phase === 'ROUND_RESULT' && host.game.history.length === round, `mixed round ${round} result`);
  host.send('NEXT_ROUND');
  await host.waitFor(() => host.game?.phase === (round === 4 ? 'GAME_RESULT' : 'ROUND_ACTIVE'), `mixed after round ${round}`);
}
assert(true, 'host+bots ka mixed room bhi poora khela gaya');
host.ws.close();

// ---- Voice signaling: sirf relay (server SDP/ICE ke andar kabhi nahi dekhta) ----
const v1 = new Client('V1');
const v2 = new Client('V2');
const v3 = new Client('V3'); // alag room me — cross-room relay reject hona chahiye
await Promise.all([v1, v2, v3].map((x) => x.ready));
v1.send('CREATE_ROOM', { name: 'V1' });
await v1.waitFor(() => v1.room, 'v1 room created');
v2.send('JOIN_ROOM', { code: v1.room.code, name: 'V2' });
await v2.waitFor(() => v2.room?.players.length === 2, 'v2 joined v1 room');
v3.send('CREATE_ROOM', { name: 'V3' }); // apna alag room

const fakeOffer = { kind: 'offer', sdp: { type: 'offer', sdp: 'v=0 fake sdp for smoke test' } };
v1.send('VOICE_SIGNAL', { toPlayerId: v2.id, signal: fakeOffer });
await v2.waitFor(() => v2.voiceSignals.length === 1, 'v2 ko v1 ka signal mila');
assert(
  v2.voiceSignals[0].fromPlayerId === v1.id && JSON.stringify(v2.voiceSignals[0].signal) === JSON.stringify(fakeOffer),
  'signal jaisa bheja gaya waisa hi relay hua (server ne SDP nahi chheda)',
);

v3.send('VOICE_SIGNAL', { toPlayerId: v2.id, signal: fakeOffer }); // alag room se
await new Promise((r) => setTimeout(r, 300));
assert(v2.voiceSignals.length === 1, 'alag room ke player ka signal relay nahi hua (cross-room blocked)');

v1.send('VOICE_MUTE', { muted: false });
await v2.waitFor(() => v2.voiceMutes.length === 1, 'v2 ko v1 ka mute-state mila');
assert(
  v2.voiceMutes[0].playerId === v1.id && v2.voiceMutes[0].muted === false,
  'VOICE_MUTE room ke baaki logon ko broadcast hota hai',
);
[v1, v2, v3].forEach((x) => x.ws.close());

// ---- Vote: WAIT jeeta -> grace dobara -> naya vote; gayab wapas aaya -> vote khatam; time out -> WAIT ----
const awayRole = qs[3].game.myRole;
const awayId = qs[3].id;
qs[3].ws.close();
await qs[0].waitFor(() => qs[0].room?.vote != null, 'q vote opened');
qs[0].send('VOTE', { choice: 'WAIT' });
qs[1].send('VOTE', { choice: 'WAIT' });
await qs[0].waitFor(() => qs[0].room?.vote === null, 'wait won');
assert(qs[0].room.players.length === 4 && qs[0].game?.phase === 'ROUND_ACTIVE', 'majority WAIT: koi nahi hata, game chalta hai');
await qs[0].waitFor(() => qs[0].room?.vote != null, 'vote reopened');
assert(true, 'WAIT ke baad grace dobara chala aur naya vote khula');

const back = new Client('Q4', qs[3].token);
await back.ready;
await back.waitFor(() => back.game?.phase === 'ROUND_ACTIVE', 'q4 restored');
await qs[0].waitFor(() => qs[0].room?.vote === null && qs[0].room.players.every((p) => p.connected), 'vote voided');
assert(back.id === awayId && back.game.myRole === awayRole, 'gayab player vote ke beech wapas aaya: vote khatam, wahi role');
qs[3] = back;

back.ws.close();
await qs[0].waitFor(() => qs[0].room?.vote != null, 'vote 3 opened');
await qs[0].waitFor(() => qs[0].room?.vote === null, 'vote timed out');
assert(qs[0].room.players.length === 4, 'kisi ne vote nahi kiya: time khatam => WAIT, koi nahi hata');
const back2 = new Client('Q4', back.token);
await back2.ready;
await back2.waitFor(() => back2.game?.phase === 'ROUND_ACTIVE', 'q4 restored again');
assert(back2.id === awayId, 'time-out ke baad bhi player wapas aa sakta hai');
qs[3] = back2;

// ---- Accounts: register, login, WS auth, game -> reward, /me ----
const HTTP = process.env.HTTP_URL ?? 'http://localhost:3000';
const call = (method, path, body, token) =>
  fetch(HTTP + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
const suffix = Date.now().toString(36);
const accs = [];
for (const n of ['p1', 'p2', 'p3', 'p4']) {
  const r = await call('POST', '/auth/register', { username: `${n}_${suffix}`, password: 'password123', displayName: n });
  assert(r.status === 201, `register ${n} -> 201`);
  accs.push(await r.json());
}
assert(!JSON.stringify(accs).includes('password123'), 'response me password/hash nahi');
assert((await call('POST', '/auth/register', { username: `p1_${suffix}`, password: 'password123' })).status === 409, 'duplicate username -> 409');
assert((await call('POST', '/auth/register', { username: 'x', password: 'password123' })).status === 400, 'chhota username -> 400');
const bad = await call('POST', '/auth/login', { username: `p1_${suffix}`, password: 'wrong-password' });
assert(bad.status === 401 && (await bad.json()).code === 'BAD_CREDENTIALS', 'galat password -> 401 BAD_CREDENTIALS');
const good = await call('POST', '/auth/login', { username: `P1_${suffix}`, password: 'password123' });
assert(good.status === 200, 'login sahi password -> 200');
assert((await call('GET', '/me')).status === 401, 'bina token /me -> 401');
assert((await call('GET', '/me', null, 'garbage')).status === 401, 'galat token /me -> 401');

const pl = accs.map((acc, i) => Object.assign(new Client(`p${i + 1}`), { acc }));
await Promise.all(pl.map((x) => x.ready));
pl.forEach((x) => x.send('AUTHENTICATE', { authToken: x.acc.authToken }));
await Promise.all(pl.map((x) => x.waitFor(() => x.authState !== undefined, 'auth state')));
assert(pl.every((x, i) => x.authState === `p${i + 1}`), 'WebSocket AUTHENTICATE se account juda');

pl.forEach((x) => x.send('QUICK_MATCH', { name: x.name }));
await Promise.all(pl.map((x) => x.waitFor(() => x.game?.phase === 'ROUND_ACTIVE', 'account game')));
for (let round = 1; round <= 4; round++) {
  const mantri = pl.find((x) => x.game.myRole === 'MANTRI');
  const target = pl.find((x) => x.game.myRole !== 'RAJA' && x !== mantri);
  mantri.send('SUBMIT_GUESS', { guessedChorId: target.id });
  await Promise.all(pl.map((x) => x.waitFor(() => x.game?.phase === 'ROUND_RESULT' && x.game.history.length === round, 'acct result')));
  const host = pl.find((x) => x.room.hostId === x.id);
  host.send('NEXT_ROUND');
  await Promise.all(pl.map((x) => x.waitFor(() => x.game?.phase === (round === 4 ? 'GAME_RESULT' : 'ROUND_ACTIVE'), 'acct next')));
}
await Promise.all(pl.map((x) => x.waitFor(() => x.reward !== undefined, 'reward')));
assert(pl.every((x) => x.reward.xpGained >= 50 && x.reward.coinsGained >= 10), 'server ne sabko XP + coins diye (GAME_REWARD)');
assert(pl.every((x) => x.reward.newAchievements.includes('FIRST_GAME')), 'FIRST_GAME achievement mila');
const winners = pl.filter((x) => x.game.winnerIds.includes(x.id));
assert(winners.every((x) => x.reward.coinsGained === 30 && x.reward.newAchievements.includes('FIRST_WIN')), 'winner ko extra coins + FIRST_WIN');
for (const x of pl) {
  const me = await (await call('GET', '/me', null, x.acc.authToken)).json();
  assert(me.gamesPlayed === 1 && me.history.length === 1 && me.xp === x.reward.xpGained, `${x.name}: /me me history + XP saved`);
}

// ---- Shop: characters khareedna aur pehnna ----
const shop = (path, characterId, token) => call('POST', `/shop/${path}`, { characterId }, token);
assert((await shop('purchase', 'CAT')).status === 401, 'bina login shop -> 401');
const buyer = pl[0];
const coinsBefore = (await (await call('GET', '/me', null, buyer.acc.authToken)).json()).coins;
assert(coinsBefore >= 10, `game ke baad ${coinsBefore} coins hain`);
assert((await shop('purchase', 'NOPE', buyer.acc.authToken)).status === 404, 'anjaan character -> 404');
assert((await shop('purchase', 'DRAGON', buyer.acc.authToken)).status === 403, 'level kam -> 403 LEVEL_TOO_LOW');
assert((await shop('purchase', 'LION', buyer.acc.authToken)).status === (coinsBefore >= 100 ? 200 : 402), 'LION (100 coins): coins kam to 402');
assert((await shop('equip', 'CAT', buyer.acc.authToken)).status === 403, 'khareede bina equip -> 403 NOT_OWNED');
const bought = await shop('purchase', 'CAT', buyer.acc.authToken);
const boughtProfile = await bought.json();
assert(bought.status === 200 && boughtProfile.ownedCharacters.includes('CAT'), 'CAT kharida (10 coins)');
assert(boughtProfile.coins === coinsBefore - 10 - (coinsBefore >= 100 ? 100 : 0), 'coins server ne ghataye');
assert((await shop('purchase', 'CAT', buyer.acc.authToken)).status === 409, 'dobara CAT -> 409 ALREADY_OWNED');
const observer = pl[1];
const equipped = await shop('equip', 'CAT', buyer.acc.authToken);
assert(equipped.status === 200 && (await equipped.json()).equippedCharacter === 'CAT', 'CAT pehna');
await observer.waitFor(() => observer.room?.players.find((p) => p.id === buyer.id)?.character === 'CAT', 'avatar live');
assert(true, 'room me doosre player ko turant naya avatar (CAT) dikha');
assert(observer.room.players.filter((p) => p.character === 'CAT').length === 1, 'baaki players ka avatar DEFAULT hi hai');

// Guest ko reward nahi milta
const guest = new Client('Guest');
await guest.ready;
assert(guest.reward === undefined, 'guest ko koi reward nahi');
guest.ws.close();
pl.forEach((x) => x.ws.close());

// ---- Friends: request, accept, presence, invite ----
const reg = async (prefix) => {
  const r = await call('POST', '/auth/register', { username: `${prefix}_${suffix}`, password: 'password123', displayName: prefix.toUpperCase() });
  return { ...(await r.json()), username: `${prefix}_${suffix}` };
};
const fa = await reg('fa');
const fb = await reg('fb');
const authed = async (acc) => {
  const c = new Client(acc.profile.displayName);
  await c.ready;
  c.send('AUTHENTICATE', { authToken: acc.authToken });
  await c.waitFor(() => c.authState !== undefined, 'friend auth');
  return c;
};
const ca = await authed(fa);
const cb = await authed(fb);

assert((await call('GET', '/friends')).status === 401, 'bina login /friends -> 401');
assert((await call('POST', '/friends/requests', { username: 'nobody_zzz' }, fa.authToken)).status === 404, 'anjaan username -> 404');
assert((await call('POST', '/friends/requests', { username: fa.username }, fa.authToken)).status === 400, 'khud ko request -> 400');

const before = cb.friendsChanged;
const sent = await call('POST', '/friends/requests', { username: fb.username }, fa.authToken);
assert(sent.status === 200 && (await sent.json()).result === 'REQUESTED', 'friend request bheji');
assert((await call('POST', '/friends/requests', { username: fb.username }, fa.authToken)).status === 409, 'dobara request -> 409');
await cb.waitFor(() => cb.friendsChanged > before, 'live update');
assert(true, 'samne wale ko FRIENDS_CHANGED (live) mila');
let ov = await (await call('GET', '/friends', null, fb.authToken)).json();
assert(ov.incoming.length === 1 && ov.incoming[0].username === fa.username, 'B ki incoming me A dikhta hai');
assert((await call('POST', `/friends/requests/${fb.profile.accountId}/accept`, null, fa.authToken)).status === 404, 'apni bheji request khud accept nahi ho sakti');

const beforeA = ca.friendsChanged;
assert((await call('POST', `/friends/requests/${fa.profile.accountId}/accept`, null, fb.authToken)).status === 204, 'B ne accept kiya');
await ca.waitFor(() => ca.friendsChanged > beforeA, 'accept update');
ov = await (await call('GET', '/friends', null, fa.authToken)).json();
assert(ov.friends.length === 1 && ov.friends[0].username === fb.username && ov.friends[0].online === true, 'A ki list me B dost hai aur online dikhta hai');

// Invite: A room banata hai aur B ko bulata hai
ca.send('INVITE_FRIEND', { accountId: fb.profile.accountId });
await ca.waitFor(() => ca.errors.includes('NOT_IN_ROOM'), 'invite without room');
assert(true, 'room ke bina invite -> NOT_IN_ROOM');
ca.send('CREATE_ROOM', { name: 'FA' });
await ca.waitFor(() => ca.room, 'fa room');
await new Promise((r) => setTimeout(r, 2100)); // invite rate limit window
ca.send('INVITE_FRIEND', { accountId: fb.profile.accountId });
await cb.waitFor(() => cb.invites.length === 1, 'invite received');
assert(cb.invites[0].roomCode === ca.room.code && cb.invites[0].fromName === 'FA', 'B ko invite mila (room code + A ka naam)');
ca.send('INVITE_FRIEND', { accountId: fb.profile.accountId });
await ca.waitFor(() => ca.errors.includes('RATE_LIMITED'), 'invite rate limit');
assert(true, 'jaldi dobara invite -> RATE_LIMITED');
cb.send('JOIN_ROOM', { code: cb.invites[0].roomCode, name: 'FB' });
await ca.waitFor(() => ca.room?.players.length === 2, 'fb joined');
assert(true, 'B invite se room me aa gaya');

await new Promise((r) => setTimeout(r, 2100));
ca.send('INVITE_FRIEND', { accountId: fb.profile.accountId });
await ca.waitFor(() => ca.errors.includes('FRIEND_BUSY'), 'friend busy');
assert(true, 'dost pehle se room me ho -> FRIEND_BUSY');

// Non-friend aur guest
const fc = await reg('fc');
const outsider = await authed(fc);
await new Promise((r) => setTimeout(r, 2100));
ca.send('INVITE_FRIEND', { accountId: fc.profile.accountId });
await ca.waitFor(() => ca.errors.includes('NOT_FRIENDS'), 'not friends');
assert(true, 'dost nahi hai -> NOT_FRIENDS');
const guestInviter = new Client('G');
await guestInviter.ready;
guestInviter.send('CREATE_ROOM', { name: 'G' });
await guestInviter.waitFor(() => guestInviter.room, 'guest room');
guestInviter.send('INVITE_FRIEND', { accountId: fb.profile.accountId });
await guestInviter.waitFor(() => guestInviter.errors.includes('NOT_LOGGED_IN'), 'guest invite');
assert(true, 'guest invite nahi bhej sakta -> NOT_LOGGED_IN');

// Presence: B ka connection band => A ko live update, list me offline, invite -> FRIEND_OFFLINE
cb.send('LEAVE_ROOM');
await new Promise((r) => setTimeout(r, 300));
const beforeOff = ca.friendsChanged;
cb.ws.close();
await ca.waitFor(() => ca.friendsChanged > beforeOff, 'presence update');
ov = await (await call('GET', '/friends', null, fa.authToken)).json();
assert(ov.friends[0].online === false, 'B offline hua: A ko live update mila aur list me offline');
await new Promise((r) => setTimeout(r, 2100));
ca.send('INVITE_FRIEND', { accountId: fb.profile.accountId });
await ca.waitFor(() => ca.errors.includes('FRIEND_OFFLINE'), 'friend offline');
assert(true, 'offline dost ko invite -> FRIEND_OFFLINE');

// Unfriend
assert((await call('DELETE', `/friends/${fb.profile.accountId}`, null, fa.authToken)).status === 204, 'unfriend -> 204');
ov = await (await call('GET', '/friends', null, fb.authToken)).json();
assert(ov.friends.length === 0, 'dono ki list se dosti hat gayi');
[ca, outsider, guestInviter].forEach((x) => x.ws.close());

// ---- Abuse protection ----
// Payload size server ke MAX_PAYLOAD_BYTES (voice SDP ke liye 16KB tak) se bada hona chahiye,
// warna server ise valid maan kar process kar leta hai aur connection kabhi band nahi hota.
const closed = (client) => new Promise((resolve) => client.ws.once('close', (code) => resolve(code)));
const big = new Client('Big');
await big.ready;
const bigClosed = closed(big);
big.ws.send(JSON.stringify({ event: 'CREATE_ROOM', data: { name: 'x'.repeat(20_000) } }));
assert((await bigClosed) === 1009, 'bahut bada message (20KB) par connection band (code 1009)');

const spammer = new Client('Spam');
await spammer.ready;
const spamClosed = closed(spammer);
for (let i = 0; i < 100; i++) spammer.send('LEAVE_ROOM');
await spamClosed;
assert(true, 'ek second me 100 messages bhejne par connection band');

[a, b, c3, late, ...qs].forEach((x) => x.ws.close());
console.log('SMOKE TEST PASSED');

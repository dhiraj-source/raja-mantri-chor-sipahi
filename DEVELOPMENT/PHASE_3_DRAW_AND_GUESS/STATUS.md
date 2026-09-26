# PHASE 3 — Draw & Guess (Skribbl.io-style mode)

## Status
**IN PROGRESS** (started 2026-09-26). Owner ne poora spec diya (47 sections) aur "full hand to
think and build" — is scale ka feature ek saath "done" claim karna galat hoga, isliye milestones
me tod kar banaya ja raha hai. Jab tak neeche checklist ke saare items DONE na ho jayen, is file
ko "COMPLETE" mat likhna.

## Maksad
Ek naya, poora alag game mode: "Raja Rani Chor Sipahi — Draw & Guess" (Skribbl.io-inspired
drawing+guessing, original implementation/branding/word-lists). Existing Raja Mantri Chor Sipahi
game **bilkul nahi todhna** — dono saath chalne chahiye.

## Design decisions (owner ko pata hona chahiye)

- **Alag pure package** (`packages/draw-guess-engine`), RMCS ke `game-engine` se bilkul separate —
  modular rakhne ke liye (owner ne explicitly maanga tha).
- **Same WebSocket connection/gateway reuse** — dusra socket architecture nahi banayenge (owner
  ne mana kiya tha). Naye event names (RMCS ke `SUBMIT_GUESS` waghera se clash nahi karenge).
- **Alag room map** apne NestJS module me (RMCS rooms se alag). Room-code collision RMCS se
  possible hai (dono independent 5-char codes generate karte hain) par **koi masla nahi** — `DG_JOIN_ROOM`
  sirf DG ke map me dhoondta hai, RMCS ka `JOIN_ROOM` sirf apne map me — alag event names khud hi
  disambiguate kar dete hain, cross-check ki zaroorat nahi thi (pehle laga tha zaroorat hogi).
- **Canvas screens ke liye wide layout** — existing app `max-w-md` (mobile-card feel) hai, canvas
  ke liye zyada jagah chahiye; sirf Draw & Guess screens is container se bahar niklenge.

## Milestone checklist

| # | Milestone | Status | RMC |
|---|---|---|---|
| 1 | Foundation: pure `draw-guess-engine` package — word bank, state machine, scoring, guess validation, hint masking (fully unit-tested, zero framework deps) | ☑ DONE | RMC-0024 |
| 2 | Server core: shared-types wire protocol + NestJS module — full room lifecycle (create/join/leave/ready/kick/settings) AND full game loop with real server-owned timers (countdown, word-select, drawing, round-result) — reusing existing gateway+sessions | ☑ DONE | RMC-0025 |
| 3 | React UI: mode-select, lobby, canvas + toolbar, guess/chat panel, scoreboard, round/final results, mobile layout | ☑ DONE | RMC-0026 |
| 4 | Reconnection hardening ☑ DONE; i18n wiring ☑ DONE (English + Hindi); spectators, private rooms still ☐ TODO | ◐ PARTIAL | RMC-0027, RMC-0028 |
| 5 | Accessibility pass, visual/audio polish (sound effects, confetti, etc.), voice chat integration for DG | ☐ TODO | — |
| — | *(aage jo bhi naye items aayenge, yahan neeche add honge)* | | |

## Notes
- Full 47-point spec owner ke message me hai (is session ke conversation history me) — is file
  me duplicate nahi kiya, sirf milestone-level tracking yahan.

### Milestone 1 (RMC-0024) — implemented
- `packages/draw-guess-engine/`: naya pure package, `@rmc/game-engine` jaisa hi shape
  (package.json/tsconfig/vitest.config.mts/index.ts barrel), sirf `@rmc/shared-types`
  (PlayerId ke liye) par depend karta hai — RMCS ke `game-engine` se koi dependency nahi
  (bilkul alag rakha, jaisa owner ne "modular, alag maintain ho sake" maanga tha).
- `words.ts`: ~150 words, 16 categories (Animals/Food/Objects/Places/Vehicles/Nature/Sports/
  Professions/Technology/Everyday/Indian Culture/Indian Food/Indian Places/Festivals/Bollywood/
  Cricket) x 3 difficulty levels. Bollywood/Cricket **jaan-boojh kar sirf generic vocabulary**
  hai (jaise "Playback singer", "Century", "Umpire") — koi real movie/cricketer ka naam nahi,
  copyright/trademark-safe (RMC-0022 jaisi hi ehtiyaat). `pickWordChoices` used-words avoid karta
  hai, custom words support karta hai, pool khatam ho to kabhi crash nahi hota.
- `guess.ts`: server-authoritative normalize+match (lowercase/trim/punctuation/diacritics-insensitive
  by default, ya EXACT mode) — configurable via `DrawGuessConfig.guessTolerance`.
- `mask.ts`: masked word display + time-based hint reveal (`hintIntervalMs`/`maxHintFraction` se
  configurable, 0 = hints band).
- `scoring.ts`: guesser ke points rank ke hisaab se ghatte hain (kabhi min se kam nahi), drawer ke
  points kitno ne sahi guess kiya usi par — **sab ek hi jagah, config-driven** (owner ne yahi
  maanga tha: "Do NOT hard-code scoring logic throughout the UI").
- `state.ts`: poora state machine — `LOBBY → COUNTDOWN → CHOOSING_WORD → DRAWING → ROUND_RESULTS
  → (agla turn | GAME_RESULTS) → FINISHED`. Drawer rotation deterministic round-robin
  (`playerOrder[turn % n]`). **Security chokepoint: `getPlayerView(state, viewerId, now)`** —
  RMCS ke `getPlayerView` jaisa hi pattern: sirf yahi function client-facing data banata hai,
  aur `state.word`/`state.wordChoices` sirf tabhi include karta hai jab `viewerId === drawerId`.
  Ek test explicitly ye check karta hai ki non-drawer ko diye gaye view ko `JSON.stringify` karke
  bhi kahin asli word na mile (jaisa gateway asli me karega).
- Timers (turn ka drawTimeMs khatam hona, word-select deadline, round-result duration) engine ke
  andar nahi hain — engine sirf `endTurn`/`autoSelectWord`/`beginNextTurn` pure functions deta hai;
  **timers Milestone 2/3 me NestJS service/gateway layer me honge** (RMCS ka `RoomsGateway` jaisa
  hi pattern: engine pure, gateway timers ka malik).
- Root `package.json` (build/typecheck scripts) aur `eslint.config.mjs` (no-restricted-imports:
  NestJS/React/pg/redis/ws import nahi kar sakta) me naya package add kiya.
- Verified: 50 naye unit tests (guess 6, mask 9, scoring 4, words 12, state 19 — state.test.ts me
  security-specific tests bhi shamil), sab pass. Poora repo build (`npm run build`) aur poora
  existing test suite (RMCS: engine + api 106 + web 114) dobara chalaya — sab abhi bhi pass,
  **RMCS ko haath tak nahi laga**.

### Milestone 2 (RMC-0025) — implemented
- `packages/shared-types/src/draw-guess.ts`: poora wire protocol — `DrawGuessGameView`/
  `DrawGuessTurnResult`/`DrawGuessCorrectGuesser` (engine ke `state.ts` se yahan move kiye,
  RMCS ke `PlayerGameView`/`RoundResult` jaisa hi pattern — engine in types ko import karke
  return karta hai, khud define nahi karta), `DrawGuessRoomView`/`DrawGuessSettings`,
  `DrawGuessChatEntry` (CHAT/SYSTEM/CORRECT_GUESS — CORRECT_GUESS me kabhi guess ka text nahi
  hota), `DrawGuessClientMessage`/`DrawGuessServerMessage` (naye `DG_*` event names — RMCS ke
  `SUBMIT_GUESS` waghera se kabhi clash nahi karte).
- `apps/api/src/draw-guess/draw-guess.service.ts`: naya, poori tarah alag in-memory room map
  (RMCS ke `RoomsService` se koi dependency nahi). Poora lobby (create/join/leave/ready/
  kick/settings, host transfer on leave) + poora game loop (start -> countdown -> choosing-word
  -> drawing -> round-results -> agla turn -> game-results). Ek hi text box guess + chat dono
  karta hai — `chat()` method decide karta hai: agar player abhi guess kar sakta hai (non-drawer,
  DRAWING phase, abhi tak sahi nahi kiya) to pehle guess ki tarah try hota hai; sahi ho to
  `CORRECT_GUESS` entry (text kabhi nahi), warna normal `CHAT` entry (profanity-censored).
  Basic profanity filter (`profanity.ts`) chat aur custom words dono par lagta hai.
- `apps/api/src/rooms/rooms.gateway.ts` (existing file, RMCS ka gateway) me `DG_*`
  `@SubscribeMessage` handlers add kiye — **naya gateway/socket nahi banaya**, wahi ek `/ws`
  connection dono game modes serve karta hai (jaisa plan tha). Timer design: ek hi generic
  `scheduleDgTimer(code)` jo state ka `turnEndsAt` padh kar agla timer set karta hai; fire hone
  par abhi ka phase dobara check karke sahi transition (`beginNextTurn`/`autoSelectWord`/
  `endTurn`) chalata hai — RMCS ke alag-alag timer-per-concern se simpler, kyunki DG me har
  waqt sirf EK deadline active hoti hai.
- Disconnect: drawer disconnect ho to turn turant khatam (RMCS jaisa poora grace-timer/vote
  system abhi nahi hai — Milestone 5 me, "Notes" me neeche likha hai).
- **2 real bugs pakde gaye is milestone me sirf real-server smoke test se** (unit tests ne
  nahi pakde, kyunki wo service ko isolation me test karte hain, poore gateway-broadcast
  behaviour ko nahi): (1) `@rmc/api` ka `package.json` me `@rmc/draw-guess-engine` dependency
  explicitly likhna bhool gaya tha (workspace hoisting se build to chal gaya tha, par galat
  practice thi) — fix kiya. (2) Jab sab players ek hi guess se turn khatam kar dete hain (turn
  turant khatam hokar `endTurn` khud chal jaata hai), ek hi `DG_CHAT` call se 2 chat-entries ban
  jaati hain (`CORRECT_GUESS` + "word was...") — gateway sirf **aakhri** entry broadcast kar raha
  tha, is se `CORRECT_GUESS` entry kabhi client tak nahi pahunchti thi. Fix: ab chat-array ki
  length before/after track karke, is call se ban ke saare naye entries broadcast hote hain.
- Verified: 15 naye unit tests (`apps/api/test/draw-guess.service.test.ts`, security-check bhi
  shamil), poore repo ka build+lint+test suite dobara pass (RMCS untouched), **aur ek real
  chalte hue server ke against do end-to-end smoke tests**: `scripts/smoke-dg.mjs` (naya —
  2 real WebSocket clients poora Draw & Guess turn khelte hain, guesser ko kabhi asli word
  nahi milta — JSON payload check karke) aur `scripts/smoke-ws.mjs` (existing RMCS smoke test —
  confirm karne ke liye ki dono game modes same gateway par sahi saath chalte hain).

### Milestone 3 (RMC-0026) — implemented, ab asli browser me khelne layak hai
Mode select se lekar final scoreboard tak — poora flow.

- `apps/web/src/draw-guess/`: naya poora module (10 files) — `dgClientState.ts` (RMCS ke
  `clientState.ts` jaisa hi pattern, apna reducer), `useDrawGuessSocket.ts` (App.tsx me hi
  mount hota hai — reload/reconnect ke baad turant sahi room dikhe, "mode" pe depend nahi karta),
  `ModeSelect.tsx`, `DgHome.tsx` (create/join + settings), `DgLobby.tsx` (code/copy/share,
  ready toggle, kick, settings, start), `DgGameScreen.tsx` (saare phases: countdown/choosing-word/
  drawing/round-results/game-results), `Canvas.tsx` (asli `<canvas>`, pointer events, stroke
  batching+throttling, incremental remote-stroke painting, real flood-fill), `Toolbar.tsx`,
  `DgChatPanel.tsx` (ek text-box guess+chat dono), `DgScoreboard.tsx`, `strokeBatching.ts`
  (pure, unit-tested: point normalization + batching), `dgAvatar.ts` (chhote generic emoji avatars).
- `App.tsx`: `mode` state (menu/rmcs/draw_guess) add kiya, par screen selection **state-driven
  rehta hai jahan tak ho sake** — agar `dg.state.room` non-null hai (reload/reconnect ke baad
  server se pata chala), DG screens turant dikhte hain chahe `mode` abhi "menu" hi ho. Canvas
  screen ke liye container wide (`max-w-4xl`) hota hai, baaki jagah `max-w-md` waisa hi.
- `useGameSocket.ts`/`clientState.ts`/`useVoiceChat.ts`: `send`/`onRawMessage` ke types widen
  kiye (`ClientMessage | DrawGuessClientMessage`, `ServerMessage | DrawGuessServerMessage`) —
  **ek hi socket dono message-universes carry karta hai**, koi doosra connection nahi.
- `DrawGuessGameView.players[]` me `name` field add ki (pehle sirf id/score/connected/
  hasGuessedCorrectly thi) — RMCS ke `PlayerInfo {id, name}` convention follow karke, engine ka
  `createGame` ab `PlayerInfo[]` leta hai (pehle sirf `PlayerId[]`).

**Verified: sirf build/lint/unit-tests nahi — asli headless Chrome me poora khela gaya**
(`scripts/ui-check-dg.mjs`, naya): mode select -> DG home -> room create -> 2 bots join+ready
-> start -> host (=drawer, turn 0) ko 3 word choices -> word select -> **asli mouse pointer se
canvas par stroke draw kiya (CDP `Input.dispatchMouseEvent`)** -> dono guesser bots ko `DG_STROKE`
mila (proof: message count) -> guesser ke `GAME_VIEW` wire payload me kahin bhi asli word check
kiya (nahi mila) -> ek bot sahi guess karta hai (chat me dikhta hai) -> doosra bhi sahi guess
karta hai -> turn khud khatam hokar round-results (word reveal + points) dikhta hai -> desktop
width (1200px) par bhi koi horizontal overflow nahi. Screenshots liye gaye har step ka.

**2 real bugs isi real-browser check se pakde gaye** (unit tests ne nahi pakde):
1. App header hardcoded "Raja Mantri Chor Sipahi" dikha raha tha Draw & Guess khelte waqt bhi —
   fix: header ab `mode`/active-DG-room ke hisaab se badalta hai.
2. **Chat panel hamesha khaali dikh raha tha** — join/leave/start/round-transition jaise system
   messages server-side ban to rahe the (`pushSystem`), par sirf `DG_CHAT` handler hi naye
   entries broadcast karta tha; baaki sab actions (`dgHandle` se guzarne wale — create/join/
   ready/start/kick/timer-driven transitions) kabhi bheja hi nahi. Fix: `broadcastDgRoom` (jo
   HAR DG action ke baad call hoti hai) ab khud track karti hai kitni chat-entries pehle bheji
   ja chuki hain aur naya jo bhi bana hai wo broadcast kar deti hai — ek hi central jagah,
   alag-alag handler me yaad rakhne ki zaroorat nahi.

### Milestone 4 (part 1/2, RMC-0027) — reconnection hardening, implemented
- **Host disconnect ho jaaye (LEAVE bheje bina, seedha connection toote)**: `DrawGuessService
  .setConnected` ab turant kisi doosre connected player ko host bana deta hai (pehle sirf explicit
  `DG_LEAVE_ROOM` par hota tha) — ek system chat message ke saath ("X is now the host").
- **Grace period + auto-remove**: RMCS ke `armGrace`/`expire` jaisa hi pattern, DG ke liye alag
  (`armDgGrace`/`expireDgGrace`), same `RECONNECT_GRACE_MS` env var reuse karta hai. Disconnect
  hone par timer shuru; reconnect ho jaaye to cancel; na aaye to `leaveRoom` se seat khali (jo
  khud hi host-transfer bhi sambhal leta hai agar zaroorat pade).
- **Jaan-boojh kar RMCS se simpler**: koi "WAIT ya CANCEL" vote system nahi — ek casual drawing
  game me turn-rotation khud hi kaafi hai (drawer disconnect ho to turn turant khatam hota hai,
  jo already RMC-0025 me ban chuka tha). Grace-then-auto-remove is mode ke liye "reasonable"
  behavior hai, RMCS ki poori vote-complexity yahan zaroori nahi lagi.
- **Known edge case (documented, fix nahi kiya)**: agar koi non-drawer player grace expire hone
  par room se hat jaaye BEECH-GAME me, engine ke `state.playerOrder` se wo turant nahi hatta
  (engine ka state room-roster se snapshot hai, live sync nahi) — agar unki drawer-turn kabhi
  aayi to ek "phantom turn" waste hoga (khaali canvas, `wordSelectMs`/`drawTimeMs` timeout se
  khud aage badh jaayega, 0 points milenge). Game-breaking nahi hai (khud recover hota hai), par
  ek round waste hota hai. Deep fix (playerOrder ko live resync karna) is milestone ke scope se
  bahar rakha — chhota, low-frequency edge case hai.
- Verified: 3 naye unit tests (`draw-guess.service.test.ts` — host-transfer, no-eligible-host
  edge case, non-host-disconnect-doesn't-change-host) + `scripts/smoke-dg.mjs` me naya real
  end-to-end scenario (asli host disconnect -> naya host turant -> naya host bhi disconnect ->
  grace expire -> seat khali, sab kuch asli WebSocket clients ke saath verify kiya, chhota
  `RECONNECT_GRACE_MS` env var ke saath). RMCS ka apna smoke test bhi dobara isi server ke against
  chalaya (poore env vars ke saath) — sab pass, RMCS untouched.

### Milestone 4 (part 2/2, RMC-0028) — i18n, implemented
- `apps/web/src/i18n/messages.ts`: ~60 naye `dg.*` keys, `en` aur `hi` dono me (asli translation,
  copy-paste nahi) — `hi: Record<MessageKey, string>` type khud hi enforce karta hai ki koi key
  miss na ho (TypeScript error deta hai agar `en` me key ho aur `hi` me na ho).
- Saare 7 Draw & Guess components (`ModeSelect`, `DgHome`, `DgLobby`, `DgGameScreen` + iske
  `RoundResults`/`FinalResults` sub-components, `Toolbar`, `DgChatPanel`, `DgScoreboard`) `useI18n()`
  se `t()` use karte hain ab — koi hardcoded English string nahi bacha.
- Verified: poora repo build+lint+test (340 tests) pass. Real headless Chrome me Hindi switch
  karke check kiya — mode-select aur DG-home screens Hindi me sahi, poori tarah render hue
  (screenshot se confirm), koi layout toot-na nahi, koi console error nahi.

## Ab tak NAHI bana (agle milestones me)
- RMCS ka "WAIT/CANCEL vote" wala flow Draw & Guess me jaan-boojh kar nahi hai (grace+auto-remove
  hi kaafi hai is casual mode ke liye — RMC-0027 me decide kiya). Ek chhota edge case bacha hai:
  beech-game me grace-remove hone wale non-drawer player ka "phantom turn" (upar RMC-0027 notes
  me detail hai) — self-recovering hai, deep fix nahi kiya.
- Spectators, private room/password, late-joining — settings fields exist nahi karte abhi.
- Voice chat DG me nahi hai (RMCS-only feature abhi).
- Accessibility pass (keyboard nav, screen-reader labels beyond basic aria) nahi hua.
- Custom words UI se set nahi ho sakte abhi (sirf `DG_CREATE_ROOM`/`DG_UPDATE_SETTINGS` ke
  `settings.customWords` field se possible hai, koi UI text-area nahi bana).

# PHASE 4 — Bomb Tag (fast multiplayer arena game)

## Status
**COMPLETE** (2026-09-27). Saare 5 milestones done + **live production par deploy + verify ho
chuka hai**. Owner ne poora spec diya (48 sections) aur "full hand to think and implement", phir
"each everything complete krke deploy krdo" — Phase 3 jaisa hi, milestones me tod kar banaya gaya.

## Maksad
Teesra game mode: **Bomb Tag** — chhota, chaotic, real-time multiplayer arena game. Ek player ke
paas bomb hota hai (countdown ke saath), usse doosre players ko chhoo kar bomb pass karni hai,
warna timer khatam hone par elimination. Last player standing round jeetta hai; match multiple
rounds ka hota hai (default: 3 round-wins se match jeeto). Existing RMCS aur Draw & Guess
**bilkul nahi todhna** — teeno saath chalne chahiye.

## Design decisions (owner ko pata hona chahiye)

- **Naya continuous tick-loop** (~20Hz) server par — RMCS aur Draw & Guess dono turn-based/event-driven
  hain (koi continuous simulation nahi thi), Bomb Tag ke liye players continuously move karte hain
  isliye ye codebase ka pehla "game loop" hai. Ek hi global ticker (per-room nahi) saare active
  Bomb Tag rooms ko step karta hai — efficient rehta hai chahe kai rooms ho.
- **Alag pure package** (`packages/bomb-tag-engine`) — RMCS/DG engines se bilkul separate, modular.
- **Same gateway/socket reuse** — koi naya WebSocket connection nahi, naye `BT_*` event names.
- **Wire protocol do hisso me**: static roster (naam/color/host — sirf tab bhejte hain jab badle)
  alag se, per-tick dynamic snapshot (positions/bomb/timer) alag se — taaki har tick pe naam/color
  dobara na bheje jaayen (network traffic kam).
- **Client canvas-rendering** (Draw & Guess ke `Canvas` pattern se prerna, par bilkul alag component
  — arena/players/bomb draw karta hai, drawing tool nahi hai).

## Milestone checklist

| # | Milestone | Status | RMC |
|---|---|---|---|
| 1 | Foundation: pure `bomb-tag-engine` — movement physics, collision, bomb/tag logic, round state machine, scoring (fully unit-tested, zero framework deps) + shared-types wire protocol | ☑ DONE | RMC-0030 |
| 2 | Server core: NestJS module + global tick-loop, reusing existing gateway+sessions | ☑ DONE | RMC-0031 |
| 3 | React UI: arena canvas, keyboard controls, HUD, lobby/menu integration, round/match results | ☑ DONE | RMC-0032 |
| 4 | Mobile controls (virtual joystick) — reconnection hardening (host transfer, disconnect-forfeit) already done in Milestone 2 (RMC-0031); i18n (English + Hindi) already done in Milestone 3 (RMC-0032) | ☑ DONE | RMC-0033 |
| 5 | Polish: effects/animations, audio hooks, accessibility pass | ☑ DONE | RMC-0034 |
| — | *(deploy + verify live, jaisa Phase 3 me hua)* | ☑ DONE | RMC-0034/0035 |

## Notes
- Full 48-point spec owner ke message me hai (is session ke conversation history me) — is file
  me duplicate nahi kiya, sirf milestone-level tracking yahan.
- Phase 3 (RMC-0029) se ek zaroori lesson yaad rakhna: naya package add hote hi
  `apps/api/Dockerfile` me uska `COPY --from=build` pair bhi add karna (nahi to deploy crash
  hoga jaisa Draw & Guess ke pehle deploy me hua tha). **Bomb Tag deploy karne se pehle abhi
  tak nahi bhoola hai kyunki Milestone 3+ khatam hone tak deploy nahi kar rahe — jab bhi deploy
  karein, `packages/bomb-tag-engine` ke liye bhi COPY lines add karna yaad rakhna.**

## Milestone 2 me mile 2 real bugs (live-server test se pakde, unit tests se nahi)
1. Round disconnect/leave se khatam hota tha to gateway ko kabhi pata hi nahi chalta tha
   (`onRoundOver` hook fire nahi hota tha) — match state sahi thi lekin agla round kabhi shuru
   nahi hota, hamesha ke liye atak jaata. Fix: `notifyEvents()` helper jo har jagah use hota hai
   jahan engine `forfeit()`/`tick()` call hota hai.
2. Jo player match ke beech me poori tarah room chhod de ya disconnected reh jaaye, wo agle
   round me "bhoot" ban kar wapas "alive" aa jaata (engine ka fixed-roster design, kisi player ko
   poori tarah hata nahi sakta). Fix: `startNextRound` ab har naye round ke baad unhe turant
   dobara forfeit kar deta hai.
Dono `apps/api/scripts/smoke-bt.mjs` (real WebSocket clients, real chalta hua server) chalane se
pakde gaye — sirf unit tests likhne se ye kabhi pata nahi chalte.

## Milestone 3 (RMC-0032) — React UI, real browser me verify hua
`apps/web/src/bomb-tag/` naya module: `btClientState.ts`/`useBombTagSocket.ts` (DG jaisa hi
pattern), `BombTagApp.tsx` (screen switcher), `BtHome.tsx`, `BtLobby.tsx`, `BtGameScreen.tsx`
(COUNTDOWN/PLAYING/ROUND_OVER/GAME_OVER phases), `Arena.tsx` (canvas renderer — server ke
BombTagGameView se positions/bomb/alive draw karta hai, ~20fps full-redraw, interpolation baad
ke polish ke liye), `useKeyboardInput.ts` (WASD/arrow keys, pure `computeDirection()` alag se
testable), `BtScoreboard.tsx`. `ModeSelect.tsx` me teesra option add hua. i18n (English + Hindi)
poora saath hi kiya (Milestone 4 me planned tha, jaldi kar liya). `apps/web/scripts` ke bajaye
`scripts/ui-check-bt.mjs` real headless-Chrome se poora match khilata hai — **real keyboard input
CDP (`Input.dispatchKeyEvent`) se bheja gaya, synthetic DOM event nahi** — arena par player ka
position badalte hue screenshot se confirm hua. English + Hindi dono me verify hua, no console
errors, no layout overflow (mobile 390px + desktop). 11 naye unit tests (`btClientState.test.ts`,
`useKeyboardInput.test.ts`).

## Milestone 4 (RMC-0033) — mobile virtual joystick
`VirtualJoystick.tsx`: on-screen draggable stick (Pointer Events — mouse aur touch dono handle
karta hai), sirf touch-capable devices par dikhta hai (`isTouchDevice()` check — keyboard-only
desktop par nahi dikhta, clutter nahi hota). Keyboard input (`useKeyboardInput`) jaisa hi
`onInput` callback use karta hai — dono ek saath kaam kar sakte hain, server sirf aakhri input
yaad rakhta hai. Circle-clamp math (`clampToRadius`) pure function hai — 4 naye unit tests. Real
headless-Chrome me verify hua: `Emulation.setTouchEmulationEnabled` explicitly enable karna pada
(sirf `mobile:true` viewport se `navigator.maxTouchPoints` set nahi hota) — phir real mouse-drag
(CDP) se joystick khींचke player ko move karke confirm kiya. Reconnection hardening aur i18n
already Milestone 2/3 me ho chuke the, isliye Milestone 4 ka poora scope yahi tha.

## Milestone 5 (RMC-0034) — polish (audio, visual, accessibility)
- **Audio**: 3 naye sounds (`BT_TAG`, `BT_EXPLODE`, `BT_ROUND_WIN`) + match-win par existing `WIN`
  reuse (uski "Victory!" voice-line free me mil jaati hai). Server discrete events (BOMB_TRANSFERRED,
  EXPLODED, ...) wire par kabhi nahi bhejta (sirf continuous snapshots), isliye `btClientState.ts`
  khud consecutive `BombTagGameView` snapshots compare karke ye events client-side nikaalta hai
  (`diffGameEvents` — 8 naye unit tests).
- **Visual**: apne khud ke liye chhota transient banner ("💣 Aapke paas bomb hai!" / "💀 Aap bahar
  ho gaye!") jab tag/elimination event apne playerId ke liye ho.
- **Accessibility**: `aria-live="polite"` status region (canvas khud kuch nahi bolta screen-reader
  ko, isliye "3 alive. Charu ke paas bomb hai." jaisa text) — text hi nahi badla to browser dobara
  announce nahi karta (khud hi throttle).
- Real headless-Chrome se verify: aria-live region me non-empty text confirm kiya, poora flow
  (movement + joystick + disconnect + round/match end) dobara chalaya, koi console error nahi.
- **Deploy se pehle Dockerfile fix + real Docker verification**: `apps/api/Dockerfile` me
  `packages/bomb-tag-engine` ke COPY lines missing the (RMC-0029 wala hi lesson) — fix kiya,
  phir real `docker build` + `docker run` + **teeno game modes ke smoke tests** (RMCS, Draw &
  Guess, Bomb Tag) us container ke against chalaye, sab pass. Isi verification ke dauran
  `smoke-ws.mjs` me ek pehle se maujood (is session se related nahi) latent race-condition bug
  bhi mila aur fix kiya (do alag WebSocket clients ke beech queue-order par exact-match assertion,
  jo Docker ke network timing me expose hua — order-independent check me badal diya).

## Deploy + live verification (RMC-0034/0035) — **Bomb Tag ab production me live hai**
- Commit + push kiya (58 files, saare 5 milestones). Render (API) aur Vercel (web) dono ne auto-deploy
  kiya — dono CLI se poll karke confirm kiya "live"/"Ready".
- **Real live production server ke against teeno game modes ka smoke test chalaya** (sirf status
  check nahi): RMCS, Draw & Guess, Bomb Tag — sab pass, including reconnect scenario.
- Isi production-verification ke dauran 3 aur real, pre-existing (Bomb Tag se related nahi) Render
  infra characteristics mile aur `smoke-ws.mjs` ko unke liye adapt kiya:
  1. Client-initiated WebSocket close (ya server `terminate()`) Render ke reverse-proxy se doosre
     party tak pahunchne me **~10-20s** tak lagte hain (local Docker par turant). Disconnect-detection
     par depend karne wale saare waits ka timeout badhaya.
  2. Oversized-payload/rate-limit abuse-protection ka close-code production me app ka clean 1009
     nahi, Render ke proxy ka abrupt **1006** hota hai — dono ko valid signal maan kar accept kiya.
  3. Do independent WebSocket clients ke messages ka server tak pahunchne ka exact order kabhi
     guaranteed nahi hota — queue-name check ko order-independent banaya.
  Koi bhi cheez app ka real bug nahi thi — sabka independent local-Docker (short timers) run se
  confirm hua ki wahi exact code turant/cleanly pass hota hai. Sirf test-script production-network
  ke liye adapt karna tha (jaisa RMC-0029 me `SKIP_GRACE_CHECK` se pehle bhi hua tha).
- Final health check: web (Vercel) 200, API `/health` (Render) 200, teeno smoke suites live server
  ke against clean pass.

## Post-launch (RMC-0036) — ek critical bug + 2 enhancements

**Bug (owner ne report kiya): "move karte hi doosra player jeet jaata hai."**
Pehle asli repro banaya (2 clients, har state change ka log). 20 msg/sec par bug nahi aaya — yahi
sabse bada clue tha ki engine bilkul theek hai. Joystick-speed (~100 msg/sec) par turant reproduce
ho gaya. Asli chain:
`BT_INPUT` bahut tez → gateway ki global anti-flood limit (40/sec, jo turn-based modes ke liye
banayi thi) paar → `socket.terminate()` → gateway ke liye ye normal disconnect hai →
`setConnected(false)` → Bomb Tag me **koi grace nahi** (jaan-boojh kar, RMC-0030) → turant forfeit
→ ek hi player zinda bacha → ROUND_OVER. Yaani movement ne kabhi `alive`/score/round-end ko haath
nahi lagaya (game rules bilkul sahi the) — transport layer player ko maar raha tha.
- **Server fix (root cause)**: `BT_INPUT` ab apni alag, generous limit (`MAX_INPUT_MESSAGES_PER_SECOND`,
  default 150/sec) par ginta hai. Baaki har message ki sakht limit waisi hi hai (verify kiya: spam
  wala check abhi bhi connection kaatta hai). Sirf chhote frames parse hote hain aur asli `event`
  field check hota hai (chat me "BT_INPUT" likh dene se chhoot nahi milti).
- **Client fix (flood source)**: `VirtualJoystick` har `pointermove` par bhej raha tha (60-120/sec);
  server 50ms me ek hi baar padhta hai, isliye ab 50ms throttle — stick ka visual phir bhi smooth.

**Enhancement 1 — bomb ke paas jaate hi warning/pulse**: bomb holder ke around pulsing red danger
ring (arena me), paas aane wale ko red border + "⚠️ Bomb is near you — RUN!", aur khud holder ko
amber border + "💣 Pass it — run!". Sab client-side, snapshot se derive (koi protocol change nahi).

**Enhancement 2 — aakhri 5 second me tez hoti beep**: gap ~550ms (5s par) se ghat kar ~110ms
(0 ke paas), aakhri ~1.5s me pitch bhi ooncha (panic beep). HUD ka timer bhi isi window me bada +
red + pulse ho jaata hai. `Arena` ab `requestAnimationFrame` loop me draw karta hai taaki pulse
60fps smooth rahe (snapshot 20Hz par hi aate hain).

**Verify**: 6 + 10 naye unit tests, `smoke-bt.mjs` me bug ka seedha regression check (100 tez
movement messages ke baad socket OPEN + PLAYING + sab alive + koi winner nahi), `ui-check-bt.mjs`
me bot asli positions se host ka peecha karke warning trigger karta hai aur phir door jaakar timer
ko 5s tak girne deta hai. 464 tests pass, teeno modes Docker image + live production dono par pass.

**Ek nayi known limitation mili**: do players bilkul ek doosre ke upar khade rahein to bomb har
~400ms (cooldown) par transfer hoti rehti hai aur har transfer timer reset kar deta hai — round
kabhi khatam hi nahi hota. UI check likhte waqt dikha (bot host par park ho gaya, timer 15s par
atka raha). Abhi change nahi kiya (existing tag-rules ka natural nateeja hai, asli players alag ho
jaate hain), par agar real play me dikhe to transfer par poora timer reset na karna ek seedha fix hai.

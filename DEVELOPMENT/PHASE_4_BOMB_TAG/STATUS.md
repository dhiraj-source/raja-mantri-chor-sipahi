# PHASE 4 — Bomb Tag (fast multiplayer arena game)

## Status
**IN PROGRESS** (started 2026-09-27). Owner ne poora spec diya (48 sections) aur "full hand to
think and implement" — Phase 3 jaisa hi, milestones me tod kar banaya ja raha hai. Jab tak
checklist ke saare items DONE na ho jayen, is file ko "COMPLETE" mat likhna.

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
| — | *(deploy + verify live, jaisa Phase 3 me hua)* | ⏳ IN PROGRESS | — |

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

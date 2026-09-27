# PHASE 5 — Freeze Tag (real-time chase/rescue arena game)

## Status
**IN PROGRESS** (started 2026-09-27). Owner ne poora spec diya (33 sections) aur kaha: pehle
existing project audit karo, jo reuse ho sakta hai wo reuse karo, phir banao. Jab tak checklist ke
saare items DONE na ho jayen, is file ko "COMPLETE" mat likhna.

## Maksad
Chautha game mode: **Freeze Tag** — ek player "IT" hota hai jo baaki ko chhoo kar ❄️ freeze karta
hai; frozen player hil nahi sakta, par koi doosra active player use chhoo kar wapas zinda
(unfreeze) kar sakta hai. Round khatam: ya to **IT jeeta** (sab frozen ho gaye), ya **players
jeete** (timer khatam hone tak koi na koi bacha rah gaya). RMCS / Draw & Guess / Bomb Tag —
teeno **bilkul nahi todhne** hain.

## Audit ka nateeja — kya reuse ho raha hai

| System | Source | Kaise use hoga |
|---|---|---|
| WebSocket gateway (`/ws`) | `rooms.gateway.ts` | Wahi ek socket; naye `FT_*` events (koi doosra connection nahi) |
| Tick loop (20Hz) | Bomb Tag (RMC-0031) | Ek hi global timer ab dono real-time games ko tick karega |
| Sessions / reconnect | `SessionsService` | As-is |
| Room/lobby lifecycle | `bomb-tag.service.ts` ka shape | Same pattern (code, host, ready, kick, settings, connected) |
| Movement/geometry/spawn/random | `bomb-tag-engine` | **`@rmc/arena-kit` me nikaal kar dono games share karenge** |
| Canvas arena + keyboard + joystick | `apps/web/src/bomb-tag/` | Same patterns, alag components |
| Sound/mute, i18n, mode-select, error banner | Existing web infra | Extend (naya system nahi) |
| Anti-flood limiter (movement ke liye alag limit) | RMC-0036 | `FT_INPUT` ko bhi wahi generous limit milegi |

## Design decisions (owner ko pata hona chahiye)

- **`@rmc/arena-kit` (naya shared package)**: geometry (Vec2/distance/clamp/spawn points), movement
  (`stepPosition`), random (shuffle/pickIndex) ab teesri baar copy ho rahe the — isliye ek chhote
  shared package me nikaale. Ye **pure math** hai, koi game-rule nahi; har game ke apne rules
  (config/state/collision-semantics) alag-alag hi rehte hain, taaki ek game badalne se doosra na
  toote. Bomb Tag ko is refactor ke baad poora dobara verify kiya jaata hai (unit + smoke).
- **Ek hi round, match nahi**: Bomb Tag me "pehle N round jeeto" wala match hai; Freeze Tag spec me
  ek timed round hai, phir result screen → play again. Isliye phases: `COUNTDOWN → PLAYING →
  ROUND_OVER`. (Bomb Tag ka `GAME_OVER` yahan nahi chahiye.)
- **Tick ke andar fix order (race conditions ka asli jawab)**: server ke ek hi deterministic
  `tick()` me sab hota hai, isliye do cheezein sach me "ek saath" ho hi nahi sakti. Order:
  `movement → unfreeze (sirf un players ka jo is tick se pehle frozen the) → freeze → timer/win check`.
  Isse ek hi tick me freeze-phir-turant-unfreeze wala thrash nahi hota, aur IT ke tag ka matlab
  bana rehta hai.
- **Unfreeze ke baad thodi immunity**: abhi-abhi thaw hue player ko IT turant dobara freeze na kar
  sake (warna IT frozen player par "camp" karke rescue ko bekaar kar deta).
- **Frozen player hil nahi sakta**: uska input server par hi ignore hota hai (client par bharosa nahi).

## Milestone checklist

| # | Milestone | Status | RMC |
|---|---|---|---|
| 0 | `@rmc/arena-kit` extract (geometry/movement/random) + Bomb Tag usi par shift + poora re-verify | ☑ DONE | RMC-0037 |
| 1 | Foundation: pure `freeze-tag-engine` (IT selection, freeze/unfreeze, timer, win conditions, stats) + shared-types wire protocol | ☑ DONE | RMC-0037 |
| 2 | Server core: NestJS module + shared tick-loop/gateway wiring, disconnect/reconnect | ☐ TODO | — |
| 3 | React UI: arena canvas (IT/active/frozen visuals), HUD, lobby/menu integration, result screen | ☐ TODO | — |
| 4 | Polish: sounds (tag/freeze/unfreeze/countdown/win/lose), effects, mobile joystick, i18n | ☐ TODO | — |
| — | *(deploy + verify live, jaisa Phase 4 me hua)* | ☐ TODO | — |

## Notes
- Full 33-section spec owner ke message me hai (conversation history) — yahan sirf milestone-level
  tracking.
- **Deploy se pehle yaad rakhna**: `apps/api/Dockerfile` me har naye `@rmc/*` package ka
  `COPY --from=build` pair add karna hota hai (RMC-0029 aur RMC-0034 dono baar yahi gap mila tha).
  Is phase me **do** naye packages hain: `arena-kit` aur `freeze-tag-engine`.

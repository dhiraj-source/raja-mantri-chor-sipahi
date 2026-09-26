# PHASE 2 — Bots, Mixed Rooms, Voice

## Status
**IN PROGRESS** (started 2026-09-26). Naye features is phase me aage bhi add honge —
jab tak neeche list ke saare items DONE na ho jayen (ya owner khud na kahe), is file ko
"COMPLETE" mat likhna.

## Maksad
Akela player bhi khel sake (bots), rooms me insaan+bot mix ho sakein, aur players
ek-doosre se awaaz se jud sakein.

## Feature checklist

| # | Feature | Status | RMC |
|---|---|---|---|
| 1 | Quick play with bots (single player, bots fill the room) | ☑ DONE | RMC-0019 |
| 2 | Room create: host bots se khaali seats bhar sake | ☑ DONE | RMC-0019 |
| 3 | Lobby/queue me connected/waiting players ke **naam** dikhein (sirf count nahi) | ☑ DONE | RMC-0019 |
| 4 | Sound packs: animal sounds + voice-line style reactions | ⏸ WAITING ON OWNER | — |
| 5 | Live voice chat (WebRTC mesh, STUN only), per-player mute/unmute | ☐ TODO (decided, not started) | — |
| — | *(aage jo bhi naye features aayenge, yahan neeche add honge)* | | |

## Decisions (confirmed by owner)

### #4 — Sound/voice packs: **owner khud audio files dega**
Asli PUBG voice-lines copyrighted hain, unhe copy/use nahi kar sakte. Owner ne kaha ki khud
royalty-free/apne .mp3 files denge. **Blocked on: files abhi tak nahi mile.** Jab milein,
inhe kis naam/folder me daalna hai (convention) yahan likha jayega, phir wire-up hoga.

### #5 — Live voice chat: **WebRTC mesh, sirf public STUN (free), koi TURN nahi**
Owner ne free/simple tarika chuna — 4 players ke liye mesh chalta hai. Trade-off: kuch
strict-NAT/corporate network wale users (~5-10%) connect nahi kar payenge; TURN baad me
add ho sakta hai agar zaroorat pade. **Abhi tak shuru nahi hua** (bade scope ka feature hai,
bots ke baad ka number hai).

## Design notes (jaise-jaise implement hoga, yahan update hoga)

### Bots (RMC-0019) — implemented
- Bots engine ke liye invisible hain: ek bot "player" bhi normal `PlayerId` string hai
  (`bot-<uuid>`), GameEngine ko farak nahi padhta insaan hai ya bot.
- `RoomsService` me `bots: Set<PlayerId>` (global, kyunki ids unique hain), `addBot`/`removeBot`/
  `playWithBots`/`getBotMantriTask`. Bots `roomOfPlayer` map me bhi register hote hain
  (isi se ek asli bug pakda gaya: pehli baar bhula diya tha, `submitGuess` bot ke liye
  "Aap kisi room me nahi ho" de raha tha — test se turant pakda gaya).
- Bot Mantri ka guess: `RoomsService.onRoundStarted` hook -> `RoomsGateway` ek
  `setTimeout` (env `BOT_GUESS_DELAY_MS`, default 1800ms) schedule karta hai, jo random
  Sipahi/Chor me se ek guess karta hai. Koi AI/LLM nahi — bas fair random choice.
- Insaan (host) chala jaye aur sirf bots bachein to room khud delete ho jati hai (memory
  leak nahi hota). Host kabhi bot nahi banta.
- Quick match queue ab naam bhi bhejta hai (`MatchmakingService.waitingNames()`), sirf
  count nahi.
- Verified: `apps/api/test/rooms.service.test.ts` (10 naye tests) + real-server smoke test
  (solo vs 3 bots poora 4-round game, mixed room add/remove bot, dono me bot Mantri ka
  auto-guess) — sab pass.

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
| 1 | Quick play with bots (single player, bots fill the room) | ☐ TODO | — |
| 2 | Room create: host bots se khaali seats bhar sake | ☐ TODO | — |
| 3 | Lobby/queue me connected/waiting players ke **naam** dikhein (sirf count nahi) | ☐ TODO | — |
| 4 | Sound packs: animal sounds + voice-line style reactions | ⏸ NEEDS DECISION | — |
| 5 | Live voice chat (WebRTC), per-player mute/unmute | ⏸ NEEDS DECISION | — |
| — | *(aage jo bhi naye features aayenge, yahan neeche add honge)* | | |

## Open decisions (owner se confirm hone tak shuru nahi honge)

### #4 — Sound/voice packs
Asli PUBG voice-lines copyrighted hain, unhe copy/use nahi kar sakte. Options owner ko diye
gaye (dekho conversation) — jo bhi chuna jayega yahan likha jayega.

### #5 — Live voice chat
WebRTC architecture (mesh vs TURN server) aur uska cost/reliability tradeoff — owner ka
decision chahiye. Jo bhi tय hoga yahan likha jayega.

## Design notes (jaise-jaise implement hoga, yahan update hoga)
- Bots: engine/rules server ke pure hain, isliye bot "player" bhi normal PlayerId hai —
  RoomsService ko farak nahi padhta ki koi player insaan hai ya bot. Bot ka faisla (guess
  kise karna hai) ek chhota deterministic/random helper karega, kisi AI/LLM ki zaroorat nahi.
- Bots real WebSocket connection nahi rakhte — RoomsService ke andar hi "virtual" players
  hote hain jinke actions server khud schedule karta hai (chhoti delay ke baad, taaki
  insaan jaisa lage).

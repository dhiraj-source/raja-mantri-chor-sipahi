# LAST WORK

## Latest (RMC-0036 — Bomb Tag critical bugfix + 2 enhancements, deployed)

Owner ne report kiya: **"move karte hi doosra player jeet jaata hai"**, aur saaf kaha ki UI patch
nahi, asli root cause dhoondho. Phir do enhancements maange (bomb ke paas jaate hi warning/pulse,
aur aakhri 5 second me tez hoti beep) aur deploy.

### Bug: root cause (engine bilkul theek tha)
Pehle asli repro banaya — 2 WebSocket clients, poora match, har state change ka timestamped log.
- 20 movement-messages/sec par **bug reproduce hi nahi hua** — yahi sabse bada clue tha.
- Joystick-speed (~100/sec) par turant reproduce ho gaya, aur poori chain dikh gayi:

```
BT_INPUT bahut tez (joystick drag / tez keys)
   → gateway ki global anti-flood limit (40/sec — turn-based modes ke liye banayi thi) paar
   → socket.terminate()
   → gateway ke liye ye ek normal disconnect hai
   → BombTagService.setConnected(false)
   → Bomb Tag me koi grace nahi (jaan-boojh kar, kyunki bomb timer hi ~15s ka hai)
   → turant forfeit → ek hi player zinda → ROUND_OVER
```
Captured timeline: socket t=5890ms par band (code 1006), t=5891ms par doosra player winner —
jabki bomb me abhi ~14 second bache the. Matlab movement ne kabhi `alive`, score, ya round-end
ko haath nahi lagaya; **transport layer player ko maar raha tha**.

**Fix (server — asli jagah):** `BT_INPUT` ab apni alag generous limit par ginta hai
(`MAX_INPUT_MESSAGES_PER_SECOND`, default 150/sec). Baaki har message ki limit waisi hi sakht
(verify kiya: spam-protection test abhi bhi connection kaatta hai). Frame classification sirf
chhote frames parse karta hai (BT_INPUT ~45 bytes) aur asli `event` field dekhta hai — chat me
"BT_INPUT" likh dene se dheeli limit nahi milti.

**Fix (client — flood ka source):** `VirtualJoystick` har `pointermove` par bhej raha tha
(60-120/sec) jabki server 50ms me ek hi baar padhta hai. Ab 50ms throttle; stick ka visual phir
bhi har frame par smooth chalta hai, aur press/release hamesha turant jaate hain.

### Enhancements
1. **Proximity warning/pulse** — bomb holder ke around pulsing red danger ring (arena canvas me),
   paas aane wale ko red border + "⚠️ Bomb is near you — RUN!", holder ko amber border +
   "💣 Pass it — run!". Sab client-side, existing snapshot se derive — koi protocol change nahi.
2. **Aakhri 5 second me tez hoti beep** — gap ~550ms (5s par) se ghat kar ~110ms (0 ke paas),
   aakhri ~1.5s me ooncha "panic" pitch. HUD timer bhi isi window me bada + red + pulse.
   `Arena` ab `requestAnimationFrame` loop me draw karta hai taaki pulse 60fps smooth rahe.

### Verification
- 16 naye tests (6 API: frame classification + limit behavior; 10 web: beep timing curve + proximity).
- `smoke-bt.mjs` me bug ka **seedha regression check**: 100 tez movement messages ke baad socket
  OPEN, phase PLAYING, sab players alive, koi winner nahi.
- `ui-check-bt.mjs`: bot asli server positions se host ka peecha karta hai jab tak warning DOM me
  na dikhe, phir door jaata hai taaki timer 5s tak gir sake, aur urgent-timer styling assert hoti hai.
- 464 tests pass; teeno modes production Docker image par pass; deploy ke baad live server par bhi pass.

### Ek nayi known limitation (abhi fix nahi ki)
Do players bilkul ek doosre ke upar khade rahein to bomb har ~400ms par transfer hoti rehti hai
aur **har transfer timer reset kar deta hai** — wo round kabhi khatam nahi hota. UI check likhte
waqt mila. Existing tag-rules ka natural nateeja hai aur asli players alag ho jaate hain, isliye
abhi chhoda hai; zaroorat pade to seedha fix = transfer par poora timer reset na karna.

## RMC-0030..0035 (Phase 4: Bomb Tag banaya aur deploy kiya)
See CHANGELOG.md. Not repeated here.

## Current phase
- **PHASE 2**: checklist fully DONE.
- **PHASE 3** (Draw & Guess): Milestones 1-4 done and deployed. Milestone 5 open (accessibility
  pass, voice chat integration).
- **PHASE 4** (Bomb Tag): **COMPLETE, deployed, aur post-launch bug bhi fix ho chuka hai.**

## Next step
Koi pending kaam nahi. Owner ke direction ka intezaar. Reasonable options:
1. Draw & Guess ka baaki Milestone 5 (accessibility pass, voice chat).
2. Bomb Tag ki upar wali "overlapping players se round stall" wali limitation, agar real play me
   dikhe.
3. Koi naya Phase 5 / naya game mode.

Separately, still open (owner handling it themselves): Render's free PostgreSQL expires ~2026-10-26.

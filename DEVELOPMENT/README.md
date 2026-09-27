# DEVELOPMENT — phase-by-phase tracking

Ye folder project ko **phases** me track karta hai. Har phase ka apna folder hai:

```
DEVELOPMENT/
  PHASE_1_FOUNDATION_TO_LAUNCH/
    STATUS.md
  PHASE_2_BOTS_AND_VOICE/
    STATUS.md
  PHASE_3_.../             (jab shuru hoga tab banega)
```

## Ye kyun hai, aur root files se kaise alag hai

Root ke 5 files (`CLAUDE.md`, `PROJECT_STATUS.md`, `LAST_WORK.md`, `CHANGELOG.md`, `ARCHITECTURE.md`) **waise hi rahenge** — CLAUDE.md abhi bhi kehta hai har badlav se pehle wahi 5 files padho. Wo **poore project ka abhi ka snapshot** hain (sab kuch, sab phases mila kar).

`DEVELOPMENT/PHASE_N/STATUS.md` alag kaam karta hai: **sirf usi phase ke features ki checklist**. Isse ye pata chalta hai ki:
- Is phase me kaunse features plan hue the
- Kaunse ban chuke hain, kaunse baaki hain
- Phase kab complete hua (ya abhi bhi chal raha hai)

**Rule:** Jab tak checklist ke saare items DONE na hon, phase ko "COMPLETE" mat likhna — naye items bhi baad me add ho sakte hain isi phase me.

## Har phase STATUS.md me kya hota hai

- Phase ka naam aur maksad
- Status: PLANNED / IN PROGRESS / COMPLETE
- Feature checklist (☐ / ☑, har ek ka apna status)
- Har complete hue feature ka RMC-XXXX number (poori detail CHANGELOG.md me hai, yahan duplicate nahi karte)
- Open questions / decisions jo owner ko leni hain

## Ab tak

- **PHASE 1** (RMC-0001 — RMC-0018): Foundation se lekar live deployment tak. **COMPLETE.**
- **PHASE 2** (RMC-0019 — RMC-0023): Bots, room me mixed human+bot, voice packs, live voice chat. **IN PROGRESS** (checklist done, phase khuli hai owner ke standing instruction ke hisaab se).
- **PHASE 3** (naya game mode — Draw & Guess): Skribbl.io-style drawing+guessing mode, RMCS ke saath. **IN PROGRESS** (Milestones 1-4 + deploy done; live in production).
- **PHASE 4** (naya game mode — Bomb Tag): fast real-time multiplayer arena game, bomb pass-the-parcel style. **IN PROGRESS.**

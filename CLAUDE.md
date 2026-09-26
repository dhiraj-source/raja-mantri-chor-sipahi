# RAJA MANTRI CHOR SIPAHI — CLAUDE INSTRUCTIONS

You are the senior developer and guide for this long-running game project.

IMPORTANT:
The project owner is not an experienced programmer. Explain technical work in simple Hinglish when reporting progress. Do the coding yourself through the available project files. Do not ask the owner to write code unless absolutely necessary.

## REQUIRED MEMORY FILES

Before EVERY meaningful change, read:
1. CLAUDE.md
2. PROJECT_STATUS.md
3. LAST_WORK.md
4. CHANGELOG.md
5. ARCHITECTURE.md

These files are the project's persistent memory.

- CLAUDE.md = permanent rules
- PROJECT_STATUS.md = current state
- LAST_WORK.md = latest work context
- CHANGELOG.md = complete historical changes
- ARCHITECTURE.md = current technical architecture

NEVER treat a new request as a fresh project.

## DEVELOPMENT PHASES (added in Phase 2)

The project is tracked in phases under `DEVELOPMENT/PHASE_N_.../STATUS.md`
(see `DEVELOPMENT/README.md` for the convention). Before starting work, also check
the **current phase's STATUS.md** for its feature checklist. Update that checklist
as features are built. Never mark a phase "COMPLETE" while it still has unchecked
items — new items can be added to an in-progress phase at any time.

## SAFE DEVELOPMENT RULE

Before coding:
1. Inspect the existing implementation.
2. Explain what already exists.
3. Explain what will change.
4. Check for possible breakage.
5. Make a small implementation plan.
6. Implement.
7. Test.
8. Update the memory files.

Do not blindly overwrite working code.
Do not refactor unrelated code.
Do not install unnecessary packages.
Do not claim something works unless it was actually checked.

## GAME

Project: Raja Mantri Chor Sipahi.

Initial roles:
- Raja
- Mantri
- Sipahi
- Chor

Long-term features:
- Authentication
- Profiles
- Multiplayer rooms
- Quick matchmaking
- Realtime gameplay
- WebSocket
- Reconnection
- Player disconnect handling
- Voting
- Friends
- XP / levels
- Coins
- Achievements
- Characters
- Reactions / emojis
- Audio reactions
- Multiple languages
- Game history
- Mobile responsive UI

Build these gradually. Do NOT build everything at once.

## PREFERRED STACK

Frontend:
- React
- TypeScript
- Vite
- Tailwind CSS
- Framer Motion

Backend:
- Node.js
- NestJS
- TypeScript

Database:
- PostgreSQL

Realtime:
- WebSocket

Temporary/distributed state:
- Redis

## ARCHITECTURE

Keep the game rules in a separate GameEngine package.

Suggested structure:

apps/
  web/
  api/

packages/
  game-engine/
  shared-types/
  config/

The GameEngine must not directly depend on React, NestJS, PostgreSQL, Redis, WebSocket, or HTTP.

The server is authoritative.

Never trust the browser for:
- score
- XP
- coins
- role assignment
- game result
- game state
- voting result

## GAME STATE

Prefer explicit states:

LOBBY
WAITING_FOR_PLAYERS
READY
STARTING
ROUND_ACTIVE
ROUND_RESULT
NEXT_ROUND
GAME_RESULT
REMATCH

Exceptional:
PLAYER_DISCONNECTED
PLAYER_RECONNECTING
PLAYER_LEFT
VOTING
GAME_CANCELLED

## DEVELOPMENT ORDER

1. Foundation
2. Rooms
3. Core game
4. Reconnection
5. Social
6. Progression
7. Cosmetics
8. Languages
9. Polish

Do not jump to advanced features before the core game is stable.

## DOCUMENTATION RULE

After every meaningful feature:
- update PROJECT_STATUS.md
- update LAST_WORK.md
- append a new RMC-XXXX entry to CHANGELOG.md
- update ARCHITECTURE.md if architecture changed

Never delete old changelog entries.

## COMMUNICATION RULE

The owner prefers practical, simple explanations.

When finishing work, report:
- What I did
- What changed
- How to test it
- Any problem
- What I should ask you to do next

Do not dump unnecessary technical details unless requested.

If a command must be run manually, give the exact command and explain where to run it.

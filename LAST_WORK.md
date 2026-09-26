# LAST WORK

## Latest (RMC-0019 — Phase 2 kickoff: bots)
Owner started Phase 2 with 5 asks: (1) quick play with bots, (2) mixed human+bot rooms with
queue names shown, (3) sound/voice packs, (4) live voice chat. First set up
`DEVELOPMENT/PHASE_1_FOUNDATION_TO_LAUNCH/STATUS.md` (archived, COMPLETE) and
`DEVELOPMENT/PHASE_2_BOTS_AND_VOICE/STATUS.md` (new, IN PROGRESS, full checklist) per the
owner's explicit ask for a phase-tracking folder structure. Root CLAUDE.md/PROJECT_STATUS.md
point at these now; the 5-file read-before-work contract is unchanged.

Asked the owner 2 real decisions before touching the ambiguous items:
- Sound packs (real PUBG-style voice-lines are copyrighted) -> **owner will supply their own
  audio files** (not provided yet — this item is WAITING, not started).
- Live voice chat architecture -> **WebRTC mesh, public STUN only** (free, simplest; not
  started yet, it's a big feature on its own).

Then implemented items 1-3 (bots + mixed rooms + queue names) fully:
- shared-types: `RoomPlayerView.isBot`, `QUEUE_STATE` now carries names, `PLAY_WITH_BOTS` /
  `ADD_BOT` / `REMOVE_BOT` messages, `BOT_NOT_FOUND` error.
- RoomsService: bot creation/removal (host only, lobby only), `playWithBots` (one-shot solo
  flow), `getBotMantriTask` (server peeks real roles to find a bot Mantri + valid guesses),
  auto room cleanup when only bots remain, host never becomes a bot.
- RoomsGateway: new message handlers + a scheduled bot auto-guess (`BOT_GUESS_DELAY_MS`,
  default 1800ms) whenever a round starts with a bot as Mantri.
- MatchmakingService: `waitingNames()`.
- web: "Play with bots" button on Home, BOT tag + add/remove buttons in Lobby, names shown
  in the queue screen, English + Hindi text.

**Real bug caught by testing, not guessed at:** `addBot` initially forgot to register the bot
in the internal `roomOfPlayer` lookup — a bot becoming Mantri would have made `submitGuess`
throw "not in a room" and hung that round forever. The new unit test for
`getBotMantriTask`/`submitGuess` caught it immediately; fixed by also setting
`roomOfPlayer` (and clearing it) wherever bots are added/removed/forgotten.

**Verified for real, not just written:**
- 253 unit tests pass (37 engine + 132 api [+10 bot tests, +1 matchmaking] + 84 web
  [+7 bot-UI tests]). Lint + build clean.
- Extended `scripts/smoke-ws.mjs` and ran it against a real running server: solo player vs
  3 bots plays a full 4-round game with the bot Mantri auto-guessing every time (zero human
  guesses needed); a host builds a mixed room (add 3 bots, remove one, re-add one, play a
  full game); queue reports names not just a count. Found and fixed two race conditions in
  the *smoke script itself* while doing this (checking round state before the new round's
  data arrived; forgetting to send NEXT_ROUND after the final round). Cleaned up the
  smoke-test accounts from the dev database afterward.

## Current phase
PHASE 2 (DEVELOPMENT/PHASE_2_BOTS_AND_VOICE/STATUS.md) IN PROGRESS: 3/5 listed items done.
Remaining: sound packs (waiting on owner's audio files) and live voice chat (not started,
scoped as WebRTC mesh + STUN).

## Next step
Ask the owner: send the audio files for sound packs (and what folder/naming convention
they'd like, or let me propose one), and/or say when to start on the WebRTC voice chat
feature (it's a substantial standalone piece: signaling over the existing WebSocket gateway,
RTCPeerConnection management in the browser, mute/unmute UI, per-room mesh for up to 4 peers).

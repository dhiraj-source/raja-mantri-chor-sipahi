# ARCHITECTURE

## High-level flow

Client
  ↓
React Web App
  ↓
NestJS API / WebSocket
  ↓
Game Service
  ↓
GameEngine
  ↓
PostgreSQL / Redis
  ↓
WebSocket broadcast
  ↓
Players

## Frontend
React
TypeScript
Vite
Tailwind CSS
Framer Motion

## Backend
Node.js
NestJS
TypeScript

## Database
PostgreSQL for permanent data.

## Redis
Redis for temporary/distributed state such as:
- matchmaking
- presence
- reconnect state
- distributed locks

## GameEngine
Game rules should be framework-independent.

It should contain concepts such as:
- createGame
- startGame
- startRound
- assignCharacters
- submitGuess
- calculateScore
- finishRound
- finishGame

## Server authoritative
The client sends actions.
The server validates them.
The GameEngine calculates the result.
The server persists/broadcasts the result.

## Game lifecycle

LOBBY
→ WAITING_FOR_PLAYERS
→ READY
→ STARTING
→ ROUND_ACTIVE
→ ROUND_RESULT
→ NEXT_ROUND
→ GAME_RESULT
→ REMATCH / LOBBY

## Current implementation (RMC-0002)

Monorepo (npm workspaces):
- packages/shared-types → types shared by server and browser (no logic)
- packages/game-engine → pure TS; depends only on shared-types (ESLint blocks framework imports)
- apps/api → NestJS (currently only /health; will call GameEngine in Phase 2)
- apps/web → Vite + React (displays server data only)
- docker-compose.yml → PostgreSQL + Redis (not used by code yet)

GameEngine design:
- Pure functions, immutable GameState, random injected (deterministic tests).
- GameState holds secret roles and stays on the server only.
- getPlayerView(state, viewerId) is the only thing sent to a browser: Raja and Mantri are public in ROUND_ACTIVE, Sipahi and Chor are hidden, and all roles are revealed in ROUND_RESULT.
- Engine phases in use: LOBBY → ROUND_ACTIVE → ROUND_RESULT → (ROUND_ACTIVE | GAME_RESULT).
- Client only sends actions (ClientAction); score and result are computed by the engine.

## Rooms and realtime (RMC-0003)

apps/api/src/rooms:
- RoomsService: in-memory rooms (code → players, host, GameState). It calls GameEngine for every game action and turns engine errors into RoomError (GAME_RULE). No HTTP/WebSocket knowledge.
- RoomsGateway: WebSocket at /ws (plain ws via @nestjs/platform-ws). Each connection gets a server-generated guest playerId. It only translates messages to RoomsService calls and pushes results.
- After every successful action every member of the room receives ROOM_STATE and their own GAME_VIEW (getPlayerView). Errors go only to the sender.
- Message protocol lives in packages/shared-types (ClientMessage / ServerMessage, { event, data }).
- Only host: START_GAME, NEXT_ROUND. Only Mantri: SUBMIT_GUESS (engine enforces).
- Temporary: leaving/disconnecting cancels the running game and returns the room to lobby. Reconnection design below replaces this in Phase 4.
- Rooms are process memory for now; Redis will hold room/presence state when distribution or restart survival is needed.

## Sessions, reconnect, matchmaking, reactions (RMC-0005/0006)

- SessionsService: token (secret) -> playerId. The token is sent only to its owner in CONNECTED and kept in the browser's sessionStorage. Reconnect = open /ws?token=...
- Gateway on disconnect: player stays in room with connected=false and a grace timer (RECONNECT_GRACE_MS, default 60s). Returning inside grace restores the same player and sends full ROOM_STATE + GAME_VIEW. On expiry: leaveRoom (game cancelled, room -> lobby) and session removed. A second socket for the same token replaces the first (close code 4000, no retry loop).
- MatchmakingService: in-memory FIFO queue -> RoomsService.createRoom/joinRoom/startGame when 4 players are waiting.
- Reactions: RoomsService validates emoji + cooldown, gateway broadcasts to the room only. No effect on GameState.
- Rematch: host only, only in GAME_RESULT, sets room.game = null (lobby, same players).

## Deployment (RMC-0017/0018) — LIVE

- Split hosting: web (static build) on **Vercel**; api (persistent Node process, WebSocket, in-memory room/session state) on **Render**. Vercel's serverless model cannot run the api as-is — this was a deliberate, discussed decision, not an oversight. (Railway was the original choice but its free trial had expired on the owner's account; Render was picked instead.)
- apps/api/Dockerfile: multi-stage, monorepo-aware (build context = repo root, not apps/api). Copies the whole repo so package-lock.json stays valid for `npm ci`, builds shared-types + game-engine + api, prunes devDependencies, then a slim runtime stage copies only node_modules + built dist + migrations. Render's `rmc-api` service builds from this Dockerfile (path `apps/api/Dockerfile`, context `.`) — the CLI's `services create` doesn't expose separate dockerfile-path/context flags, so this was set via a direct PATCH to Render's REST API (`serviceDetails.envSpecificDetails`).
- vercel.json (repo root) drives the web build directly (installCommand/buildCommand/outputDirectory) so no Vercel dashboard "Root Directory" configuration is needed for the monorepo.
- CORS (cors.ts, RMC-0016) is the production gate: the deployed web origin must be in `CORS_ORIGINS` on Render or the browser gets blocked. Currently set to the live Vercel URL.
- `.github/workflows/ci.yml` runs build+lint+test on every push as a safety net; actual deployment is triggered by Render's and Vercel's own GitHub App integration (git push -> auto deploy), not by this workflow.
- render.yaml is a **reference/documentation** Blueprint (the real resources were created via the Render CLI, not by syncing this file) — useful if the setup ever needs to be recreated.
- See DEPLOYMENT.md for the live URLs, env vars, and the free-Postgres 30-day expiry the owner needs to handle.

## Audio and verification tooling (RMC-0014/0015)

- Audio is 100% client side: web/src/audio/sounds.ts holds the tunes as tone data and a SoundPlayer on the Web Audio API (no audio files). Reactions are already broadcast by the server; each browser plays the tune locally. Mute is stored in localStorage.
- Voice lines (RMC-0022): `VoiceLinePlayer` (same file) uses `window.speechSynthesis` to speak a short phrase on round-result/win moments only (not every reaction, to avoid nagging). Same dependency-injection shape as `SoundPlayer` (a `getSynth()`/`createUtterance()` pair the browser build supplies and tests fake), and the same mute toggle gates both — no new setting. Zero audio files: no copyright exposure, unlike sourcing real PUBG/BGMI voice lines would have been.
- Animal sounds (RMC-0023): `AnimalSoundPlayer` (same file) plays two real recorded clips (`apps/web/public/audio/*.wav` — CC0/public-domain, from OpenGameArt.org) via `HTMLAudioElement`, same dependency-injection/mute pattern as the other two players. Cat meow on CORRECT (Chor caught), dog bark on WRONG (Chor escapes). TTS can't make animal sounds, hence real files here (unlike the voice lines) — license was verified per file before use, not assumed.
- scripts/smoke-ws.mjs = protocol level end-to-end test against a running API; scripts/ui-check.mjs = real-browser test (headless Chrome over the DevTools protocol) against the running API + web dev server. Both create test accounts in the dev database.

## Bots (RMC-0019, Phase 2)

- Bots are invisible to GameEngine: a bot "player" is just a `PlayerId` string (`bot-<uuid>`)
  like any other. All bot bookkeeping (which ids are bots, their name/avatar) lives in
  RoomsService, not the engine — this keeps the "GameEngine must not depend on anything"
  rule from CLAUDE.md intact.
- `RoomsService.addBot`/`removeBot` (host only, lobby only) and `playWithBots` (one call:
  create room, fill to 4, start) — bots go through the exact same `room.players` array and
  `roomOfPlayer` lookup as real players, so the rest of the system (rounds, scoring, voting,
  reconnection) doesn't need to know bots exist.
- `RoomsService.onRoundStarted` is a hook (same pattern as `onGameFinished`) that
  RoomsGateway uses to schedule a bot's Mantri guess (`BOT_GUESS_DELAY_MS`, random pick
  between the two non-Raja/non-Mantri candidates) via `getBotMantriTask`, which is the one
  place that peeks at `GameState.roles` from outside the engine (server-only, never sent to
  a browser).
- Host is always human: if the host leaves, host transfers to a human if one remains, or the
  room is deleted if only bots are left (avoids orphaned bot-only rooms).

## Voice chat (RMC-0020, Phase 2)

- Signaling-only relay: audio itself never touches the server. `RoomsGateway` relays
  `VOICE_SIGNAL` (opaque WebRTC offer/answer/ICE candidate) to one target player, and
  `VOICE_MUTE` to the whole room, checking only that sender and target share a room —
  it never parses or validates the SDP payload.
- Mesh topology: every connected human player in a room opens a direct `RTCPeerConnection`
  to every other connected human player (up to 4 players = up to 6 peer connections room-
  wide). Bots have no socket and are never included.
- Glare avoidance: WebRTC has no built-in rule for who offers when both sides could
  initiate at once. `shouldInitiate(a, b)` picks the lexicographically smaller `PlayerId`
  as the offerer; the other side only ever answers, even if it independently decides to
  connect at the same moment (`VoiceRoom.connectTo` takes an explicit `initiate` flag so
  the reactive "an offer just arrived" path can never accidentally send its own offer too).
  ICE candidates that arrive before the remote description is set are queued and applied
  once it is.
- `packages/shared-types`: `VoiceRoom`'s `PeerConnectionFactory` is dependency-injected
  (`defaultPeerConnectionFactory` in production, a fake in tests) so the whole state
  machine — offer/answer/ICE handling, mute, peer add/remove — is unit-testable without a
  real browser or network.
- STUN only (Google's public STUN server), no TURN server: free and simple, per the
  owner's explicit choice. Trade-off: players behind a strict/symmetric NAT or some
  corporate networks (~5-10% estimated) won't be able to complete the peer connection;
  adding TURN later would need a running TURN server (coturn or a paid provider) and is
  independent of everything else here.
- `MAX_PAYLOAD_BYTES` (WebSocket gateway) raised 4096 -> 16384 to fit SDP offers/answers,
  which can exceed 4KB once ICE candidates are bundled in. This is a single global
  per-frame cap (`ws`'s own `maxPayload`, closes the connection with code 1009 over the
  limit) — there's deliberately no separate, smaller limit for non-signaling messages,
  since 16KB is still a small, reasonable abuse-protection ceiling either way.
- Lost-offer recovery (RMC-0021): if two players join voice chat at different times, the
  earlier joiner may already be the designated offerer (per `shouldInitiate`) and send an
  offer before the later joiner is listening — that offer is silently dropped, and without
  a fix the pair never connects (a page reload was the only way to retry). Fix: a `ready`
  signal (just another case of the same opaque `VoiceSignal`, no gateway change) is sent
  whenever a player creates a passive connection; the designated initiator, on receiving
  `ready` for a peer it already tried, resends its cached `localDescription` instead of
  waiting forever.

## Characters and shop (RMC-0013)

- The catalog (ids, emoji, price, minLevel) lives in shared-types so server and browser see the same list; only the server decides purchases.
- AccountRepository.purchaseCharacter is atomic (row lock: ownership row + coin deduction in one transaction; ownership is checked before coins; coins CHECK >= 0 in the database). AccountsService serializes purchases, equips and game rewards per account.
- Avatars in rooms: RoomsService keeps playerId -> characterId (set by RoomsGateway from the logged-in profile, updated live through AccountsService.onCharacterChanged) and puts it into RoomView.players[].character.
- HTTP: POST /shop/purchase, POST /shop/equip (Bearer) return the new Profile.

## Friends (RMC-0012)

- apps/api/src/friends: FriendsService holds the rules; FriendRepository (abstract) has InMemory and PostgreSQL versions; FriendsController exposes /friends over HTTP (Bearer token). One shared DatabaseModule provides the pg Pool (null without DATABASE_URL) to AccountsModule and FriendsModule.
- Presence and live updates are the gateway's job: FriendsService.isOnline / onChange are set by RoomsGateway (sockets and SessionsService.playersOf). Changes push FRIENDS_CHANGED over WebSocket; the browser then re-fetches GET /friends (HTTP stays the source of truth).
- Invites: INVITE_FRIEND (gateway checks login, lobby, friendship, online, not busy, rate limit) -> INVITE {fromName, roomCode} to the friend; joining goes through the normal JOIN_ROOM.

## Disconnect voting (RMC-0011)

DISCONNECT -> grace timer (60s) -> [game running and someone else connected] -> VOTE (30s, connected players) -> CANCEL (majority: missing players removed, game cancelled, room -> lobby) or WAIT (tie / timeout: grace restarts, a new vote opens later). A returning player leaves the vote; when nobody is missing the vote ends.
- Rules are pure in game-engine/voting.ts. RoomsService owns the vote state in the room (RoomView.vote); RoomsGateway owns the timers (graceTimers, voteTimers) and applies the outcome (sessions removed, timers re-armed, broadcast).
- Outside a running game (lobby) or when nobody else is connected, the player is simply removed after grace (old behaviour).

## Accounts and progression (RMC-0009)

- Rules (pure, in GameEngine package): progression.ts turns a finished game's history into XP, coins, level and achievements. No framework, no storage.
- apps/api/src/accounts: AccountsService holds the use-cases (register, login, recordGame ...). Storage goes through the abstract AccountRepository (InMemory now; PostgreSQL adapter later, swapped in AccountsModule only). Passwords: scrypt + random salt. HTTP: /auth/register, /auth/login, /auth/logout, /me with Bearer authToken.
- Link to the game: RoomsService fires onGameFinished once at GAME_RESULT; RoomsGateway looks up the account bound to each player (AUTHENTICATE message, SessionsService.bindAccount), asks AccountsService.recordGame, and sends GAME_REWARD. The browser never sends scores or rewards. Guests get nothing.
- Web: useAuth keeps authToken (localStorage) and the server's Profile; the socket sends AUTHENTICATE on every new/reconnected socket.
- Storage (RMC-0010): AccountsModule builds the repository from DATABASE_URL: PgAccountRepository (PostgreSQL, parameterized SQL, saveGameResult = one transaction) or InMemoryAccountRepository. apps/api/migrations/*.sql are applied in order at API start by database/migrate.ts (append-only files, transaction each, advisory lock). Tables: accounts, game_history, schema_migrations. Auth tokens and rooms are still in process memory (Redis later).

## Draw & Guess — new game mode, Phase 3 (RMC-0024, Milestone 1 of 6)

A Skribbl.io-inspired drawing-and-guessing mode, built **alongside** RMCS, never replacing it.

- `packages/draw-guess-engine`: a brand-new pure package, sibling to `packages/game-engine`, not
  a dependency of it or a dependent on it (only shared-types, for `PlayerId`). Same purity rule
  applies (ESLint blocks NestJS/React/pg/redis/ws imports) — chosen so this whole feature can be
  developed and reasoned about without any risk to the existing engine.
- State machine: `LOBBY → COUNTDOWN → CHOOSING_WORD → DRAWING → ROUND_RESULTS → (next turn |
  GAME_RESULTS) → FINISHED`. Drawer rotation is deterministic round-robin over a fixed
  `playerOrder` (`drawerId = playerOrder[turn % playerOrder.length]`), not random per turn — fair
  and reproducible.
- Security chokepoint, same pattern as RMCS's `getPlayerView`: `getPlayerView(state, viewerId,
  now)` is the **only** sanctioned way to build client-facing data. `state.word` (the secret) and
  `state.wordChoices` are only ever included when `viewerId === state.drawerId`; everyone else
  gets a `maskedWord` (computed from a per-turn shuffled `hintOrder` plus elapsed time — hints
  reveal gradually, capped at a configurable fraction of the word). A test serializes a
  non-drawer's view with `JSON.stringify` and asserts the literal word string is absent, not just
  structurally hidden, to catch any accidental leak early.
- Timers do not live in the engine. `endTurn`, `autoSelectWord`, and `beginNextTurn` are pure
  functions the engine exposes; a later milestone's NestJS gateway/service owns the actual
  `setTimeout`s and calls them, exactly like `RoomsGateway` already owns RMCS's grace/vote timers.
- Word bank (`words.ts`): ~150 original words across 16 categories (including Indian Culture/
  Food/Places/Festivals). The Bollywood and Cricket categories deliberately use only generic,
  common-noun vocabulary ("Playback singer", "Century", "Umpire") — no real film titles or
  cricketers' names — kept copyright/trademark-safe the same way RMC-0022's voice lines were.
- **Server core (RMC-0025) — implemented, playable over raw WebSocket:**
  - `packages/shared-types/src/draw-guess.ts`: the full wire protocol. `DrawGuessGameView`,
    `DrawGuessTurnResult`, `DrawGuessCorrectGuesser` live here (not in the engine package) —
    same convention as RMCS's `PlayerGameView`/`RoundResult`: the engine imports and returns
    these exact types rather than defining its own. New `DG_*` client/server events, entirely
    separate from RMCS's protocol (no shared event names, e.g. RMCS's `SUBMIT_GUESS` vs this
    mode's guessing going through `DG_CHAT`).
  - `apps/api/src/draw-guess/draw-guess.service.ts`: its own in-memory room map (no dependency
    on `RoomsService`). Full lobby (create/join/leave/ready/kick/settings, host transfer) and
    full game loop (start → countdown → choosing-word → drawing → round-results → next turn →
    game-results), all server-authoritative.
  - One text box does both chat and guessing: `chat()` checks whether the sender could
    currently be guessing (non-drawer, `DRAWING` phase, hasn't already guessed correctly) and
    tries it as a guess first; correct becomes a `CORRECT_GUESS` entry (never carries the
    guessed text — checked by both a unit test and a smoke-test wire-payload assertion),
    incorrect (or not eligible to guess) becomes a normal `CHAT` entry, profanity-censored via
    a small blocklist (`profanity.ts`) that also filters host-supplied custom words.
  - **No second gateway/socket** — `DG_*` `@SubscribeMessage` handlers were added directly to
    the existing `RoomsGateway` (NestJS's WS adapter can't cleanly run two gateways on the same
    path/server). One generic timer per room: `scheduleDgTimer(code)` reads the state's
    `turnEndsAt` and reschedules on every phase change; on fire it re-checks the current phase
    (state may have changed since scheduling) and calls the matching transition. The existing
    `RateLimiter` class is reused for chat-specific rate limiting.
  - Disconnect handling so far is intentionally minimal: if the drawer disconnects mid-turn,
    the turn ends immediately (never leaves the game stuck); other disconnects just flip a
    `connected` flag. RMCS's fuller grace-timer/vote-to-cancel system is deferred to a later
    milestone.
  - Verified end-to-end, not just unit-tested: `apps/api/scripts/smoke-dg.mjs` runs 2 real
    WebSocket clients through a full turn against a real running server. This caught two real
    bugs unit tests missed — a missing `@rmc/draw-guess-engine` dependency in `apps/api`'s
    `package.json`, and a gateway bug where a turn auto-ending inside a single `DG_CHAT` call
    (producing two chat entries at once) meant only the *last* entry was ever broadcast, so
    `CORRECT_GUESS` silently never reached clients in that case. RMCS's own smoke test
    (`smoke-ws.mjs`) was re-run against the same modified gateway to confirm both modes still
    coexist correctly on the one connection.
- **React UI (RMC-0026) — implemented, playable in a real browser:**
  - `apps/web/src/draw-guess/`: `ModeSelect` → `DgHome`/`DgLobby`/`DgGameScreen`, all consuming
    a `useDrawGuessSocket` hook mounted at the `App.tsx` level (not nested inside the mode's own
    tree) — so a page reload/reconnect shows the right Draw & Guess room immediately from server
    state, without depending on a client-only "which mode did you pick" flag that a fresh mount
    would otherwise have lost.
  - `Canvas.tsx`: a real `<canvas>`, drawn at a fixed internal resolution (800×600) scaled via
    CSS so the same coordinate math works at any display size. Local strokes render immediately
    on pointer move for responsiveness; points are simultaneously batched (60ms window) through
    `StrokeBatcher` and sent as one `DG_STROKE` message per batch rather than one per pointer
    event. Remote strokes paint incrementally — a ref-tracked count means only strokes newer
    than the last render get drawn, never a full redraw. Includes a real stack-based flood fill
    (with color tolerance, to handle anti-aliased stroke edges) for the paint-bucket tool.
  - The outer app container widens (`max-w-4xl` vs the normal `max-w-md`) only for the active
    Draw & Guess game screen — everywhere else, including Draw & Guess's own lobby, keeps the
    existing mobile-first width.
  - One shared WebSocket carries both games' messages: `useGameSocket`'s `send`/`onRawMessage`
    and `useVoiceChat`'s declared listener type were widened to the union of both protocols
    (RMCS's `clientReducer` and the new `dgReducer` each just ignore whatever events aren't
    theirs via a `default` case / an `isDgMessage` filter).
  - Verified beyond build/lint/unit-tests: `scripts/ui-check-dg.mjs` drives a real headless
    Chrome through a complete game, including **an actual mouse-drawn stroke via Chrome
    DevTools Protocol** and a direct wire-payload check that a guesser's `GAME_VIEW` never
    contains the real word. This caught two real bugs (a hardcoded app title that didn't
    reflect the active game mode, and a chat panel that silently never showed system messages
    because only one of several message-producing server actions broadcast new chat entries —
    both fixed).
- **Reconnection hardening (RMC-0027) — implemented:**
  - Host disconnecting (not just leaving) transfers host immediately to another connected
    player (`DrawGuessService.setConnected`), with a system chat message announcing it.
  - A disconnected player who doesn't reconnect within `RECONNECT_GRACE_MS` (same env var RMCS
    uses) is auto-removed via the existing `leaveRoom` path — a new `armDgGrace`/`expireDgGrace`
    pair in `RoomsGateway`, structurally the same idea as RMCS's `armGrace`/`expire` but kept
    separate since Draw & Guess deliberately has no vote-to-cancel step: for a casual game whose
    turn rotates every ~60-75 seconds regardless, freeing the seat is judged "reasonable"
    disconnect handling without RMCS's fuller vote-system complexity.
  - Known, accepted edge case: a non-drawer removed mid-game via grace-expiry isn't live-removed
    from the pure engine's `playerOrder` (a snapshot taken at game start, same design RMCS's
    engine uses) — if their turn comes up later it plays out with nobody drawing, then times out
    normally. Self-recovering, costs one wasted turn, never gets the game stuck.
  - Verified with a real end-to-end scenario in `scripts/smoke-dg.mjs` (genuine WebSocket closes,
    not `DG_LEAVE_ROOM` messages) run twice to confirm it isn't flaky, plus RMCS's own smoke test
    re-verified against the same modified gateway.
- **i18n (RMC-0028) — implemented, English + Hindi:** every Draw & Guess component renders
  through the existing `useI18n()`/`t()` mechanism (~60 new `dg.*` keys in
  `apps/web/src/i18n/messages.ts`) — the same dictionary system RMCS already uses, not a
  separate one. `hi` is typed as `Record<MessageKey, string>`, so TypeScript itself refuses to
  compile if a key is ever added to one language and forgotten in the other. Verified in a real
  browser: switched to Hindi via headless Chrome and confirmed (screenshot + direct text read)
  every visible string renders correctly with no layout breakage.
- Still open (rest of Milestone 4, and Milestone 5): spectators, private rooms/passwords, an
  accessibility pass, and voice chat integration for this mode.

## Web app structure (RMC-0004/0007)

- net/clientState.ts: pure reducer = mirror of server messages (no game logic).
- net/useGameSocket.ts: WebSocket + auto-reconnect (backoff, max 8 tries).
- i18n/: en + hi dictionaries; server sends error codes, browser translates.
- components/: Home, QueueScreen, Lobby, GameScreen, Reactions, LanguageSwitch, Scoreboard, ui.

## Reconnection

DISCONNECT
→ RECONNECT WINDOW
→ RECONNECT
→ RESTORE STATE
→ CONTINUE

or

DISCONNECT
→ TIMEOUT
→ PLAYER_LEFT
→ VOTING if required

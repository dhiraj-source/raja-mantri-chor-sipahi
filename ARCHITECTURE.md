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
- scripts/smoke-ws.mjs = protocol level end-to-end test against a running API; scripts/ui-check.mjs = real-browser test (headless Chrome over the DevTools protocol) against the running API + web dev server. Both create test accounts in the dev database.

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

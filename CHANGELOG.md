# CHANGELOG

This is permanent project history.
NEVER delete old entries.
NEVER rewrite old entries.
Always append.

# RMC-0001

## Feature
Project memory and development rules

## Status
COMPLETE

## What changed
Created the persistent documentation system:
- CLAUDE.md
- PROJECT_STATUS.md
- LAST_WORK.md
- CHANGELOG.md
- ARCHITECTURE.md

## Reason
Keep Claude aware of previous implementation decisions and current project state across future changes.

## Database
None.

## API
None.

## WebSocket
None.

## Tests
None.

## Known limitations
The actual game implementation has not started.

# RMC-0002

## Feature
Phase 1 foundation: monorepo, GameEngine, web, api, Docker Compose

## Status
COMPLETE

## What changed
- git init; npm workspaces (packages/*, apps/*).
- packages/shared-types: shared roles/phases/view types.
- packages/game-engine: pure TypeScript. createGame, startGame, submitGuess, nextRound, assignRoles, calculateRoundScore, getStandings, getWinnerIds, getPlayerView. Immutable state, injectable random, GameEngineError codes.
- 19 Vitest unit tests for the engine.
- apps/web: Vite + React + TypeScript, page shows API /health status.
- apps/api: NestJS, GET /health only.
- docker-compose.yml (PostgreSQL 16, Redis 7), .env.example.
- Root tsconfig.base.json, ESLint (engine cannot import NestJS/React/pg/redis/ws), scripts: build, test, lint, typecheck, dev:web, dev:api, db:up, db:down.

## Reason
Set up a safe, small foundation with game rules isolated from frameworks and a server-authoritative design.

## Database
None (Postgres container configured only, no tables).

## API
GET /health -> {"status":"ok"}

## WebSocket
None.

## Tests
- npm test: 19 passed (game-engine).
- npm run build: all 4 workspaces build.
- npm run lint: clean.
- API started manually, /health returned ok.
- docker compose config validated; containers NOT started (Docker Desktop was not running).

## Known limitations
- Scoring rules are assumed defaults, need owner confirmation.
- npm audit reports 5 issues in older major versions of dev/transitive deps (NestJS 10, Vite 5, Vitest 2); to be handled by a planned upgrade, not audit fix --force.
- Web resolves @rmc/shared-types via Vite alias to source.
- No commit made yet.

# RMC-0003

## Feature
Phase 2: in-memory rooms + WebSocket gateway (server-authoritative realtime game flow)

## Status
COMPLETE (backend only; no web UI yet)

## What changed
- New packages in apps/api: @nestjs/websockets, @nestjs/platform-ws, ws, @types/ws, vitest.
- packages/shared-types: room/protocol types (RoomView, ClientMessage, ServerMessage, RoomErrorCode, limits).
- apps/api/src/rooms: RoomsService (create/join/leave/start/guess/next round), RoomsGateway (/ws), RoomsModule.
- main.ts: WsAdapter.
- apps/api/test/rooms.service.test.ts, apps/api/vitest.config.mts, apps/api/scripts/smoke-ws.mjs, "test" and "smoke" scripts in apps/api.

## Reason
Get multiplayer rooms and realtime game flow working on the server before building UI, keeping GameEngine as the only place where rules and scores are computed.

## Database
None.

## API
GET /health unchanged.

## WebSocket
ws://localhost:3000/ws, messages { event, data }.
Client -> server: CREATE_ROOM {name}, JOIN_ROOM {code, name}, LEAVE_ROOM, START_GAME, SUBMIT_GUESS {guessedChorId}, NEXT_ROUND.
Server -> client: CONNECTED {playerId}, ROOM_STATE, GAME_VIEW (per-player safe view), ERROR {code, message}.

## Tests
- npm test: 19 engine + 13 rooms tests pass.
- npm run lint clean, npm run build OK.
- Smoke test on the real server: 4 clients create/join, start rejected with 3 players and for non-host, full 4-round game, secrets hidden, disconnect handled -> SMOKE TEST PASSED.

## Known limitations
- Rooms live in API memory only (restart loses them; no Redis yet).
- Disconnect/leave cancels the game and returns room to lobby (temporary; real reconnect in Phase 4).
- No rematch after GAME_RESULT.
- Guest playerId is new per connection (no auth yet).
- No rate limiting or payload size limits on WebSocket.

# RMC-0004

## Feature
Web UI: home, lobby, game screen, round result, final result (mobile-first)

## Status
COMPLETE

## What changed
- apps/web: added Tailwind CSS 4 (@tailwindcss/vite), Framer Motion, vitest.
- src/net/clientState.ts (pure reducer mirroring server messages + safe message parser), src/net/useGameSocket.ts (WebSocket hook).
- Components: Home (name saved in localStorage, create/join), Lobby, GameScreen (role card, Mantri guess buttons, round result, final result), Scoreboard, ui helpers. src/strings.ts holds user-facing text (ready for i18n).
- PlayerGameView got winnerIds (engine getPlayerView fills it in GAME_RESULT) so the browser does not decide the winner.
- vite.config.ts: tailwind plugin, alias to shared-types source, vitest include.

## Reason
Make the game playable by humans in the browser while keeping the server authoritative.

## Database
None.

## API
None.

## WebSocket
No protocol change (PlayerGameView.winnerIds added).

## Tests
- npm test: engine 20, api 13, web 6 all pass. Lint clean. Build OK.
- Not visually verified in a real browser by Claude (no browser tool used); logic verified via reducer tests + build + earlier server smoke test.

## Known limitations
- Refresh/disconnect loses identity (fixed by reconnection work next).
- No rematch yet (next).
- UI text is Hinglish/English only.

# RMC-0005

## Feature
Reconnection (session token + 60s grace) and Rematch

## Status
COMPLETE

## What changed
- shared-types: CONNECTED now carries a secret reconnect token; RoomPlayerView.connected; ClientMessage REMATCH; RECONNECT_TOKEN_PARAM; error code GAME_NOT_FINISHED.
- api: SessionsService (token -> playerId). RoomsGateway: connect with ?token=... restores the same player (role, room, game unchanged), replaces an older socket (close code 4000), disconnect starts a grace timer (RECONNECT_GRACE_MS, default 60000) instead of instant removal; after grace the player is removed and the game is cancelled back to lobby. RoomsService: setConnected, rematch (host only, only in GAME_RESULT, same players, fresh points).
- web: useGameSocket auto-reconnects (backoff 1s..8s, max 8 tries) with token in sessionStorage; reducer keeps room/game while reconnecting and resets them if the server gave a new identity; "disconnected" markers and banners; host "Dobara khelo" button.
- smoke test extended (21 checks): rematch, reconnect restores same role, wrong token gets a new guest, second tab replaces the first, grace expiry removes player, expired token unusable.

## Reason
Players must survive refresh/network drops without losing their game, and finish a game with a rematch.

## Database
None.

## API
None.

## WebSocket
CONNECTED {playerId, token}; new client event REMATCH; socket URL accepts ?token=.

## Tests
- npm test: engine 20, api 22, web 10 all pass; lint clean; build OK.
- Smoke test on real server (RECONNECT_GRACE_MS=1500): SMOKE TEST PASSED.

## Known limitations
- Game freezes while the Mantri is disconnected until they return or grace expires (no voting/skip yet).
- Sessions and tokens are in API memory (lost on server restart).
- Tokens live in sessionStorage (per tab).

# RMC-0006

## Feature
Reactions (emoji) and Quick matchmaking

## Status
COMPLETE

## What changed
- shared-types: REACTIONS (😂 😡 👏 😱 🤔 ❤️), REACTION_COOLDOWN_MS, client events REACTION / QUICK_MATCH / CANCEL_QUICK_MATCH, server events REACTION / QUEUE_STATE, error codes RATE_LIMITED, BAD_REACTION, ALREADY_QUEUED.
- api: RoomsService.reaction (validates against the allowed list, 1 per second per player, room members only; no game-state effect). MatchmakingService (in-memory FIFO queue; the 4th player triggers room creation + immediate game start, first in queue is host). Gateway: QUICK_MATCH, CANCEL_QUICK_MATCH, REACTION; queued players are removed instantly on disconnect or when they create/join a room.
- web: ReactionBar, ReactionFeed (animated, auto-expiring), Quick match button on Home, QueueScreen.
- Tests: rooms reactions (4), matchmaking (5), reducer queue/reactions (3), smoke test extended (reactions rate limit + bad emoji, queue size updates, cancel, matched game).

## Reason
Social feel during play and a way to play without sharing room codes.

## Database
None.

## API
None.

## WebSocket
See "What changed". Reaction broadcast goes only to the sender's room.

## Tests
- Engine 20, api 31, web 24 pass. Smoke test on real server passed (incl. reactions and quick match).

## Known limitations
- Queue is in API memory (single server only); no skill/level matching yet.
- Audio reactions are not built (emoji only).
- Reaction cooldown resets if a player leaves and rejoins a room.

# RMC-0007

## Feature
Multiple languages (English + Hindi)

## Status
COMPLETE

## What changed
- web/src/i18n: messages.ts (en + hi dictionaries; TypeScript forces every English key to exist in Hindi), I18nProvider (language saved in localStorage), LanguageSwitch.
- All UI text moved into dictionaries. Server errors now travel as codes only; the browser translates them (ClientState.error is now a RoomErrorCode).
- Tests: i18n (keys, placeholders, error codes) and render tests for Home/Queue/Lobby/GameScreen (Mantri vs non-Mantri views, round result, final result).

## Reason
Long-term feature list includes multiple languages; doing it before more UI exists keeps it cheap.

## Database
None.

## API
None.

## WebSocket
No change (server "message" text is now ignored by the browser; codes are used).

## Tests
- web 24 pass (clientState 13, i18n 5, render 6). Build and lint clean.

## Known limitations
- Only en and hi. Server-sent player names are shown as typed.
- Layout not visually checked in a real browser by Claude (only server-render tests).

# RMC-0008

## Feature
WebSocket abuse protection (message rate limit + payload size limit)

## Status
COMPLETE

## What changed
- api: RateLimiter (sliding window, injectable clock). Gateway terminates a socket that sends more than MAX_MESSAGES_PER_SECOND (default 20, env override) and sets maxPayload to 4096 bytes (ws closes the connection with code 1009 on larger frames).
- Tests: rate-limiter unit tests (3); smoke test checks for a 10KB message and a 100-message flood.

## Reason
Closes the "no rate limit / payload limit" technical debt before real users connect.

## Database
None.

## API
None.

## WebSocket
Connections that flood or send oversize frames are closed. Normal play is far below the limits.

## Tests
- api 34 pass (total engine 20 + api 34 + web 24 = 78). Smoke test passed. Lint clean.

## Known limitations
- Limits are per connection, not per IP; a determined attacker can open many connections (needs a reverse proxy / IP limits at deploy time).
- Nest logs a RangeError line when an oversize frame is rejected (expected).

# RMC-0009

## Feature
Accounts, profiles, game history, XP / levels, coins, achievements (storage still in memory)

## Status
COMPLETE for logic, API, WebSocket integration and UI. PostgreSQL storage PENDING (Docker Desktop not running).

## What changed
- shared-types: ACHIEVEMENTS, Profile, GameHistoryEntry, GameReward, AuthResponse, AuthErrorCode, username/password rules; WS events AUTHENTICATE (client) and AUTH_STATE, GAME_REWARD (server).
- game-engine: progression.ts (pure): summarizeGameForPlayer, calculateRewards, levelForXp, xpForLevel, evaluateAchievements. Assumed numbers: XP = 50 + points/100 (+50 if winner); coins = 10 (+20 if winner); level = 1 + floor(sqrt(xp/100)). Achievements: FIRST_GAME, FIRST_WIN, WIN_5, SHARP_MANTRI, SLIPPERY_CHOR, LEVEL_5.
- api/accounts: password.ts (scrypt with random salt, timing-safe verify, no new package), AccountRepository (abstract class = DI token) + InMemoryAccountRepository, AuthTokensService (7-day tokens), AccountsService (register/login/logout/getProfile/recordGame; per-username login limit 5/min; dummy hash for unknown users; per-account serialized updates), AuthController: POST /auth/register, POST /auth/login, POST /auth/logout, GET /me (Bearer token). Errors are { code, message } with 400/401/409/429.
- api/rooms: RoomsService.onGameFinished fires once at GAME_RESULT; RoomsGateway rewards logged-in players (summary is computed by the server from history; one reward per account per game) and sends GAME_REWARD; AUTHENTICATE binds a socket's player to an account (SessionsService.bindAccount).
- web: authApi + useAuth (token in localStorage, profile always from server), AccountPanel (login/register form, profile card with level bar, coins, achievements, last games), reward box on final screen, English + Hindi texts.
- Tests: engine progression (9), accounts (14), onGameFinished (1), web account/reward/reducer/i18n (10). Smoke test extended: register/login/401/409/400, WS auth, full game, GAME_REWARD, /me history, guest gets no reward.

## Reason
Long-term features: authentication, profiles, XP/coins/achievements, game history.

## Database
None yet. The AccountRepository interface is the seam; a PostgreSQL implementation + SQL migration will be added when Docker/PostgreSQL can be run and tested.

## API
POST /auth/register {username, password, displayName?} -> 201 {authToken, profile}
POST /auth/login {username, password} -> 200 {authToken, profile}
POST /auth/logout (Bearer) -> 204
GET /me (Bearer) -> Profile

## WebSocket
AUTHENTICATE {authToken|null} -> AUTH_STATE; at game end -> GAME_REWARD.

## Tests
- engine 29, api 48, web 34 = 111 pass. Lint + build clean. Smoke test on the real server passed (incl. accounts).

## Known limitations
- Accounts, tokens and history are lost on API restart until the PostgreSQL repository exists.
- No email, password reset or email verification. Passwords only (8-72 chars).
- Login limiter is per username (not per IP). Auth token is stored in localStorage (standard for this kind of SPA but readable by any XSS).
- Rewards can still be farmed by playing with your own accounts/tabs (one reward per account per game is enforced, not per person). Needs anti-abuse rules before real launch.
- Coins/achievements cannot be spent yet (Characters/cosmetics shop not built).
- Friends and audio reactions are not built.

# RMC-0010

## Feature
PostgreSQL storage for accounts, profiles and game history (+ Docker/WSL2 fixed)

## Status
COMPLETE and verified on a real PostgreSQL 16 container.

## What changed
- Environment: WSL 2.7.14 installed (`wsl --install --no-distribution`), Docker Desktop 28.0.1 now runs; `npm run db:up` started PostgreSQL 16 + Redis 7 (both healthy). `.env` created from `.env.example` (git-ignored) with DATABASE_URL.
- New package: pg (+ @types/pg) in apps/api.
- apps/api/migrations/001_accounts.sql: tables accounts and game_history (lowercase username check, non-negative counters, FK with cascade, index). Migration files are append-only.
- apps/api/src/database/migrate.ts: runs migrations/*.sql in order, each in a transaction, tracked in schema_migrations, guarded by an advisory lock (safe with several API instances).
- AccountRepository: update + addHistory replaced by one atomic saveGameResult(account, entry). New PgAccountRepository (all queries parameterized, transaction). AccountsModule picks PostgreSQL when DATABASE_URL is set (migrations run on API start, clear error "Is Docker running? Try: npm run db:up" if unreachable), otherwise in-memory.
- src/env.ts loads the repo-root .env with Node's built-in process.loadEnvFile (imported first in main.ts); vitest config does the same.
- Tests: one contract suite run against both InMemory and PostgreSQL (6 tests each) + PostgreSQL-only tests (transaction rollback, DB constraints, concurrent create race, migration idempotency, bad-migration rollback in an isolated schema). PostgreSQL tests are skipped automatically if the database is not reachable.

## Reason
Accounts, XP, coins and history must survive an API restart.

## Database
Tables accounts, game_history, schema_migrations (see 001_accounts.sql).

## API
No change.

## WebSocket
No change.

## Tests
- engine 29 + api 65 + web 34 = 128 pass; build + lint clean.
- Real check: API started with DATABASE_URL, full smoke test passed (register, login, game, reward), 4 accounts + 4 history rows visible in PostgreSQL, API restarted, login with the saved account returned the same xp/coins/achievements/history, password stored as scrypt hash. Smoke test rows were deleted afterwards.

## Known limitations
- Auth tokens (login sessions) are still in API memory: after an API restart users must log in again (accounts and data are safe). Should move to Redis/PostgreSQL later.
- Rooms, matchmaking queue and reconnect sessions are still in API memory; Redis is running but not used yet.
- The smoke test creates new accounts in whatever database the API uses on every run (dev database only).
- DATABASE_URL has a dev password in .env.example; use real secrets for any deployment.

# RMC-0011

## Feature
Voting when a player disconnects mid-game

## Status
COMPLETE

## What changed
- shared-types: VoteChoice, RoomVoteView, RoomView.vote, ClientMessage VOTE, error codes NO_VOTE / NOT_VOTER.
- game-engine/voting.ts (pure): createVote, castVote, tallyVote, countVotes. CANCEL needs more than half of the eligible voters; WAIT wins on a tie or as soon as CANCEL can no longer get a majority; a vote can be changed.
- api RoomsService: canOpenVote / openVote / castVote / resolveVote / getDisconnectedIds. Voters = connected players when the vote opens; missing = disconnected players. CANCEL removes the still-missing players and cancels the game (room back to lobby); WAIT changes nothing. A missing player who comes back is removed from the vote (vote ends if nobody is missing). Leaving the room or finishing the game ends any vote. RoomView carries the vote (votes are visible to the room) with expiresInMs.
- api RoomsGateway: when a player's reconnect grace ends during a running game and someone else is connected, a vote opens (VOTE_DURATION_MS, default 30000). Timeout = WAIT; after WAIT the grace timer restarts and a new vote opens later. Lobby disconnects and "everyone is gone" still remove the player directly.
- web: VotePanel (missing names, live tally, countdown from the server's remaining time, Wait / Cancel buttons with the player's current choice highlighted, non-voters see a status line), English + Hindi texts.
- Tests: engine voting (8), rooms vote (11), web vote panel (7). Smoke test (real server, RECONNECT_GRACE_MS=1500, VOTE_DURATION_MS=1500): grace without vote, vote opens, single CANCEL does not decide, 2 CANCEL removes the player and cancels, NO_VOTE afterwards, WAIT majority keeps everyone and a new vote opens later, reconnect during a vote ends it and restores the same role, timeout = WAIT.

## Reason
CLAUDE.md long-term feature "Player disconnect handling / Voting": remaining players decide instead of the game being cancelled automatically.

## Database
None.

## API
None.

## WebSocket
Client: VOTE { choice: 'WAIT' | 'CANCEL' }. Server: RoomView.vote in ROOM_STATE.

## Tests
- engine 37 + api 76 + web 41 = 154 pass. Lint + build clean. Smoke test on the real server passed.

## Known limitations
- If the missing player is the Mantri the game stays frozen until the vote/grace cycle ends (no "skip"/bot replacement).
- No score is recorded for a cancelled game (no XP for anyone).
- Vote state is in API memory (lost on restart, like rooms).

# RMC-0012

## Feature
Friends: requests, accept/decline/cancel, unfriend, online status, live updates and room invites

## Status
COMPLETE and verified on the real server + PostgreSQL.

## What changed
- Database: migration 002_friendships.sql (one row per pair, account_low < account_high, status PENDING/ACCEPTED, cascade on account delete).
- New shared DatabaseModule (one pg Pool for everything; AccountsModule refactored to use it). New apps/api/src/friends: FriendRepository (+ InMemory, + PgFriendRepository), FriendsService (rules), FriendsController, FriendsModule.
- Rules: request by username (lowercased); cannot friend yourself; duplicate request/friend rejected; if the other person had already requested you, it becomes a friendship at once; max 20 pending outgoing requests; only the person who received a request can accept it; decline works for received requests and cancel for sent ones; unfriend only for accepted.
- HTTP (Bearer token): GET /friends, POST /friends/requests {username}, POST /friends/requests/:accountId/accept, DELETE /friends/requests/:accountId, DELETE /friends/:accountId. Errors { code, message } with 400/401/404/409/429.
- SessionsService: account -> players reverse map (playersOf). Gateway: presence (online = at least one connected socket of the account), FRIENDS_CHANGED pushed to affected accounts on every change and to friends when someone goes online/offline; INVITE_FRIEND {accountId} (must be logged in, in a lobby, friends, friend online and not already in a room; 1 invite per 2s) -> friend gets INVITE {fromName, roomCode}; joining uses the normal JOIN_ROOM so the server re-checks everything. New error codes NOT_LOGGED_IN, NOT_FRIENDS, FRIEND_OFFLINE, FRIEND_BUSY.
- web: useFriends (refetches on the server's FRIENDS_CHANGED), FriendsPanel on Home (add by username, requests, list with online dot, remove, cancel), InviteToasts (Join / Not now), Lobby invite list (online friends only), clientState invites (max 3, no duplicates, cleared on joining a room). English + Hindi.
- Tests: friends repository contract (in-memory + PostgreSQL), PostgreSQL-only rules (constraints, cascade, concurrent create), FriendsService (9), sessions (1), web friends/invite/lobby/reducer/i18n (13). Smoke test extended by 28 checks (HTTP + WebSocket end to end).

## Reason
CLAUDE.md long-term feature: Friends.

## Database
friendships table (see migration).

## API
See "What changed".

## WebSocket
Client: INVITE_FRIEND. Server: INVITE, FRIENDS_CHANGED.

## Tests
- engine 37 + api 99 + web 54 = 190 pass; lint + build clean; smoke test passed on the real server (PostgreSQL).

## Known limitations
- No "block user" and no friend search beyond exact username.
- Invites are not stored: a friend who is offline or busy never sees them later.
- Presence and invites work on one API server only (in-memory sockets).

# RMC-0013

## Feature
Characters (avatars) and the coins shop

## Status
COMPLETE and verified on the real server + PostgreSQL.

## What changed
- shared-types: CHARACTERS catalog (DEFAULT free, CAT 10 coins, LION 100, FOX 150 lvl2, OWL 150 lvl2, ROBOT 250 lvl3, NINJA 300 lvl4, DRAGON 500 lvl5), findCharacter, ShopErrorCode; Profile.ownedCharacters / equippedCharacter; RoomPlayerView.character.
- Database: migration 003_characters.sql (accounts.equipped_character, account_characters table with cascade).
- AccountRepository: listOwnedCharacters, purchaseCharacter (atomic: row lock, ownership + coins in one transaction, coins can never go negative, already-owned checked first), equipCharacter (only owned or DEFAULT). In-memory and PostgreSQL versions share one contract test.
- AccountsService: purchaseCharacter (unknown item, DEFAULT/duplicate = ALREADY_OWNED, level check before coins, coins check), equipCharacter (NOT_OWNED), both serialized per account together with game rewards so coins never get lost. onCharacterChanged callback.
- HTTP (Bearer): POST /shop/purchase {characterId}, POST /shop/equip {characterId} -> new Profile. Errors { code, message }: 404 UNKNOWN_ITEM, 409 ALREADY_OWNED, 403 NOT_OWNED / LEVEL_TOO_LOW, 402 NOT_ENOUGH_COINS, 401 UNAUTHORIZED.
- RoomsService keeps a player -> character map (login-bound, cleared with the session); RoomView shows every player's avatar; RoomsGateway sets it on AUTHENTICATE and when a player equips a new character (live update to the room).
- web: ShopPanel (cards with price / level / owned / wearing, Buy disabled when coins or level are short), avatar shown in lobby, scoreboard and profile card, shop errors and character names in English + Hindi.
- Tests: repository contract for shop (in-memory + PostgreSQL) incl. concurrent purchases and "cannot overspend", PostgreSQL cascade, service rules (7), rooms avatars (2), web shop/avatar/translation tests (11). Smoke test +12 checks (401, 404, level 403, coins 402, NOT_OWNED, buy, coins deducted by the server, duplicate 409, equip, live avatar in the room).

## Reason
CLAUDE.md long-term features: Characters, Coins usage.

## Database
See migration 003.

## API
POST /shop/purchase, POST /shop/equip.

## WebSocket
No new events (ROOM_STATE players now include `character`).

## Tests
- engine 37 + api 118 + web 65 = 220 pass; lint + build clean; smoke test passed (real server + PostgreSQL).

## Known limitations
- Characters are emoji avatars only (no artwork/animations); no refunds/trading; prices are simple placeholders.
- Coins come only from finishing games (10, +20 for a win); no daily rewards yet.
- An avatar in a running game is not shown next to role cards, only in lobby/scoreboard/profile.

# RMC-0014

## Feature
Audio: synthesized sound effects and audio reactions with a mute button

## Status
COMPLETE (logic unit-tested; actual sound output could not be heard by Claude)

## What changed
- web/src/audio/sounds.ts: SOUNDS table (a short tune for each of the 6 reaction emojis, plus CORRECT, WRONG, WIN, INVITE) written as plain tone data, SoundPlayer (Web Audio API; does nothing when muted or when audio is unavailable; creates the AudioContext lazily and resumes it after the first user click), mute save/load helpers. No audio files and no new packages.
- web/src/audio/useSounds.ts (hook), mute button (🔊/🔇) next to the language switch, texts in English + Hindi.
- App plays: a reaction's tune when any player in the room sends it (everyone hears everyone's reactions), CORRECT/WRONG once per round result, WIN when you win, INVITE when a friend invites you. Mute choice is remembered in localStorage.
- Tests (12): every reaction has a tune, all tones are audible / under 1 second / quiet, scheduling checked against a fake AudioContext, muted = silent and no context created, mute takes effect immediately, resume of a suspended context, no crash without audio or with blocked storage, mute button labels.

## Reason
CLAUDE.md long-term feature: Audio reactions.

## Database
None.

## API
None.

## WebSocket
None (reactions already broadcast; sound is played locally from them).

## Tests
- engine 37 + api 118 + web 77 = 232 pass; lint + build clean.

## Known limitations
- Tunes are simple synthesized beeps, not recorded voices; no per-sound volume setting.
- Browsers only allow sound after the first click/tap on the page.
- Players cannot upload/record their own audio reactions.

# RMC-0015

## Feature
Real-browser UI verification (`npm run ui:check`) and small polish

## Status
COMPLETE

## What changed
- scripts/ui-check.mjs (no new package; uses Chrome's DevTools protocol over the `ws` package already installed): starts headless Chrome with a 390px mobile emulation, opens the app, checks horizontal overflow, switches to Hindi, registers an account through the API, logs in, creates a room, lets 3 bot players join, plays all 4 rounds through the real UI, checks the reward box, buys a character in the shop, takes a screenshot of every screen into ./ui-screenshots (git-ignored) and reports browser console errors. Run: `npm run ui:check` (needs the API on :3000 and the web dev server on :5173; CHROME_PATH / OUT env vars are optional).
- Verified with it: guest home, logged-in home (profile, shop, friends), lobby with avatars, round active/result, final result with rewards, shop purchase (Cat 10 coins -> 0 coins, button changes to "Wear"), Hindi text rendering, desktop width. No horizontal overflow at 390px, no console errors.
- Polish: profile stats text is now "Games: N • Wins: M" (was "1 games").
- eslint: script globals (URL, Buffer) for scripts.

## Reason
The UI had never been looked at in a real browser; this closes the biggest verification gap and leaves a repeatable check.

## Database
None (the script creates a `ui_xxxxxx` account in the dev database; delete rows named ui_* when needed).

## API
None.

## WebSocket
None.

## Tests
- engine 37 + api 118 + web 77 = 232 pass; lint + build clean; ui:check passed (all screens, 0 console errors).

## Known limitations
- ui:check does not cover the vote panel, friends panel actions or invite toast visually (they are unit-tested and smoke-tested at the protocol level).
- The script is Windows-path oriented by default (CHROME_PATH can override).
- Sound could not be heard by Claude; only its logic is tested.

# RMC-0016

## Feature
Open the app from a phone / another device on the same WiFi

## Status
COMPLETE (verified from the PC's own LAN IP; not yet tried from a real phone)

## What changed
- apps/web/vite.config.ts: server.host = '0.0.0.0' merged into the existing config (owner pasted a bare config; replacing the file would have dropped the React/Tailwind plugins and aliases).
- web: API and WebSocket default addresses now use the host the page was opened from (http://<host>:3000, ws://<host>:3000/ws) instead of localhost, so a phone talks to the PC, not to itself. VITE_API_URL / VITE_WS_URL still override.
- api: src/cors.ts. CORS now allows localhost and private-network IPs (10.x, 192.168.x, 172.16-31.x) only for the web port 5173 over http, plus anything listed in CORS_ORIGINS (comma separated). Other sites are blocked.
- Tests: cors (4). Real check: dev server and API answer on 192.168.29.109; LAN origin gets an Access-Control-Allow-Origin header, http://evil.com does not.

## Reason
Test on a real phone (mobile-responsive UI).

## Database
None.

## API
CORS policy only.

## WebSocket
No change (WebSocket has no CORS; it is open to any origin as before).

## Tests
- engine 37 + api 122 + web 77 = 236 pass; lint + build clean.

## Known limitations
- Windows Firewall may block ports 5173 and 3000 for other devices (allow them on "Private networks").
- The PC's IP can change; phone and PC must be on the same network.
- Sound and touch behaviour still need a real-phone check.

# RMC-0017

## Feature
Deployment: Dockerfile for the API (Railway) + build config for the web app (Vercel), CI workflow, guide

## Status
COMPLETE. Docker image actually built and run against real PostgreSQL + Redis containers; full smoke test (99 checks) passed inside the container. Vercel's exact build command run locally and verified. Not yet deployed to real Railway/Vercel accounts (needs the owner's login).

## What changed
- Owner decided (discussion): API on Railway, web on Vercel, GitHub for source, Redis provisioned now (not yet used by app code — that refactor is still separate/pending).
- apps/api/Dockerfile: multi-stage build for the npm-workspaces monorepo (copies the whole repo so the lockfile stays valid, `npm ci`, builds shared-types+game-engine+api, `npm prune --omit=dev`; runtime stage copies only node_modules + built dist + migrations). CMD runs `node apps/api/dist/main.js`.
- .dockerignore at repo root. Found and fixed a real bug while testing: a bare pattern like `*.tsbuildinfo` only matches at the dockerignore context ROOT (unlike .gitignore, which matches at any depth) — needs an explicit `**/` prefix for nested files. Without the fix, stale local `tsconfig.tsbuildinfo` files got copied into the image and made `tsc -b` silently skip emitting shared-types/game-engine (silent, no error — nest build then failed with "Cannot find module '@rmc/shared-types'").
- railway.json: Dockerfile builder, path apps/api/Dockerfile, healthcheck /health.
- apps/api/src/main.ts: listens on `PORT` (Railway/Render convention) falling back to `API_PORT` then 3000.
- Root package.json: build:web / build:api scripts (used by vercel.json / documented for Docker).
- vercel.json (repo root): installCommand `npm ci`, buildCommand `npm run build:web`, outputDirectory `apps/web/dist`, SPA rewrite. No dashboard "Root Directory" setting needed.
- .github/workflows/ci.yml: build+lint+test on every push/PR (Node 22). Not a deploy step — Vercel/Railway deploy via their own GitHub integration.
- .env.production.example: documents DATABASE_URL / REDIS_URL (reference the platform's plugins, don't hand-type) / CORS_ORIGINS / the tunable timing env vars.
- DEPLOYMENT.md: full step-by-step guide (GitHub push, Railway service+Postgres+Redis+env vars, Vercel import+env vars, wiring CORS_ORIGINS back, troubleshooting table).

## Reason
Owner wants to actually publish the game (Vercel account already available).

## Database
No schema change. Railway will run the existing migrations (001/002/003) automatically on first boot (DatabaseModule already does this).

## API
No route change. CORS is now checked against `CORS_ORIGINS` in addition to localhost/private-network IPs (already existed from RMC-0016); production requires setting it to the real Vercel URL.

## WebSocket
No protocol change.

## Tests
- engine 37 + api 122 + web 77 = 236 pass; lint + build clean (after the main.ts/package.json changes).
- Real Docker build (`docker build -f apps/api/Dockerfile .`) succeeded after the dockerignore fix; container run against the existing docker-compose Postgres/Redis, `/health` returned 200, CORS header present only for the allowed origin, and the full smoke test (scripts/smoke-ws.mjs, 99 checks) passed talking to the containerized API.
- `npm run build:web` run locally, produced `apps/web/dist` matching vercel.json's outputDirectory. `npm ci` at the repo root (Vercel's installCommand) verified clean.
- Smoke-test accounts created during the Docker check were deleted from the dev database afterwards.

## Known limitations
- Not yet deployed to a live Railway/Vercel account — the owner still needs to do the one-time GitHub push + dashboard connects described in DEPLOYMENT.md (login can't be automated).
- Redis is provisioned in the deployment (per owner's choice) but application code still keeps rooms/sessions/queue/auth-tokens in memory — the Redis instance sits unused until that refactor happens (tracked in PROJECT_STATUS.md).
- No custom domain, no staging environment, no secrets manager beyond the platforms' own env var storage.
- The Docker image bundles some unused runtime deps (e.g. react/react-dom end up in the pruned node_modules because they're a "dependency" of the web workspace, not a devDependency) — harmless but not minimal; could be trimmed later with a per-workspace install if it ever matters.

# RMC-0018

## Feature
Actually deployed: game is live (Render API + Vercel web)

## Status
COMPLETE and verified end-to-end on the real production URLs.

## What changed
- Owner's Railway trial had expired (needs a paid plan); owner chose Render (free tier) instead. Did the whole thing via CLI (no dashboard clicking) after two browser logins (Render CLI OAuth device flow, Vercel CLI OAuth) — both completed by the owner in their browser when prompted.
- Installed Render CLI via winget (`Render.CLI`). Created (via `render postgres create` / `render keyvalues create` / `render services create`): `rmc-postgres` (free Postgres), `rmc-redis` (free Key Value), `rmc-api` (Docker web service, region Singapore) linked to the GitHub repo.
- Found two CLI/environment gotchas while doing this and fixed them: (1) Git Bash's automatic path conversion turned a bare `/health` argument into a Windows path (`C:/Program Files/Git/health`) when passed to the Windows render.exe — worked around by sending values through JSON files instead of bare CLI args where it mattered. (2) `render services create` has no flag to set `dockerfilePath`/`dockerContext` independently of `--root-directory`, which would have broken the monorepo build context; used Render's public REST API directly (PATCH `/services/:id` with `serviceDetails.envSpecificDetails`) with the CLI's own stored API key (from `~/.render/cli.yaml`) to set `dockerfilePath: ./apps/api/Dockerfile`, `dockerContext: .`, and fix the health check path, then triggered a deploy explicitly (Render docs: PATCH does not auto-redeploy).
- Installed Vercel CLI via npx. `vercel link` created the project and auto-connected the GitHub repo (no separate step needed). Set `VITE_API_URL` / `VITE_WS_URL` (production) to the real Render URL, then `vercel --prod` deployed the web app. Vercel CLI itself added `.vercel` and `.env*` to .gitignore.
- Removed railway.json (unused now); added render.yaml as a documentation/reference Blueprint (resources were created via CLI, not by syncing this file). Rewrote DEPLOYMENT.md for what's actually live, including a clear warning that Render's free Postgres expires 30 days after creation (2026-09-26 -> renew/upgrade/migrate by ~2026-10-26).
- Updated Render's `CORS_ORIGINS` to the real Vercel URL after it was known, and triggered a second deploy for that (env var changes don't auto-redeploy either).

## Reason
Owner asked to actually deploy, not just prepare files.

## Database
Render-managed PostgreSQL (free, 1GB, expires in 30 days per Render's free-tier policy) and Key Value/Redis (free, unused by app code, same as before).

## API
Live at https://rmc-api-etep.onrender.com. No route/behavior change from RMC-0017.

## WebSocket
Live at wss://rmc-api-etep.onrender.com/ws.

## Tests
- `/health` returns 200 on the live URL; CORS header present only for the allowed Vercel origin, absent for `http://evil.com`.
- Ran scripts/smoke-ws.mjs against the live wss:// URL: room creation, full 4-round game (secrets hidden correctly, correct scores/totals), rematch, and a fresh game all passed (14 checks). Reconnect/vote checks in that same script need short grace/vote timings not to be set on a real production server, so those specific checks were skipped there — the identical code path was already fully verified (99 checks incl. voting/reconnect) against a local Docker container with real Postgres+Redis earlier in RMC-0017.
- Opened the real production web URL in headless Chrome (390px phone size): page loads, WebSocket connects (Home screen with "Quick match"/"Create a new room" shown, not stuck on "Connecting…"), zero console or network errors. Screenshot taken.
- All local secrets (API keys, DB connection strings) extracted to a local temp folder outside the repo during setup and deleted afterward; none were committed.

## Known limitations
- Render's free web service sleeps after 15 minutes of inactivity (30-60s cold start on the next request) — acceptable for a hobby project, not for real concurrent players expecting instant response after idle periods.
- Free Postgres expires in 30 days (see DEPLOYMENT.md) — this needs owner action before ~2026-10-26.
- Redis is provisioned but still unused by application code (same pending item as RMC-0012/0017).
- No custom domain; Vercel's own `.vercel.app` and Render's own `.onrender.com` subdomains are in use.
- The `dhirajsources-projects` Vercel scope and `My Workspace` Render workspace now each hold this one project; no team/environment separation (staging vs production) set up yet.

# RMC-0019

## Feature
Phase 2 kickoff: Quick play with bots, mixed human+bot rooms, quick-match queue shows names

## Status
COMPLETE for these 3 items (see DEVELOPMENT/PHASE_2_BOTS_AND_VOICE/STATUS.md — phase itself stays IN PROGRESS, more features to come: sound packs waiting on owner-supplied audio files, live WebRTC voice chat not started).

## What changed
- shared-types: `RoomPlayerView.isBot`, `ServerMessage.QUEUE_STATE` now carries `names: string[]` (not just size), new `ClientMessage`s `PLAY_WITH_BOTS`, `ADD_BOT`, `REMOVE_BOT`, new error code `BOT_NOT_FOUND`.
- game-engine: no changes — bots are just PlayerId strings to the engine, by design.
- api/rooms/rooms.service.ts: bot bookkeeping (`bots: Set<PlayerId>`, friendly random bot names, `ROBOT` avatar), `addBot`/`removeBot` (host only, LOBBY only, room not full), `playWithBots` (create room + fill to 4 + start, one call), `getBotMantriTask` (peeks the real roles server-side to find a bot Mantri + valid guess candidates), `onRoundStarted` hook, room auto-cleanup when only bots remain after a human leaves, host never becomes a bot.
- api/rooms/rooms.gateway.ts: `PLAY_WITH_BOTS`/`ADD_BOT`/`REMOVE_BOT` handlers; schedules a bot's Mantri guess after `BOT_GUESS_DELAY_MS` (default 1800ms, random Sipahi/Chor choice) whenever a round starts with a bot as Mantri.
- api/rooms/matchmaking.service.ts: `waitingNames()`; gateway's queue broadcast now includes names.
- web: Home gets a "🤖 Play with bots" button; Lobby shows a BOT tag per bot player and lets the host add an empty seat's bot or remove an existing one; QueueScreen shows who else is waiting; English + Hindi text.
- Also this session: set up `DEVELOPMENT/` phase-tracking folder (PHASE_1 archived as COMPLETE, PHASE_2 STATUS.md tracks this backlog), small CLAUDE.md addendum pointing at it.

## Reason
Owner's Phase 2 request: solo play via bots, mixed rooms, and see who's in the matchmaking queue.

## Database
None.

## API
See "What changed" for the new WebSocket messages; no HTTP changes.

## WebSocket
New client->server: `PLAY_WITH_BOTS`, `ADD_BOT`, `REMOVE_BOT`. `QUEUE_STATE` payload shape changed (added `names`).

## Tests
- engine 37 (unchanged) + api 132 (+10 new bot tests, +1 matchmaking-names test) + web 84 (+7 new bot-UI tests, +1 Home test updated) = 253 pass. Lint + build clean.
- Real bug caught and fixed by the new tests before it ever reached a real game: `addBot` never registered the bot in the internal `roomOfPlayer` lookup, so `submitGuess` on a bot's behalf failed with "not in a room" — a bot-as-Mantri round would have hung forever. Fixed in the same pass.
- Real-server smoke test (scripts/smoke-ws.mjs) extended and run end to end: solo player vs 3 bots plays a full 4-round game with zero human guesses (bot Mantri auto-guesses every time it's its turn); a host creates a room, adds 3 bots, removes one, re-adds one, and plays a full mixed human+bot game; quick-match queue reports players' names, not just a count. Two genuine race conditions in the *smoke script itself* (not app code) were found and fixed while verifying: it checked round state before waiting for the new round's data to arrive, and it forgot to send NEXT_ROUND after the final round (so the game never reached GAME_RESULT).
- Smoke-test accounts cleaned from the dev database afterward.

## Known limitations
- Bot difficulty is a single fixed behavior (uniform random guess); no easy/hard levels.
- A room with a disconnected human host and only bots left still waits out the normal reconnect grace before being cleaned up (bots don't shortcut that).
- Sound packs (item 4) and live voice chat (item 5) are not implemented — see DEVELOPMENT/PHASE_2_BOTS_AND_VOICE/STATUS.md for their status.

# RMC-0020

## Feature
Phase 2: Live voice chat (WebRTC mesh, public STUN only, per-player mute/unmute)

## Status
COMPLETE for this item (see DEVELOPMENT/PHASE_2_BOTS_AND_VOICE/STATUS.md — phase itself stays IN PROGRESS: sound packs (item 4) still waiting on owner-supplied audio files, and more features may still be added to this phase).

## What changed
- shared-types: new `ClientMessage`s `VOICE_SIGNAL` ({toPlayerId, signal}) and `VOICE_MUTE` ({muted}); new `ServerMessage`s `VOICE_SIGNAL` ({fromPlayerId, signal}) and `VOICE_MUTE` ({playerId, muted}). `signal` is an opaque WebRTC offer/answer/ICE payload — the server never inspects it.
- game-engine: no changes — voice chat has nothing to do with game rules.
- api/rooms/rooms.gateway.ts: `voiceSignal`/`voiceMute` handlers relay the payload verbatim to the target player (or the whole room for mute) only if both are in the same room — otherwise silently dropped. `MAX_MESSAGES_PER_SECOND` default raised 20 -> 40 and `MAX_PAYLOAD_BYTES` default raised 4096 -> 16384 (SDP offers/answers, especially with ICE candidates bundled, can be a few KB).
- web/src/voice/webrtc.ts (new): `VoiceRoom` class — one `RTCPeerConnection` per other human player in the room (mesh), deterministic glare-avoidance (`shouldInitiate`: the lexicographically smaller `PlayerId` always sends the offer), ICE candidates queued until the remote description is set, `PeerConnectionFactory` is dependency-injected so it's unit-testable without real WebRTC.
- web/src/voice/useVoiceChat.ts (new): React hook — asks for the mic on "Join voice chat" (default muted), keeps peer connections in sync with the room's current human+connected players, plays remote audio via hidden `<audio>` elements, exposes mic status / mute toggle / per-peer connection state.
- web/src/components/VoiceBar.tsx (new): UI — join button (with permission-denied / unsupported-browser messages), mute/unmute, list of other players with connection state and a mute icon when they're muted. Bots never appear in this list.
- web/src/net/useGameSocket.ts: added a raw-message side channel (`onRawMessage`) so `VOICE_SIGNAL`/`VOICE_MUTE` don't have to go through the shared app-state reducer (they're high-frequency and app-state shouldn't re-render on every ICE candidate).
- web/src/App.tsx: wires `useVoiceChat` and renders `<VoiceBar>` whenever the player is in a room.
- apps/api/scripts/smoke-ws.mjs: new "Voice signaling" section (same-room relay is byte-for-byte, cross-room is blocked, VOICE_MUTE broadcasts to the room); also fixed the pre-existing abuse-protection "oversized message" check (see Known limitations).

## Reason
Owner's Phase 2 request #5: players should be able to talk live, and mute/unmute themselves.

## Database
None.

## API
None (HTTP unchanged).

## WebSocket
New: `VOICE_SIGNAL` (client<->server<->client, opaque relay) and `VOICE_MUTE` (client->server, server broadcasts to room). `MAX_MESSAGES_PER_SECOND` 20->40, `MAX_PAYLOAD_BYTES` 4096->16384 (both env-overridable, unchanged defaults for everything else).

## Tests
- engine 37 (unchanged) + api 132 (unchanged — voice relay is thin enough that the existing gateway tests plus the smoke test cover it) + web 102 (+9 `voice.test.ts` unit tests against a fake `RTCPeerConnection`, +9 `voice-ui.test.tsx` for `VoiceBar`) = 271 pass. Lint + build clean.
- Real bug caught and fixed by a unit test before it ever reached a browser: `VoiceRoom.connectTo`, when called reactively after receiving an incoming offer, still sent its own offer if it happened to also be the lexicographically-smaller id — two offers crossing instead of one offer + one answer (a WebRTC "glare" bug). Fixed by always answering (never re-offering) on the reactive path.
- Real bug caught by the real-server smoke test, not the app but the test itself: raising `MAX_PAYLOAD_BYTES` to 16384 (needed for SDP) silently broke the existing "10KB message gets the connection closed" abuse-protection check, because 10KB is now under the new limit — the server no longer closes the connection, so the smoke script hung forever awaiting a `close` event that never comes. This is not a security regression (16KB per message is still a small, reasonable cap), just a stale test assumption; fixed by sending 20KB in that check (comfortably over the current limit) instead of 10KB.
- Verified for real, in three independent ways: (1) unit tests with a fully fake, dependency-injected `RTCPeerConnection` (no real network); (2) the real-server smoke test, including the new voice-signaling section and the fixed abuse-protection section, ran end to end against a locally-built, locally-running API with `SMOKE TEST PASSED` printed; (3) two real headless-Chrome browsers (`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`) opened the actual production UI, joined the same room and joined voice chat, and completed genuine ICE/DTLS negotiation with zero console errors — real WebRTC, not a mocked path.
- Smoke-test accounts cleaned from the dev database afterward (35 rows: `p1`-`p4`/`fa`/`fb`/`fc` prefixes from this round of testing).

## Known limitations
- STUN only, no TURN: players behind a strict/corporate NAT (~5-10% estimated) won't be able to connect their voice peer, per the owner's explicit free/simple choice. Text chat/game itself is unaffected.
- No push-to-talk, no volume/input-device picker, no visual "who's speaking" indicator — just join/mute/unmute.
- Voice never reconnects automatically if a peer connection drops mid-call (e.g. network blip) short of a full room re-sync (rejoining triggers `syncPeers` again); there's no dedicated ICE-restart path yet.
- Sound packs (item 4) are still not implemented — waiting on the owner's own audio files. Phase 2 is not "complete"; more features can still be added to it.


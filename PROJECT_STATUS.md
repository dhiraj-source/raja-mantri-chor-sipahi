# PROJECT STATUS

## Project
Raja Mantri Chor Sipahi

## Current Phase
See `DEVELOPMENT/` for the phase-tracking convention.
- **PHASE 1 (Foundation to Launch): COMPLETE** — `DEVELOPMENT/PHASE_1_FOUNDATION_TO_LAUNCH/STATUS.md`
- **PHASE 2 (Bots, Mixed Rooms, Voice): IN PROGRESS** — `DEVELOPMENT/PHASE_2_BOTS_AND_VOICE/STATUS.md`
- **PHASE 3 (Draw & Guess — new game mode): IN PROGRESS** — `DEVELOPMENT/PHASE_3_DRAW_AND_GUESS/STATUS.md`
- **PHASE 4 (Bomb Tag — new game mode): IN PROGRESS** — `DEVELOPMENT/PHASE_4_BOMB_TAG/STATUS.md`

## Overall Status
**LIVE**: https://raja-mantri-chor-sipahi-five.vercel.app (verified working end-to-end in a real browser, real production API) — **both Raja Mantri Chor Sipahi and the new Draw & Guess mode are live**, verified against the real production server. Also still fully playable locally (2 browser tabs = 2 players, ya smoke script).

## Completed
- RMC-0001 Memory/documentation system.
- RMC-0002 Monorepo, GameEngine (pure TS), shared-types, web + api skeleton, Docker Compose (Postgres + Redis, not yet used).
- RMC-0003 In-memory rooms + WebSocket gateway (/ws), server-authoritative flow.
- RMC-0004 Web UI: Home, Lobby, Game, Round result, Final result (mobile-first, Tailwind + Framer Motion).
- RMC-0005 Reconnection (secret session token, 60s grace, same role/room restored) + Rematch.
- RMC-0006 Emoji reactions + Quick matchmaking.
- RMC-0007 Languages: English + Hindi (server errors are codes, translated in browser).
- RMC-0008 WebSocket abuse protection (rate limit + payload limit).
- RMC-0009 Accounts (register/login), profiles, game history, XP/levels, coins, achievements. Server-computed rewards at game end.
- RMC-0010 PostgreSQL storage for accounts/history (migrations, transactions), verified on a real container incl. API restart. Docker + WSL2 now working.
- RMC-0011 Voting on disconnect: after the grace period the remaining players vote WAIT or CANCEL (majority), 30s.
- RMC-0012 Friends: requests, accept/decline, unfriend, online status, live updates, room invites (PostgreSQL migration 002).
- RMC-0013 Characters + coins shop: 8 emoji avatars, atomic purchases (migration 003), equip, avatars visible in lobby/scoreboard/profile.
- RMC-0014 Audio: synthesized sounds for reactions and game events + mute button.
- RMC-0015 Real-browser UI check (`npm run ui:check`): whole game played through the UI in headless Chrome on a 390px phone size; no overflow, no console errors.
- RMC-0016 Open the app from a phone on the same WiFi (LAN host + CORS).
- RMC-0017 Deployment setup: Dockerfile for API + Vercel build config for web + CI workflow. Real Docker build verified end-to-end (99-check smoke test passed inside the container).
- RMC-0018 **Actually deployed, live**: Render (API + free Postgres + free Redis) + Vercel (web), GitHub-connected auto-deploy on both. Verified with a real headless-Chrome visit to the production URL (connects, no console errors) and a live smoke test (4-round game, rewards) against the production WebSocket. Railway wasn't used in the end (free trial had expired) — see DEPLOYMENT.md for the live URLs and the one thing owner must act on: free Postgres expires ~2026-10-26.
- RMC-0019 **Phase 2 kickoff**: Quick play with bots (solo player), host can fill/empty room seats with bots, quick-match queue shows waiting players' names. See DEVELOPMENT/PHASE_2_BOTS_AND_VOICE/STATUS.md.
- RMC-0020 **Live voice chat**: WebRTC mesh (public STUN only), join/mute/unmute, per-peer connection status; bots never appear in the voice list. Verified with unit tests, the real-server smoke test, and two real headless-Chrome browsers completing genuine ICE/DTLS negotiation. See DEVELOPMENT/PHASE_2_BOTS_AND_VOICE/STATUS.md.
- RMC-0021 **Voice chat bugfix**: fixed a real "need to reload to connect" bug (owner-reported) caused by joining voice chat at different times — the earlier joiner's offer could be sent before the later joiner was listening and was never retried. Verified with a staggered-join headless-Chrome test that reproduces the exact reported scenario.
- RMC-0022 **PUBG/BGMI-style voice lines (item 4, part 1/2)**: spoken announcer-style lines ("Busted!", "Escaped!", "Victory!") via the browser's built-in text-to-speech on round-result/win moments — zero audio files, zero copyright risk. Animal sounds (part 2/2) not yet implemented; verified a free/CC0-safe source (Pixabay) for when the owner picks specific clips.
- RMC-0023 **Animal sounds (item 4, part 2/2) — DONE**: real CC0 audio clips (cat meow on CORRECT, dog bark on WRONG) sourced from OpenGameArt.org (license verified per file before download — Pixabay itself turned out to be Cloudflare-bot-blocked from this environment, no browser tool available here to fetch from it). `AnimalSoundPlayer` plays them via `HTMLAudioElement`, same mute/DI pattern as the other two audio players. Phase 2 item 4 is now fully DONE.
- RMC-0024 **Phase 3 kickoff — Draw & Guess, Milestone 1 (foundation)**: brand-new, fully independent pure package `packages/draw-guess-engine` (word bank, state machine `LOBBY→COUNTDOWN→CHOOSING_WORD→DRAWING→ROUND_RESULTS→GAME_RESULTS→FINISHED`, scoring, guess normalization/matching, hint-reveal masking). Zero framework deps (ESLint-enforced, like the RMCS engine), zero dependency on the RMCS engine, touches no existing file's logic. Security-critical `getPlayerView` never exposes the secret word/choices to non-drawers (test-verified via JSON serialization check). 50 new tests, all pass; full repo build + entire existing test suite re-verified passing (RMCS untouched). **Not playable yet** — no server/socket/UI wiring (that's Milestones 2-6, see DEVELOPMENT/PHASE_3_DRAW_AND_GUESS/STATUS.md).
- RMC-0025 **Phase 3 — Draw & Guess, Milestone 2 (server core) — now playable over raw WebSocket**: `packages/shared-types/src/draw-guess.ts` (full wire protocol, new `DG_*` events distinct from RMCS's) + new NestJS module `apps/api/src/draw-guess/` (own in-memory rooms, full lobby + full game loop, one text box does both chat and guessing, basic profanity filter) wired into the **existing** `/ws` gateway (no second socket). 15 new unit tests + a new real end-to-end smoke test (`scripts/smoke-dg.mjs`) against a real running server — which caught and led to fixing 2 real bugs the unit tests alone had missed (a missing package.json dependency, and a gateway broadcast bug that silently dropped `CORRECT_GUESS` messages when a turn auto-ended). Re-ran RMCS's own smoke test against the same modified gateway to confirm both modes coexist correctly — passed in full.
- RMC-0026 **Phase 3 — Draw & Guess, Milestone 3 (React UI) — now playable in a real browser**: new `apps/web/src/draw-guess/` module (mode select, home, lobby, full game screen with a real `<canvas>` — pointer-event drawing, batched/throttled stroke sync, incremental remote-stroke painting, real flood fill — toolbar, chat/guess panel, scoreboard, round/final results). One shared WebSocket carries both game modes. **Verified with a real headless-Chrome run** (`scripts/ui-check-dg.mjs`) that played a complete turn end-to-end including an actual mouse-drawn canvas stroke via Chrome DevTools Protocol, a direct wire-payload check that guessers never receive the real word, correct/incorrect guessing, and the round-results screen — which caught and fixed 2 real bugs invisible to unit tests (a hardcoded app title, and a chat panel that never showed system messages because only one of several message-producing actions ever broadcast them). 15 new unit tests; 337 tests total across the whole repo, all passing.
- RMC-0027 **Phase 3 — Draw & Guess, Milestone 4 part 1/2: reconnection hardening**: host disconnecting (not just leaving) now transfers host immediately to another connected player; a disconnected player who doesn't reconnect within the grace period is auto-removed (same `RECONNECT_GRACE_MS` env var RMCS uses). Deliberately simpler than RMCS's vote-to-cancel system — reasoned to be sufficient for this mode's fast turn rotation, documented as intentional. 3 new unit tests + a real end-to-end smoke-test scenario (genuine WebSocket disconnects, not just LEAVE messages) run twice to confirm it isn't flaky; RMCS's own smoke test re-verified passing on the same server. 340 tests total.
- RMC-0028 **Phase 3 — Draw & Guess, Milestone 4 part 2/2: i18n (English + Hindi)**: ~60 new `dg.*` translation keys, real Hindi (not copies), every Draw & Guess component now renders through `t()` — no hardcoded strings left. `hi`'s `Record<MessageKey, string>` type makes TypeScript itself refuse to compile if a key is ever missing from either language. **Verified in a real browser**: switched language to Hindi via headless Chrome, confirmed every visible Draw & Guess string rendered correctly (screenshot + direct text read), no layout breakage, no console errors; re-ran the full English UI check to confirm nothing regressed.
- RMC-0029 **Deployed Phase 3 to production**: the first deploy attempt crashed Render (`Dockerfile` never copied the new `draw-guess-engine` package into the runtime image — Render safely kept the old version live instead of taking the site down). Fixed the Dockerfile, then verified with a real local Docker build+run+full-smoke-test before pushing again. Also fixed a genuine flaky race and a hang in `smoke-dg.mjs` found while doing this. **Draw & Guess is now confirmed live in production** — both the web (Vercel) and API (Render) respond, and the full smoke test passes against the real deployed server.
- RMC-0030 **Phase 4 kickoff — Bomb Tag, Milestone 1 (foundation)**: brand-new pure package `packages/bomb-tag-engine` (movement/geometry, collision/tag detection, bomb state machine `COUNTDOWN→PLAYING→ROUND_OVER→GAME_OVER`, scoring) + full wire protocol in shared-types. 39 new tests, all pass. Not playable yet (no server/UI wiring).
- RMC-0031 **Phase 4 — Bomb Tag, Milestone 2 (server core) — now playable over raw WebSocket**: NestJS module + the project's **first continuous tick loop** (one global 20Hz timer driving every active room's movement/bomb simulation), wired into the same shared `/ws` gateway (no second socket). Disconnect handling deliberately has no grace period (unlike RMCS/DG) since the bomb timer is only ~15s. **Live-server smoke testing (`scripts/smoke-bt.mjs`) caught 2 real bugs invisible to unit tests alone**: (1) a round ending via disconnect/leave never told the gateway to schedule the next round (state was right, but the match silently stalled forever); (2) a player who fully left or stayed disconnected would come back as an uncontrollable "ghost" every subsequent round (engine's fixed roster revives everyone alive each round; service now re-forfeits anyone gone/still-disconnected right after). Both fixed and re-verified against a real running server, including a same-token reconnect scenario. 20 new unit tests + full existing suite (425 tests total) all pass.
- RMC-0032 **Phase 4 — Bomb Tag, Milestone 3 (React UI) — now playable in a real browser**: new `apps/web/src/bomb-tag/` module (mode-select entry, home, lobby, full game screen covering all 4 engine phases, canvas arena renderer, WASD/arrow-key movement input, scoreboard) — same conventions as Draw & Guess's UI module. i18n (English + Hindi) done early too (was planned for Milestone 4). **Verified with real headless Chrome including actual keyboard input via Chrome DevTools Protocol** (not a synthetic DOM event) — confirmed the player's on-screen position genuinely changed. 11 new unit tests + full existing suite (436 tests total) all pass, no console errors, no layout overflow in English or Hindi.
- RMC-0033 **Phase 4 — Bomb Tag, Milestone 4 (mobile virtual joystick)**: on-screen draggable joystick (Pointer Events, shown only on touch-capable devices), sends the same `BT_INPUT` event the keyboard already uses. Reconnection hardening and i18n (also originally scoped for this milestone) were already done in Milestones 2/3, so this closed out the milestone. **Verified with real headless Chrome** — needed an extra `Emulation.setTouchEmulationEnabled` CDP call beyond mobile-viewport emulation to make the touch-detection testable (a test-harness gap, not a product one). 4 new unit tests + full existing suite (440 tests total) all pass.

## In Progress
- **Phase 4 (Bomb Tag)**: Milestone 5 next — polish (animations/effects, audio hooks, accessibility pass), then deploy.

## Pending
- **Act before ~2026-10-26**: Render's free PostgreSQL (`rmc-postgres`) expires 30 days after creation (created 2026-09-26). Owner said they will handle this themselves.
- **Phase 3 (Draw & Guess)**: Milestones 1-3 done (pure engine + full server core + React UI) — **playable end-to-end in a real browser now, in English or Hindi**, verified with headless Chrome. Milestone 4 partial (reconnection hardening + i18n done; spectators/private rooms still open). Milestone 5 remaining: accessibility pass, voice chat integration. See DEVELOPMENT/PHASE_3_DRAW_AND_GUESS/STATUS.md.
- **Phase 4 (Bomb Tag)**: Milestones 1-4 done (pure engine + server core + React UI + mobile joystick) — **playable end-to-end in a real browser now, on desktop (keyboard) or mobile (joystick), in English or Hindi**. Milestone 5 (polish) not started. Not yet deployed. See DEVELOPMENT/PHASE_4_BOMB_TAG/STATUS.md.

## Planned
- Redis for rooms / queue / reconnect sessions / auth tokens / presence (container runs but is unused). Deliberately NOT started: it is a big refactor (async token store, serializable room + GameState storage, cross-server WebSocket broadcast) that only matters for restarts or running more than one API server. Login tokens and rooms are lost on an API restart until then.
- Polish: visual check of vote panel / friends / invite toast in a real browser, accessibility review (keyboard, screen reader), real-phone testing, deployment setup (HTTPS/wss, real secrets, per-IP limits), first git commit

## Current Stack
Frontend: React 18 + TypeScript + Vite 5 + Tailwind CSS 4 + Framer Motion 11
Backend: Node.js 22 + NestJS 10 + TypeScript + @nestjs/websockets + platform-ws (plain ws)
Database: PostgreSQL 16 (Docker) via pg — accounts, game_history; migrations in apps/api/migrations
Run locally (3 terminals, folder D:\ANJALI\GAME): `npm run db:up` (once, Docker Desktop must be running), `npm run dev:api`, `npm run dev:web` -> http://localhost:5173 (open two tabs = two players, or one tab + "Play with bots" for solo). Full UI check: `npm run ui:check` (with the API and web dev server running). Phone on the same WiFi: open http://<PC-IP>:5173 (RMC-0016); allow ports 5173 and 3000 in Windows Firewall (Private networks).
Realtime: WebSocket (path /ws)
Temporary state: in API memory (Redis 7 in Docker, NOT used yet)
Tests: Vitest (engine 37, draw-guess-engine 50 (RMC-0024), bomb-tag-engine 39 (RMC-0030), api 170 incl. real-PostgreSQL/cors/bot/draw-guess/bomb-tag tests (RMC-0025/0027/0031), web 144 incl. voice/voice-line/animal-sound/draw-guess/bomb-tag tests (RMC-0026/0032/0033) = 440 total). Plus real-server smoke tests: `npm run smoke -w @rmc/api` (RMCS), `npm run smoke:dg -w @rmc/api` (Draw & Guess), `npm run smoke:bt -w @rmc/api` (Bomb Tag). Plus real-headless-Chrome UI checks: `npm run ui:check` (RMCS), `node scripts/ui-check-dg.mjs` (Draw & Guess), `node scripts/ui-check-bt.mjs` (Bomb Tag).
Deployment: LIVE at https://raja-mantri-chor-sipahi-five.vercel.app (web, Vercel) + https://rmc-api-etep.onrender.com (API, Render). apps/api/Dockerfile + render.yaml (reference) + vercel.json + .github/workflows/ci.yml — see DEPLOYMENT.md. Local smoke test: run the API with `RECONNECT_GRACE_MS=1500 VOTE_DURATION_MS=1500`, then `npm run smoke -w @rmc/api`.
Lint: ESLint 9 + typescript-eslint

## Game Roles
Raja, Mantri, Sipahi, Chor

## Game Rules Implemented (assumed defaults; owner ne confirm kiya "ok proceed")
- 4 players, 4 rounds (configurable).
- Points: Raja 1000, Mantri 800, Sipahi 500, Chor 0.
- Mantri Chor sahi pakde: sab ko role ke points. Galat pakde: Mantri 0, Chor ko 800.
- Mantri sirf Sipahi/Chor me se guess kar sakta hai.

## Known Bugs
None known. UI was checked in a real headless Chrome (390px phone + desktop); vote panel / friends actions / invite toast were not checked visually.

## Technical Debt
- Login auth tokens (7 days) are in API memory: after an API restart users log in again (accounts/history are safe in PostgreSQL).
- Reward farming with multiple own accounts is possible; passwords only, no email/reset.
- Rooms/sessions/queue live in API memory: restart = sab gaya; ek hi server.
- Guest identity only; refresh with same tab keeps player via token, new tab/browser = new player.
- Game freezes while the Mantri is disconnected until grace (60s) + vote (30s) decide; a disconnected human's seat is never auto-replaced by a bot mid-game (bots, RMC-0019, only fill empty seats before a game starts). A cancelled game gives no XP.
- Bot difficulty is a single fixed random-guess behavior; no difficulty levels.
- WebSocket limits are per connection only (40 msgs/s, 16KB — raised from 20/4KB for voice signaling); no per-IP limits yet (deploy time).
- Voice chat is STUN-only (no TURN): players behind a strict/corporate NAT (~5-10% estimated) can't connect their voice peer. No push-to-talk, no speaking indicator, no automatic ICE restart if a peer connection drops mid-call (RMC-0021 fixed the "need a reload to connect" case specifically; a connection that fails for some other reason, like a network blip, still isn't auto-retried).
- npm audit warnings (old majors: NestJS 10, Vite 5, Vitest 2). Do NOT run `audit fix --force`.
- Smoke test creates accounts in the dev database on every run (delete rows named p1_..p4_*, fa_*, fb_*, fc_* when needed).
- Editing files with non-ASCII text (emoji/Hindi) must be done with the Edit tool, not PowerShell Get-Content/Set-Content (it corrupts the encoding).
- Web/Vitest alias shared-types to source because shared-types builds as CommonJS.
- (was: no commit yet — fixed, see Pending above for the push/deploy steps still left)

## Last Change
RMC-0033 — Phase 4 (Bomb Tag) Milestone 4: mobile virtual-joystick controls — verified with real CDP pointer-drag input; Milestones 1-4 of Phase 4 all done

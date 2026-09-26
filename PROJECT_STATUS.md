# PROJECT STATUS

## Project
Raja Mantri Chor Sipahi

## Current Phase
See `DEVELOPMENT/` for the phase-tracking convention.
- **PHASE 1 (Foundation to Launch): COMPLETE** — `DEVELOPMENT/PHASE_1_FOUNDATION_TO_LAUNCH/STATUS.md`
- **PHASE 2 (Bots, Mixed Rooms, Voice): IN PROGRESS** — `DEVELOPMENT/PHASE_2_BOTS_AND_VOICE/STATUS.md`

## Overall Status
**LIVE**: https://raja-mantri-chor-sipahi-five.vercel.app (verified working end-to-end in a real browser, real production API). Also still fully playable locally (2 browser tabs = 2 players, ya smoke script).

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

## In Progress
- Kuch nahi.

## Pending
- **Act before ~2026-10-26**: Render's free PostgreSQL (`rmc-postgres`) expires 30 days after creation (created 2026-09-26). Upgrade the plan, or migrate to a new free database, before then — see DEPLOYMENT.md.

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
Tests: Vitest (engine 37, api 132 incl. real-PostgreSQL, cors and bot tests, web 108 incl. voice and voice-line tests = 277).
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
RMC-0022 — PUBG/BGMI-style spoken voice lines via text-to-speech (Phase 2, item 4 part 1/2)

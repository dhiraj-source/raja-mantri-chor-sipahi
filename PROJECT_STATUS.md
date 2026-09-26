# PROJECT STATUS

## Project
Raja Mantri Chor Sipahi

## Current Phase
PHASES 1–4 done (Foundation, Rooms, Core game, Reconnection) + parts of Social/Languages that need no database.
Next big block = accounts + database (needs Docker/PostgreSQL running).

## Overall Status
Game poora khelne layak hai (2 browser tabs = 2 players, ya smoke script). Database wale features baaki hain.

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
- RMC-0017 Deployment setup: Dockerfile for API (Railway) + Vercel build config for web + CI workflow + DEPLOYMENT.md. Real Docker build verified end-to-end (99-check smoke test passed inside the container). Not yet deployed to a live account — see DEPLOYMENT.md for the owner's one-time steps.

## In Progress
- Kuch nahi.

## Pending (owner asked to skip for now)
- First git commit (repo is initialised, nothing committed; work exists only on disk). Now required as Step 1 of DEPLOYMENT.md, so this will happen as soon as the owner starts deploying.
- Actually deploying to Railway/Vercel (files are ready and Docker-build-verified; the login/connect steps in DEPLOYMENT.md are the owner's to do).

## Planned
- Redis for rooms / queue / reconnect sessions / auth tokens / presence (container runs but is unused). Deliberately NOT started: it is a big refactor (async token store, serializable room + GameState storage, cross-server WebSocket broadcast) that only matters for restarts or running more than one API server. Login tokens and rooms are lost on an API restart until then.
- Polish: visual check of vote panel / friends / invite toast in a real browser, accessibility review (keyboard, screen reader), real-phone testing, deployment setup (HTTPS/wss, real secrets, per-IP limits), first git commit

## Current Stack
Frontend: React 18 + TypeScript + Vite 5 + Tailwind CSS 4 + Framer Motion 11
Backend: Node.js 22 + NestJS 10 + TypeScript + @nestjs/websockets + platform-ws (plain ws)
Database: PostgreSQL 16 (Docker) via pg — accounts, game_history; migrations in apps/api/migrations
Run locally (3 terminals, folder D:\ANJALI\GAME): `npm run db:up` (once, Docker Desktop must be running), `npm run dev:api`, `npm run dev:web` -> http://localhost:5173 (open two tabs = two players). Full UI check: `npm run ui:check` (with the API and web dev server running). Phone on the same WiFi: open http://<PC-IP>:5173 (RMC-0016); allow ports 5173 and 3000 in Windows Firewall (Private networks).
Realtime: WebSocket (path /ws)
Temporary state: in API memory (Redis 7 in Docker, NOT used yet)
Tests: Vitest (engine 37, api 122 incl. real-PostgreSQL and cors tests, web 77 = 236).
Deployment: apps/api/Dockerfile (Railway) + vercel.json (Vercel) + .github/workflows/ci.yml — see DEPLOYMENT.md. Smoke test: run the API with `RECONNECT_GRACE_MS=1500 VOTE_DURATION_MS=1500`, then `npm run smoke -w @rmc/api`. + WebSocket smoke test (npm run smoke -w @rmc/api)
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
- Game freezes while the Mantri is disconnected until grace (60s) + vote (30s) decide; no skip/bot replacement. A cancelled game gives no XP.
- WebSocket limits are per connection only (20 msgs/s, 4KB); no per-IP limits yet (deploy time).
- npm audit warnings (old majors: NestJS 10, Vite 5, Vitest 2). Do NOT run `audit fix --force`.
- Smoke test creates accounts in the dev database on every run (delete rows named p1_..p4_*, fa_*, fb_*, fc_* when needed).
- Editing files with non-ASCII text (emoji/Hindi) must be done with the Edit tool, not PowerShell Get-Content/Set-Content (it corrupts the encoding).
- Web/Vitest alias shared-types to source because shared-types builds as CommonJS.
- No commit yet in git.

## Last Change
RMC-0017 — Deployment setup (Railway + Vercel), Docker-build-verified

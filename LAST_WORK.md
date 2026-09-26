# LAST WORK

## Latest (DEPLOYMENT.md Step 1 complete)
Owner said "ok proceed" (deploy). Committed everything (2 commits: full game, then a small memory-file update) after checking for secrets. Owner created the empty GitHub repo (`dhiraj-source/raja-mantri-chor-sipahi`) via the browser link given. `git remote add origin` + `git push -u origin main` failed once with a stale cached GitHub credential ("Invalid username or token"); cleared it with `git credential reject` and the retry succeeded (this second attempt is what actually prompted the owner's real GitHub auth). Verified: `git ls-remote origin main` hash matches local HEAD exactly, and the GitHub API shows the repo with `default_branch: main` and a recent `pushed_at`.
Also cleaned up 3 leftover smoke-test accounts (fa_/fb_/fc_) in the dev DB from the earlier Docker verification session (owner's own real accounts dhiraj/anjali/dkumar/athakur/tuntun were left alone).

## Next
DEPLOYMENT.md Steps 2-4: Railway (new project from the now-pushed GitHub repo, Dockerfile builder pointed at apps/api/Dockerfile, add Postgres + Redis plugins, set DATABASE_URL/REDIS_URL/CORS_ORIGINS), then Vercel (import same repo, vercel.json handles the build, set VITE_API_URL/VITE_WS_URL to the Railway URL), then update CORS_ORIGINS on Railway with the real Vercel URL. All owner's-login steps; ask them to go through DEPLOYMENT.md and report back the Railway URL once generated.

## Before that (RMC-0017)
Owner asked for a deployment file, but first wanted to discuss 5 questions (Docker? Vercel free plan? GitHub/Bitbucket? containers? auto-deploy/MCP?). Discussed each in Hinglish, flagged the key blocker myself: Vercel is serverless and cannot run our WebSocket + in-memory-state API, so it can only host the web frontend. Asked the owner 3 real decisions via AskUserQuestion: API host, git host, whether to provision Redis now. Answers: Railway (API), GitHub, provision Redis now.

Built: apps/api/Dockerfile (multi-stage, monorepo-aware), railway.json, root vercel.json (build:web script), .github/workflows/ci.yml, .env.production.example, DEPLOYMENT.md (full step-by-step in Hinglish incl. troubleshooting table). Updated apps/api/src/main.ts to listen on Railway's PORT env var.

**Actually verified, not just written:**
- Built the real Docker image (`docker build -f apps/api/Dockerfile .`). Found and fixed a genuine bug during this: `.dockerignore` patterns without a leading `**/` only match at the context root (unlike .gitignore's any-depth default) — stale local `*.tsbuildinfo` files were leaking into the image and making `tsc -b` silently no-op, so `nest build` failed with "Cannot find module '@rmc/shared-types'". Fixed with `**/*.tsbuildinfo` etc.
- Ran the built image against the project's real docker-compose Postgres + Redis containers: migrations ran automatically, `/health` returned 200, CORS header correctly present/absent for allowed/disallowed origins, and the full smoke test (scripts/smoke-ws.mjs, 99 checks) passed talking to the containerized API.
- Ran `npm run build:web` (Vercel's exact build command) and confirmed `apps/web/dist` matches vercel.json's outputDirectory. Confirmed `npm ci` (Vercel's install command) works cleanly on the lockfile.
- Cleaned up: stopped/removed the test container and image, deleted the smoke-test accounts from the dev database.
- 236 unit tests + lint + build still pass after the main.ts/package.json changes.

## Current phase
All CLAUDE.md long-term feature items are implemented (as of RMC-0015). RMC-0016/0017 are infra (LAN access, deployment), not gameplay features.

## Blocked on the owner (cannot be automated)
DEPLOYMENT.md Steps 1–4: create the GitHub repo and push (exact commands given), then log into Railway and Vercel (OAuth/browser login) and connect the repo + set a few env vars (exact values given, including how to reference Railway's Postgres/Redis plugins). No MCP/CLI available here for Railway or Vercel, and GitHub's `gh` CLI isn't installed in this environment either — the owner runs these themselves following the guide.

## Next step
Once the owner has deployed (or if they want to skip that for now), remaining backlog: Redis actually wired into rooms/sessions/queue/tokens (currently just provisioned, unused), accessibility review, real-phone check, visual check of vote/friends/invite screens in a real browser.

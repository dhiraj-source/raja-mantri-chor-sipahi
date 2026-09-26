# LAST WORK

## Latest (RMC-0018 — deployed live)
Owner said "i connect the railway with my github, can't you do that" — took that as a green light to drive the whole deployment via CLI instead of asking them to click through dashboards.

- Found and used the Railway CLI (`npx @railway/cli`), logged in via its browser OAuth flow (owner completed it) — but `railway init` failed: **their free trial had expired**, needs a paid plan. This is a real billing decision, so I stopped and asked; owner chose **Render** (free tier) over Railway (pay) or Fly.io.
- Checked Render's actual current free-tier terms via web search/fetch before committing to it (important: free Postgres auto-deletes 30+14 days after creation — documented clearly for the owner).
- Installed Render CLI via `winget`, logged in via its browser device-code flow (owner completed it). Created via CLI: `rmc-postgres` (free Postgres), `rmc-redis` (free Key Value), `rmc-api` (Docker web service from the GitHub repo).
- Hit two real bugs and fixed them: Git Bash mangled a bare `/health` CLI argument into a Windows path; and the CLI has no flag to set the Dockerfile path independently from the build root, which would have broken the monorepo build — worked around by calling Render's REST API directly (using the CLI's own stored token) to PATCH `serviceDetails.envSpecificDetails` correctly, then triggering a deploy (PATCH alone doesn't redeploy).
- Installed Vercel CLI via npx, logged in (owner completed browser auth), `vercel link` (auto-connected GitHub too), set `VITE_API_URL`/`VITE_WS_URL` to the Render URL, `vercel --prod` to deploy.
- Wired CORS_ORIGINS on Render to the real Vercel URL once known, redeployed.
- Verified for real: `/health` 200 + correct CORS on the live Render URL; full 4-round game smoke-tested over the live `wss://` URL; **opened the actual production web URL in headless Chrome** — connects cleanly, zero console errors, screenshot taken.
- Cleaned up all locally-extracted secrets (API keys, DB connection strings were in a temp folder outside the repo, deleted after use; nothing went into git).
- Removed the now-unused railway.json, added render.yaml (documentation/reference — resources were made via CLI, not by syncing this file), rewrote DEPLOYMENT.md for what's actually live.

## LIVE URLs
- Web: https://raja-mantri-chor-sipahi-five.vercel.app
- API: https://rmc-api-etep.onrender.com
- GitHub: https://github.com/dhiraj-source/raja-mantri-chor-sipahi (main; Vercel + Render both auto-deploy on push)

## Important: owner must act by ~2026-10-26
Render's free PostgreSQL expires 30 days after creation (created 2026-09-26). See DEPLOYMENT.md for the options (upgrade / recreate / migrate).

## Current phase
Every long-term feature in CLAUDE.md is implemented AND the game is live. Remaining backlog is polish/infra, not features: Redis actually wired into rooms/sessions (still just provisioned), accessibility review, real-phone check, visual check of vote/friends/invite screens, and the looming free-Postgres-expiry decision above.

## Next step
Whatever the owner wants next — could be: decide the Postgres plan before it expires, real-phone testing on the live URL, or a new feature. Nothing is blocking; ask the owner.

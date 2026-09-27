# LAST WORK

## Latest (RMC-0034/0035 — Phase 4 (Bomb Tag) Milestone 5 + deployed to production)

Owner said "PROCEED" (continuing autonomously), then after Milestones 3-4 were reported done,
said "each everything complete krke deploy krdo" (finish everything and deploy). This session did
both: finished Milestone 5 (polish), then deployed all of Phase 4 and verified it live.

### Milestone 5 (RMC-0034) — polish
- **Audio**: 3 new sounds (`BT_TAG`, `BT_EXPLODE`, `BT_ROUND_WIN`) + reused the existing `WIN`
  sound (and its "Victory!" voice-line) for match-win. Since the server never sends discrete
  events over the wire for this mode (only continuous snapshots — a deliberate Milestone-1
  design choice), `btClientState.ts` now diffs consecutive `BombTagGameView` snapshots
  (`diffGameEvents`) to derive `TAG`/`EXPLODE`/`ROUND_WIN`/`MATCH_WIN` events client-side.
- **Visual**: a small transient banner ("💣 You have the bomb!" / "💀 Eliminated!") shown only to
  the affected player.
- **Accessibility**: an `aria-live="polite"` status region narrating a short status line, since
  the arena canvas has no inherent screen-reader content.
- 8 new unit tests for the event-diffing logic (the tricky part — correctly distinguishing a real
  bomb hand-change from a round-start assignment, etc.).

### Deploy (RMC-0034 continued + RMC-0035)
- **Found and fixed the Dockerfile gap before pushing**, not after a crash this time:
  `apps/api/Dockerfile` was still missing the `COPY --from=build` pair for
  `packages/bomb-tag-engine` — the exact same shape as the RMC-0029 incident. Fixed, then
  verified for real: built the actual production image locally, ran it as a container, and ran
  **all three game modes'** smoke tests against that container — all passed.
- Committed all of Phase 4 (58 files, RMC-0030 through RMC-0034) in one commit, pushed. Both
  Render and Vercel auto-deployed; watched both through to completion via their CLIs.
- **Verified against the real live production server, not just deploy status**: ran all three
  game modes' full smoke-test suites directly against `wss://rmc-api-etep.onrender.com/ws`.
- **This surfaced 3 more real, pre-existing Render infrastructure characteristics** (confirmed
  none are Bomb Tag bugs by first reproducing the exact same code passing cleanly and near-
  instantly against local Docker):
  1. A client-initiated WebSocket close (or the server's own abuse-protection `terminate()`)
     takes **~10-20 seconds** to propagate through Render's reverse proxy to the *other* party —
     near-instant locally. Any check waiting for one client to notice another's disconnect needed
     a much longer timeout for production.
  2. The close code for oversized-payload/rate-limit protection is Render's own proxy-level
     `1006` in production, not the application's clean `1009` — protection works either way, code
     just differs.
  3. Two independent WebSocket clients' messages have no guaranteed relative arrival order at the
     server (confirmed `MatchmakingService.join()` itself is correctly order-faithful; the test's
     assumption about network delivery order was the actual bug).
- Fixed `apps/api/scripts/smoke-ws.mjs` accordingly: longer justified timeouts (each with a
  comment recording the measured real delay), accepted both close codes, order-independent queue
  check, and a `SKIP_GRACE_CHECK` path (matching the existing `smoke-dg.mjs` precedent) for the
  vote-flow sections that need production's real 60s grace period. Verified this fix twice: full
  pass against local Docker with short timers (confirming no regression), full pass against
  production with the skip flag.
- **Final confirmation**: web (Vercel) and API `/health` (Render) both return 200; all three game
  modes' smoke-test suites pass cleanly against the real production server.

**All 5 milestones of Phase 4 are complete. Bomb Tag is now live in production**, alongside RMCS
and Draw & Guess — not just "should be," confirmed by actually exercising it against the real
deployed server, the same standard this project has held to for every prior deploy.

## RMC-0033 / RMC-0032 / RMC-0031 / RMC-0030 (earlier — Phase 4 Milestones 1-4)
See CHANGELOG.md for full detail. Not repeated here.

## Current phase
- **PHASE 2**: checklist fully DONE. Owner's standing instruction: still open, no new items queued.
- **PHASE 3** (Draw & Guess): Milestones 1-4 done and deployed to production. Milestone 5 not
  started (accessibility pass, voice chat integration).
- **PHASE 4** (Bomb Tag): **fully COMPLETE and deployed.** All 5 milestones done, live in
  production, verified end-to-end (real browser, real keyboard/joystick input, real production
  smoke tests). See `DEVELOPMENT/PHASE_4_BOMB_TAG/STATUS.md` for the full history.

## Next step
No specific instruction yet — Phase 4 was the active work and it's now fully done and deployed.
Reasonable options for whenever the owner gives direction:
1. Finish Draw & Guess's own remaining Milestone 5 items (accessibility pass, voice chat
   integration) — the one other mode with an open milestone.
2. A new Phase 5 / fourth game mode, if the owner has something in mind.
3. General polish/maintenance across all three modes (e.g., addressing any of the now-documented
   Render networking quirks at the *application* level if they ever affect real users, not just
   test scripts — though there's no evidence yet that they do; disconnect-detection being ~10-20s
   slower in production than local dev is a minor UX nicety-to-investigate, not a bug).

No blockers. Separately, still open (owner handling it themselves): Render's free PostgreSQL
expires ~2026-10-26.

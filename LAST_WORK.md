# LAST WORK

## Latest (RMC-0029 — Phase 3 (Draw & Guess) deployed to production)
Owner said to deploy before continuing further work. Committed RMC-0024 through RMC-0028 (all
of Phase 3 built so far) in one commit and pushed — this triggered Vercel and Render's usual
auto-deploy.

**Render's deploy crashed**: `Error: Cannot find module '@rmc/draw-guess-engine'` at container
startup. `apps/api/Dockerfile`'s multi-stage build copies each internal package's `package.json`
+ built `dist/` into the runtime image one by one (to keep the image slim) — the two existing
packages had their `COPY` lines, but nobody had added one for the new `draw-guess-engine`
package when it was created. The build stage succeeded (it has the whole repo checked out);
only the slim runtime stage was missing the package. **Render handled this safely on its own**:
it detected the crash and kept serving the previous (RMC-0023) deployment instead of taking the
site down — there was no actual downtime, just a failed deploy that didn't take effect.

**Fixed and verified properly, not just re-pushed and hoped:**
- Added the two missing `COPY --from=build` lines for `packages/draw-guess-engine`.
- Started Docker Desktop, built the actual production image locally
  (`docker build -f apps/api/Dockerfile .`), ran the container, confirmed clean startup, then ran
  the full `smoke-dg.mjs` suite against the running container — all passed.
- Committed, pushed, and watched both Vercel and Render's new deploys through to completion
  (using their respective CLIs) rather than assuming success from the push alone.
- Ran the full smoke test against the **real live production server** afterward — this caught a
  genuine pre-existing flakiness in the test script itself (a race between the drawer's and
  guesser's independent WebSocket message streams, more likely to show up over real network
  latency than on localhost) and a script that hung instead of exiting after finishing. Fixed
  both, pushed again, and did one final full verification pass: live web (200), live API health
  (200), and the complete smoke test against the live server (all checks pass, clean exit).

**Draw & Guess is now genuinely live in production**, not just "should be" — confirmed by
actually exercising it against the real deployed server, the same standard this project has
held to throughout (see the memory note on the verification escalation ladder).

## RMC-0028 / 0027 / 0026 / 0025 / 0024 (same session, earlier — building Phase 3)
i18n, reconnection hardening, React UI, server core, pure engine foundation, in that order
building backward. See CHANGELOG.md for full per-milestone detail.

## Current phase
- **PHASE 2**: checklist fully DONE. Owner's standing instruction: still open, no new items queued.
- **PHASE 3** (Draw & Guess): Milestones 1-4 done and **deployed to production**. Milestone 5 not
  started (accessibility pass, voice chat integration). Spectators and private rooms are open
  enhancements beyond the original spec's Definition of Done, not gaps in it. See
  `DEVELOPMENT/PHASE_3_DRAW_AND_GUESS/STATUS.md` for the full checklist.

## Next step
Owner said to deploy first, then continue — deploy is done and verified live. Waiting on the
owner for direction on what's next: more Draw & Guess polish (spectators, private rooms,
accessibility pass, voice chat), or something else entirely. No blockers.

One lesson worth remembering for next time a new internal package is added to this monorepo:
`apps/api/Dockerfile`'s runtime stage needs an explicit `COPY` pair for it — there's no
compile-time check that catches a missed one, only an actual container run does (which is why
this is now a standard step before pushing a deploy that adds a new `@rmc/*` package).

Separately, still open (owner handling it themselves): Render's free PostgreSQL expires
~2026-10-26.

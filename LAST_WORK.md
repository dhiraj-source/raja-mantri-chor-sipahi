# LAST WORK

## Latest (RMC-0023 — sound packs part 2/2: animal sounds — DONE, Phase 2 item 4 complete)
Owner said to just complete the feature myself instead of waiting for them to pick/send clips.
Pixabay (the source verified earlier in RMC-0022) turned out to be Cloudflare bot-protected —
direct download from this environment (no browser tool available here) was blocked (403).
Found and used **OpenGameArt.org** instead — reachable directly, and checked each file's
license tag on its page before downloading (not assumed): "Dog barking mono" (CC0) and
"Kitten Mew" (CC0, single license). Both are real WAV files, verified by inspecting the RIFF/
WAVE header after download, not just trusting the file extension.

**Built:**
- `apps/web/public/audio/dog-bark.wav` (176KB) + `cat-meow.wav` (98KB) — real recorded clips.
- `apps/web/src/audio/sounds.ts`: `ANIMAL_SOUNDS` map (`CORRECT: cat-meow` — cat "catches" the
  Chor, `WRONG: dog-bark` — dog barks as the Chor gets away) + `AnimalSoundPlayer` — same
  dependency-injected, mute-gated shape as `SoundPlayer`/`VoiceLinePlayer` (an `AudioElementLike`
  interface real `HTMLAudioElement` matches, tests fake it). Caches one `Audio` object per file
  (no re-creating on every play), volume 0.5, silently no-ops on any error (muted, unsupported,
  play() rejected by the browser) so the game never breaks over audio.
- `apps/web/src/audio/useSounds.ts`: `play(name)` now also plays the animal sound if one exists,
  alongside the existing tone + voice line — same single mute toggle controls all three.
- 6 new unit tests (plays only for mapped names, correct volume, muted = silent + no Audio
  created, cached per src, never throws on null/error/rejected-play, every ANIMAL_SOUNDS path
  matches a real audio file pattern). 283 tests total now (37 engine + 132 api + 114 web).
  Build clean, lint clean.
- Verified at runtime (not just build output): started the Vite dev server and curled both
  `/audio/*.wav` URLs — both 200 OK, correct `Content-Type: audio/wav`, correct byte sizes.
  Did NOT run the full real-headless-Chrome `ui:check` for this increment (needs Docker+
  Postgres+API up too) — the new code follows the exact same try/catch-everything pattern as
  the tone/voice-line players already verified that way in RMC-0014/0022, so this was judged
  proportionate; owner can run `npm run ui:check` (or just play the game) to actually hear it.

**Phase 2 item 4 (sound packs) is now fully DONE** — see
DEVELOPMENT/PHASE_2_BOTS_AND_VOICE/STATUS.md.

## RMC-0022 (same session, before this — voice lines)
PUBG/BGMI-style spoken lines ("Busted!"/"Escaped!"/"Victory!") via the browser's own
text-to-speech on round-result/win moments. 277 tests at the time. See CHANGELOG.md for detail.

## Current phase
PHASE 2 (DEVELOPMENT/PHASE_2_BOTS_AND_VOICE/STATUS.md) IN PROGRESS: all 5 checklist items are
now DONE (bots, mixed rooms, queue names, sound packs, voice chat). **Phase is not "complete"**
per the owner's standing instruction — new items can still be added here; nothing is currently
queued.

## Next step
No blockers. Two things worth the owner's attention when convenient:
1. **Render's free PostgreSQL expires ~2026-10-26** (owner said they'll handle this themselves).
2. Try the new animal sounds in a real game (round-result / win moments) and confirm they
   sound right — if the cat-meow/dog-bark mapping feels off, easy to swap or remap.
Otherwise: waiting on the owner for the next feature/direction (Phase 2 checklist is fully
done, so this is a natural point to decide what's next — more Phase 2 polish, or moving on).

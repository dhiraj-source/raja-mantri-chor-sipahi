# LAST WORK

## Latest (RMC-0022 — sound packs part 1/2: TTS voice lines)
Owner tried downloading real PUBG/BGMI voice-line MP3s and correctly concluded they can't be
used (copyrighted), and asked for a free alternative. Gave two options via AskUserQuestion;
owner picked the recommended one: TTS for voice lines + search for a free/CC0 source for
animal sounds.

**Built (voice lines):**
- `apps/web/src/audio/sounds.ts`: `VOICE_LINES` map (`CORRECT: 'Busted!'`, `WRONG: 'Escaped!'`,
  `WIN: 'Victory!'`) + `VoiceLinePlayer` — same dependency-injected shape as the existing
  `SoundPlayer` (`SpeechSynthesisLike`/`SpeechUtteranceLike` interfaces), so it's unit-testable
  without a real browser, same as every other audio piece in this project.
- `apps/web/src/audio/useSounds.ts`: `play(name)` now also speaks the line if one exists.
  Same mute toggle controls both tones and voice — no new setting, no new UI.
- Deliberately only on round-result/win (not every reaction emoji tap) — a spoken line on
  every single tap would get old fast; the big moments are where a PUBG-style callout fits.
- 3 new unit tests (speaks only for names with a line; silent + never touches the synth when
  muted; never crashes with no TTS support or a throwing synth). 277 tests total now
  (37 engine + 132 api + 108 web). Build + lint clean.

**Researched (animal sounds, not yet built):** searched and verified (not guessed) a safe free
source: **Pixabay's sound-effects library** (pixabay.com/sound-effects) — checked its actual
Content License: commercial use OK, no attribution, no signup needed to download MP3s; the
only restriction is not reselling a file unchanged as a standalone product, which doesn't apply
to using one inside the game. Also checked Kenney.nl's "Animal Pack" (looked promising by
name) and found it's actually visual sprites, not audio — ruled out after checking, not
assumed. Nothing downloaded yet — waiting on the owner to pick specific clips (e.g. dog bark,
cat meow) and send them over; I'll wire them in once they arrive.

## RMC-0021 (this same session, voice chat bugfix — done before this)
Owner reported voice chat needed a page reload to connect. Root cause: staggered joins — the
earlier joiner could already be the designated offer-sender and send its offer before the
later joiner was listening; that offer was silently dropped and never retried. Fixed with a
`ready` signal (passive side announces it's listening; the initiator resends its cached offer
on receiving it). Verified with 3 unit tests plus a new real two-headless-Chrome check that
specifically reproduces the staggered-join bug shape (A joins, waits 4s, then B joins) — both
sides connected, zero reload, zero console errors.

## Current phase
PHASE 2 (DEVELOPMENT/PHASE_2_BOTS_AND_VOICE/STATUS.md) IN PROGRESS: bots, mixed rooms, queue
names, and voice chat (bugfixed) are DONE. Item 4 (sound packs) is now PARTIAL: voice lines
DONE, animal sounds still waiting on the owner. **Phase is not "complete"** — per the owner's
standing instruction, more features can still be added here.

## Next step
Waiting on the owner to: (1) try the new voice lines and voice-chat fix and confirm they work
well, (2) pick a few animal-sound clips from Pixabay (dog bark, cat meow, or whatever else they
want) and send the files over — I'll wire them in as soon as they arrive. No other blockers;
happy to also just keep going on any other Phase 2 idea the owner has in mind.

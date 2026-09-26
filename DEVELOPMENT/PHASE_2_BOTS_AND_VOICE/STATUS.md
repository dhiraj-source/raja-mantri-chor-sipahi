# PHASE 2 — Bots, Mixed Rooms, Voice

## Status
**IN PROGRESS** (started 2026-09-26). Naye features is phase me aage bhi add honge —
jab tak neeche list ke saare items DONE na ho jayen (ya owner khud na kahe), is file ko
"COMPLETE" mat likhna.

## Maksad
Akela player bhi khel sake (bots), rooms me insaan+bot mix ho sakein, aur players
ek-doosre se awaaz se jud sakein.

## Feature checklist

| # | Feature | Status | RMC |
|---|---|---|---|
| 1 | Quick play with bots (single player, bots fill the room) | ☑ DONE | RMC-0019 |
| 2 | Room create: host bots se khaali seats bhar sake | ☑ DONE | RMC-0019 |
| 3 | Lobby/queue me connected/waiting players ke **naam** dikhein (sirf count nahi) | ☑ DONE | RMC-0019 |
| 4 | Sound packs: animal sounds + voice-line style reactions | ☑ DONE | RMC-0022, RMC-0023 |
| 5 | Live voice chat (WebRTC mesh, STUN only), per-player mute/unmute | ☑ DONE | RMC-0020 |
| — | *(aage jo bhi naye features aayenge, yahan neeche add honge)* | | |

## Decisions (confirmed by owner)

### #4 — Sound/voice packs: **owner khud audio files dega** → **ab DONE (RMC-0023)**
Asli PUBG voice-lines copyrighted hain, unhe copy/use nahi kar sakte. Owner ne khud PUBG/BGMI
MP3 download karke try kiya, wahi nateeja nikla — copyright issue. **Updated decision
(RMC-0022): voice-lines ke liye text-to-speech (koi file nahi, koi copyright risk nahi) —
ban gaya, DONE.** Animal sounds ke liye TTS kaam nahi aata (bhaunk/mya u nahi kar sakta) —
Pixabay verify kiya tha (free, safe), lekin owner ne kaha khud complete karo. Pixabay is
session se Cloudflare bot-block kar raha tha (koi browser tool bhi available nahi tha) —
isliye **OpenGameArt.org** use kiya (reachable, CC0 license har file par verify kiya).
Do real clips wire ho gaye: cat meow (CORRECT), dog bark (WRONG). **DONE (RMC-0023).**

### #5 — Live voice chat: **WebRTC mesh, sirf public STUN (free), koi TURN nahi**
Owner ne free/simple tarika chuna — 4 players ke liye mesh chalta hai. Trade-off: kuch
strict-NAT/corporate network wale users (~5-10%) connect nahi kar payenge; TURN baad me
add ho sakta hai agar zaroorat pade. **Implemented in RMC-0020.**

## Design notes (jaise-jaise implement hoga, yahan update hoga)

### Bots (RMC-0019) — implemented
- Bots engine ke liye invisible hain: ek bot "player" bhi normal `PlayerId` string hai
  (`bot-<uuid>`), GameEngine ko farak nahi padhta insaan hai ya bot.
- `RoomsService` me `bots: Set<PlayerId>` (global, kyunki ids unique hain), `addBot`/`removeBot`/
  `playWithBots`/`getBotMantriTask`. Bots `roomOfPlayer` map me bhi register hote hain
  (isi se ek asli bug pakda gaya: pehli baar bhula diya tha, `submitGuess` bot ke liye
  "Aap kisi room me nahi ho" de raha tha — test se turant pakda gaya).
- Bot Mantri ka guess: `RoomsService.onRoundStarted` hook -> `RoomsGateway` ek
  `setTimeout` (env `BOT_GUESS_DELAY_MS`, default 1800ms) schedule karta hai, jo random
  Sipahi/Chor me se ek guess karta hai. Koi AI/LLM nahi — bas fair random choice.
- Insaan (host) chala jaye aur sirf bots bachein to room khud delete ho jati hai (memory
  leak nahi hota). Host kabhi bot nahi banta.
- Quick match queue ab naam bhi bhejta hai (`MatchmakingService.waitingNames()`), sirf
  count nahi.
- Verified: `apps/api/test/rooms.service.test.ts` (10 naye tests) + real-server smoke test
  (solo vs 3 bots poora 4-round game, mixed room add/remove bot, dono me bot Mantri ka
  auto-guess) — sab pass.

### Voice chat (RMC-0020) — implemented
- Audio khud kabhi server se nahi guzarta — sirf signaling (WebRTC offer/answer/ICE
  candidates) WebSocket se relay hoti hai (`VOICE_SIGNAL`, `VOICE_MUTE`). `RoomsGateway`
  bas payload ko `toPlayerId` tak pahuncha deta hai agar dono same room me hon — SDP ke
  andar kabhi nahi jhaakta.
- Topology: mesh — room ke har human (non-bot, connected) player ki har doosre human se
  seedhi peer-to-peer connection. Bots ke paas socket hi nahi hota, isliye unse connection
  kabhi banti hi nahi.
- Glare (dono taraf se ek saath offer) se bachne ke liye deterministic rule: chhoti
  `PlayerId` wala hamesha offer bhejta hai (`shouldInitiate`), badi id wala intezaar karta
  hai. Reactive path (kisi ka offer aa jaye) hamesha answer hi banata hai, apna offer nahi
  bhejta — pehle isi jagah ek bug tha (dono offers bhej rahe the), unit test se pakda gaya.
- Sirf public STUN (Google), koi TURN nahi — free, simple, per owner ka decision. ICE
  candidates jo remote description set hone se pehle aa jaayen, queue ho kar baad me lagte
  hain.
- `MAX_PAYLOAD_BYTES` 4096 → 16384 badhaya gaya (SDP offers/answers 4KB se bade ho sakte
  hain). Isse `smoke-ws.mjs` ka purana abuse-protection check (10KB "bahut bada message")
  todh gaya tha — 10KB ab naye 16KB limit se chhota tha, connection band hi nahi hota tha,
  script hamesha wahi hang ho jaati thi. Fix: test ka payload 20KB kar diya (naye limit se
  bada), taaki check dobara meaningful ho.
- Verified: `apps/web/test/voice.test.ts` (9 tests, fake `RTCPeerConnection`) +
  `apps/web/test/voice-ui.test.tsx` (9 tests) + real-server smoke test (same-room relay,
  cross-room block, mute broadcast) + do asli headless-Chrome browsers (fake mic device)
  ne real ICE/DTLS negotiate karke ek-doosre ka audio stream connect kiya, real UI ke
  through, zero console errors.

### Voice chat bugfix (RMC-0021) — "reload chahiye tha" fix
Owner ne use karke bataya: kabhi-kabhi mic on karne ke baad reload karna padta tha tabhi
awaaz judti thi. Wajah: agar dono players alag-alag time par voice join karte the, to jo
pehle offer bhejta tha (id comparison se decide hota hai kaun offer bhejega) uska offer
tab tak bhej deta tha jab tak doosra sun hi nahi raha hota tha — wo offer hamesha ke liye
kho jaata tha, dobara kabhi nahi bhejta tha. Fix: ek naya `ready` signal — jab koi passively
(offer ka wait karte hue) connect karta hai, doosre ko bata deta hai "ab main sun raha hoon",
aur agar us doosre ne pehle offer bheja tha jo abhi tak connect nahi hua, wo apna offer
dobara bhej deta hai. Verified: 3 naye unit tests + ek naya real do-headless-Chrome test
jisme jaan-boojh kar A pehle join karta hai, 4 second ruk kar B join karta hai — dono
bina reload ke connect ho gaye.

### Sound packs, part 1/2: voice lines (RMC-0022) — implemented
- `VoiceLinePlayer` (`apps/web/src/audio/sounds.ts`): round-result/win par chhoti spoken line
  ("Busted!"/"Escaped!"/"Victory!") — browser ka apna text-to-speech (`speechSynthesis`),
  koi audio file nahi. Reaction emojis par nahi bolta (har tap par bolna shuru ho jaata to
  irritating ho jaata) — sirf bade moments par, jaise asli game announcer voice lines.
  Same mute button dono (tone + voice) control karta hai.
- Animal sounds abhi bhi baaki hain — Pixabay (pixabay.com/sound-effects) verify kiya hua
  free/safe source hai (commercial use OK, attribution/signup nahi chahiye); owner clips
  choose karke bheje to turant wire ho jayega.

### Sound packs, part 2/2: animal sounds (RMC-0023) — implemented, DONE
- Pixabay se direct download nahi ho paya (Cloudflare bot-block, is session me koi browser
  tool nahi tha). OpenGameArt.org se do real CC0 WAV files liye — har file ka license tag
  uski apni page par check kiya (assume nahi kiya): "Dog barking mono" (CC0) aur "Kitten Mew"
  (CC0). Download ke baad RIFF/WAVE header dekh kar confirm bhi kiya ki asli valid audio hai.
- `apps/web/public/audio/dog-bark.wav` + `cat-meow.wav`, `ANIMAL_SOUNDS` map + `AnimalSoundPlayer`
  (`apps/web/src/audio/sounds.ts`) — `SoundPlayer`/`VoiceLinePlayer` jaisa hi dependency-injected
  aur same mute toggle se control hota hai. Mapping: CORRECT → cat meow (catch), WRONG → dog
  bark (chor bhaag gaya) — yeh apni taraf se creative choice hai, owner ne specify nahi kiya
  tha, badalna easy hai.
- Verified: 6 naye unit tests + dev server chala kar `/audio/*.wav` URLs curl se check kiye
  (200 OK, sahi Content-Type, sahi byte size). Poora `ui:check` (real headless Chrome) nahi
  chalaya — usme Docker+Postgres+API bhi chahiye; yeh choti, isolated, try/catch-protected
  addition thi jo pehle se verified pattern (RMC-0014/0022) follow karti hai.

# LAST WORK

## Latest (RMC-0020 — Phase 2: live voice chat)
Owner said "procced" after RMC-0019 (bots) shipped — next unblocked Phase 2 item was #5,
live voice chat (#4 sound packs stays blocked, owner hasn't sent audio files yet). Built
WebRTC mesh voice chat, sirf public STUN (owner ka pehle se confirmed decision, see
DEVELOPMENT/PHASE_2_BOTS_AND_VOICE/STATUS.md):

- shared-types: `VOICE_SIGNAL` (client<->server<->client, opaque offer/answer/ICE payload)
  aur `VOICE_MUTE` (client->server->room) messages.
- RoomsGateway: dono ko relay karta hai (sirf same-room check karta hai, SDP ke andar kabhi
  nahi jhaakta). `MAX_PAYLOAD_BYTES` 4096->16384 aur `MAX_MESSAGES_PER_SECOND` 20->40 badhaya
  (SDP bada ho sakta hai, ICE candidates bhi bar-bar aate hain).
- web/src/voice/webrtc.ts: `VoiceRoom` — room ke har human se ek mesh connection, glare
  (dono taraf offer) se bachne ke liye chhoti `PlayerId` wala hi offer bhejta hai.
- web/src/voice/useVoiceChat.ts + components/VoiceBar.tsx: mic on/off, mute/unmute, peer
  status list (bots kabhi list me nahi aate — unke paas socket hi nahi hota).
- App.tsx me wire kiya: room me ho to VoiceBar dikhta hai.

**Do real bugs pakde gaye, dono testing se, guess se nahi:**
1. **WebRTC glare bug** (asli app bug): jab kisi ka offer aata tha aur hum reactively
   answer bana rahe hote the, agar hamari id chhoti hoti (jo initiate karti hai) to code
   apna offer bhi bhej deta tha — matlab do offers cross ho jaate, connection kabhi nahi
   banti. Unit test se pakda gaya, fix: reactive path hamesha sirf answer banata hai,
   kabhi apna offer nahi bhejta.
2. **Smoke test hang** (test bug, app bug nahi): `MAX_PAYLOAD_BYTES` 16KB karne se purana
   abuse-protection check ("10KB ka bada message bhejo, connection band hona chahiye")
   todh gaya — 10KB ab naye 16KB limit se chhota tha, server use normal maan kar process
   kar leta tha, connection kabhi band nahi hota, script `await` par hamesha ke liye ruk
   jaati thi (na error, na timeout khud se — sirf hang). Do baar isi jagah phas gaya
   (pehle apne hi galat "process stuck hai" andaaze se kill kiya, phir dobara 5-min
   Monitor se bhi wahi jagah). Root cause samajhne ke baad fix simple tha: test ka payload
   20KB kar diya (naye limit se bada), taaki check phir se meaningful ho.

**Verified for real, teen tarike se:**
1. Unit tests: `apps/web/test/voice.test.ts` (9, fake `RTCPeerConnection`, koi real network
   nahi) + `voice-ui.test.tsx` (9, `VoiceBar` component).
2. Real-server smoke test (`scripts/smoke-ws.mjs`), naya "Voice signaling" section (same-room
   relay verbatim, cross-room block, mute broadcast) + poora baaki suite — locally built,
   locally running API ke against, poora "SMOKE TEST PASSED" tak pahuncha.
3. Do asli headless-Chrome browsers (`--use-fake-device-for-media-stream` se nakli mic,
   permission prompt ke bina) ne real production UI khola, same room join kiya, voice join
   kiya, aur asli ICE/DTLS negotiate karke connect ho gaye — zero console errors. Ye sabse
   strong proof hai ki feature browser me sach me chalta hai, mocked path nahi.

271 unit tests pass (37 engine + 132 api + 102 web). Build + lint clean.

## Current phase
PHASE 2 (DEVELOPMENT/PHASE_2_BOTS_AND_VOICE/STATUS.md) IN PROGRESS: 4/5 listed items done
(bots, mixed rooms, queue names, voice chat). Sirf item 4 (sound packs) baaki hai, aur wo
poori tarah owner par depend karta hai. **Phase khatam nahi hui hai** — owner ne saaf kaha
tha ki is phase me aur features add ho sakte hain, to jab tak owner khud na kahe, "COMPLETE"
nahi likhna (STATUS.md me ye rule likha hua hai).

## Next step
Do cheezein owner par pending hain:
1. Sound packs (item 4): apne .mp3/audio files bhejo (animal sounds, PUBG-style voice
   lines) — jab milein, folder/naming convention design karke wire karenge.
2. Voice chat try karo (do phone/browser tabs se ek room me, mic on karo) aur bata do kaisa
   laga — koi aur voice-related feature chahiye to (push-to-talk, speaking indicator, TURN
   server strict-NAT users ke liye) bata sakte ho, phase abhi bhi open hai.

Koi code action mere taraf se pending nahi hai jab tak owner in do me se kuch na kahe.

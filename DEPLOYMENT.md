# DEPLOYMENT — LIVE

Ye game ab live hai — **teeno game modes** (Raja Mantri Chor Sipahi, Draw & Guess, Bomb Tag):

- **Web:** https://raja-mantri-chor-sipahi-five.vercel.app (Vercel)
- **API + WebSocket:** https://rmc-api-etep.onrender.com (Render)
- **Database:** Render PostgreSQL (free) — `rmc-postgres`
- **Redis:** Render Key Value (free) — `rmc-redis` (provision hai, app code abhi use nahi karta)
- **GitHub:** https://github.com/dhiraj-source/raja-mantri-chor-sipahi (`main` branch)

Har `git push origin main` par **dono khud-ba-khud redeploy ho jate hain** (Vercel aur Render dono GitHub se connected hain).

---

## Kaise bana (history)

Pehle Railway try kiya tha, par free trial khatam nikla (paid plan chahiye tha). Isliye **Render** (free tier) chuna. Sab kuch CLI se bana (Render CLI + Vercel CLI + kuch Render REST API calls jo CLI expose nahi karta tha), browser sirf login ke liye khula.

- **Render:** `rmc-postgres` (PostgreSQL, free), `rmc-redis` (Key Value, free), `rmc-api` (Docker web service, `apps/api/Dockerfile`, region Singapore).
- **Vercel:** repo import + GitHub auto-connect, root `vercel.json` ne build khud handle kiya.
- Verified: asli container/deploy build hua, `/health` = 200, CORS sahi origin allow/block karta hai, poora 4-round game asli WebSocket se khela (rewards/points sab sahi), aur asli headless Chrome me production URL khol kar dekha — koi console error nahi, "Quick match" screen turant dikhi (matlab API se connect ho gaya).

---

## ⚠️ Zaroori: Free PostgreSQL 30 din me expire hota hai

Render ka free PostgreSQL **30 din baad automatically expire** ho jata hai (14 din ka grace period milta hai, uske baad **data delete** ho jata hai). Ye database bana: **26 September 2026**, isliye **~26 October 2026** tak koi decision lena hoga:

1. **Upgrade karo** (Render dashboard → `rmc-postgres` → plan badlo, ~$6/month se shuru), ya
2. **Naya free database bana lo** (data khatam ho jayega — accounts/history/coins sab reset), ya
3. **Kisi aur free Postgres** (jaise Neon, Supabase) par migrate karo aur sirf `DATABASE_URL` badal do Render ke API service me.

Reminder apne aap set kar lo — main khud yaad nahi dila sakta.

---

## Env vars (jo already set hain, Render `rmc-api` service par)

| Variable | Value |
|---|---|
| `DATABASE_URL` | Render Postgres ka internal connection string |
| `REDIS_URL` | Render Redis ka internal connection string |
| `CORS_ORIGINS` | `https://raja-mantri-chor-sipahi-five.vercel.app,https://raja-mantri-chor-sipahi.vercel.app` |

Vercel par (Production environment):

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://rmc-api-etep.onrender.com` |
| `VITE_WS_URL` | `wss://rmc-api-etep.onrender.com/ws` |

**Vercel URL badal jaye** (naya custom domain waghera) to Render ki `CORS_ORIGINS` bhi update karni hogi (warna browser block kar dega), phir Render par ek naya deploy trigger karna hoga (env var badalne se apne aap deploy nahi hota).

---

## Common problems

| Problem | Fix |
|---|---|
| Web khulti hai par "Connecting to the server..." pe atki | Render service so gaya hoga (free tier 15 min baad sleep hota hai, ~30-60s me jaagta hai) — thoda ruko aur refresh karo |
| Login/register CORS error | `CORS_ORIGINS` (Render) me web ka poora URL hai? Naya deploy trigger kiya? |
| Render build fail | Render dashboard → `rmc-api` → Logs dekho |
| Database "expired" error | Upar wala 30-day section dekho |

---

## Render ki networking ke kuch quirks (RMC-0035 me pata chale, dobara verify karte waqt yaad rakhna)

Render ke reverse-proxy/load-balancer ka behavior local Docker/dev se thoda alag hai — ye app ka
bug nahi hai, bas production-verification scripts likhte/chalate waqt dhyan rakhna:

- Ek client apna WebSocket khud band kare (ya server `terminate()` kare kisi abuse ki wajah se),
  to doosri party tak ye baat pahunchne me **~10-20 second** tak lag sakte hain (local Docker par
  turant hota hai). Real users ke liye normal gameplay me farq nahi padta (disconnect-detection
  thoda slow bas), lekin koi bhi smoke-test script isi hisab se lamba timeout rakhe.
- Oversized-payload/rate-limit se connection band ho to code app ka clean `1009` nahi, Render ke
  proxy ka abrupt `1006` milta hai — protection dono jagah kaam karta hai, bas code/timing alag.
- Do alag WebSocket clients ke messages ka server tak exact order kabhi guaranteed nahi hota.

`apps/api/scripts/smoke-ws.mjs` inhi teeno ke liye adapt ho chuka hai (dekho CHANGELOG.md RMC-0035).

## Local development me kuch nahi badla

`npm run db:up`, `npm run dev:api`, `npm run dev:web` — pehle jaisa hi chalega. Ye deployment guide sirf **production** ke liye hai.

---

## Reference files

- `apps/api/Dockerfile` — API ka image (Render isi se build karta hai, path: `apps/api/Dockerfile`, context: repo root)
- `render.yaml` — jo bana hai uska documentation/reference (isse dobara "sync" nahi kiya gaya, CLI se banaya tha)
- `vercel.json` — web ka build config
- `.github/workflows/ci.yml` — har push par build+lint+test (safety check, deploy isse trigger nahi hota)

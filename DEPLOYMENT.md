# DEPLOYMENT GUIDE

Simple Hinglish me, step-by-step. Do jagah deploy hota hai:

- **Web** (React) → **Vercel** (free)
- **API** (NestJS + WebSocket + PostgreSQL + Redis) → **Railway**

**Kyun do jagah?** Vercel *serverless* hai — code sirf ek request ke liye chalta hai, phir band ho jata hai. Hamara game WebSocket connections **hamesha khule** rakhta hai aur rooms/sessions **memory me** rakhta hai. Ye Vercel par kaam nahi karta. Isliye API ek "normal" server (Railway) par chalti hai, jaha ek Node process **hamesha chalta rehta hai**.

Deployment files already ban chuki hain is repo me:
- `apps/api/Dockerfile` — API ka container image (asli Docker build test ho chuka hai)
- `railway.json` — Railway ko batata hai kaunsa Dockerfile use karna hai
- `vercel.json` — Vercel ko batata hai web kaise build karna hai (monorepo hai isliye zaroori)
- `.github/workflows/ci.yml` — har push par build+test+lint (safety check)
- `.env.production.example` — API par kaunse environment variables set karne hain

Neeche jo bhi step "**Aapko karna hai**" likha hai, wahi sirf aap kar sakte ho (login/account cheezein). Baaki sab already ready hai.

---

## Step 1 — GitHub par code push karo

**Aapko karna hai:** [github.com/new](https://github.com/new) par jaake ek naya **empty** repo banao (koi README/gitignore mat add karo, hamare paas already hai). Naam jo chaho rakho, jaise `raja-mantri-chor-sipahi`.

Phir isi folder me (`D:\ANJALI\GAME`) ye commands chalao — apna GitHub username/repo naam daal ke:

```powershell
git add -A
git commit -m "Initial commit: full game (RMC-0001 to RMC-0016)"
git branch -M main
git remote add origin https://github.com/<aapka-username>/<repo-naam>.git
git push -u origin main
```

Agar `gh` (GitHub CLI) install hai to repo banana + push ek saath ho sakta hai:
```powershell
gh repo create <repo-naam> --public --source=. --remote=origin --push
```

---

## Step 2 — Railway par API + Database deploy karo

**Aapko karna hai** ([railway.app](https://railway.app), GitHub se login):

1. **New Project → Deploy from GitHub repo** → apna repo chuno.
2. Ye service khud-ba-khud nahi samjhegi ki ye monorepo hai — service settings me:
   - **Settings → Build → Builder:** `Dockerfile`
   - **Dockerfile Path:** `apps/api/Dockerfile`
   - **Root Directory:** khaali chhodo (repo root hi rehna chahiye)
3. Isi project me **+ New → Database → PostgreSQL** add karo.
4. Isi project me **+ New → Database → Redis** add karo (abhi code use nahi karta, par ready rehta hai — aapne "abhi shamil karo" chuna tha).
5. API service ke **Variables** tab me jaake:
   - `DATABASE_URL` = Postgres service se reference karo: `${{Postgres.DATABASE_URL}}`
   - `REDIS_URL` = Redis service se reference karo: `${{Redis.REDIS_URL}}`
   - `CORS_ORIGINS` = abhi `http://localhost:5173` daal do (Step 3 ke baad asli Vercel URL se badlenge)
6. Deploy hone do. **Settings → Networking → Generate Domain** se ek public URL milega, jaise `https://rmc-api-production.up.railway.app`. **Ye URL yaad rakho, Step 3 me chahiye.**
7. Check karo: browser me `https://<wo-url>/health` kholo — `{"status":"ok"}` dikhna chahiye.

(`railway.json` already batata hai ki healthcheck `/health` par hai aur crash hone par phir se start ho jaye.)

---

## Step 3 — Vercel par Web deploy karo

**Aapko karna hai** ([vercel.com](https://vercel.com), GitHub se login):

1. **Add New → Project** → apna repo import karo.
2. Vercel repo root ka `vercel.json` khud padh lega (build command, output folder sab usi me hai) — kuch badalne ki zaroorat nahi.
3. **Environment Variables** me ye do add karo (Step 2 ka Railway URL use karke):
   ```
   VITE_API_URL=https://<railway-api-url>
   VITE_WS_URL=wss://<railway-api-url>/ws
   ```
   (`wss://` — `ws://` nahi, kyunki Railway HTTPS deta hai.)
4. **Deploy** dabao. Kuch minute me ek URL milega, jaise `https://raja-mantri-chor-sipahi.vercel.app`.

---

## Step 4 — Railway ko Vercel ka URL batao

Step 3 ka Vercel URL Railway ki `CORS_ORIGINS` variable me daalo (Step 2.5 wapas jaake):
```
CORS_ORIGINS=https://raja-mantri-chor-sipahi.vercel.app
```
Railway apne aap redeploy kar dega. Isके bina browser API ko call nahi kar payega (security check block kar dega).

---

## Step 5 — Test karo

Vercel wala URL do browser tabs (ya phone + PC) me kholo, account banao, room banao, dusre tab se join karo, game khelo.

---

## Uske baad: Auto-deploy

Ab se jab bhi `git push` karoge `main` branch par:
- **Vercel** khud web ka naya version deploy kar dega
- **Railway** khud API ka naya version build+deploy kar dega (migrations bhi apne aap chal jaati hain)
- **GitHub Actions** (`.github/workflows/ci.yml`) build+test+lint chala ke check karega ki kuch tootha to nahi (ye deploy nahi rokta, sirf batata hai)

Koi manual command nahi chahiye — bas code badlo, commit karo, push karo.

---

## Common problems

| Problem | Fix |
|---|---|
| Web khulti hai par "Connecting to the server..." pe atki rehti hai | `VITE_API_URL` / `VITE_WS_URL` Vercel me sahi hain? `wss://` (na ki `ws://`) daala? Redeploy kiya? |
| Login/register 401 ya CORS error (browser console me) | Railway ki `CORS_ORIGINS` me Vercel ka **poora** URL hai (https:// ke saath, trailing slash ke bina)? |
| Railway build fail | Build logs me dekhо — Dockerfile Path `apps/api/Dockerfile` aur Root Directory khaali hai ye confirm karo |
| Database errors | Railway Postgres plugin add hai aur `DATABASE_URL` usse reference ho raha hai (khud se type na karo) |

---

## Local development me kuch nahi badla

`npm run db:up`, `npm run dev:api`, `npm run dev:web` — pehle jaisa hi chalega. Ye sab sirf **deployment** (production) ke liye hai.

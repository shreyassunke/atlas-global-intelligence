# TATVA — Global Intelligence

Vite + React intel globe. See `.env.example` for API keys (copy to `.env` locally).

## Deploy on Vercel

### 1. Environment variables

In the [Vercel project](https://vercel.com/dashboard) → **Settings** → **Environment Variables**, add every `VITE_*` key from `.env.example` (Production / Preview as needed).  
`VITE_CESIUM_ION_TOKEN` is required for the Cesium globe; others depend on which features you use.

Redeploy after changing env vars.

### 2. Deploy via Git (recommended)

Connect this repo in Vercel → **Import Project** → root directory **`/`** (repo root is this `atlas` folder if the monorepo only contains the app).  
Vercel reads `vercel.json` and runs `npm install` + `npm run build`, serving `dist/`.

### 3. Deploy via CLI

```bash
npm i -g vercel
cd path/to/atlas
vercel login
vercel link    # link to an existing project or create one
vercel         # preview
vercel --prod  # production
```

If the GitHub repo moved, update the remote:

`git remote set-url origin https://github.com/shreyassunke/atlas-global-intelligence.git`

### Notes

- **SPA routing:** `vercel.json` rewrites unknown paths to `index.html` so refreshes work if you add client routes later.
- **Large assets:** `public/audio` MP3s ship with the static build; keep an eye on bundle/deploy size.
- **Secrets:** Never commit `.env`; use Vercel env UI only for production keys.

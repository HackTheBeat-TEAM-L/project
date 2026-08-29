# HYPEWAVE

Crowd-reactive auto DJ. Detects hype from microphone **dB spikes** (+10 over the
previous 10s rolling average) and auto-queues a similar track via **LLM
recommendation → Spotify Search verification → self-managed queue**. Single web
app for a booth laptop (Chrome).

## Stack
- Next.js (App Router, TS). API routes are the secret backend (Spotify token
  exchange + LLM proxy). Client runs Web Audio dB metering + Spotify Web Playback SDK.
- Secrets live only in the root `.env` (symlinked as `hypewave/.env.local`).

## Setup
1. Fill the repo-root `.env` (already gitignored):
   ```
   SPOTIFY_CLIENT_ID=...
   SPOTIFY_CLIENT_SECRET=...
   SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/callback
   LLM_PROVIDER=groq            # or gemini
   LLM_API_KEY=...
   ```
   Register **exactly** `http://127.0.0.1:5173/callback` in the Spotify app
   dashboard (Web API + Web Playback SDK). Host account must be real **Premium**.
2. Install & run:
   ```
   cd hypewave
   npm install
   npm run dev            # http://127.0.0.1:5173
   ```

## Two modes
- **Mock / Demo** (no login): synthetic dB, real LLM via `/api/llm`, simulated
  deck. Buttons: *Inject HYPE spike*, *Song ended → play next*. Runs the full
  8-step loop for verification.
- **Live (Spotify)**: connect Premium, real mic, real playback in-browser.

## Test
```
npm test          # vitest: dB engine, cooldown, dedupe, fallback chain, full loop
npm run build     # production build + type check
```

## Config (not hardcoded — `src/lib/config.ts`)
`spikeThresholdDb=10`, `rollingWindowSec=10`, `cooldownSec=30`,
`recommendCount=2`, `dedupeLastN=5`. Tune spike threshold on-site after
measuring real crowd dB.

## Notes / gotchas
- Spotify `/recommendations` is deprecated → recommendations come from the LLM,
  existence is verified via Spotify Search.
- Current track is read from player state (no audio recognition).
- `add-to-queue` isn't used (appends to the tail); the app plays the chosen URI
  directly when the current track ends.
- Gemini: use `gemini-3.6-flash` (2.5-flash is blocked for new keys).

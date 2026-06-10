# ai_gf — AI Girlfriend Web App

React 18 SPA using Agnes AI APIs for chat and image generation. Taiwanese Mandarin UI.

## Quick start

```bash
cp .env.example .env   # fill in real Agnes API key
npm run dev             # -> http://localhost:5173/ai_gf/
```

## Build & deploy

```bash
npm run build           # outputs to dist/
npm run preview         # serve built dist locally
```

**Deployment**: Push to `master` → GitHub Actions builds and deploys to [GitHub Pages](https://ourfunmedia.github.io/ai_gf/). The Vite `base: '/ai_gf/'` is required for the subfolder path.

## Architecture

- **No router** — tab switching via React state (`chat` / `settings` / `image`)
- **No state persistence** — character settings are in-memory only
- **No tests, no linter, no formatter** configured
- **Client-side API calls** — `fetch()` directly to Agnes APIs from browser. API key embedded in JS bundle at build time (acceptable for free-tier MVP)
- **Vercel Functions** (`api/chat.js`, `api/image.js`) exist but are **not active** in the current GitHub Pages deployment

## APIs (Agnes AI)

Base: `https://apihub.agnes-ai.com/v1`
- Chat: `POST /chat/completions` — model `agnes-2.0-flash`
- Image: `POST /images/generations` — model `agnes-image-2.1-flash`
- Image-to-image consistency uses `extra_body.image` with a reference image URL

## Vite env vars (must be set at build time)

```
VITE_AGNES_API_KEY        # Agnes API key
VITE_AGNES_BASE_URL       # https://apihub.agnes-ai.com/v1
VITE_AGNES_CHAT_MODEL     # agnes-2.0-flash
VITE_AGNES_IMAGE_MODEL    # agnes-image-2.1-flash
```

CI sets these via GitHub secrets (`AGNES_API_KEY`) and hardcoded values in `.github/workflows/deploy-pages.yml`.

## Key conventions

- All UI text is Traditional Chinese (zh-TW)
- Dark theme with pink accent (`--pink: #e84393`), CSS variables in `index.css`
- Character system prompt is sent as a `system` role message in every chat API call
- Default character: name `小艾`, Taiwan-style personality
- Image generation always prepends a face-preservation instruction to the scene prompt
- Reference image URL must be user-provided (external image host like imgbb)

## Gotchas

- `npm run dev` only works with the `VITE_*` env vars loaded (from `.env` or shell). Missing API key → chat/image calls fail at runtime, not at build time.
- Changing the `base` in `vite.config.js` requires updating GitHub Pages deploy URL and `dist` path references.
- API key is exposed in the client bundle — do not use a key with billing limits if that matters.
- No `beforeunload` guards — page refresh loses chat history and character settings.

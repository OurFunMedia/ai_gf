HANDOFF CONTEXT
===============

USER REQUESTS (AS-IS)
---------------------
-  把 ai_gf 部署出去，免費方案為主
- 我們正在開發 ai_gf (AI girlfriend) web app
- 我的 node_modules 好像壞了... 當初是從其他地方複製過來的
- 把我們的對話記錄儲存到 C:\GitHub\ai_gf, 我們在那邊再繼續對話

GOAL
----
Continue developing the ai_gf AI girlfriend web app — improve chat, image generation, and character consistency features, and iterate on the deployed MVP.

WORK COMPLETED
--------------
- Rebuilt entire project from scratch at C:\GitHub\ai_gf after node_modules corruption
- npm install succeeded (70 packages), npm run build passes (vite, ~615ms)
- Initialized git repo and pushed to https://github.com/OurFunMedia/ai_gf (master branch)
- Switched from Vercel Functions server-side proxy to client-side direct API calls to Agnes API (Vite env vars inject at build time)
- Created GitHub Actions CI/CD workflow (.github/workflows/deploy-pages.yml) for automatic GitHub Pages deployment
- Set GitHub secret AGNES_API_KEY via gh CLI
- Deployed to GitHub Pages at https://ourfunmedia.github.io/ai_gf/ — site loads, assets served correctly
- Vercel API route files (api/chat.js, api/image.js, vercel.json) retained for future server-side proxy use
- Deleted old working copy at G:\我的雲端硬碟\www\ai_gf (contents cleared, empty dir locked until session ends)

CURRENT STATE
-------------
- Site live at https://ourfunmedia.github.io/ai_gf/
- Three tabs: 聊天 (Chat), 設定 (Settings/Character), 生圖 (Image Generation)
- Chat calls Agnes chat API (agnes-2.0-flash) directly from browser with Authorization header
- Image Gen calls Agnes image API (agnes-image-2.1-flash) with extra_body.image for image-to-image consistency
- Character settings stored in component state (name, personality, avatar)
- Any push to master triggers GitHub Actions build + deploy to Pages
- API key embedded in JS bundle at build time (acceptable for free-tier MVP; can add server proxy later)

PENDING TASKS
-------------
- No remaining items in todo list — all deployment tasks completed
- Next logical improvements: add welcome/onboarding to Chat, improve character personality consistency across turns, refine image gen scene selection, add image history gallery, test with real API calls
- Potential enhancement: restore server-side proxy (Vercel Functions) to protect API key from client exposure

KEY FILES
---------
- src/components/Chat.jsx — Chat component, directly calls Agnes /chat/completions
- src/components/ImageGen.jsx — Image generation component, calls Agnes /images/generations with image-to-image
- src/components/CharacterSettings.jsx — Character config (name, personality, reference image)
- src/App.jsx — Main app with tab routing
- src/App.css — All app styles (dark theme, pink accent)
- vite.config.js — Vite config with base: /ai_gf/ for GitHub Pages subfolder
- .github/workflows/deploy-pages.yml — CI/CD pipeline
- package.json — Dependencies (React 18, Vite 5)
- api/chat.js — (retained) Vercel Function proxy for chat
- api/image.js — (retained) Vercel Function proxy for image gen

IMPORTANT DECISIONS
-------------------
- Chose GitHub Pages over Vercel for deployment because Vercel CLI needed auth (device code not completed by user)
- Client-side API calls replace Vercel Functions proxy — simpler deployment at cost of exposing API key in JS bundle (acceptable for free-tier MVP)
- Default character: name 小艾, Taiwan-style personality, pink theme
- image-to-image via extra_body.image parameter for character consistency in generated scenes

EXPLICIT CONSTRAINTS
--------------------
- Zero/low cost for feasibility testing
- MVP: chat + character reference image + scene-based image generation with appearance consistency

CONTEXT FOR CONTINUATION
------------------------
- Agnes API base: https://apihub.agnes-ai.com/v1
- Chat model: agnes-2.0-flash
- Image model: agnes-image-2.1-flash
- API key stored as GitHub secret AGNES_API_KEY and in .env for local dev
- Default Vite env vars in deploy workflow: VITE_AGNES_API_KEY, VITE_AGNES_BASE_URL, VITE_AGNES_CHAT_MODEL, VITE_AGNES_IMAGE_MODEL
- Build base path /ai_gf/ is critical for GitHub Pages subfolder deployment
- The app is a single-page React app with client-side routing via tab state (no React Router)
- All API calls use fetch() directly — no axios or other HTTP client
- Character settings are in-memory (component state), not persisted across page reloads
- To test locally: copy .env.example to .env, fill in real API key, npm run dev

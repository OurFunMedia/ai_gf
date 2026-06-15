# ai_gf — AI Girlfriend Web App

React 18 SPA，使用 Agnes AI API 聊天與生圖。UI 全繁體中文（zh-TW）。

## Quick start

```bash
cp .env.example .env   # 填入真實的 Agnes API key
npm run dev             # → http://localhost:5173/ai_gf/
```

## Commands

| 指令 | 作用 |
|------|------|
| `npm run dev` | Vite dev server（含 Cloudflare Vite plugin） |
| `npm run build` | 輸出到 `dist/`（Vite base: `/ai_gf/`） |
| `npm run preview` | `build` + `wrangler dev`（本機 Cloudflare Pages 模擬） |
| `npm run deploy` | `build` + `wrangler deploy`（部署到 Cloudflare Workers） |

無 lint、無 typecheck、無 test runner。不要執行相關指令。

## Deploy

- **GitHub Pages**：Push `master` → `.github/workflows/deploy-pages.yml` 自動建置部署到 `https://ourfunmedia.github.io/ai_gf/`
- **Workers**：手動 `npm run deploy` 部署 prompt 擴寫 proxy
- CI 透過 secrets 注入 `AGNES_API_KEY`，build 時轉為 `VITE_AGNES_API_KEY`

## Environment variables（build-time，嵌入 JS bundle）

```
VITE_AGNES_API_KEY            # 必要，無則 build 成功但 runtime 失敗
VITE_AGNES_BASE_URL           = https://apihub.agnes-ai.com/v1
VITE_AGNES_CHAT_MODEL         = agnes-2.0-flash
VITE_AGNES_IMAGE_MODEL        = agnes-image-2.1-flash
VITE_NVIDIA_WORKER_URL        = https://ai-gf-zen-proxy-production.tobyyip-work.workers.dev
```

## Architecture

### 分頁切換（無 router）
`App.jsx` 的 `tab` state 控制顯示：`chat` / `image` / `settings`。透過 `display: none/block/flex` 切換。

### Chat.jsx（1076 行）— 核心元件
涵蓋：streaming SSE 聊天 + 情境生圖 + 專業大師級模式 + 配件/服裝上傳。

- **聊天**：`POST /chat/completions`，model `agnes-2.0-flash`，streaming SSE
- **生圖**：`POST /images/generations` — 單張 ref 用 `agnes-image-2.1-flash`，多張（含配件/服裝）自動降級 `agnes-image-2.0-flash`
- **Image-to-image**：使用 `extra_body.image`（傳入 URL 陣列或 base64）
- **專業大師級模式**：AI 助理引導使用者描述需求，輸出 `[PROMPT]...[/PROMPT]` 後自動觸發生圖。另外支援 markdown code block 與長文字（不含問號）兩種 fallback pattern
- **體型參數**：角色設定頁的 body params 由 `buildBodyDesc()` 組合成自然語言，送進圖片 prompt
- **取消生圖**：`abortRef.current.abort()` 中斷進行中的請求

### Prompt 擴寫（英文輸出，品質較好）
`expandPrompt()` 有完整 fallback chain：
1. **Agnes Chat API**（CORS-safe）
2. **Cloudflare Worker**（預設 Zen proxy）
3. **Client-side fallback**（隨機 pool 組合，保證不失敗）

擴寫 prompt 包含隨機場景、季節、時間、天氣、色調、鏡頭角度等 pool，確保每次輸出多樣性。

### 兩種 Cloudflare Worker（prompt 擴寫 proxy）
```
worker/index.js     → ai-gf-nvidia-proxy       (NVIDIA NIM, 備用)
worker-zen/index.js → ai-gf-zen-proxy           (Zen Free Model, 預設)
```
- 兩者都是 CORS proxy，從瀏覽器端呼叫
- 每 5 分鐘 cron warmup，避免冷啟動
- `wrangler.toml` 各有 `ALLOWED_ORIGIN` 指向 GitHub Pages
- 根目錄 `wrangler.jsonc` 用於 Cloudflare Vite plugin 整合（SPA fallback + `nodejs_compat`）

### IndexedDB 儲存（src/lib/db.js）
三個 store：`messages`、`images`、`settings`，keyPath 均為 `id`。

| 用途 | Store | Key | 寫入時機 |
|------|-------|-----|---------|
| 聊天記錄 | messages | `chat` | 每次 messages state 變更後 1500ms debounce |
| 圖片歷史 | images | `img_{timestamp}` | 每次生成後立即寫入 |
| 角色設定 | settings | `character` | 設定頁任一欄位變更後 1000ms debounce + 每次 onChange |

設定頁的 `save()` 寫入完整角色物件（含 body params），但 `data:` URL 的前端 ref 圖會被跳過不寫入（防 IndexedDB 爆掉）。

### ErrorBoundary
定義在 `App.jsx` 內，Class component 形式。捕捉錯誤後顯示錯誤訊息 +「重新載入」按鈕（`window.location.reload()`）。

### beforeunload
Chat.jsx 有 `beforeunload` 監聽：當聊天記錄尚未儲存（dirty flag）或生圖進行中時，阻止頁面關閉。對話狀態本身有 1500ms 防抖寫入，短時間內關閉仍可能遺失最後幾則訊息。

## Key patterns & constants

所有魔術數字集中在 `src/constants.js`：

```
MESSAGE_PERSIST_DELAY_MS = 1500    # 聊天記錄防抖
TOAST_DURATION_MS        = 2000    # Toast 顯示時間
IMAGE_SIZE               = 1024x1536
MAX_ACCESSORIES          = 3
MAX_IMAGE_COUNT          = 30
PRO_MODE_MIN_CHARS       = 80      # 專業模式觸發門檻
PRO_MODE_CANDIDATE_MIN   = 50
PROGRESS_*               # 生圖進度百分比
```

## UI conventions

- 深色主題，CSS 變數在 `src/index.css`（`--pink: #e84393`）
- 元件樣式在 `src/App.css`（無 CSS modules，單一 global CSS）
- 角色 system prompt 每次 chat API 都加上 `system` role 訊息（含「用角色名自稱」規則）
- 專業模式時 system prompt 包含完整的拍攝助理指引 + 配件/服裝上下文

## Gotchas

- `character.refImageUrl` 以 `data:` 開頭（來自「修改這張圖」功能）→ 生成圖片後自動清空，避免 base64 撐爆 IndexedDB。外部 URL（imgbb 等）不受影響
- 配件最多 3 張，自動標記 `pic1`-`pic3`，每張需要填寫文字描述 AI 才能正確使用
- 服裝僅 1 組，與配件不同槽位
- 改變 `vite.config.js` 的 `base` → 一併更新 GitHub Pages 部署 URL 與 `dist` 路徑
- `VITE_NVIDIA_WORKER_URL` 預設指向 Zen proxy，舊版 NVIDIA proxy 在 `.env.example` 註解中可查
- 未設定角色參考圖時生圖不會保留臉部一致性（ImageGen.jsx 與 Chat.jsx 都有 UI 提示）
- Worker cron warmup 失敗不影響主要功能（catch 內忽略）

# ai_gf — AI Girlfriend Web App

React 18 SPA，使用 Agnes AI API 進行聊天與圖片生成。UI 語言：繁體中文（zh-TW）。

## Quick start

```bash
cp .env.example .env   # 填入真實的 Agnes API key
npm run dev             # → http://localhost:5173/ai_gf/
```

## Build & deploy

```bash
npm run build           # 輸出到 dist/（Vite base: /ai_gf/）
npm run preview         # 在本地啟動 production build
```

**Deploy**：Push 到 `master` → GitHub Actions 自動建置並部署到 GitHub Pages：
`https://ourfunmedia.github.io/ai_gf/`

CI 使用 `.github/workflows/deploy-pages.yml`，API key 從 secret `AGNES_API_KEY` 注入。

## Project state

- **無測試、無 linter、無 formatter** — 未配置任何 lint/type-check/test 工具，不要跑相關指令
- **無 router** — 透過 React state 切換分頁（`chat` / `image` / `settings`）
- **無路由 API 檔案** — `api/` 目錄不存在，所有 API 呼叫直接從瀏覽器發出
- **Client-side API calls** — `fetch()` 直接打 Agnes API，API key 在建置時嵌入 JS bundle（free-tier MVP 可接受）
- **IndexedDB 儲存**（透過 `src/lib/db.js`）— 聊天記錄 1500ms 防抖儲存、圖片歷史、角色設定。重新整理頁面會保留，但角色名稱/個性以外的 body params 只有在點擊「儲存設定」後才會寫入

## Agnes API

Base: `https://apihub.agnes-ai.com/v1`
- Chat: `POST /chat/completions` — model `agnes-2.0-flash`，streaming SSE
- Image: `POST /images/generations` — 單張 ref 用 `agnes-image-2.1-flash`，多張 ref（含配件/服裝）自動降級為 `agnes-image-2.0-flash`
- Image-to-image: 使用 `extra_body.image`（傳入圖片 URL 陣列或 base64）

## Env vars（必須在建置時設定）

```
VITE_AGNES_API_KEY
VITE_AGNES_BASE_URL       = https://apihub.agnes-ai.com/v1
VITE_AGNES_CHAT_MODEL     = agnes-2.0-flash
VITE_AGNES_IMAGE_MODEL    = agnes-image-2.1-flash
```

缺少 API key 時 build 成功，但 runtime 呼叫會失敗。

## Architecture notes

- **三個分頁**，由 `App.jsx` 的 `tab` state 控制顯示
- **`Chat.jsx`（917 行）** 是核心元件：聊天 + streaming SSE + 圖片生成（情境模式與專業大師級模式）+ 配件上傳 + 服裝上傳。「相簿」分頁的 `ImageGen.jsx` 只負責瀏覽已產生的圖片
- **角色設定**包含 body 參數（年齡、身高、身材、胸圍、腰圍、臀圍、風格），Chat.jsx 用 `buildBodyDesc()` 將這些參數組合為自然語言描述，送進圖片的 prompt
- **專業大師級模式**：AI 助理透過對話引導使用者描述拍攝需求，輸出 `[PROMPT]...[/PROMPT]` 標籤後自動觸發圖片生成
- **ErrorBoundary** 在 `App.jsx` 內，捕捉錯誤後顯示「重新載入」按鈕（`window.location.reload()`）
- **無 `beforeunload` 防護** — 重新整理頁面會遺失未儲存的對話狀態

## UI conventions

- 深色主題，粉紅色主色（`--pink: #e84393`），CSS 變數定義在 `src/index.css`
- 所有 UI 文字為繁體中文
- 角色 system prompt 在每次 chat API 呼叫時以 `system` role 訊息傳送
- 預設角色：名為「小艾」的 22 歲台灣女孩
- 圖片生成時先透過 AI 擴寫提示詞（英文輸出，品質較好），再送到 image API
- 角色參考圖必須由使用者自行上傳到外部圖床（如 imgbb），貼上 URL

## Gotchas

- 若 `character.refImageUrl` 以 `data:` 開頭（來自「修改這張圖」功能），生成圖片後會自動清空，避免 base64 撐爆 IndexedDB
- 配件最多 3 張，自動標記為 `pic1`-`pic3`，每張需要填寫文字描述 AI 才能正確使用
- 服裝上傳只有 1 組，與配件不同槽位
- 改變 `vite.config.js` 的 `base`，需要一併更新 GitHub Pages 部署 URL 與 `dist` 路徑

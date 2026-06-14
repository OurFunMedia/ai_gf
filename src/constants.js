/* ═══════════════════════════════════════════
   ai_gf — 應用程式常數
   所有魔術數字集中管理
   ═══════════════════════════════════════════ */

// ---- IndexedDB ----
export const DB_NAME = 'ai_gf'
export const DB_STORES = ['messages', 'images', 'settings']
export const DB_OPEN_RETRIES = 3

// ---- 聊天 ----
export const CHAT_TEMPERATURE = 0.8
export const CHAT_MAX_TOKENS = 1024
export const MESSAGE_PERSIST_DELAY_MS = 1500

// ---- 圖片生成 ----
export const IMAGE_SIZE = '1024x1536'
export const MAX_ACCESSORIES = 3
export const MAX_IMAGE_COUNT = 30
export const IMAGE_TRUNCATE_MAX = 30

// ---- Prompt 擴寫 ----
export const PROMPT_TEMPERATURE = 1.0
export const PROMPT_MAX_TOKENS = 4096

// ---- 專業大師級模式 ----
export const PRO_MODE_MIN_CHARS = 80
export const PRO_MODE_CANDIDATE_MIN = 50

// ---- 角色設定 ----
export const MIN_AGE = 18
export const MAX_AGE = 60
export const TOAST_DURATION_MS = 2000

// ---- 圖片生成進度（百分比） ----
export const PROGRESS_INIT = 5
export const PROGRESS_EXPANDING = 20
export const PROGRESS_EXPANDED = 45
export const PROGRESS_API_CALL = 50
export const PROGRESS_DONE = 95
export const PROGRESS_PRO_INIT = 10
export const PROGRESS_PRO_PROCESSING = 30

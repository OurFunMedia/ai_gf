/**
 * ai-gf Zen Free Model proxy — Cloudflare Worker
 *
 * 環境變數（Cloudflare Secrets）：
 *   ZEN_API_KEY       — OpenCode Zen API key（https://opencode.ai/auth）
 *   ALLOWED_ORIGIN    — 前端 origin（例如 https://ourfunmedia.github.io）
 *
 * 定時觸發：每 5 分鐘 cron warmup，減少冷啟動。
 */

const ZEN_URL = 'https://opencode.ai/zen/v1/chat/completions'
const MODEL = 'nemotron-3-ultra-free'
const FETCH_TIMEOUT_MS = 10000

/* shared warmup: keeps the Worker isolate + Zen endpoint alive */
async function warmup(env) {
  const key = env.ZEN_API_KEY || globalThis.ZEN_API_KEY || ''
  if (!key) return
  try {
    await fetch(ZEN_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(20000),
    })
  } catch {
    /* warmup failure is non-critical — ignore */
  }
}

export default {
  /* CORS proxy for browser — main request handler */
  async fetch(req, env) {
    const ZEN_API_KEY = env.ZEN_API_KEY || globalThis.ZEN_API_KEY || ''
    const ALLOWED_ORIGIN = env.ALLOWED_ORIGIN || globalThis.ALLOWED_ORIGIN || ''
    const origin = req.headers.get('Origin') || ''
    const allowedOrigin = ALLOWED_ORIGIN || origin
    const corsOrigin = (!origin || origin === 'null' || origin === allowedOrigin) ? (origin || '*') : 'null'
    const corsHeaders = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    }

    if (req.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: corsHeaders })

    if (req.method !== 'POST')
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })

    if (!ZEN_API_KEY)
      return new Response(JSON.stringify({ error: 'ZEN_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })

    let body
    try {
      body = await req.json()
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON', detail: e.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const zenPayload = {
      model: MODEL,
      messages: body.messages,
      temperature: body.temperature ?? 1.0,
      max_tokens: body.max_tokens ?? 4096,
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    try {
      const zenRes = await fetch(ZEN_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ZEN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(zenPayload),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      const zenText = await zenRes.text()

      return new Response(zenText, {
        status: zenRes.status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      })
    } catch (err) {
      clearTimeout(timeout)
      return new Response(JSON.stringify({
        error: err.message, name: err.name,
        stage: err.name === 'AbortError' ? 'timeout' : 'fetch',
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  },

  /* cron warmup — keeps Worker and Zen endpoint alive */
  async scheduled(event, env) {
    await warmup(env)
  },
}

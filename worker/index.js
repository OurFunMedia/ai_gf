/**
 * ai-gf NVIDIA DeepSeek V4 Flash proxy — Cloudflare Worker
 *
 * 環境變數（Cloudflare Secrets）：
 *   NVIDIA_API_KEY    — NVIDIA NIM API key
 *   ALLOWED_ORIGIN    — 前端 origin（例如 https://ourfunmedia.github.io）
 *
 * 定時觸發：每 5 分鐘 cron warmup，避免冷啟動。
 */

const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
const MODEL = 'nvidia/nemotron-3-nano-30b-a3b'
const FETCH_TIMEOUT_MS = 10000

/* shared warmup: keeps the Worker isolate + NVIDIA endpoint alive */
async function warmup(env) {
  const key = env.NVIDIA_API_KEY || globalThis.NVIDIA_API_KEY || ''
  if (!key) return
  try {
    await fetch(NVIDIA_URL, {
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
    const NVIDIA_API_KEY = env.NVIDIA_API_KEY || globalThis.NVIDIA_API_KEY || ''
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

    if (!NVIDIA_API_KEY)
      return new Response(JSON.stringify({ error: 'NVIDIA_API_KEY not configured' }), {
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

    /* do NOT send top_p — known to cause NVIDIA V1 endpoint to hang */
    const nvidiaPayload = {
      model: MODEL,
      messages: body.messages,
      temperature: body.temperature ?? 1.0,
      max_tokens: body.max_tokens ?? 4096,
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    try {
      const nvidiaRes = await fetch(NVIDIA_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${NVIDIA_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(nvidiaPayload),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      const nvidiaText = await nvidiaRes.text()

      return new Response(nvidiaText, {
        status: nvidiaRes.status,
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

  /* cron warmup — keeps Worker and NVIDIA endpoint alive */
  async scheduled(event, env) {
    await warmup(env)
  },
}

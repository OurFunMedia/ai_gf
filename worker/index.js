/**
 * ai-gf NVIDIA NIM CORS Proxy — Cloudflare Worker
 *
 * 透明代理：前端 → Worker（CORS proxy）→ NVIDIA NIM API
 * 支援 streaming SSE 與非 streaming 請求。
 *
 * 環境變數（Cloudflare Secrets）：
 *   NVIDIA_API_KEY — NVIDIA NIM API key（沒設則從前端送 Authorization）
 *   ALLOWED_ORIGIN — 限制來源（留空 = 接受任何 origin）
 */

const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1'
const FETCH_TIMEOUT_MS = 120_000

/* shared warmup: keeps the Worker isolate alive */
async function warmup(env) {
  const key = env.NVIDIA_API_KEY || ''
  if (!key) return
  try {
    await fetch(`${NVIDIA_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'minimaxai/minimax-m2.7',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1, temperature: 0,
      }),
      signal: AbortSignal.timeout(20000),
    })
  } catch { /* non-critical */ }
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || ''
    /* 回傳請求的 origin（不限制）— API key 已在前端 JS bundle 中 */
    const corsHeaders = {
      'Access-Control-Allow-Origin': origin || '*',
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

    let body
    try { body = await req.json() }
    catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { model, messages, temperature, max_tokens, stream } = body
    if (!model || !messages)
      return new Response(JSON.stringify({ error: 'model and messages required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })

    /* 優先使用 worker env 的 API key，沒設才 fallback 到前端送來的 */
    const serverKey = env.NVIDIA_API_KEY || globalThis.NVIDIA_API_KEY || ''
    const authHeader = serverKey
      ? `Bearer ${serverKey}`
      : (req.headers.get('Authorization') || '')

    const nvidiaPayload = {
      model,
      messages,
      temperature: temperature ?? 1.0,
      max_tokens: max_tokens ?? 4096,
      stream: stream ?? false,
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    try {
      const nvidiaRes = await fetch(`${NVIDIA_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authHeader ? { 'Authorization': authHeader } : {}) },
        body: JSON.stringify(nvidiaPayload),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (stream) {
        /* SSE streaming — pipe through as-is */
        const { readable, writable } = new TransformStream()
        nvidiaRes.body.pipeTo(writable)
        return new Response(readable, {
          status: nvidiaRes.status,
          statusText: nvidiaRes.statusText,
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-store',
            'Connection': 'keep-alive',
          },
        })
      }

      const text = await nvidiaRes.text()
      return new Response(text, {
        status: nvidiaRes.status,
        statusText: nvidiaRes.statusText,
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

  async scheduled(event, env) {
    await warmup(env)
  },
}

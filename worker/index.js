/**
 * ai-gf CORS Proxy — Cloudflare Worker
 *
 * 多路由代理：
 *   預設路徑 → NVIDIA NIM API（chat completions）
 *   /agnes/  → Agnes AI API（image generations）
 *
 * 環境變數（Cloudflare Secrets）：
 *   NVIDIA_API_KEY — NVIDIA NIM API key（必要）
 *   AGNES_API_KEY  — Agnes AI API key（/agnes/ 路由必要）
 *   ALLOWED_ORIGIN — 限制來源（例如 https://ourfunmedia.github.io）
 */

const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1'
const AGNES_BASE = 'https://apihub.agnes-ai.com/v1'
const FETCH_TIMEOUT_MS = 120_000

/* shared warmup: keeps the Worker isolate alive */
async function warmup(env) {
  const nvidiaKey = env.NVIDIA_API_KEY || ''
  if (nvidiaKey) {
    try {
      await fetch(`${NVIDIA_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${nvidiaKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'minimaxai/minimax-m2.7',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1, temperature: 0,
        }),
        signal: AbortSignal.timeout(20000),
      })
    } catch { /* non-critical */ }
  }
  const agnesKey = env.AGNES_API_KEY || ''
  if (agnesKey) {
    try {
      await fetch(`${AGNES_BASE}/images/generations`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${agnesKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'agnes-image-2.0-flash', prompt: 'ping' }),
        signal: AbortSignal.timeout(20000),
      })
    } catch { /* non-critical */ }
  }
}

export default {
  async fetch(req, env) {
    const NVIDIA_API_KEY = env.NVIDIA_API_KEY || globalThis.NVIDIA_API_KEY || ''
    const AGNES_API_KEY = env.AGNES_API_KEY || globalThis.AGNES_API_KEY || ''
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

    /* ── route: Agnes AI API (image generations) ── */
    const url = new URL(req.url)
    if (url.pathname.startsWith('/agnes/')) {
      if (!AGNES_API_KEY)
        return new Response(JSON.stringify({ error: 'AGNES_API_KEY not configured' }), {
          status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

      let body
      try { body = await req.json() }
      catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      /* rewrite the path: /agnes/v1/... → /v1/... */
      const agnesPath = url.pathname.replace(/^\/agnes/, '')
      const agnesUrl = `${AGNES_BASE}${agnesPath}${url.search}`

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

      try {
        const agnesRes = await fetch(agnesUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AGNES_API_KEY}` },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
        clearTimeout(timeout)

        const text = await agnesRes.text()
        return new Response(text, {
          status: agnesRes.status,
          statusText: agnesRes.statusText,
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
    }

    /* ── route: NVIDIA NIM API (chat completions) ── */
    if (!NVIDIA_API_KEY)
      return new Response(JSON.stringify({ error: 'NVIDIA_API_KEY not configured' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${NVIDIA_API_KEY}` },
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

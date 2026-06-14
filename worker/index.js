/**
 * ai-gf NVIDIA M3 proxy — Cloudflare Worker
 *
 * 環境變數（Cloudflare Secrets）：
 *   NVIDIA_API_KEY    — NVIDIA NIM API key
 *   ALLOWED_ORIGIN    — 前端 origin（例如 https://ourfunmedia.github.io）
 */

const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
const MODEL = 'minimaxai/minimax-m3'

export default {
  async fetch(req, env) {
    const NVIDIA_API_KEY = env.NVIDIA_API_KEY || globalThis.NVIDIA_API_KEY || ''
    const ALLOWED_ORIGIN = env.ALLOWED_ORIGIN || globalThis.ALLOWED_ORIGIN || ''
    const origin = req.headers.get('Origin') || ''
    const allowedOrigin = ALLOWED_ORIGIN || origin
    /* if the request origin matches or is null (dev), echo it back */
    const corsOrigin = (!origin || origin === 'null' || origin === allowedOrigin) ? (origin || '*') : 'null'
    const corsHeaders = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    }

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    /* --- debug endpoint --- */
    if (req.url.includes('/debug')) {
      return new Response(JSON.stringify({
        hasKey: !!NVIDIA_API_KEY,
        keyPrefix: NVIDIA_API_KEY ? NVIDIA_API_KEY.substring(0, 10) + '...' : 'none',
        origin,
        allowedOrigin,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let body
    try {
      body = await req.json()
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON', detail: e.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const nvidiaPayload = {
      model: MODEL,
      messages: body.messages,
      temperature: body.temperature ?? 1.0,
      top_p: body.top_p ?? 0.95,
      max_tokens: body.max_tokens ?? 4096,
      stream: false,
    }

    if (!NVIDIA_API_KEY) {
      return new Response(JSON.stringify({ error: 'NVIDIA_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    try {
      const nvidiaRes = await fetch(NVIDIA_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${NVIDIA_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(nvidiaPayload),
      })

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
      return new Response(JSON.stringify({ error: err.message, name: err.name, cause: String(err.cause) }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  },
}

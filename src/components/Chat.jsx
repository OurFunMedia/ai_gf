import { useState, useRef, useEffect } from 'react'
import { get, put } from '../lib/db.js'

const AGNES_API_KEY = import.meta.env.VITE_AGNES_API_KEY
const AGNES_BASE = import.meta.env.VITE_AGNES_BASE_URL
const AGNES_CHAT_MODEL = import.meta.env.VITE_AGNES_CHAT_MODEL
const AGNES_IMAGE_MODEL = import.meta.env.VITE_AGNES_IMAGE_MODEL

const WELCOME = (name) => `嗨～我是${name}！今天過得怎麼樣呀？😊`
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

const SCENES = [
  { id: 'beach', icon: '🏖️', label: '沙灘', prompt: '單人照片，在沙灘上赤腳漫步回頭微笑，海風吹動髮絲與裙擺，藍天白雲與海浪，自然清爽風格，男友視角半身構圖' },
  { id: 'cafe', icon: '☕', label: '咖啡廳約會', prompt: '單人照片，在溫馨咖啡廳靠窗座位，手拿一杯拿鐵看向窗外，窗邊自然光灑落，舒適文青氛圍，男友視角半身特寫' },
  { id: 'bookstore', icon: '📚', label: '書店', prompt: '單人照片，在獨立書店裡站在書架前翻書，專注閱讀的側臉，暖黃色燈光，安靜文藝氛圍，男友視角半身構圖' },
  { id: 'park', icon: '🌿', label: '公園散步', prompt: '單人照片，在翠綠公園小徑上散步回頭微笑，陽光穿過樹葉灑下斑駁光影，自然清新風格，男友視角全身構圖' },
  { id: 'shopping', icon: '🛍️', label: '逛街試穿', prompt: '單人照片，在服飾店裡試穿衣服，對著鏡子整理衣領，店內暖色燈光，時尚都會風格，男友視角全身構圖' },
  { id: 'bedroom', icon: '🛋️', label: '睡房', prompt: '單人照片，在溫馨的睡房裡坐在床邊整理頭髮，窗外午後陽光柔和灑入，舒適放鬆的居家氛圍，男友視角半身構圖' },
]

/* build natural language body description from character settings */
const downloadImage = (url) => {
  const d = new Date()
  const ts = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`
  const a = document.createElement('a')
  a.href = url; a.download = `${ts}.png`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

const buildBodyDesc = (c) => {
  const parts = []
  if (c.age) parts.push(`${c.age}歲`)
  const heightMap = { 矮細: '身高嬌小', 中等: '中等身高', 高挑: '高挑身材' }
  if (c.height) parts.push(heightMap[c.height] || c.height)
  if (c.figure) parts.push(c.figure + '身材')
  const bustMap = { 微乳: '微乳', 中等: '中等上圍', 明顯: '明顯上圍', 暴乳: '豐滿暴乳' }
  if (c.bust) parts.push(bustMap[c.bust] || c.bust + '上圍')
  const waistMap = { 細: '細腰', 中: '中等腰圍', 寬: '豐腴腰身' }
  if (c.waist) parts.push(waistMap[c.waist] || c.waist)
  if (c.hipWidth && c.hipShape === '翹') {
    const hipMap = { 窄: '窄翹臀', 中: '翹臀', 寬: '豐滿翹臀' }
    parts.push(hipMap[c.hipWidth] || '翹臀')
  } else if (c.hipWidth) {
    const hipMap = { 窄: '窄臀', 中: '中等臀圍', 寬: '豐滿臀部' }
    parts.push(hipMap[c.hipWidth] || '')
  }
  if (c.style) parts.push(c.style + '風格')
  return parts.join('、')
}

export default function Chat({ character, onChangeCharacter }) {
  const [messages, setMessages] = useState([])
  const [ready, setReady] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [viewerUrl, setViewerUrl] = useState(null)
  const messagesEndRef = useRef(null)

  /* image gen */
  const [imgMode, setImgMode] = useState(false)
  const [selectedScene, setSelectedScene] = useState(null)
  const [customPrompt, setCustomPrompt] = useState('')
  const [genLoading, setGenLoading] = useState(false)
  const [genStatus, setGenStatus] = useState('')
  const [genProgress, setGenProgress] = useState(0)
  const [proMode, setProMode] = useState(false)

  const abortRef = useRef(null)
  const persistTimer = useRef(null)
  const cancelGen = () => {
    abortRef.current?.abort()
    setGenLoading(false); setGenStatus(''); setGenProgress(0); setError('')
  }

  /* load persisted messages on mount */
  useEffect(() => {
    get('messages', 'chat')
      .then((record) => {
        if (record?.messages?.length) {
          setMessages(record.messages)
        } else {
          setMessages([{ id: uid(), role: 'assistant', content: WELCOME(character.name) }])
        }
      })
      .catch(() => {
        setMessages([{ id: uid(), role: 'assistant', content: WELCOME(character.name) }])
      })
      .finally(() => setReady(true))
  }, [])

  /* debounced persist messages to IndexedDB */
  useEffect(() => {
    if (!ready) return
    clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      put('messages', { id: 'chat', messages }).catch((err) => {
        console.error('Failed to save messages:', err)
      })
    }, 1500)
    return () => clearTimeout(persistTimer.current)
  }, [messages, ready])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const deleteMessage = (id) => {
    if (!window.confirm('確定刪除此訊息？')) return
    setMessages(prev => prev.filter(m => m.id !== id))
  }

  if (!ready) return null

  /* build full system prompt with name consistency rule */
  const getSystemContent = () => {
    const selfRule = `\n\n當你自我稱呼時，一定要用你的角色名稱「${character.name}」自稱，不要用「我」。例如說「${character.name}今天好開心～」而不是「我今天好開心～」。`
    let base = character.personality || ''
    if (!proMode) return base ? `${base}${selfRule}` : undefined
    const bodyDesc = buildBodyDesc(character)
    const proExtra = `

 你現在是使用者的「專屬拍攝助理」！你是專業級攝影指導，為使用者規劃並拍攝 ${character.name} 的照片。

 🔑 核心原則：**完全忠於使用者的拍攝要求**。使用者說怎麼拍就怎麼拍，你的建議只是選項，最終以使用者指定的為主。

 你的任務是引導使用者說出想要的畫面，並提供專業建議。遵循以下流程：

 步驟一：先讓使用者描述想拍什麼畫面。
 步驟二：逐一確認細節（每次問 1-2 項），並**提供選項讓使用者選擇**：
  - 場景：哪裡？室內還是戶外？例如「海邊夕陽很浪漫，或者咖啡廳文青風也不錯？」
  - 姿勢：提供具體選項。例如「${character.name}可以回頭微笑、撩頭髮、喝飲料、倚靠欄杆、低頭滑手機～你喜歡哪種？」
  - 風格：寫實自然、夢幻、電影感、可愛還是性感？
  - 光源：自然光、夕陽、霓虹、燭光？
  - 構圖：特寫、半身、全身、男友視角？
  - 品質要求：高畫質、精細細節？
  - 服裝：根據場景建議適合的穿著
 步驟三：收集所有必要元素後，**務必嚴格按照以下格式輸出**（包含 [PROMPT] 和 [/PROMPT] 標籤）：

 [PROMPT]以 ${character.name} 為主角的詳細照片提示，包含主體動作、場景氛圍、風格、光源、構圖、品質、光影和細節描述[/PROMPT]

 ⚠️ 重要：最終輸出**必須**包含 [PROMPT]...[/PROMPT] 標籤，否則無法生成照片。標籤內是你要生成的完整照片描述，不要有任何其它文字在標籤內。

 整個對話使用中文。一次問 1-2 個問題就好，讓對話自然流暢。`
    return base ? `${base}${selfRule}${proExtra}` : `${proExtra}${selfRule}`
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setError('')
    const newMessages = [...messages, { id: uid(), role: 'user', content: userMsg }]
    setMessages(newMessages)
    setLoading(true)
    abortRef.current = new AbortController()
    try {
      const systemContent = getSystemContent()
      const payload = {
        model: AGNES_CHAT_MODEL,
        messages: [
          ...(systemContent ? [{ role: 'system', content: systemContent }] : []),
          ...newMessages.map(m => ({ role: m.role, content: m.content })),
        ],
        temperature: 0.8, max_tokens: 1024,
      }
      const res = await fetch(`${AGNES_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${AGNES_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortRef.current.signal,
      })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data = await res.json()
      const reply = data.choices?.[0]?.message?.content || '...'

      /* pro mode: detect generation trigger for auto image generation */
      if (proMode) {
        let expandedPrompt = null

        /* pattern 1: [PROMPT]...[/PROMPT] (primary format) */
        const tagMatch = reply.match(/\[PROMPT\]([\s\S]*?)\[\/PROMPT\]/)
        if (tagMatch) expandedPrompt = tagMatch[1].trim()

        /* pattern 2: markdown code block ```
        if (!expandedPrompt) {
          const codeMatch = reply.match(/```(?:plaintext)?\s*([\s\S]*?)```/)
          if (codeMatch) expandedPrompt = codeMatch[1].trim()
        }

        /* pattern 3: long descriptive text (no question marks = final output) */
        if (!expandedPrompt && reply.length > 80 && !reply.includes('？') && !reply.includes('?')) {
          const proMsgs = messages.filter(m => m.role === 'assistant')
          if (proMsgs.length >= 1) {
            /* strip conversational framing */
            let candidate = reply.replace(/^(好的|OK|好|來了|準備好了|以下是|這就為你).{0,20}[:：]/i, '')
            if (candidate.length > 50) expandedPrompt = candidate.trim()
          }
        }

        if (expandedPrompt) {
          const cleanReply = reply
            .replace(/\[PROMPT\][\s\S]*?\[\/PROMPT\]/, '')
            .replace(/```[\s\S]*?```/, '')
            .trim()
          setMessages(prev => [...prev, {
            id: uid(), role: 'assistant',
            content: cleanReply || '📸 幫你生成大師級男友視覺照片中...',
          }])
          setProMode(false)
          setLoading(false)
          await generateImageFromPrompt(expandedPrompt)
          return
        }
      }

      setMessages(prev => [...prev, { id: uid(), role: 'assistant', content: reply }])
    } catch (err) { if (err.name !== 'AbortError') setError(err.message) }
    finally { setLoading(false); abortRef.current = null }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  /* shared image API call */
  const callImageAPI = async (finalPrompt, refUrl, signal) => {
    const payload = { model: AGNES_IMAGE_MODEL, prompt: finalPrompt, size: '1024x1536' }
    if (refUrl) {
      payload.extra_body = { image: [refUrl], response_format: 'b64_json' }
    }
    const res = await fetch(`${AGNES_BASE}/images/generations`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${AGNES_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    const data = await res.json()
    const b64 = data.data?.[0]?.b64_json
    if (!b64) throw new Error('No image returned')
    return `data:image/png;base64,${b64}`
  }

  /* AI expand prompt for more detail and randomness */
  const expandPrompt = async (base, signal, hasRef = false) => {
    const today = new Date()
    const season = ['冬','春','春','春','夏','夏','夏','秋','秋','秋','冬','冬'][today.getMonth()]
    const hour = today.getHours()
    const timeOfDay = hour < 6 ? '凌晨' : hour < 9 ? '早晨' : hour < 12 ? '上午' : hour < 14 ? '中午' : hour < 17 ? '下午' : hour < 19 ? '黃昏' : '夜晚'
    const weathers = ['晴朗','微雲','多雲','陽光普照','和煦']
    const weather = weathers[Math.floor(Math.random() * weathers.length)]

    const styleHint = '自然風格、真實生活感'

    const clothingRule = hasRef
      ? '1. 🧥 服裝：保持服裝不變（如果有參考圖），除非使用者明確要求換衣服。'
      : '1. 🧥 服裝：根據場景場合選擇合適的服裝。例如洋裝、T恤牛仔褲、襯衫短裙、連身褲、針織衫、運動服等。'

    const sysMsg = `你是專業攝影師，每次都要輸出截然不同的照片提示。\
除非使用者指定其他人，否則主體預設是「${character.name}」（即照片中的人物）。\
根據場景和角色的身體特徵，加入以下所有元素（每次都不同）：

${clothingRule}
2. 🧍 姿勢：每次都要換一種姿勢。例如回頭微笑、撩頭髮、低頭滑手機、喝飲料、整理衣領、倚靠牆邊、蹲下綁鞋帶、伸懶腰等。
3. ☁️ 天氣：加入天氣描述（${weather}）。
4. 🌅 時間光線：現在是${timeOfDay}，${season}季，加入對應的自然光描述。
5. 🎨 色彩基調：配合場景和風格選擇整體色調。
6. 😊 表情情緒：每次換一種表情情緒。

⚠️ 重要：如果使用者的提示中明確要求「保持某元素不變」或「同一服裝」等，務必優先遵守使用者的指示，不要擅自更改。
風格方向：${styleHint}。只輸出擴寫後的提示（一段中文，不要前言、不要說明、不要換行）。`
    const res = await fetch(`${AGNES_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${AGNES_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: AGNES_CHAT_MODEL,
        messages: [
          { role: 'system', content: sysMsg },
          { role: 'user', content: base },
        ],
        temperature: 0.95, max_tokens: 768,
      }),
      signal,
    })
    if (!res.ok) return base
    const data = await res.json()
    const expanded = data.choices?.[0]?.message?.content?.trim()
    return expanded || base
  }

  const generateImage = async () => {
    const promptText = customPrompt.trim() || (selectedScene ? SCENES.find(s => s.id === selectedScene)?.prompt : '')
    if (!promptText) { setError('請選擇一個情境或輸入描述'); return }

    abortRef.current = new AbortController()
    const signal = abortRef.current.signal
    setGenLoading(true); setGenStatus('✏️'); setGenProgress(5); setError('')

    try {
      const bodyDesc = buildBodyDesc(character)
      const hasRef = !!character.refImageUrl
      const refClause = hasRef ? '角色外貌保持不變（臉部、髮型、體型、服裝完全與參考圖一致）' : ''
      const basePrompt = `${refClause}${refClause ? '，' : ''}${bodyDesc}，${promptText}`.replace(/^，/, '')

      /* step 1: AI expand with randomness */
      setGenStatus('✏️'); setGenProgress(20)
      const expandedPrompt = await expandPrompt(basePrompt, signal, hasRef)
      if (signal.aborted) return
      setGenProgress(45)

      /* step 2: send expanded prompt to image API */
      setGenStatus('🎨'); setGenProgress(50)
      const finalPrompt = `${expandedPrompt}。高畫質、精細細節、寫實風格`
      const dataUrl = await callImageAPI(finalPrompt, character.refImageUrl, signal)
      setGenProgress(95)
      if (signal.aborted) return

      const label = selectedScene ? SCENES.find(s => s.id === selectedScene)?.label : '自訂'
      const imageMsg = {
        id: uid(), role: 'assistant', type: 'image',
        imageUrl: dataUrl, content: `📸 生成了「${label}」的圖片`,
      }
      const promptMsg = character.showPrompt ? {
        id: uid(), role: 'assistant', type: 'prompt',
        content: `💡 ${expandedPrompt}`,
      } : null
      setMessages(prev => [...prev, imageMsg, ...(promptMsg ? [promptMsg] : [])])

      /* persist to image history */
      const record = { id: `img_${Date.now()}`, imageUrl: dataUrl, scene: selectedScene, prompt: promptText, timestamp: Date.now() }
      await put('images', record)

      setImgMode(false); setSelectedScene(null); setCustomPrompt('')
      /* reset only data-URL reference (set via 修改這張圖), preserve external URLs */
      if (character.refImageUrl?.startsWith('data:')) {
        onChangeCharacter?.({...character, refImageUrl: ''})
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      setError(err.message)
    }
    finally { setGenLoading(false); setGenStatus(''); setGenProgress(0); abortRef.current = null }
  }

  /* auto-generate image from AI-crafted prompt in pro mode */
  const generateImageFromPrompt = async (expandedPrompt, label = '大師級作品') => {
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal
    setGenLoading(true); setGenStatus('🎨'); setGenProgress(10)
    const bodyDesc = buildBodyDesc(character)
    const refClause = character.refImageUrl ? '角色外貌保持不變（臉部、髮型、體型、服裝完全與參考圖一致）' : ''
    const finalPrompt = `${refClause}${refClause ? '，' : ''}${bodyDesc}，${expandedPrompt}。高畫質、精細細節、寫實風格`.replace(/^，/, '')

    try {
      setGenProgress(30)
      const dataUrl = await callImageAPI(finalPrompt, character.refImageUrl, signal)
      if (signal.aborted) return
      setGenProgress(95)

      const imageMsg = {
        id: uid(), role: 'assistant', type: 'image',
        imageUrl: dataUrl, content: `📸 大師級男友視覺作品 — ${label}`,
      }
      const promptMsg = character.showPrompt ? {
        id: uid(), role: 'assistant', type: 'prompt',
        content: `💡 ${finalPrompt}`,
      } : null
      setMessages(prev => [...prev, imageMsg, ...(promptMsg ? [promptMsg] : [])])

      /* persist to image history */
      const record = { id: `img_${Date.now()}`, imageUrl: dataUrl, scene: 'pro', prompt: expandedPrompt, timestamp: Date.now() }
      await put('images', record)

      setImgMode(false); setProMode(false)
      /* reset only data-URL reference (set via 修改這張圖), preserve external URLs */
      if (character.refImageUrl?.startsWith('data:')) {
        onChangeCharacter?.({...character, refImageUrl: ''})
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      setError(err.message)
    }
    finally { setGenLoading(false); setGenStatus(''); setGenProgress(0); abortRef.current = null }
  }

  const toggleImgMode = () => {
    if (genLoading) cancelGen()
    setImgMode(!imgMode)
    setError('')
    if (!imgMode) { setSelectedScene(null); setCustomPrompt('') }
  }

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`} style={{ position: 'relative' }}>
            <div className="message-avatar">{msg.role === 'assistant' ? '♡' : '☺'}</div>
            <div className="message-bubble" style={{ position: 'relative', ...(msg.type === 'image' ? { width: '50%' } : {}) }}>
              <button onClick={() => deleteMessage(msg.id)}
                style={{
                  position: 'absolute', top: 2, right: 4,
                  background: 'none', border: 'none', color: 'var(--text-muted)',
                  fontSize: '0.7rem', cursor: 'pointer', opacity: 0.3,
                  lineHeight: 1, padding: '2px 4px', zIndex: 1,
                }}
                title="刪除訊息">✕</button>
              {msg.type === 'image' ? (
                <>
                  <p style={{ marginBottom: 8 }}>{msg.content}</p>
                  <img src={msg.imageUrl} alt="" onClick={() => setViewerUrl(msg.imageUrl)} style={{ width: '100%', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }} />
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => downloadImage(msg.imageUrl)}
                    style={{
                      padding: '4px 12px', fontSize: '0.75rem',
                      borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                      background: 'var(--bg-input)', color: 'var(--text-muted)', cursor: 'pointer',
                    }}>
                    ⬇️ 下載
                  </button>
                  <button onClick={() => {
                    const isRef = msg.imageUrl === character.refImageUrl
                    onChangeCharacter?.({ ...character, refImageUrl: isRef ? '' : msg.imageUrl })
                    setImgMode(isRef ? false : true) /* open 🎨 on set, close on cancel */
                  }}
                  style={{
                    marginTop: 8, padding: '4px 12px', fontSize: '0.75rem',
                    borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                    background: msg.imageUrl === character.refImageUrl ? 'rgba(232,67,147,0.15)' : 'var(--bg-input)',
                    color: msg.imageUrl === character.refImageUrl ? 'var(--pink-light)' : 'var(--text-muted)',
                    cursor: 'pointer', display: 'block',
                  }}>
                    {msg.imageUrl === character.refImageUrl ? '✕ 取消修改' : '📌 修改這張圖'}
                  </button>
                  </div>
                </>
              ) : msg.type === 'prompt' ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{msg.content}</p>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="message assistant">
            <div className="message-avatar">♡</div>
            <div className="message-bubble">...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && <div className="error">{error}</div>}

      {imgMode && (
        <div className="chat-img-panel" style={{ padding: '12px 0', borderTop: '1px solid var(--border)' }}>
          {!character.refImageUrl && (
            <div style={{
              padding: '8px 12px', marginBottom: 10, borderRadius: 'var(--radius-sm)',
              background: 'rgba(255, 193, 7, 0.1)', border: '1px solid rgba(255, 193, 7, 0.3)',
              fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5,
            }}>
              ⚠️ 未設定角色外貌參考圖，生成的角色臉部可能不一致。
              到 <strong>設定</strong> 頁面上傳參考圖可保持角色穩定性。
            </div>
          )}
          {/* mode toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button className={`scene-btn ${!proMode ? 'selected' : ''}`}
              onClick={() => setProMode(false)}
              style={{ flex: 1, padding: '8px 4px', fontSize: '0.85rem' }}>
              📋 情境場景
            </button>
            <button className={`scene-btn ${proMode ? 'selected' : ''}`}
              onClick={() => setProMode(true)}
              style={{ flex: 1, padding: '8px 4px', fontSize: '0.85rem' }}>
              🌟 專業大師級
            </button>
          </div>

          {proMode ? (
            <div style={{ marginBottom: 8, padding: '8px 0' }}>
              <p style={{ fontSize: '0.9rem', marginBottom: 8, lineHeight: 1.5 }}>
                🌟 大師級男友視覺攝影模式
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                在對話中告訴小艾你想拍什麼照片（例如：「我想在海邊拍一張照片」），
                她會一步步引導你完成專業級構圖，最後自動生成大師級作品！
              </p>
            </div>
          ) : (
            <>
              <div className="scene-grid" style={{ marginBottom: 12 }}>
                {SCENES.map(scene => (
                  <button key={scene.id}
                    className={`scene-btn ${selectedScene === scene.id ? 'selected' : ''}`}
                    style={{ padding: '10px 8px', fontSize: '0.8rem' }}
                    onClick={() => { setSelectedScene(scene.id); setCustomPrompt(''); setError('') }}>
                    <span style={{ fontSize: '1.4rem', display: 'block', marginBottom: 4 }}>{scene.icon}</span>
                    {scene.label}
                  </button>
                ))}
              </div>
              <textarea className="chat-input" rows={6} value={customPrompt}
                onChange={e => { setCustomPrompt(e.target.value); setSelectedScene(null); setError('') }}
                placeholder="或自訂情境描述，例如：在雪山頂上看日出..."
                style={{ width: '100%', marginBottom: 8 }} disabled={genLoading} />
              {genLoading ? (
                <div>
                  <div className="gen-progress-wrap">
                    <div className="gen-progress-bar">
                      <div className="gen-progress-fill" style={{ width: genProgress + '%' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', flex: 1 }}>
                      {genStatus} {genStatus === '✏️' ? 'AI 擴寫提示中...' : genStatus === '🎨' ? '生成圖片中...' : '處理中...'}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{genProgress}%</span>
                  </div>
                  <button className="chat-send" onClick={cancelGen}
                    style={{ width: '100%', background: 'transparent', border: '1px solid #ff6b6b', color: '#ff6b6b' }}>
                    ✕ 取消
                  </button>
                </div>
              ) : (
                <button className="chat-send" style={{ width: '100%' }} onClick={generateImage} disabled={!selectedScene && !customPrompt.trim()}>
                  🎨 生成 {character.name} 的圖片
                </button>
              )}
            </>
          )}
        </div>
      )}

      <div className="chat-input-area">
        <button className={`tab ${imgMode ? 'active' : ''}`} onClick={toggleImgMode}
          style={{ flexShrink: 0 }} title="生成圖片">
          📸
        </button>
        <textarea className="chat-input" rows={1} value={input}
          onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
          placeholder={proMode ? `描述你想拍的畫面...` : `跟${character.name}說說話...`} disabled={loading || genLoading} />
        <button className="chat-send" onClick={sendMessage} disabled={loading || !input.trim()}>送出</button>
      </div>

      {/* full-screen image viewer */}
      {viewerUrl && (
        <div className="album-viewer-overlay" onClick={() => setViewerUrl(null)}>
          <div className="album-viewer-content" onClick={e => e.stopPropagation()}>
            <button className="album-viewer-close" onClick={() => setViewerUrl(null)}>✕</button>
            <img src={viewerUrl} alt="" />
          </div>
        </div>
      )}
    </div>
  )
}

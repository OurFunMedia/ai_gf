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
  const messagesEndRef = useRef(null)

  /* image gen */
  const [imgMode, setImgMode] = useState(false)
  const [selectedScene, setSelectedScene] = useState(null)
  const [customPrompt, setCustomPrompt] = useState('')
  const [genLoading, setGenLoading] = useState(false)
  const [genStatus, setGenStatus] = useState('')
  const [proMode, setProMode] = useState(false)
  const [styleMode, setStyleMode] = useState(
    character.style === '性感' ? 'sexy' : character.style === '可愛' ? 'cute' : ''
  ) /* 'sexy' or 'cute' or '' */

  const abortRef = useRef(null)
  const persistTimer = useRef(null)
  const cancelGen = () => {
    abortRef.current?.abort()
    setGenLoading(false); setGenStatus(''); setError('')
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

  if (!ready) return null

  /* system prompt augmentation for pro mode */
  const getSystemContent = () => {
    let base = character.personality || ''
    if (!proMode) return base || undefined
    const bodyDesc = buildBodyDesc(character)
    const proExtra = `

 你現在是「專業攝影大師」模式。你的角色身體特徵：${bodyDesc}。

 當使用者在對話中想要拍照時，依照以下流程引導他們：

 1. 先讓使用者描述他們想拍什麼畫面
 2. 逐一詢問缺少的元素（一次問 1-2 個，不要全部一次問完）：
    - 主體：誰在畫面中？在做什麼？
    - 場景/環境：在哪裡？室內還是戶外？
    - 風格：寫實、夢幻、電影感、可愛或性感？
    - 光源：自然光、夕陽、霓虹、燭光？
    - 構圖：特寫、半身、全身、第一人稱男友視角？
    - 品質要求：高畫質、精細細節？
 3. 收集到所有必要元素後，輸出完整的中文照片提示如下：
 [PROMPT]詳細的中文照片提示，描述主體動作、場景氛圍、風格、光源、構圖、品質，加入隨機的光影和細節描述[/PROMPT]

 注意：整個對話使用中文。一次問 1-2 個問題就好，不要一次全問，讓對話自然流暢。`
    return base ? `${base}\n${proExtra}` : proExtra
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

      /* pro mode: detect [PROMPT] tag for auto image generation */
      if (proMode) {
        const promptMatch = reply.match(/\[PROMPT\]([\s\S]*?)\[\/PROMPT\]/)
        if (promptMatch) {
          const expandedPrompt = promptMatch[1].trim()
          const cleanReply = reply.replace(/\[PROMPT\][\s\S]*?\[\/PROMPT\]/, '').trim()
          setMessages(prev => [...prev, {
            id: uid(), role: 'assistant',
            content: cleanReply || '📸 幫你生成大師級男友視覺照片中...',
          }])
          setProMode(false) /* exit pro mode */
          setLoading(false) /* release chat loading before image gen starts */
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
  const expandPrompt = async (base, signal) => {
    const styleHint = styleMode === 'sexy'
      ? '時尚性感、成熟嫵媚、自信迷人'
      : styleMode === 'cute' ? '可愛活潑、清新自然、甜美療癒'
      : '自然風格、真實生活感'
    const sysMsg = `你是專業攝影師，請將以下照片提示擴寫成更豐富、更多細節、每次輸出都不同的版本。\
加入光線描述、色彩氛圍、情緒表情、隨機環境細節。維持中文敘述。\
風格方向：${styleHint}。只輸出擴寫後的提示，不要任何前言或說明。`
    const res = await fetch(`${AGNES_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${AGNES_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: AGNES_CHAT_MODEL,
        messages: [
          { role: 'system', content: sysMsg },
          { role: 'user', content: base },
        ],
        temperature: 0.95, max_tokens: 512,
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
    setGenLoading(true); setGenStatus('✏️'); setError('')

    try {
      const bodyDesc = buildBodyDesc(character)
      const refClause = character.refImageUrl ? '角色外貌保持不變（臉部、髮型、體型完全與參考圖一致）' : ''
      const styleHint = styleMode === 'sexy' ? '時尚性感風格' : styleMode === 'cute' ? '可愛活潑風格' : ''
      const basePrompt = styleHint
        ? `${refClause}${refClause ? '，' : ''}${bodyDesc}，${styleHint}，${promptText}`.replace(/^，/, '')
        : `${refClause}${refClause ? '，' : ''}${bodyDesc}，${promptText}`.replace(/^，/, '')

      /* step 1: AI expand with randomness */
      setGenStatus('✏️')
      const expandedPrompt = await expandPrompt(basePrompt, signal)
      if (signal.aborted) return

      /* step 2: send expanded prompt to image API */
      setGenStatus('🎨')
      const finalPrompt = `${expandedPrompt}。高畫質、精細細節、寫實風格`
      const dataUrl = await callImageAPI(finalPrompt, character.refImageUrl, signal)
      if (signal.aborted) return

      const label = selectedScene ? SCENES.find(s => s.id === selectedScene)?.label : '自訂'
      const imageMsg = {
        id: uid(), role: 'assistant', type: 'image',
        imageUrl: dataUrl, content: `📸 生成了「${label}」的圖片`,
      }
      setMessages(prev => [...prev, imageMsg])

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
    finally { setGenLoading(false); setGenStatus(''); abortRef.current = null }
  }

  /* auto-generate image from AI-crafted prompt in pro mode */
  const generateImageFromPrompt = async (expandedPrompt, label = '大師級作品') => {
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal
    setGenLoading(true); setGenStatus('🎨')
    const bodyDesc = buildBodyDesc(character)
    const refClause = character.refImageUrl ? '角色外貌保持不變（臉部、髮型、體型完全與參考圖一致）' : ''
    const finalPrompt = `${refClause}${refClause ? '，' : ''}${bodyDesc}，${expandedPrompt}。高畫質、精細細節、寫實風格`.replace(/^，/, '')

    try {
      const dataUrl = await callImageAPI(finalPrompt, character.refImageUrl, signal)
      if (signal.aborted) return

      const imageMsg = {
        id: uid(), role: 'assistant', type: 'image',
        imageUrl: dataUrl, content: `📸 大師級男友視覺作品 — ${label}`,
      }
      setMessages(prev => [...prev, imageMsg])

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
    finally { setGenLoading(false); setGenStatus(''); abortRef.current = null }
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
          <div key={msg.id} className={`message ${msg.role}`}>
            <div className="message-avatar">{msg.role === 'assistant' ? '♡' : '☺'}</div>
            <div className="message-bubble">
              {msg.type === 'image' ? (
                <>
                  <p style={{ marginBottom: 8 }}>{msg.content}</p>
                  <img src={msg.imageUrl} alt="" style={{ width: '100%', borderRadius: 'var(--radius-sm)' }} />
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
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button className={`scene-btn ${styleMode === 'cute' ? 'selected' : ''}`}
                  onClick={() => setStyleMode(v => v === 'cute' ? '' : 'cute')}
                  style={{ flex: 1, padding: '10px 8px', fontSize: '0.85rem' }}>
                  🌸 可愛活潑
                </button>
                <button className={`scene-btn ${styleMode === 'sexy' ? 'selected' : ''}`}
                  onClick={() => setStyleMode(v => v === 'sexy' ? '' : 'sexy')}
                  style={{ flex: 1, padding: '10px 8px', fontSize: '0.85rem' }}>
                  🔥 時尚性感
                </button>
              </div>
              <textarea className="chat-input" rows={6} value={customPrompt}
                onChange={e => { setCustomPrompt(e.target.value); setSelectedScene(null); setError('') }}
                placeholder="或自訂情境描述，例如：在雪山頂上看日出..."
                style={{ width: '100%', marginBottom: 8 }} disabled={genLoading} />
              {genLoading ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="chat-send" style={{ flex: 1 }} disabled>
                    {genStatus || '🎨'} 處理中...
                  </button>
                  <button className="chat-send" onClick={cancelGen}
                    style={{ flexShrink: 0, background: 'transparent', border: '1px solid #ff6b6b', color: '#ff6b6b' }}>
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
          style={{ padding: '8px 12px', fontSize: '1.1rem', flexShrink: 0 }} title="生成圖片">
          🎨
        </button>
        <textarea className="chat-input" rows={1} value={input}
          onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
          placeholder={proMode ? `描述你想拍的畫面...` : `跟${character.name}說說話...`} disabled={loading || genLoading} />
        <button className="chat-send" onClick={sendMessage} disabled={loading || !input.trim()}>送出</button>
      </div>
    </div>
  )
}

import { useState, useRef, useEffect } from 'react'
import { get, put } from '../lib/db.js'

const AGNES_API_KEY = import.meta.env.VITE_AGNES_API_KEY
const AGNES_BASE = import.meta.env.VITE_AGNES_BASE_URL
const AGNES_CHAT_MODEL = import.meta.env.VITE_AGNES_CHAT_MODEL
const AGNES_IMAGE_MODEL = import.meta.env.VITE_AGNES_IMAGE_MODEL

const WELCOME = (name) => `嗨～我是${name}！今天過得怎麼樣呀？😊`

const SCENES = [
  { id: 'sunset-beach', icon: '🌅', label: '沙灘夕陽', prompt: '在夕陽沙灘上回頭微笑，金色陽光灑在海面與臉龐，溫暖的逆光輪廓，男友視角半身構圖' },
  { id: 'cafe', icon: '☕', label: '咖啡廳約會', prompt: '在溫馨咖啡廳靠窗座位，手拿一杯拿鐵看向窗外，窗邊自然光灑落，舒適文青氛圍，男友視角半身特寫' },
  { id: 'bookstore', icon: '📚', label: '書店', prompt: '在獨立書店裡站在書架前翻書，專注閱讀的側臉，暖黃色燈光，安靜文藝氛圍，男友視角半身構圖' },
  { id: 'night-city', icon: '🌃', label: '城市夜景', prompt: '在高樓夜景前轉身回眸，身後是繁華城市霓虹燈光，微風吹動髮絲，藍調夜晚氛圍，男友視角半身構圖' },
  { id: 'park', icon: '🌿', label: '公園散步', prompt: '在翠綠公園小徑上散步回頭微笑，陽光穿過樹葉灑下斑駁光影，自然清新風格，男友視角全身構圖' },
  { id: 'bed-morning', icon: '🛏️', label: '早晨賴床', prompt: '在溫暖的被窩裡剛睡醒，揉揉眼睛露出慵懶微笑，窗外晨光灑入，柔和自然光，男友視角特寫' },
  { id: 'cooking', icon: '🍳', label: '廚房做早餐', prompt: '在廚房裡穿著圍裙做早餐，回頭對鏡頭微笑，平底鍋冒著熱氣，暖黃色廚房燈光，溫馨居家氛圍，男友視角半身構圖' },
  { id: 'rainy', icon: '🌂', label: '雨天窗邊', prompt: '在窗邊看雨，手中握著一杯熱茶，窗外朦朧雨景，憂鬱而浪漫的氛圍，柔和室內燈光，男友視角半身構圖' },
  { id: 'shopping', icon: '🛍️', label: '逛街試穿', prompt: '在服飾店裡試穿衣服，對著鏡子整理衣領，店內暖色燈光，時尚都會風格，男友視角全身構圖' },
  { id: 'bedroom', icon: '🛋️', label: '睡房', prompt: '在溫馨的睡房裡坐在床邊整理頭髮，窗外午後陽光柔和灑入，舒適放鬆的居家氛圍，男友視角半身構圖' },
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
  const [proMode, setProMode] = useState(false)

  /* load persisted messages on mount */
  useEffect(() => {
    get('messages', 'chat')
      .then((record) => {
        if (record?.messages?.length) {
          setMessages(record.messages)
        } else {
          setMessages([{ role: 'assistant', content: WELCOME(character.name) }])
        }
      })
      .catch(() => {
        setMessages([{ role: 'assistant', content: WELCOME(character.name) }])
      })
      .finally(() => setReady(true))
  }, [])

  /* persist messages to IndexedDB whenever they change */
  useEffect(() => {
    if (!ready) return
    put('messages', { id: 'chat', messages }).catch((err) => {
      console.error('Failed to save messages:', err)
    })
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
   - 風格：寫實、夢幻、電影感、動漫風格？
   - 光源：自然光、夕陽、霓虹、燭光？
   - 構圖：特寫、半身、全身、第一人稱男友視角？
   - 品質要求：高畫質、精細細節？
3. 收集到所有必要元素後，輸出完整的英文提示如下：
[PROMPT]詳細的英文提示，必須遵循結構：[Subject] + [Body Description: ${bodyDesc}] + [Scene/Environment] + [Style] + [Lighting] + [Composition] + [Quality]，強調男友視覺第一人稱拍攝視角[/PROMPT]

注意：對話使用中文，只有 [PROMPT] 區塊用英文。一次問 1-2 個問題就好，不要一次全問，讓對話自然流暢。`
    return base ? `${base}\n${proExtra}` : proExtra
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setError('')
    const newMessages = [...messages, { role: 'user', content: userMsg }]
    setMessages(newMessages)
    setLoading(true)
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
            role: 'assistant',
            content: cleanReply || '📸 幫你生成大師級男友視覺照片中...',
          }])
          setProMode(false) /* exit pro mode */
          setLoading(false) /* release chat loading before image gen starts */
          await generateImageFromPrompt(expandedPrompt)
          return
        }
      }

      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const generateImage = async () => {
    const promptText = customPrompt.trim() || (selectedScene ? SCENES.find(s => s.id === selectedScene)?.prompt : '')
    if (!promptText) { setError('請選擇一個情境或輸入描述'); return }
    setGenLoading(true); setError('')
    const bodyDesc = buildBodyDesc(character)
    const refClause = character.refImageUrl ? '角色外貌保持不變（臉部、髮型、體型完全與參考圖一致）' : ''
    const fullPrompt = `${refClause}${refClause ? '，' : ''}${bodyDesc}，${promptText}。高畫質、精細細節、寫實風格`.replace(/^，/, '')

    try {
      const payload = { model: AGNES_IMAGE_MODEL, prompt: fullPrompt, size: '1024x1536' }
      if (character.refImageUrl) {
        payload.extra_body = { image: [character.refImageUrl], response_format: 'b64_json' }
      }
      const res = await fetch(`${AGNES_BASE}/images/generations`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${AGNES_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data = await res.json()
      const b64 = data.data?.[0]?.b64_json
      if (!b64) throw new Error('No image returned')
      const dataUrl = `data:image/png;base64,${b64}`

      const label = selectedScene ? SCENES.find(s => s.id === selectedScene)?.label : '自訂'
      const imageMsg = {
        role: 'assistant',
        type: 'image',
        imageUrl: dataUrl,
        content: `📸 生成了「${label}」的圖片`,
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
    } catch (err) { setError(err.message) }
    finally { setGenLoading(false) }
  }

  /* auto-generate image from AI-crafted prompt in pro mode */
  const generateImageFromPrompt = async (expandedPrompt, label = '大師級作品') => {
    setGenLoading(true)
    const bodyDesc = buildBodyDesc(character)
    const refClause = character.refImageUrl ? '角色外貌保持不變（臉部、髮型、體型完全與參考圖一致）' : ''
    const fullPrompt = `${refClause}${refClause ? '，' : ''}${bodyDesc}，${expandedPrompt}。高畫質、精細細節、寫實風格`.replace(/^，/, '')

    try {
      const payload = { model: AGNES_IMAGE_MODEL, prompt: fullPrompt, size: '1024x1536' }
      if (character.refImageUrl) {
        payload.extra_body = { image: [character.refImageUrl], response_format: 'b64_json' }
      }
      const res = await fetch(`${AGNES_BASE}/images/generations`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${AGNES_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data = await res.json()
      const b64 = data.data?.[0]?.b64_json
      if (!b64) throw new Error('No image returned')
      const dataUrl = `data:image/png;base64,${b64}`

      const imageMsg = {
        role: 'assistant',
        type: 'image',
        imageUrl: dataUrl,
        content: `📸 大師級男友視覺作品 — ${label}`,
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
    } catch (err) { setError(err.message) }
    finally { setGenLoading(false) }
  }

  const toggleImgMode = () => {
    setImgMode(!imgMode)
    setError('')
    if (!imgMode) { setSelectedScene(null); setCustomPrompt('') }
  }

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
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
              <textarea className="chat-input" rows={6} value={customPrompt}
                onChange={e => { setCustomPrompt(e.target.value); setSelectedScene(null); setError('') }}
                placeholder="或自訂情境描述，例如：在雪山頂上看日出..."
                style={{ width: '100%', marginBottom: 8 }} disabled={genLoading} />
              <button className="chat-send" style={{ width: '100%' }} onClick={generateImage} disabled={genLoading || (!selectedScene && !customPrompt.trim())}>
                {genLoading ? '🎨 繪圖中...' : `🎨 生成 ${character.name} 的圖片`}
              </button>
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

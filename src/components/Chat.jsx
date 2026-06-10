import { useState, useRef, useEffect } from 'react'
import { get, put } from '../lib/db.js'

const AGNES_API_KEY = import.meta.env.VITE_AGNES_API_KEY
const AGNES_BASE = import.meta.env.VITE_AGNES_BASE_URL
const AGNES_CHAT_MODEL = import.meta.env.VITE_AGNES_CHAT_MODEL
const AGNES_IMAGE_MODEL = import.meta.env.VITE_AGNES_IMAGE_MODEL

const WELCOME = (name) => `嗨～我是${name}！今天過得怎麼樣呀？😊`

const SCENES = [
  { id: 'sunset-beach', icon: '🌅', label: '沙灘夕陽', prompt: '在沙灘上看夕陽，金色陽光灑在海面上，微風吹拂著頭髮，溫暖的色調' },
  { id: 'cafe', icon: '☕', label: '咖啡廳約會', prompt: '在溫馨的咖啡廳裡喝下午茶，窗邊自然光，舒適的氛圍' },
  { id: 'sakura', icon: '🌸', label: '賞櫻花', prompt: '站在盛開的櫻花樹下，花瓣飄落，春天的陽光柔和，淡粉色調' },
  { id: 'night-city', icon: '🌃', label: '城市夜景', prompt: '在城市高樓夜景前，霓虹燈光閃爍，身後是繁華的都市天際線' },
  { id: 'park', icon: '🌿', label: '公園散步', prompt: '在翠綠的公園裡散步，陽光穿過樹葉灑下斑駁光影，自然的氛圍' },
  { id: 'reading', icon: '📖', label: '看書', prompt: '在家裡的沙發上看書，暖黃色燈光，舒適的居家氛圍，輕鬆自在' },
  { id: 'rainy', icon: '🌂', label: '雨天窗邊', prompt: '在窗邊看雨，窗外是朦朧的雨景，手上拿著一杯熱茶，憂鬱而浪漫的氛圍' },
  { id: 'doodle', icon: '🎨', label: '在畫畫', prompt: '在畫室裡專注地畫畫，身旁有畫架和顏料，自然光從窗戶灑入' },
]

export default function Chat({ character }) {
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

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setError('')
    const newMessages = [...messages, { role: 'user', content: userMsg }]
    setMessages(newMessages)
    setLoading(true)
    try {
      const payload = {
        model: AGNES_CHAT_MODEL,
        messages: [
          ...(character.personality ? [{ role: 'system', content: character.personality }] : []),
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
    if (!character.refImageUrl) { setError('請先在「設定」頁面設定角色參考圖'); return }

    setGenLoading(true); setError('')
    const fullPrompt = `角色外貌保持不變（臉部、髮型、體型完全與參考圖一致），${promptText}。高畫質、精細細節、寫實風格`

    try {
      const payload = { model: AGNES_IMAGE_MODEL, prompt: fullPrompt, size: '1024x1536' }
      if (character.refImageUrl) {
        payload.extra_body = { image: [character.refImageUrl], response_format: 'url' }
      }
      const res = await fetch(`${AGNES_BASE}/images/generations`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${AGNES_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data = await res.json()
      const url = data.data?.[0]?.url
      if (!url) throw new Error('No image returned')

      const label = selectedScene ? SCENES.find(s => s.id === selectedScene)?.label : '自訂'
      const imageMsg = {
        role: 'assistant',
        type: 'image',
        imageUrl: url,
        content: `📸 生成了「${label}」的圖片`,
      }
      setMessages(prev => [...prev, imageMsg])

      /* persist to image history */
      const record = { id: `img_${Date.now()}`, imageUrl: url, scene: selectedScene, prompt: promptText, timestamp: Date.now() }
      await put('images', record)

      setImgMode(false); setSelectedScene(null); setCustomPrompt('')
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
          <textarea className="chat-input" rows={2} value={customPrompt}
            onChange={e => { setCustomPrompt(e.target.value); setSelectedScene(null); setError('') }}
            placeholder="或自訂情境描述，例如：在雪山頂上看日出..."
            style={{ marginBottom: 8 }} disabled={genLoading} />
          <button className="chat-send" style={{ width: '100%' }} onClick={generateImage} disabled={genLoading || (!selectedScene && !customPrompt.trim())}>
            {genLoading ? '🎨 繪圖中...' : `🎨 生成 ${character.name} 的圖片`}
          </button>
        </div>
      )}

      <div className="chat-input-area">
        <button className={`tab ${imgMode ? 'active' : ''}`} onClick={toggleImgMode}
          style={{ padding: '8px 12px', fontSize: '1.1rem', flexShrink: 0 }} title="生成圖片">
          🎨
        </button>
        <textarea className="chat-input" rows={1} value={input}
          onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
          placeholder={`跟${character.name}說說話...`} disabled={loading || genLoading} />
        <button className="chat-send" onClick={sendMessage} disabled={loading || !input.trim()}>送出</button>
      </div>
    </div>
  )
}

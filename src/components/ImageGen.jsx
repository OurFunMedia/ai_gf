import { useState, useEffect } from 'react'
import { get, put, getAll } from '../lib/db.js'

const AGNES_API_KEY = import.meta.env.VITE_AGNES_API_KEY
const AGNES_BASE = import.meta.env.VITE_AGNES_BASE_URL
const AGNES_MODEL = import.meta.env.VITE_AGNES_IMAGE_MODEL

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

export default function ImageGen({ character }) {
  const [selectedScene, setSelectedScene] = useState(null)
  const [customPrompt, setCustomPrompt] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState([])

  /* load image history on mount */
  useEffect(() => {
    getAll('images').then((records) => {
      setHistory(records.sort((a, b) => b.timestamp - a.timestamp))
    })
  }, [])

  const generate = async () => {
    const promptText = customPrompt.trim() || (selectedScene ? SCENES.find(s => s.id === selectedScene)?.prompt : '')
    if (!promptText) { setError('請選擇一個情境或輸入自訂描述'); return }
    if (!character.refImageUrl) { setError('請先在「設定」頁面上傳角色參考圖'); return }

    setLoading(true); setError(''); setImageUrl('')
    const fullPrompt = `角色外貌保持不變（臉部、髮型、體型完全與參考圖一致），${promptText}。高畫質、精細細節、寫實風格`

    try {
      const payload = { model: AGNES_MODEL, prompt: fullPrompt, size: '1024x1536' }
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
      if (url) setImageUrl(url)
      else throw new Error('No image returned')
      const record = { id: `img_${Date.now()}`, imageUrl: url, scene: selectedScene, prompt: promptText, timestamp: Date.now() }
      await put('images', record)
      setHistory(prev => [record, ...prev])
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="image-gen">
      <h2>🎨 情境生圖</h2>
      <p>選擇一個情境，AI 會將「{character.name}」融入該場景中。
      {!character.refImageUrl && <span style={{ color: '#ff6b6b', display: 'block', marginTop: 4 }}>⚠️ 請先到「設定」貼上角色參考圖網址</span>}</p>
      <div className="scene-grid">
        {SCENES.map(scene => (
          <button key={scene.id} className={`scene-btn ${selectedScene === scene.id ? 'selected' : ''}`}
            onClick={() => { setSelectedScene(scene.id); setCustomPrompt(''); setImageUrl(''); setError('') }}>
            <span className="scene-icon">{scene.icon}</span>{scene.label}
          </button>
        ))}
      </div>
      <div className="setting-group">
        <label>或自訂情境描述</label>
        <textarea value={customPrompt} onChange={e => { setCustomPrompt(e.target.value); setSelectedScene(null); setImageUrl(''); setError('') }}
          placeholder="例如：在雪山頂上看日出，穿著紅色外套..." rows={2} />
      </div>
      <button className="gen-btn" onClick={generate} disabled={loading}>
        {loading ? '生成中...' : `生成 ${character.name} 的圖片 ✨`}
      </button>
      {error && <div className="error">{error}</div>}
      {loading && <div className="loading">🎨 正在繪圖，請稍候...</div>}
      {imageUrl && (
        <div className="gen-output">
          <img src={imageUrl} alt={`${character.name} in scene`} />
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>右鍵 → 另存圖片即可下載</p>
        </div>
      )}

      {history.length > 0 && (
        <div className="image-history">
          <h3 style={{ marginTop: 32, marginBottom: 12, fontSize: '1rem', color: 'var(--pink-light)' }}>📂 生成記錄</h3>
          <div className="scene-grid">
            {history.map((rec) => (
              <div key={rec.id} className="history-item" style={{ cursor: 'pointer' }}
                onClick={() => setImageUrl(rec.imageUrl)}>
                <img src={rec.imageUrl} alt="" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4, textAlign: 'center' }}>
                  {new Date(rec.timestamp).toLocaleDateString('zh-TW')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

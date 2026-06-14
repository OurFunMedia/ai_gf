import { useState } from 'react'

/**
 * CharacterSettings — 角色設定頁面
 *
 * 功能：
 * - 編輯角色名稱、個性（system prompt）、外貌參考圖
 * - 體型參數（年齡、身高、身材、三圍、風格）
 * - 開關「顯示生成提示詞」
 * - 儲存設定（寫入 IndexedDB）與清除聊天記錄
 */
export default function CharacterSettings({ character, onChange, onClearChat }) {
  // ---- 表單本地狀態（編輯中不直接寫入 IndexedDB） ----
  const [localName, setLocalName] = useState(character.name)
  const [localPersonality, setLocalPersonality] = useState(character.personality)
  const [localRefUrl, setLocalRefUrl] = useState(character.refImageUrl)

  // 體型參數（body params），用於組裝圖片 prompt
  const [age, setAge] = useState(character.age ?? 22)
  const [height, setHeight] = useState(character.height ?? '中等')
  const [figure, setFigure] = useState(character.figure ?? '勻稱')
  const [bust, setBust] = useState(character.bust ?? '中等')
  const [waist, setWaist] = useState(character.waist ?? '細')
  const [hipWidth, setHipWidth] = useState(character.hipWidth ?? '中')
  const [hipShape, setHipShape] = useState(character.hipShape ?? '翹')
  const [style, setStyle] = useState(character.style ?? '可愛')
  const [showPrompt, setShowPrompt] = useState(character.showPrompt ?? true)

  // Toast 提示顯示狀態
  const [toastVisible, setToastVisible] = useState(false)

  /** 顯示 Toast，2 秒後自動隱藏 */
  const showToast = () => {
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2000)
  }

  /** 儲存所有設定至上層（App.jsx），年齡限制 18-60 */
  const save = () => {
    onChange({
      name: localName,
      personality: localPersonality,
      refImageUrl: localRefUrl,
      age: Math.min(60, Math.max(18, age)),
      height, figure, bust, waist, hipWidth, hipShape, style,
      showPrompt,
    })
    showToast()
  }

  /**
   * SelectRow — 單一選項列的通用元件
   * 用於身高、身材、胸圍等選項按鈕群組
   */
  const SelectRow = ({ label, value, onChange, options }) => (
    <div className="setting-group body-row">
      <label>{label}</label>
      <div className="body-options">
        {options.map(opt => (
          <button key={opt}
            className={`body-opt ${value === opt ? 'selected' : ''}`}
            onClick={() => onChange(opt)}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="settings">
      {/* ===== 基本設定 ===== */}
      <h2>🎀 角色設定</h2>

      {/* 角色名稱 */}
      <div className="setting-group">
        <label>角色名稱</label>
        <input type="text" value={localName} onChange={e => setLocalName(e.target.value)} placeholder="例如：小艾" />
      </div>

      {/* 個性設定 — 這會作為 chat API 的 system 角色訊息 */}
      <div className="setting-group">
        <label>個性設定（system prompt）</label>
        <textarea value={localPersonality} onChange={e => setLocalPersonality(e.target.value)}
          placeholder="描述角色的個性、語氣、說話方式..." />
      </div>

      {/* 角色外貌參考圖 URL */}
      <div className="setting-group">
        <label>角色外貌參考圖</label>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 8px' }}>
          上傳到免費圖床（如 imgbb、postimages）後貼上圖片網址
        </p>
        <input type="url" value={localRefUrl} onChange={e => setLocalRefUrl(e.target.value)}
          placeholder="https://i.imgur.com/your-image.png" />
        {/* 已有參考圖時顯示預覽與清除按鈕 */}
        {localRefUrl && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
            <img className="ref-preview" src={localRefUrl} alt="reference"
              onError={e => { e.target.style.display = 'none' }} />
            <button className="body-opt" onClick={() => setLocalRefUrl('')}
              style={{ color: '#ff6b6b', borderColor: '#ff6b6b44' }}>
              清除參考圖
            </button>
          </div>
        )}
      </div>

      {/* ===== 體型參數 ===== */}
      {/* 這些參數會由 Chat.jsx 的 buildBodyDesc() 組合成自然語言描述，送進圖片 prompt */}
      <h3 style={{ margin: '24px 0 12px', fontSize: '1.1rem', color: 'var(--pink-light)' }}>📏 體型參數</h3>

      {/* 年齡 — 獨立數字輸入 */}
      <div className="setting-group body-row">
        <label>🎂 年紀</label>
        <input type="number" min={18} max={60} value={age}
          onChange={e => setAge(Number(e.target.value))}
          className="body-age-input" />
      </div>

      {/* 選項按鈕群組 */}
      <SelectRow label="📏 身高" value={height} onChange={setHeight}
        options={['矮細', '中等', '高挑']} />
      <SelectRow label="💃 身材" value={figure} onChange={setFigure}
        options={['纖瘦', '勻稱', '豐滿', '運動型', '沙漏', '微肉']} />
      <SelectRow label="🍒 胸圍" value={bust} onChange={setBust}
        options={['微乳', '中等', '明顯', '暴乳']} />
      <SelectRow label="🧵 腰圍" value={waist} onChange={setWaist}
        options={['細', '中', '寬']} />

      {/* 臀圍 — 雙維度（寬度＋形狀）獨立選擇 */}
      <div className="setting-group body-row">
        <label>🍑 臀圍</label>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>寬度</div>
            <div className="body-options">
              {['窄', '中', '寬'].map(opt => (
                <button key={opt}
                  className={`body-opt ${hipWidth === opt ? 'selected' : ''}`}
                  onClick={() => setHipWidth(opt)}>{opt}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>形狀</div>
            <div className="body-options">
              {['平', '翹'].map(opt => (
                <button key={opt}
                  className={`body-opt ${hipShape === opt ? 'selected' : ''}`}
                  onClick={() => setHipShape(opt)}>{opt}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 風格 — 影響生成圖片的整體氛圍與造型傾向 */}
      <div className="setting-group body-row">
        <label>🎭 風格</label>
        <p className="style-hint">當前選擇：<strong>{style}</strong> — {({
          '清純': '純真無辜、自然淡妝，給人初戀般的清新感',
          '性感': '成熟嫵媚、曲線展現，散發致命吸引力',
          '可愛': '活潑俏皮、甜美笑容，充滿青春活力',
          '優雅': '高貴大方、氣質從容，展現知性美',
          '鄰家': '親切隨和、不做作，像身邊熟悉的女孩',
        })[style]}</p>
        <div className="body-options">
          {['清純', '性感', '可愛', '優雅', '鄰家'].map(opt => (
            <button key={opt}
              className={`body-opt ${style === opt ? 'selected' : ''}`}
              onClick={() => setStyle(opt)}>
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* ===== 其他設定 ===== */}
      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '32px 0 16px' }} />
      <h3 style={{ margin: '0 0 12px', fontSize: '1rem', color: 'var(--pink-light)' }}>⚙️ 其他設定</h3>

      {/* Toggle：圖片生成後是否顯示提示詞 */}
      <div className="setting-group">
          <div className="toggle-wrap" onClick={() => setShowPrompt(v => !v)}>
          <span>顯示生成提示詞</span>
          <div className={`toggle-track${showPrompt ? ' on' : ''}`}>
            <div className="toggle-thumb" />
          </div>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '6px 0 0' }}>
          生成圖片後自動在圖片下方顯示使用的提示詞
        </p>
      </div>

      {/* 儲存按鈕 */}
      <button className="gen-btn" style={{ marginTop: 12 }} onClick={save}>儲存設定</button>
      {toastVisible && <div className="toast">✅ 設定已儲存</div>}

      {/* ===== 危險區域 ===== */}
      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '32px 0 16px' }} />
      <h3 style={{ fontSize: '1rem', color: '#ff6b6b', marginBottom: 12 }}>⚠️ 危險區域</h3>
      <button onClick={onClearChat}
        style={{
          padding: '10px 20px', borderRadius: 'var(--radius-sm)',
          background: 'transparent', border: '1px solid #ff6b6b', color: '#ff6b6b',
          fontSize: '0.9rem', cursor: 'pointer', width: '100%',
        }}>
        🗑️ 清除所有聊天記錄
      </button>
    </div>
  )
}

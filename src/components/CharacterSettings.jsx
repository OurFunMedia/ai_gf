import { useState } from 'react'

export default function CharacterSettings({ character, onChange }) {
  const [localName, setLocalName] = useState(character.name)
  const [localPersonality, setLocalPersonality] = useState(character.personality)
  const [localRefUrl, setLocalRefUrl] = useState(character.refImageUrl)

  /* body params */
  const [age, setAge] = useState(character.age ?? 22)
  const [height, setHeight] = useState(character.height ?? '中等')
  const [figure, setFigure] = useState(character.figure ?? '勻稱')
  const [bust, setBust] = useState(character.bust ?? '中等')
  const [waist, setWaist] = useState(character.waist ?? '細')
  const [hipWidth, setHipWidth] = useState(character.hipWidth ?? '中')
  const [hipShape, setHipShape] = useState(character.hipShape ?? '翹')
  const [style, setStyle] = useState(character.style ?? '可愛')

  const save = () => {
    onChange({
      name: localName,
      personality: localPersonality,
      refImageUrl: localRefUrl,
      age, height, figure, bust, waist, hipWidth, hipShape, style,
    })
  }

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
      <h2>🎀 角色設定</h2>

      <div className="setting-group">
        <label>角色名稱</label>
        <input type="text" value={localName} onChange={e => setLocalName(e.target.value)} placeholder="例如：小艾" />
      </div>

      <div className="setting-group">
        <label>個性設定（system prompt）</label>
        <textarea value={localPersonality} onChange={e => setLocalPersonality(e.target.value)}
          placeholder="描述角色的個性、語氣、說話方式..." />
      </div>

      <div className="setting-group">
        <label>角色外貌參考圖</label>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 8px' }}>
          上傳到免費圖床（如 imgbb、postimages）後貼上圖片網址
        </p>
        <input type="url" value={localRefUrl} onChange={e => setLocalRefUrl(e.target.value)}
          placeholder="https://i.imgur.com/your-image.png" />
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

      <h3 style={{ margin: '24px 0 12px', fontSize: '1.1rem', color: 'var(--pink-light)' }}>📏 體型參數</h3>

      <div className="setting-group body-row">
        <label>🎂 年紀</label>
        <input type="number" min={18} max={60} value={age}
          onChange={e => setAge(Number(e.target.value))}
          className="body-age-input" />
      </div>

      <SelectRow label="📏 身高" value={height} onChange={setHeight}
        options={['矮細', '中等', '高挑']} />
      <SelectRow label="💃 身材" value={figure} onChange={setFigure}
        options={['纖瘦', '勻稱', '豐滿', '運動型', '沙漏', '微肉']} />
      <SelectRow label="🍒 胸圍" value={bust} onChange={setBust}
        options={['微乳', '中等', '明顯', '暴乳']} />
      <SelectRow label="🧵 腰圍" value={waist} onChange={setWaist}
        options={['細', '中', '寬']} />

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

      <SelectRow label="🎭 風格" value={style} onChange={setStyle}
        options={['清純', '性感', '可愛', '優雅', '鄰家']} />

      <button className="gen-btn" style={{ marginTop: 12 }} onClick={save}>儲存設定</button>
    </div>
  )
}

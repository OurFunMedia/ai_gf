import { useState } from 'react'

export default function CharacterSettings({ character, onChange }) {
  const [localName, setLocalName] = useState(character.name)
  const [localPersonality, setLocalPersonality] = useState(character.personality)
  const [localRefUrl, setLocalRefUrl] = useState(character.refImageUrl)

  const save = () => {
    onChange({ name: localName, personality: localPersonality, refImageUrl: localRefUrl })
  }

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
          <img className="ref-preview" src={localRefUrl} alt="reference"
            onError={e => { e.target.style.display = 'none' }} />
        )}
      </div>
      <button className="gen-btn" onClick={save}>儲存設定</button>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { getAll, del } from '../lib/db.js'

export default function ImageGen({ character }) {
  const [photos, setPhotos] = useState([])
  const [viewUrl, setViewUrl] = useState(null)

  /* load photos on mount */
  const loadPhotos = () => {
    getAll('images')
      .then((records) => {
        setPhotos(records.sort((a, b) => b.timestamp - a.timestamp))
      })
      .catch(() => { /* no history yet */ })
  }

  useEffect(() => { loadPhotos() }, [])

  const handleDelete = async (id) => {
    try {
      await del('images', id)
      setPhotos(prev => prev.filter(p => p.id !== id))
    } catch (err) {
      console.error('Failed to delete image:', err)
    }
  }

  const formatDate = (ts) => {
    const d = new Date(ts)
    return d.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const truncatePrompt = (text, max = 30) => {
    return text.length > max ? text.slice(0, max) + '…' : text
  }

  return (
    <div className="image-gen">
      <h2>🎨 相簿</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        共 {photos.length} 張照片
        {!character.refImageUrl && (
          <span style={{ color: 'var(--text-muted)', display: 'block', marginTop: 4 }}>
            💡 未設定參考圖，生圖不保留角色臉部一致性
          </span>
        )}
      </p>

      {photos.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)',
          border: '2px dashed var(--border)', borderRadius: 'var(--radius-sm)',
        }}>
          <p style={{ fontSize: '2rem', marginBottom: 8 }}>📸</p>
          <p>還沒有照片唷～</p>
          <p style={{ fontSize: '0.85rem', marginTop: 4 }}>
            到聊天室點 🎨 按鈕，生成你們的第一張照片吧！
          </p>
        </div>
      )}

      {photos.length > 0 && (
        <div className="album-grid">
          {photos.map(photo => (
            <div key={photo.id} className="album-card">
              <div className="album-img-wrap" onClick={() => setViewUrl(photo.imageUrl)}>
                <img src={photo.imageUrl} alt="" />
              </div>
              <div className="album-info">
                <span className="album-date">{formatDate(photo.timestamp)}</span>
                <span className="album-prompt">{truncatePrompt(photo.prompt || '')}</span>
              </div>
              <button className="album-del-btn" onClick={(e) => { e.stopPropagation(); handleDelete(photo.id) }}
                title="刪除照片">✕</button>

            </div>
          ))}
        </div>
      )}

      {/* full-screen viewer */}
      {viewUrl && (
        <div className="album-viewer-overlay" onClick={() => setViewUrl(null)}>
          <div className="album-viewer-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, justifyContent: 'flex-end' }}>
              <button onClick={(e) => {
                e.stopPropagation()
                const d = new Date()
                const ts = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`
                const a = document.createElement('a')
                a.href = viewUrl; a.download = `${ts}.png`
                document.body.appendChild(a); a.click(); document.body.removeChild(a)
              }}
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: '0.9rem', cursor: 'pointer', padding: '4px 10px' }}>
                ⬇️ 下載
              </button>
              <button className="album-viewer-close" onClick={() => setViewUrl(null)}>✕</button>
            </div>
            <img src={viewUrl} alt="" />
          </div>
        </div>
      )}
    </div>
  )
}

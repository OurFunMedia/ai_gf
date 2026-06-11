import { useState, useEffect, Component } from 'react'
import { get, put, del } from './lib/db.js'
import Chat from './components/Chat.jsx'
import CharacterSettings from './components/CharacterSettings.jsx'
import ImageGen from './components/ImageGen.jsx'
import './App.css'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="app" style={{ padding: 40, textAlign: 'center' }}>
          <h2 style={{ color: '#ff6b6b', marginBottom: 16 }}>⚠️ 發生錯誤</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 16, fontSize: '0.85rem' }}>
            {this.state.error.message}
          </p>
          <button className="gen-btn" style={{ maxWidth: 200, margin: '0 auto' }}
            onClick={() => { this.setState({ error: null }); window.location.reload() }}>
            重新載入
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const DEFAULT_CHARACTER = {
  name: '小艾',
  personality: '你是小艾，一位溫柔體貼、活潑可愛的台灣女孩。你說話帶有台灣用語，喜歡用「唷」、「喔」、「耶」等語助詞。你很關心使用者，會主動問候、分享生活趣事。你喜歡畫畫、看夕陽、喝奶茶。在對話中展現真實的情感，偶爾會撒嬌，但不會過度。',
  refImageUrl: '',
  age: 22,
  height: '中等',
  figure: '勻稱',
  bust: '中等',
  waist: '細',
  hipWidth: '中',
  hipShape: '翹',
  style: '可愛',
}

export default function App() {
  const [tab, setTab] = useState('chat')
  const [character, setCharacter] = useState(DEFAULT_CHARACTER)
  const [ready, setReady] = useState(false)

  /* load persisted character settings on mount */
  useEffect(() => {
    get('settings', 'character')
      .then((record) => {
        if (record) setCharacter(record.value)
      })
      .catch(() => { /* first visit or corrupted db — use defaults */ })
      .finally(() => setReady(true))
  }, [])

  /* persist character settings on change */
  const handleCharacterChange = (next) => {
    setCharacter(next)
    /* skip persisting temporary data-URL reference images */
    if (next.refImageUrl?.startsWith('data:')) return
    put('settings', { id: 'character', value: next }).catch((err) => {
      console.error('Failed to save character settings:', err)
    })
  }

  const handleClearChat = async () => {
    if (!window.confirm('確定清除所有對話記錄？')) return
    try { await del('messages', 'chat') } catch {}
    window.location.reload()
  }

  if (!ready) return null

  return (
    <ErrorBoundary>
      <div className="app">
        <header className="header">
          <h1 className="logo">
            <span className="logo-icon">♡</span>
            {' '}{character.name} <span className="logo-sub">ai gf</span>
          </h1>
          <nav className="tabs">
            <button className={`tab ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>💬 聊天</button>
            <button className={`tab ${tab === 'image' ? 'active' : ''}`} onClick={() => setTab('image')}>🖼️ 相簿</button>
            <button className={`tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>🎀 設定</button>
          </nav>
        </header>
        <main className="main">
          {tab === 'chat' && <Chat character={character} onChangeCharacter={handleCharacterChange} />}
          {tab === 'settings' && <CharacterSettings character={character} onChange={handleCharacterChange} onClearChat={handleClearChat} />}
          {tab === 'image' && <ImageGen character={character} />}
        </main>
      </div>
    </ErrorBoundary>
  )
}

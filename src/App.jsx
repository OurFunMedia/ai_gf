import { useState, useEffect } from 'react'
import { get, put } from './lib/db.js'
import Chat from './components/Chat.jsx'
import CharacterSettings from './components/CharacterSettings.jsx'
import ImageGen from './components/ImageGen.jsx'
import './App.css'

const DEFAULT_CHARACTER = {
  name: '小艾',
  personality: '你是小艾，一位溫柔體貼、活潑可愛的台灣女孩。你說話帶有台灣用語，喜歡用「唷」、「喔」、「耶」等語助詞。你很關心使用者，會主動問候、分享生活趣事。你喜歡畫畫、看夕陽、喝奶茶。在對話中展現真實的情感，偶爾會撒嬌，但不會過度。',
  refImageUrl: '',
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
    put('settings', { id: 'character', value: next }).catch((err) => {
      console.error('Failed to save character settings:', err)
    })
  }

  if (!ready) return null

  return (
    <div className="app">
      <header className="header">
        <h1 className="logo">
          <span className="logo-icon">♡</span>
          {' '}{character.name} <span className="logo-sub">ai gf</span>
        </h1>
        <nav className="tabs">
          <button className={`tab ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>💬 聊天</button>
          <button className={`tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>🎀 設定</button>
          <button className={`tab ${tab === 'image' ? 'active' : ''}`} onClick={() => setTab('image')}>🎨 生圖</button>
        </nav>
      </header>
      <main className="main">
        {tab === 'chat' && <Chat character={character} />}
        {tab === 'settings' && <CharacterSettings character={character} onChange={handleCharacterChange} />}
        {tab === 'image' && <ImageGen character={character} />}
      </main>
    </div>
  )
}

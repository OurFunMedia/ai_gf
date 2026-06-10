import { useState, useRef, useEffect } from 'react'
import { get, put } from '../lib/db.js'

const AGNES_API_KEY = import.meta.env.VITE_AGNES_API_KEY
const AGNES_BASE = import.meta.env.VITE_AGNES_BASE_URL
const AGNES_MODEL = import.meta.env.VITE_AGNES_CHAT_MODEL

const WELCOME = (name) => `嗨～我是${name}！今天過得怎麼樣呀？😊`

export default function Chat({ character }) {
  const [messages, setMessages] = useState([])
  const [ready, setReady] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef(null)

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
        model: AGNES_MODEL,
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

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div className="message-avatar">{msg.role === 'assistant' ? '♡' : '☺'}</div>
            <div className="message-bubble">{msg.content}</div>
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
      <div className="chat-input-area">
        <textarea className="chat-input" rows={1} value={input}
          onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
          placeholder={`跟${character.name}說說話...`} disabled={loading} />
        <button className="chat-send" onClick={sendMessage} disabled={loading || !input.trim()}>送出</button>
      </div>
    </div>
  )
}

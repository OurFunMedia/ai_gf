import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

/* fix favicon path for production base (/ai_gf/) */
document.getElementById('favicon').href = import.meta.env.BASE_URL + 'heart.svg'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

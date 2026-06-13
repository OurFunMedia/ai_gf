import { useState, useRef, useEffect } from 'react'
import { get, put } from '../lib/db.js'

const AGNES_API_KEY = import.meta.env.VITE_AGNES_API_KEY
const AGNES_BASE = import.meta.env.VITE_AGNES_BASE_URL
const AGNES_CHAT_MODEL = import.meta.env.VITE_AGNES_CHAT_MODEL
const AGNES_IMAGE_MODEL = import.meta.env.VITE_AGNES_IMAGE_MODEL

const WELCOME = (name) => `嗨～我是${name}！今天過得怎麼樣呀？😊`
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

/* build natural language body description from character settings */
const downloadImage = (url) => {
  const d = new Date()
  const ts = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`
  const a = document.createElement('a')
  a.href = url; a.download = `${ts}.png`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

const buildBodyDesc = (c) => {
  const parts = []
  if (c.age) parts.push(`${c.age}歲`)
  const heightMap = { 矮細: '身高嬌小', 中等: '中等身高', 高挑: '高挑身材' }
  if (c.height) parts.push(heightMap[c.height] || c.height)
  if (c.figure) parts.push(c.figure + '身材')
  const bustMap = { 微乳: '微乳', 中等: '中等上圍', 明顯: '明顯上圍', 暴乳: '豐滿暴乳' }
  if (c.bust) parts.push(bustMap[c.bust] || c.bust + '上圍')
  const waistMap = { 細: '細腰', 中: '中等腰圍', 寬: '豐腴腰身' }
  if (c.waist) parts.push(waistMap[c.waist] || c.waist)
  if (c.hipWidth && c.hipShape === '翹') {
    const hipMap = { 窄: '窄翹臀', 中: '翹臀', 寬: '豐滿翹臀' }
    parts.push(hipMap[c.hipWidth] || '翹臀')
  } else if (c.hipWidth) {
    const hipMap = { 窄: '窄臀', 中: '中等臀圍', 寬: '豐滿臀部' }
    parts.push(hipMap[c.hipWidth] || '')
  }
  if (c.style) parts.push(c.style + '風格')
  return parts.join('、')
}

export default function Chat({ character, onChangeCharacter }) {
  const [messages, setMessages] = useState([])
  const [ready, setReady] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [viewerUrl, setViewerUrl] = useState(null)
  const messagesEndRef = useRef(null)

  /* image gen */
  const [imgMode, setImgMode] = useState(false)
  const [selectedScene, setSelectedScene] = useState(null)
  const [customPrompt, setCustomPrompt] = useState('')
  const [genLoading, setGenLoading] = useState(false)
  const [genStatus, setGenStatus] = useState('')
  const [genProgress, setGenProgress] = useState(0)
  const [proMode, setProMode] = useState(false)

  /* accessories for multi-image composition (max 3, each with label pic1-pic3 + required desc) */
  const [accessories, setAccessories] = useState([])
  const fileInputRef = useRef(null)

  /* single outfit image (1 set of clothing) */
  const [outfit, setOutfit] = useState(null) // { dataUrl, name, desc } | null
  const outfitInputRef = useRef(null)

  const [dragOver, setDragOver] = useState(false)
  const [uploadAreaOpen, setUploadAreaOpen] = useState(false)
  const [hintOpen, setHintOpen] = useState(false)

  const abortRef = useRef(null)
  const persistTimer = useRef(null)
  const cancelGen = () => {
    abortRef.current?.abort()
    setGenLoading(false); setGenStatus(''); setGenProgress(0); setError('')
  }

  /* load persisted messages on mount */
  useEffect(() => {
    get('messages', 'chat')
      .then((record) => {
        if (record?.messages?.length) {
          setMessages(record.messages)
        } else {
          setMessages([{ id: uid(), role: 'assistant', content: WELCOME(character.name) }])
        }
      })
      .catch(() => {
        setMessages([{ id: uid(), role: 'assistant', content: WELCOME(character.name) }])
      })
      .finally(() => setReady(true))
  }, [])

  /* debounced persist messages to IndexedDB */
  useEffect(() => {
    if (!ready) return
    clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      put('messages', { id: 'chat', messages }).catch((err) => {
        console.error('Failed to save messages:', err)
      })
    }, 1500)
    return () => clearTimeout(persistTimer.current)
  }, [messages, ready])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const deleteMessage = (id) => {
    if (!window.confirm('確定刪除此訊息？')) return
    setMessages(prev => prev.filter(m => m.id !== id))
  }

  const processFiles = (files) => {
    const filesArr = Array.from(files).filter(f => f.type.startsWith('image/'))
    const currentLen = accessories.length
    const canAdd = Math.max(0, 3 - currentLen)
    if (canAdd <= 0) return
    filesArr.slice(0, canAdd).forEach((file, i) => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        setAccessories(prev => [...prev, {
          id: uid(),
          dataUrl: ev.target.result,
          name: file.name,
          label: `pic${prev.length + 1}`,
          desc: '',
        }])
      }
      reader.readAsDataURL(file)
    })
  }

  const handleAccessoryUpload = (e) => {
    processFiles(e.target.files || [])
    e.target.value = ''
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    processFiles(e.dataTransfer.files || [])
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => {
    setDragOver(false)
  }

  const removeAccessory = (id) => {
    setAccessories(prev => prev.filter(a => a.id !== id))
  }

  const handleOutfitUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (ev) => { setOutfit({ dataUrl: ev.target.result, name: file.name, desc: '' }) }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const removeOutfit = () => setOutfit(null)

  const [outfitDragOver, setOutfitDragOver] = useState(false)

  const handleOutfitDrop = (e) => {
    e.preventDefault()
    setOutfitDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (ev) => { setOutfit({ dataUrl: ev.target.result, name: file.name, desc: '' }) }
    reader.readAsDataURL(file)
  }

  if (!ready) return null

  /* build full system prompt with name consistency rule */
  const getSystemContent = () => {
    const selfRule = `\n\n當你自我稱呼時，一定要用你的角色名稱「${character.name}」自稱，不要用「我」。例如說「${character.name}今天好開心～」而不是「我今天好開心～」。`
    let base = character.personality || ''
    if (!proMode) return base ? `${base}${selfRule}` : undefined
    const bodyDesc = buildBodyDesc(character)
    const proExtra = `

 你現在是使用者的「專屬拍攝助理」！你是專業級攝影指導，為使用者規劃並拍攝 ${character.name} 的照片。

  🔑 核心原則：**完全忠於使用者的拍攝要求**。使用者說怎麼拍就怎麼拍，你的建議只是選項，最終以使用者指定的為主。

  你的任務是引導使用者說出想要的畫面，並提供專業建議。遵循以下流程：

  步驟一：先讓使用者描述想拍什麼畫面。
  步驟二：逐一確認細節（每次問 1-2 項），並**提供選項讓使用者選擇**：
   - 場景：哪裡？室內還是戶外？例如「海邊夕陽很浪漫，或者咖啡廳文青風也不錯？」每次建議盡量不同類型，不要偏好特定種類
   - 姿勢：提供具體選項。例如「${character.name}可以回頭微笑、撩頭髮、喝飲料、倚靠欄杆、低頭滑手機～你喜歡哪種？」
   - 風格：寫實自然、夢幻、電影感、可愛還是性感？
   - 光源：自然光、夕陽、霓虹、燭光？
   - 構圖：特寫、半身、全身、男友視角？
   - 品質要求：高畫質、精細細節？
   - 服裝：根據場景建議適合的穿著
  步驟三：收集所有必要元素後，**務必嚴格按照以下格式輸出**（包含 [PROMPT] 和 [/PROMPT] 標籤）：

  [PROMPT]以 ${character.name} 為主角的詳細照片提示，包含主體動作、場景氛圍、風格、光源、構圖、品質、光影和細節描述[/PROMPT]

  ⚠️ 重要：最終輸出**必須**包含 [PROMPT]...[/PROMPT] 標籤，否則無法生成照片。標籤內是你要生成的完整照片描述，不要有任何其它文字在標籤內。

  整個對話使用中文。一次問 1-2 個問題就好，讓對話自然流暢。
`
    const accSection = accessories.filter(a => a.desc).length > 0
      ? '\n📦 使用者已上傳以下穿戴物品：\n'
        + accessories.filter(a => a.desc).map(a => `  - ${a.label}：${a.desc}`).join('\n')
        + '\n\n使用這些物品時請遵循以下流程：\n'
        + '1. 先詢問使用者是否要使用每個物品\n'
        + '2. 問清楚穿戴方式（例如帽子正戴還是斜戴、項鍊露在外面還是衣服裡面）\n'
        + '3. 使用者決定後，把最終搭配寫入 [PROMPT] 描述中\n'
        + '4. 如果使用者說不用某個物品，就不要在 [PROMPT] 中提到它\n'
      : '\n📦 使用者目前沒有上傳穿戴物品。如果需要，建議先請使用者上傳道具再開始拍攝。\n'
    return base ? `${base}${selfRule}${proExtra}${accSection}` : `${proExtra}${accSection}${selfRule}`
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setError('')

    /* scene mode: treat chat message as scene prompt, generate image directly */
    if (imgMode && !proMode) {
      setMessages(prev => [...prev, { id: uid(), role: 'user', content: userMsg }])
      await generateImage(userMsg)
      return
    }

    const newMessages = [...messages, { id: uid(), role: 'user', content: userMsg }]
    setMessages(newMessages)
    setLoading(true)
    const placeholderId = uid()
    setMessages(prev => [...prev, { id: placeholderId, role: 'assistant', content: '' }])
    abortRef.current = new AbortController()
    try {
      const systemContent = getSystemContent()
      const payload = {
        model: AGNES_CHAT_MODEL,
        messages: [
          ...(systemContent ? [{ role: 'system', content: systemContent }] : []),
          ...newMessages.map(m => ({ role: m.role, content: m.content })),
        ],
        temperature: 0.8, max_tokens: 1024,
        stream: true,
      }
      const res = await fetch(`${AGNES_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${AGNES_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortRef.current.signal,
      })
      if (!res.ok) throw new Error(`API error: ${res.status}`)

      /* stream SSE chunks */
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta?.content
            if (delta) {
              fullContent += delta
              setMessages(prev => prev.map(m =>
                m.id === placeholderId ? { ...m, content: fullContent } : m
              ))
            }
          } catch { /* skip malformed chunks */ }
        }
      }

      /* drain remaining buffer */
      if (buffer.startsWith('data: ')) {
        const data = buffer.slice(6).trim()
        if (data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta?.content
            if (delta) fullContent += delta
          } catch {}
        }
      }
      setMessages(prev => prev.map(m =>
        m.id === placeholderId ? { ...m, content: fullContent } : m
      ))

      /* pro mode: detect generation trigger for auto image generation */
      if (proMode) {
        let expandedPrompt = null

        /* pattern 1: [PROMPT]...[/PROMPT] (primary format) */
        const tagMatch = fullContent.match(/\[PROMPT\]([\s\S]*?)\[\/PROMPT\]/)
        if (tagMatch) expandedPrompt = tagMatch[1].trim()

        /* pattern 2: markdown code block */
        if (!expandedPrompt) {
          const codeMatch = fullContent.match(/```(?:plaintext)?\s*([\s\S]*?)```/)
          if (codeMatch) expandedPrompt = codeMatch[1].trim()
        }

        /* pattern 3: long descriptive text (no question marks = final output) */
        if (!expandedPrompt && fullContent.length > 80 && !fullContent.includes('？') && !fullContent.includes('?')) {
          const proMsgs = messages.filter(m => m.role === 'assistant')
          if (proMsgs.length >= 1) {
            let candidate = fullContent.replace(/^(好的|OK|好|來了|準備好了|以下是|這就為你).{0,20}[:：]/i, '')
            if (candidate.length > 50) expandedPrompt = candidate.trim()
          }
        }

        if (expandedPrompt) {
          const cleanReply = fullContent
            .replace(/\[PROMPT\][\s\S]*?\[\/PROMPT\]/, '')
            .replace(/```[\s\S]*?```/, '')
            .trim()
          setMessages(prev => prev.map(m =>
            m.id === placeholderId ? { ...m, content: cleanReply || '📸 幫你生成大師級男友視覺照片中...' } : m
          ))
          setProMode(false)
          setLoading(false)
          await generateImageFromPrompt(expandedPrompt)
          return
        }
      }

    } catch (err) { if (err.name !== 'AbortError') setError(err.message) }
    finally { setLoading(false); abortRef.current = null }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  /* shared image API call — supports single-image (2.1-flash) and multi-image (2.0-flash) */
  const callImageAPI = async (finalPrompt, refUrl, accessoryUrls, signal, outfitUrl) => {
    const allRefs = [refUrl, outfitUrl, ...(accessoryUrls || [])].filter(Boolean)
    const hasMulti = allRefs.length > 1 || accessoryUrls?.length > 0
    const model = hasMulti ? 'agnes-image-2.0-flash' : AGNES_IMAGE_MODEL
    const payload = { model, prompt: finalPrompt, size: '1024x1536' }
    const images = allRefs
    if (images.length > 0) {
      if (hasMulti) payload.tags = ['img2img']
      payload.extra_body = { image: images, response_format: 'b64_json' }
    } else {
      payload.response_format = 'b64_json'
    }
    const res = await fetch(`${AGNES_BASE}/images/generations`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${AGNES_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    const data = await res.json()
    const b64 = data.data?.[0]?.b64_json
    if (!b64) throw new Error('No image returned')
    return `data:image/png;base64,${b64}`
  }

  /* AI expand prompt with randomness — English output for better Agnes image quality */
  const expandPrompt = async (userPrompt, signal, hasRef = false) => {
    /* client-side scene type pick — guarantees diversity when input is vague */
    const sceneTypes = [
      'cozy indoor living space — bedroom, living room, kitchen, balcony, sunroom',
      'indoor public space — library, coffee shop, museum, bookstore, aquarium, arcade, karaoke room',
      'urban outdoor — night market, rooftop, subway station, parking garage, laundromat, convenience store',
      'city street scene — bustling sidewalk, crosswalk, bus stop, taxi stand, street food stall',
      'transport hub — airport terminal, train station platform, ferry dock, bullet train interior',
      'indoor recreation — bowling alley, climbing gym, basketball court, recording studio, dance studio',
      'natural landscape — beach shore, lakeside pier, mountain trail, waterfall, desert road, sunflower field',
      'cultural venue — temple courtyard, traditional teahouse, open-air theater, lantern festival, night parade',
      'industrial/utilitarian — warehouse loft, factory rooftop, auto repair shop, construction site lookout',
      'atmospheric night scene — neon-lit street, observatory dome, rooftop bar, bridge overlook, highway overpass',
    ]
    const sceneType = sceneTypes[Math.floor(Math.random() * sceneTypes.length)]

    /* random season & time of day — not tied to real time */
    const seasons = ['early spring','spring','late spring','early summer','summer','midsummer','late summer','early autumn','autumn','late autumn','early winter','winter']
    const season = seasons[Math.floor(Math.random() * seasons.length)]
    const timesOfDay = ['dawn','sunrise','early morning','morning','late morning','noon','early afternoon','afternoon','golden hour','sunset','twilight','night','midnight','deep night']
    const timeOfDay = timesOfDay[Math.floor(Math.random() * timesOfDay.length)]

    /* large random pools for variety */
    const weathers = ['sunny','clear','partly cloudy','overcast','golden haze','misty','foggy','crisp autumn','warm breeze','soft overcast','dramatic clouds','hazy','bright','fair','dry heat','urban haze','starry clear','moonlit']
    const weather = weathers[Math.floor(Math.random() * weathers.length)]

    const styles = [
      'cinematic realism, natural everyday aesthetic',
      'candid photography, warm intimate atmosphere',
      'film still, soft dreamy quality',
      'fashion editorial, clean modern look',
      'vintage film stock, warm tones',
      'lifestyle photography, authentic moment',
      'romantic soft focus, pastel palette',
      'street photography style, natural light',
      'minimalist aesthetic, clean composition',
      'warm analog film, slight grain',
    ]
    const style = styles[Math.floor(Math.random() * styles.length)]

    const colorPalettes = [
      'warm earthy tones, soft browns and creams',
      'cool pastels, mint and lavender hues',
      'golden amber and warm neutrals',
      'muted vintage tones, faded memory palette',
      'soft pink and warm ivory',
      'deep indigo and neon accent, city night vibe',
      'monochromatic soft gray scale with warm accent',
      'cream, beige and dusty rose',
    ]
    const colorPalette = colorPalettes[Math.floor(Math.random() * colorPalettes.length)]

    const cameraAngles = [
      'shot from slightly below, intimate eye-level perspective',
      'boyfriend POV, natural eye-level framing',
      'shot from slightly above, soft down-angle',
      'close-up, shallow depth of field',
      'medium shot, environmental context visible',
      'three-quarter angle, natural candid framing',
      'over-the-shoulder perspective',
      'waist-level shot, everyday casual framing',
    ]
    const cameraAngle = cameraAngles[Math.floor(Math.random() * cameraAngles.length)]

    /* style config — each style influences clothing suggestions, expressions, and color bias */
    const styleConfig = {
      '清純': { clothing: '白色碎花洋裝、棉質襯衫配牛仔褲、淺色針織衫、A字裙、帆布鞋', expressions: 'natural shy smile, innocent gaze, gentle blush, pure expression, soft peaceful face' },
      '性感': { clothing: '貼身洋裝、細肩帶背心配短裙、蕾絲上衣、高衩長裙、皮裙、高跟鞋', expressions: 'seductive gaze over shoulder, confident smirk, sultry expression, mysterious look, alluring eyes' },
      '可愛': { clothing: '蓬裙、百褶裙、oversize針織衫配短褲、連身吊帶裙、泡泡袖上衣、娃娃鞋', expressions: 'bright cheerful smile, playful wink, cute pout, happy laugh, bunny pose' },
      '優雅': { clothing: '絲質連身裙、簡約套裝、高腰寬褲配雪紡衫、及膝裙、低跟鞋', expressions: 'graceful smile, composed serene expression, elegant gaze, poised calm face, refined look' },
      '鄰家': { clothing: 'T恤配牛仔短褲、連帽外套、居家棉質洋裝、吊帶褲、運動鞋', expressions: 'warm friendly smile, relaxed natural expression, casual laugh, caring look, comfortable happy face' },
    }
    const cfg = styleConfig[character.style] || styleConfig['可愛']
    const styleClothHint = cfg.clothing
    const styleExprs = cfg.expressions

    /* build body context from character settings */
    const bodyDescText = buildBodyDesc(character)
    const refNote = hasRef
      ? `\n角色外貌參照：臉部、髮型、體型${outfit?.desc ? '' : '、服裝'}保持與參考圖完全一致。`
      : ''

    /* if user uploaded accessories, force AI to keep them in the scene */
    const wearItems = accessories.length > 0
      ? `（使用者指定的穿戴物品：${accessories.filter(a => a.desc).map(a => `${a.label} = ${a.desc}`).join('；')}）務必保持這些物品在角色身上，不要移除或改變外觀。`
      : ''
    let clothingRule
    if (outfit?.desc) {
      clothingRule = `1. 🧥 服裝：角色必須穿著此套服裝：${outfit.desc}。保持服裝外觀不變，但場景、時間、地點、姿勢可以自由創作。`
    } else if (hasRef || accessories.length > 0) {
      clothingRule = `1. 🧥 服裝：保持服裝不變，${wearItems}除非使用者明確要求換衣服。`
    } else {
      clothingRule = `1. 🧥 服裝：根據角色風格選擇合適的服裝。優先選擇：${styleClothHint}。可根據場景場合調整，但須符合整體風格調性。`
    }

    const charContext = bodyDescText || refNote
      ? `\n角色資訊：${bodyDescText}${refNote}`
      : ''

    const sysMsg = `You are a professional photographer and cinematographer. Your task is to expand a short scene description into a rich, detailed English image prompt for a photo-realistic generation model.

The subject is always "${character.name}" (the character in the photo).${charContext}

If the user's description is vague (e.g. "random", "隨機", or ≤3 words), generate a scene that matches this type: ${sceneType}. Invent a specific, vivid location within that category. Example: if type is "library" then describe exactly which library, what the character is doing there, what objects are nearby. Do NOT default to outdoor street scenes when other categories are requested.

Based on the character's body features above and the scene, generate a prompt that includes ALL of the following elements (each time with different choices):

${clothingRule}
2. 🧍 Pose: Choose a unique pose different from last time. Examples: looking back with a smile, playing with hair,低頭 scrolling phone, holding a drink, leaning against a wall, adjusting collar, tying shoelaces, stretching, looking out a window, walking naturally, sitting on a bench, browsing bookshelf, holding a coffee cup, laughing naturally.
3. ☁️ Weather/Atmosphere: ${weather}
4. 🌅 Time/Lighting: ${timeOfDay}, ${season}. Describe natural light effect accordingly.
5. 🎨 Color Palette: ${colorPalette}
6. 😊 Expression/Mood: Choose a ${character.style} style expression — ${styleExprs}.
7. 📷 Camera: ${cameraAngle}
8. ✨ Quality: ultra-detailed skin texture, natural skin pores, realistic eye catchlight, natural hair strands, photorealistic, 8K

Style direction: ${style}

You MUST include the character's full body description (age, height, figure, bust, waist, hips, style) in the prompt so the image model knows exactly what the character looks like.${hasRef ? `

IMPORTANT — A reference photo of the character will be provided to the image model. Your prompt MUST explicitly tell the image model what to keep unchanged vs what to change. Begin the prompt with: "KEEP: [face, hairstyle, body, clothing unchanged]. CHANGE: [background/scene completely to the new setting below]." Then describe the scene as usual, including the character's body description. This ensures img2img generates a completely different background while preserving the character's identity.` : ''}

Output ONLY the expanded English prompt. One paragraph. No explanations, no prefixes, no line breaks. Keep character name "${character.name}" in the prompt.

Important: Rule 1 (clothing) is final. Ignore any "keep clothing unchanged" in the user's message — rule 1 takes precedence.`
    const res = await fetch(`${AGNES_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${AGNES_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: AGNES_CHAT_MODEL,
        messages: [
          { role: 'system', content: sysMsg },
          { role: 'user', content: userPrompt },
        ],
        temperature: 1.0, max_tokens: 4096,
        chat_template_kwargs: { enable_thinking: true },
      }),
      signal,
    })
    if (!res.ok) return userPrompt
    const data = await res.json()
    const expanded = data.choices?.[0]?.message?.content?.trim()
    return expanded || userPrompt
  }

  const generateImage = async (overridePrompt) => {
    const promptText = (overridePrompt || customPrompt).trim()
    if (!promptText) { setError('請選擇一個情境或輸入描述'); return }

    abortRef.current = new AbortController()
    const signal = abortRef.current.signal
    setGenLoading(true); setGenStatus('✏️'); setGenProgress(5); setError('')

    try {
      const hasRef = !!character.refImageUrl

      /* step 1: AI expand with randomness */
      setGenStatus('✏️'); setGenProgress(20)
      const expandedPrompt = await expandPrompt(promptText, signal, hasRef || accessories.length > 0)
      if (signal.aborted) return
      setGenProgress(45)

      /* step 2: send expanded prompt to image API */
      setGenStatus('🎨'); setGenProgress(50)
      const finalPrompt = `${expandedPrompt}。高畫質、精細細節、寫實風格`
      const accessoryUrls = accessories.map(a => a.dataUrl)
      const dataUrl = await callImageAPI(finalPrompt, character.refImageUrl, accessoryUrls, signal, outfit?.dataUrl)
      setGenProgress(95)
      if (signal.aborted) return

      const label = '自訂'
      const imageMsg = {
        id: uid(), role: 'assistant', type: 'image',
        imageUrl: dataUrl, content: `📸 生成了「${label}」的圖片`,
      }
      const promptMsg = character.showPrompt ? {
        id: uid(), role: 'assistant', type: 'prompt',
        content: `💡 ${expandedPrompt}`,
      } : null
      setMessages(prev => [...prev, imageMsg, ...(promptMsg ? [promptMsg] : [])])

      /* persist to image history */
      const record = { id: `img_${Date.now()}`, imageUrl: dataUrl, scene: selectedScene, prompt: promptText, timestamp: Date.now() }
      await put('images', record)

      setImgMode(false); setSelectedScene(null); setCustomPrompt(''); setAccessories([])
      /* reset only data-URL reference (set via 修改這張圖), preserve external URLs */
      if (character.refImageUrl?.startsWith('data:')) {
        onChangeCharacter?.({...character, refImageUrl: ''})
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      setError(err.message)
    }
    finally { setGenLoading(false); setGenStatus(''); setGenProgress(0); abortRef.current = null }
  }

  /* auto-generate image from AI-crafted prompt in pro mode */
  const generateImageFromPrompt = async (expandedPrompt, label = '大師級作品') => {
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal
    setGenLoading(true); setGenStatus('🎨'); setGenProgress(10)
    const bodyDesc = buildBodyDesc(character)
    const refClause = character.refImageUrl
      ? `角色外貌保持不變（臉部、髮型、體型${outfit?.desc ? '' : '、服裝'}完全與參考圖一致）`
      : ''

    let wearClause = ''
    if (accessories.length > 0) {
      const parts = accessories.filter(a => a.desc).map(a => `${a.label}（${a.desc}）`).join('、')
      wearClause = parts ? `，穿著/配戴：${parts}` : ''
    }

    const finalPrompt = `${refClause}${refClause ? '，' : ''}${bodyDesc}${wearClause}，${expandedPrompt}。高畫質、精細細節、寫實風格`.replace(/^，/, '')

    try {
      setGenProgress(30)
      const accessoryUrls = accessories.map(a => a.dataUrl)
      const dataUrl = await callImageAPI(finalPrompt, character.refImageUrl, accessoryUrls, signal, outfit?.dataUrl)
      if (signal.aborted) return
      setGenProgress(95)

      const imageMsg = {
        id: uid(), role: 'assistant', type: 'image',
        imageUrl: dataUrl, content: `📸 大師級男友視覺作品 — ${label}`,
      }
      const promptMsg = character.showPrompt ? {
        id: uid(), role: 'assistant', type: 'prompt',
        content: `💡 ${finalPrompt}`,
      } : null
      setMessages(prev => [...prev, imageMsg, ...(promptMsg ? [promptMsg] : [])])

      /* persist to image history */
      const record = { id: `img_${Date.now()}`, imageUrl: dataUrl, scene: 'pro', prompt: expandedPrompt, timestamp: Date.now() }
      await put('images', record)

      setImgMode(false); setProMode(false); setAccessories([])
      /* reset only data-URL reference (set via 修改這張圖), preserve external URLs */
      if (character.refImageUrl?.startsWith('data:')) {
        onChangeCharacter?.({...character, refImageUrl: ''})
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      setError(err.message)
    }
    finally { setGenLoading(false); setGenStatus(''); setGenProgress(0); abortRef.current = null }
  }

  const toggleImgMode = () => {
    if (genLoading) cancelGen()
    setImgMode(!imgMode)
    setError('')
    if (!imgMode) { setSelectedScene(null); setCustomPrompt(''); setAccessories([]) }
  }

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`} style={{ position: 'relative' }}>
            <div className="message-avatar">
              {msg.role === 'assistant' && character.refImageUrl ? (
                <img src={character.refImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : msg.role === 'assistant' ? '♡' : '☺'}
            </div>
            <div className="message-bubble" style={{ position: 'relative', ...(msg.type === 'image' ? { width: '50%' } : {}) }}>
              <button onClick={() => deleteMessage(msg.id)}
                style={{
                  position: 'absolute', top: 2, right: 4,
                  background: 'none', border: 'none', color: 'var(--text-muted)',
                  fontSize: '0.7rem', cursor: 'pointer', opacity: 0.3,
                  lineHeight: 1, padding: '2px 4px', zIndex: 1,
                }}
                title="刪除訊息">✕</button>
              {msg.type === 'image' ? (
                <>
                  <p style={{ marginBottom: 8 }}>{msg.content}</p>
                  <img src={msg.imageUrl} alt="" onClick={() => setViewerUrl(msg.imageUrl)} style={{ width: '100%', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }} />
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => downloadImage(msg.imageUrl)}
                    style={{
                      padding: '4px 12px', fontSize: '0.75rem',
                      borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                      background: 'var(--bg-input)', color: 'var(--text-muted)', cursor: 'pointer',
                    }}>
                    ⬇️ 下載
                  </button>
                  <button onClick={() => {
                    const isRef = msg.imageUrl === character.refImageUrl
                    onChangeCharacter?.({ ...character, refImageUrl: isRef ? '' : msg.imageUrl })
                    setImgMode(isRef ? false : true) /* open 🎨 on set, close on cancel */
                  }}
                  style={{
                    marginTop: 8, padding: '4px 12px', fontSize: '0.75rem',
                    borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                    background: msg.imageUrl === character.refImageUrl ? 'rgba(232,67,147,0.15)' : 'var(--bg-input)',
                    color: msg.imageUrl === character.refImageUrl ? 'var(--pink-light)' : 'var(--text-muted)',
                    cursor: 'pointer', display: 'block',
                  }}>
                    {msg.imageUrl === character.refImageUrl ? '✕ 取消修改' : '📌 修改這張圖'}
                  </button>
                  </div>
                </>
              ) : msg.type === 'prompt' ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{msg.content}</p>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {error && <div className="error">{error}</div>}

      {imgMode && (
        <div className="chat-img-panel" style={{ padding: '12px 0', borderTop: '1px solid var(--border)' }}>
          {!genLoading && (<>
          {!character.refImageUrl && (
            <div style={{
              padding: '8px 12px', marginBottom: 10, borderRadius: 'var(--radius-sm)',
              background: 'rgba(255, 193, 7, 0.1)', border: '1px solid rgba(255, 193, 7, 0.3)',
              fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5,
            }}>
              ⚠️ 未設定角色外貌參考圖，生成的角色臉部可能不一致。
              到 <strong>設定</strong> 頁面上傳參考圖可保持角色穩定性。
            </div>
          )}
          {/* mode toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button className={`scene-btn ${!proMode ? 'selected' : ''}`}
              onClick={() => setProMode(false)}
              style={{ flex: 1, padding: '8px 4px', fontSize: '0.85rem' }}>
              📋 情境場景
            </button>
            <button className={`scene-btn ${proMode ? 'selected' : ''}`}
              onClick={() => setProMode(true)}
              style={{ flex: 1, padding: '8px 4px', fontSize: '0.85rem' }}>
              🌟 專業大師級
            </button>
          </div>

          {/* collapsible outfit + accessories — collapsed by default, side by side when open */}
          <div style={{ marginBottom: 12 }}>
            <div onClick={() => setUploadAreaOpen(prev => !prev)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                padding: '8px 0', userSelect: 'none',
              }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: uploadAreaOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                ▶
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                👗 服裝暫存 ＆ 📎 穿戴物品
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {uploadAreaOpen ? '收起' : '展開'}
              </span>
            </div>

            {uploadAreaOpen && (
            <div className="outfit-acc-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>

            {/* outfit upload (1 set of clothing — locks outfit, scene random) */}
            <div className="outfit-section"
              onDragOver={e => { e.preventDefault(); setOutfitDragOver(true) }}
              onDragLeave={() => setOutfitDragOver(false)}
              onDrop={handleOutfitDrop}
              style={{
                flex: '1 1 280px', padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                background: outfitDragOver ? 'rgba(232,67,147,0.15)' : 'rgba(232,67,147,0.04)',
                border: outfitDragOver ? '2px dashed var(--pink)' : '1px solid rgba(232,67,147,0.12)',
                transition: 'all 0.2s',
              }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                👗 服裝暫存（上傳 1 張衣服照片，給「虛擬女友」換新裝）
              </p>
              {outfit ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ position: 'relative', width: 56, height: 56, borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
                    <img src={outfit.dataUrl} alt={outfit.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button onClick={removeOutfit}
                      style={{
                        position: 'absolute', top: 1, right: 1,
                        width: 16, height: 16, borderRadius: '50%',
                        background: 'rgba(0,0,0,0.6)', color: '#fff',
                        border: 'none', cursor: 'pointer',
                        fontSize: '0.5rem', lineHeight: '16px', padding: 0,
                      }}>✕</button>
                  </div>
                  <input type="text" value={outfit.desc}
                    onChange={e => setOutfit(prev => prev ? { ...prev, desc: e.target.value } : prev)}
                    placeholder="描述這套服裝，例如：白色連身裙、草帽、涼鞋"
                    style={{
                      flex: 1, padding: '6px 10px', fontSize: '0.75rem',
                      borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                      background: 'var(--bg-input)', color: 'var(--text)',
                      outline: 'none', boxSizing: 'border-box',
                    }} />
                </div>
              ) : outfitDragOver ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--pink)', textAlign: 'center', padding: '8px 0' }}>
                  📸 放開以上傳服裝
                </p>
              ) : (
                <>
                  <input type="file" accept="image/*"
                    ref={outfitInputRef}
                    style={{ display: 'none' }}
                    onChange={handleOutfitUpload} />
                  <button onClick={() => outfitInputRef.current?.click()}
                    style={{
                      padding: '6px 14px', fontSize: '0.8rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px dashed var(--border)',
                      background: 'transparent', color: 'var(--text-muted)',
                      cursor: 'pointer',
                    }}>
                    + 上傳服裝照片
                  </button>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 8 }}>
                    或拖曳圖片到此
                  </span>
                </>
              )}
              {outfit && !outfit.desc && (
                <p style={{ fontSize: '0.7rem', color: '#ff6b6b', marginTop: 6 }}>
                  ⚠️ 請填寫服裝描述，AI 才知道如何搭配
                </p>
              )}
            </div>

            {/* accessories upload (max 3, auto-labeled pic1-pic3, per-item required desc) */}
            <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
              style={{
                flex: '1 1 280px', padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                background: dragOver ? 'rgba(232,67,147,0.15)' : 'rgba(232,67,147,0.05)',
                border: dragOver ? '2px dashed var(--pink)' : '1px solid rgba(232,67,147,0.15)',
                transition: 'all 0.2s',
              }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                📎 上傳穿戴物品（最多 3 張）{accessories.length > 0 && <span style={{ color: 'var(--pink)' }}>({accessories.length}/3)</span>}
              </p>

              {/* per-item display: thumbnail + label + required desc input */}
              {accessories.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                  {accessories.map(acc => (
                    <div key={acc.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.1)' }}>
                      <div style={{ position: 'relative', width: 48, height: 48, borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
                        <span style={{
                          position: 'absolute', top: 1, left: 1, zIndex: 1,
                          fontSize: '0.55rem', background: 'var(--pink)', color: '#fff',
                          padding: '0 4px', borderRadius: 3, lineHeight: '14px',
                        }}>{acc.label}</span>
                        <img src={acc.dataUrl} alt={acc.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button onClick={() => removeAccessory(acc.id)}
                          style={{
                            position: 'absolute', top: 1, right: 1,
                            width: 16, height: 16, borderRadius: '50%',
                            background: 'rgba(0,0,0,0.6)', color: '#fff',
                            border: 'none', cursor: 'pointer',
                            fontSize: '0.5rem', lineHeight: '16px', padding: 0,
                          }}>✕</button>
                      </div>
                      <input type="text" value={acc.desc}
                        onChange={e => {
                          const val = e.target.value
                          setAccessories(prev => prev.map(a => a.id === acc.id ? { ...a, desc: val } : a))
                        }}
                        placeholder={`描述 ${acc.label}，例如：紅色貝雷帽（頭上戴）`}
                        style={{
                          flex: 1, padding: '6px 10px', fontSize: '0.75rem',
                          borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                          background: 'var(--bg-input)', color: 'var(--text)',
                          outline: 'none', boxSizing: 'border-box',
                        }} />
                    </div>
                  ))}
                </div>
              )}

              {/* drag hint or max reached */}
              {dragOver ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--pink)', textAlign: 'center', padding: '8px 0' }}>
                  📸 放開以上傳圖片
                </p>
              ) : accessories.length >= 3 ? (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '4px 0' }}>
                  已達上傳上限 (3/3)
                </p>
              ) : (
                <>
              <input type="file" accept="image/*" multiple
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleAccessoryUpload} />
              <button onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: '6px 14px', fontSize: '0.8rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px dashed var(--border)',
                  background: 'transparent', color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}>
                + 選擇圖片
              </button>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 8 }}>
                或拖曳圖片到此
              </span>
              </>)}
            </div>
            </div>
            )}
          </div>

          {/* Mode description — collapsible hint */}
          <div style={{ marginBottom: 8, padding: '4px 0' }}>
            <div onClick={() => setHintOpen(prev => !prev)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                padding: '4px 0', userSelect: 'none',
              }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: hintOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                ▶
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                {proMode ? '🌟 大師級男友視覺攝影模式' : '📋 情境場景模式'}
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {hintOpen ? '收起提示' : '展開提示'}
              </span>
            </div>

            {hintOpen && (
              <div style={{ padding: '8px 0 4px' }}>
                {proMode ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    在對話中告訴虛擬伴侶你想拍什麼照片（例如：「我想在海邊拍一張照片」），
                    她會一步步引導你完成專業級構圖，最後自動生成大師級作品！
                  </p>
                ) : (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    在對話中直接輸入場景描述（例如：「圖書館窗邊看書」），
                    或輸入「隨機 / random」讓 AI 即興抽卡！
                  </p>
                )}
                {accessories.length > 0 && accessories.some(a => !a.desc) && (
                  <p style={{ fontSize: '0.75rem', color: '#ff6b6b', marginTop: 6 }}>
                    ⚠️ 請為每個上傳的物品填寫描述，AI 才知道如何搭配
                  </p>
                )}
              </div>
            )}
          </div>
          </>)}

          {/* Shared progress bar (any mode) */}
          {genLoading && (
            <div style={{ padding: '8px 0' }}>
              <div className="gen-progress-wrap">
                <div className="gen-progress-bar">
                  <div className="gen-progress-fill" style={{ width: genProgress + '%' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', flex: 1 }}>
                  {genStatus} {genStatus === '✏️' ? 'AI 擴寫提示中...' : genStatus === '🎨' ? '生成圖片中...' : '處理中...'}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{genProgress}%</span>
              </div>
              <button className="chat-send" onClick={cancelGen}
                style={{ width: '100%', background: 'transparent', border: '1px solid #ff6b6b', color: '#ff6b6b' }}>
                ✕ 取消
              </button>
            </div>
          )}
        </div>
      )}

      <div className="chat-input-area">
        <button className={`tab ${imgMode ? 'active' : ''}`} onClick={toggleImgMode}
          style={{ flexShrink: 0 }} title="生成圖片">
          📸
        </button>
        <textarea className="chat-input" rows={1} value={input}
          onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
          placeholder={imgMode ? (proMode ? `描述你想拍的畫面...` : `輸入場景描述，如：圖書館窗邊看書`) : `跟${character.name}說說話...`} disabled={loading || genLoading} />
        <button className="chat-send" onClick={sendMessage} disabled={loading || !input.trim()}>送出</button>
      </div>

      {/* full-screen image viewer */}
      {viewerUrl && (
        <div className="album-viewer-overlay" onClick={() => setViewerUrl(null)}>
          <div className="album-viewer-content" onClick={e => e.stopPropagation()}>
            <button className="album-viewer-close" onClick={() => setViewerUrl(null)}>✕</button>
            <img src={viewerUrl} alt="" />
          </div>
        </div>
      )}
    </div>
  )
}

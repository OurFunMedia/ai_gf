const AGNES_API_KEY = process.env.AGNES_API_KEY;
const AGNES_BASE = 'https://apihub.agnes-ai.com/v1';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, systemPrompt } = req.body;
  const payload = {
    model: 'agnes-2.0-flash',
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...messages,
    ],
    temperature: 0.8, max_tokens: 1024,
  };

  try {
    const response = await fetch(`${AGNES_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${AGNES_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return res.status(response.status).json({ error: await response.text() });
    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) { return res.status(500).json({ error: err.message }); }
}

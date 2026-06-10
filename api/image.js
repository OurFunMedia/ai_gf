const AGNES_API_KEY = process.env.AGNES_API_KEY;
const AGNES_BASE = 'https://apihub.agnes-ai.com/v1';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, refImageUrl } = req.body;
  const payload = { model: 'agnes-image-2.1-flash', prompt, size: '1024x768' };

  if (refImageUrl) {
    payload.extra_body = { image: [refImageUrl], response_format: 'url' };
  }

  try {
    const response = await fetch(`${AGNES_BASE}/images/generations`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${AGNES_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return res.status(response.status).json({ error: await response.text() });
    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) { return res.status(500).json({ error: err.message }); }
}

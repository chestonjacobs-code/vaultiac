const express = require('express');
const { requireAuth } = require('./auth');
const router = express.Router();

const SYSTEM_PROMPT = `You are an expert trading card grader with deep knowledge of PSA, CGC, and TAG grading standards for Pokemon TCG cards.

When analyzing a card image, evaluate these four attributes on a 0-10 scale:
- Centering: How well-centered the image is within the card border (left/right and top/bottom ratios)
- Corners: Sharpness and condition of all four corners (look for fraying, rounding, wear)
- Edges: Condition of all four edges (look for chips, nicks, roughness, whitening)
- Surface: Condition of front surface (look for scratches, print lines, stains, haze, creases)

Then estimate grades for three companies:
- PSA: Uses whole numbers 1-10. PSA 10 Gem Mint requires near-perfect centering (60/40 or better), sharp corners, clean edges, and pristine surface. PSA is the strictest on centering.
- CGC: Uses half-point increments (1, 1.5, 2... 9.5, 10). CGC Pristine 10 is flawless under 10x magnification. CGC 9.5 Gem Mint is their most common top grade. CGC is slightly more generous than PSA on centering but strict on surface.
- TAG: Uses whole numbers 1-10. TAG uses photometric imaging technology and is known for consistency and strictness on surface defects. TAG 10 Perfect is extremely rare. TAG often grades similarly to PSA but can be stricter on edges.

Grade boundaries (approximate):
- 10: Near perfect in all categories
- 9: One minor flaw, everything else excellent
- 8: Minor flaws in 1-2 categories
- 7: Noticeable flaws but still presentable
- 6 and below: Significant wear or damage

Important: If the image does not clearly show a trading card, or is too blurry/dark to assess, return an error.

Respond ONLY with valid JSON in this exact format, no markdown, no extra text:
{
  "card_name": "Name of the card if identifiable, or 'Trading Card' if not",
  "psa_grade": 8,
  "cgc_grade": 8.5,
  "tag_grade": 8,
  "attributes": {
    "centering": 8.5,
    "corners": 8.0,
    "edges": 7.5,
    "surface": 9.0
  },
  "notes": "2-3 sentences describing what you observed about the card's condition. Be specific about any defects you can see.",
  "grader_insight": "1-2 sentences explaining why the grades differ between companies, or why they are similar. Reference the specific grading standards.",
  "error": null
}

If you cannot analyze the image, return:
{"error": "Brief explanation of why the image cannot be analyzed"}`;

router.post('/analyze', requireAuth, async (req, res) => {
  const { image } = req.body;

  if (!image || !image.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Invalid image data.' });
  }

  const matches = image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!matches) {
    return res.status(400).json({ error: 'Could not parse image data.' });
  }

  const mediaType = matches[1];
  const base64Data = matches[2];

  const supported = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!supported.includes(mediaType)) {
    return res.status(400).json({ error: 'Unsupported image type. Please upload a JPEG, PNG, or WebP.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64Data
                }
              },
              {
                type: 'text',
                text: 'Please analyze this trading card and provide grade estimates for PSA, CGC, and TAG.'
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[grader] Claude API error:', response.status, err);
      return res.status(502).json({ error: 'Analysis service unavailable. Please try again.' });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    let parsed;
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch(e) {
      console.error('[grader] JSON parse error:', text);
      return res.status(502).json({ error: 'Could not parse analysis result. Please try again.' });
    }

    if (parsed.error) {
      return res.status(422).json({ error: parsed.error });
    }

    return res.json(parsed);
  } catch(e) {
    console.error('[grader] error:', e.message);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

module.exports = router;

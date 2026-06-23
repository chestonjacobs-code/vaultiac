const express = require('express');
const { requireAuth } = require('./auth');
const heicConvert = require('heic-convert');
const router = express.Router();

const SYSTEM_PROMPT = `You are an expert trading card grader with deep knowledge of PSA, CGC, TAG, and BGS grading standards for Pokemon TCG cards.

When analyzing a card image, evaluate these four attributes on a 0-10 scale:
- Centering: How well-centered the image is within the card border (left/right and top/bottom ratios)
- Corners: Sharpness and condition of all four corners (look for fraying, rounding, wear)
- Edges: Condition of all four edges (look for chips, nicks, roughness, whitening)
- Surface: Condition of front surface (look for scratches, print lines, stains, haze, creases)

Then estimate grades for four companies:
- PSA: Uses whole numbers 1-10. PSA 10 Gem Mint requires near-perfect centering (60/40 or better), sharp corners, clean edges, and pristine surface. PSA is the strictest on centering.
- CGC: Uses half-point increments (1, 1.5, 2... 9.5, 10). CGC Pristine 10 is flawless under 10x magnification. CGC 9.5 Gem Mint is their most common top grade. CGC is slightly more generous than PSA on centering but strict on surface.
- TAG: Uses whole numbers 1-10. TAG uses photometric imaging technology and is known for consistency and strictness on surface defects. TAG 10 Perfect is extremely rare. TAG often grades similarly to PSA but can be stricter on edges.
- BGS (Beckett Grading Services): Uses half-point increments (1 through 10). BGS grades four sub-grades separately: Centering, Corners, Edges, Surface — each on a 1-10 half-point scale. The overall BGS grade is determined by the lowest sub-grade (with some flexibility). BGS 10 Pristine requires all sub-grades at 10. BGS 9.5 Gem Mint is their most common top grade. BGS 9 is Mint. BGS is known for strict sub-grade transparency and is widely used for vintage and modern cards.

Grade boundaries (approximate):
- 10: Near perfect in all categories
- 9: One minor flaw, everything else excellent
- 8: Minor flaws in 1-2 categories
- 7: Noticeable flaws but still presentable
- 6 and below: Significant wear or damage
BGS uses the same 1-10 scale with half-point increments, with sub-grades driving the overall.

Important: If the image does not clearly show a trading card, or is too blurry/dark to assess, return an error.

Respond ONLY with valid JSON in this exact format, no markdown, no extra text:
{
  "card_name": "Name of the card if identifiable, or 'Trading Card' if not",
  "psa_grade": 8,
  "cgc_grade": 8.5,
  "tag_grade": 8,
  "bgs_grade": 8.5,
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

async function convertHeicToJpeg(base64Data) {
  try {
    const inputBuffer = Buffer.from(base64Data, 'base64');
    const outputBuffer = await heicConvert({
      buffer: inputBuffer,
      format: 'JPEG',
      quality: 0.92
    });
    return outputBuffer.toString('base64');
  } catch(e) {
    console.error('[grader] HEIC conversion error:', e.message);
    throw new Error('Could not convert iPhone photo. Please try a different image.');
  }
}

router.post('/analyze', requireAuth, async (req, res) => {
  const { front_image, back_image, image } = req.body;
  const frontRaw = front_image || image;

  function parseDataURL(dataUrl, label) {
    if (!dataUrl || typeof dataUrl !== 'string') {
      return { error: `No ${label} image received.` };
    }
    if (!dataUrl.startsWith('data:')) {
      return { error: `Invalid ${label} image format.` };
    }
    // Strip whitespace that some encoders inject into base64
    const clean = dataUrl.replace(/\s/g, '');
    const m = clean.match(/^data:(image\/[a-zA-Z0-9+\-.]+);base64,(.+)$/);
    if (!m) {
      console.error(`[grader] parseDataURL failed for ${label}:`, dataUrl.slice(0, 80));
      return { error: `Could not parse ${label} image. Please try a different photo.` };
    }
    const mediaType = m[1];
    const base64Data = m[2];

    const needsConversion = mediaType === 'image/heic' || mediaType === 'image/heif';

    const supported = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff'];
    if (!needsConversion && !supported.includes(mediaType)) {
      console.error(`[grader] Unsupported media type for ${label}:`, mediaType);
      return { error: `Unsupported image format (${mediaType}). Please use JPEG, PNG, or WebP.` };
    }

    const apiMediaType = (mediaType === 'image/jpg' || needsConversion) ? 'image/jpeg' : mediaType;

    return { mediaType: apiMediaType, base64Data, needsConversion };
  }

  const front = parseDataURL(frontRaw, 'front');
  if (front.error) return res.status(400).json({ error: front.error });

  // Convert HEIC to JPEG if needed
  if (front.needsConversion) {
    try {
      front.base64Data = await convertHeicToJpeg(front.base64Data);
      front.mediaType = 'image/jpeg';
      // Verify JPEG magic bytes (FF D8)
      const magic = Buffer.from(front.base64Data.slice(0, 4), 'base64');
      if (magic[0] !== 0xFF || magic[1] !== 0xD8) {
        console.error('[grader] HEIC conversion produced non-JPEG output');
        return res.status(400).json({ error: 'Could not process this photo format. Please try a different image.' });
      }
    } catch(e) {
      return res.status(400).json({ error: e.message });
    }
  }

  const hasBack = !!back_image;
  let back = null;
  if (hasBack) {
    back = parseDataURL(back_image, 'back');
    if (back.error) return res.status(400).json({ error: back.error });

    if (back.needsConversion) {
      try {
        back.base64Data = await convertHeicToJpeg(back.base64Data);
        back.mediaType = 'image/jpeg';
        const magic = Buffer.from(back.base64Data.slice(0, 4), 'base64');
        if (magic[0] !== 0xFF || magic[1] !== 0xD8) {
          console.error('[grader] HEIC conversion produced non-JPEG output (back)');
          return res.status(400).json({ error: 'Could not process the back photo format. Please try a different image.' });
        }
      } catch(e) {
        return res.status(400).json({ error: e.message });
      }
    }
  }

  const contentBlocks = [
    {
      type: 'image',
      source: { type: 'base64', media_type: front.mediaType, data: front.base64Data }
    },
    { type: 'text', text: 'This is the FRONT of the card.' }
  ];

  if (hasBack) {
    contentBlocks.push({
      type: 'image',
      source: { type: 'base64', media_type: back.mediaType, data: back.base64Data }
    });
    contentBlocks.push({ type: 'text', text: 'This is the BACK of the card.' });
    contentBlocks.push({
      type: 'text',
      text: 'Please analyze both sides of this trading card and provide grade estimates for PSA, CGC, TAG, and BGS. Consider defects visible on both the front and back when scoring each attribute.'
    });
  } else {
    contentBlocks.push({
      type: 'text',
      text: 'Please analyze this trading card front and provide grade estimates for PSA, CGC, TAG, and BGS. Note that only the front image was provided, so back-surface defects cannot be assessed.'
    });
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
        messages: [{ role: 'user', content: contentBlocks }]
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

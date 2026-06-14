const express = require('express');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('./auth');
const router = express.Router();

// Load canvas
let createCanvas, loadImage, registerFont;
try {
  const canvas = require('canvas');
  createCanvas = canvas.createCanvas;
  loadImage = canvas.loadImage;
  registerFont = canvas.registerFont;
} catch(e) {
  const canvas = require('@napi-rs/canvas');
  createCanvas = canvas.createCanvas;
  loadImage = canvas.loadImage;
  registerFont = canvas.registerFont;
}

// Register bundled fonts — Railway has no system fonts
const FONTS_DIR = path.join(__dirname, '../../public/fonts');
const FONT_DEFS = [
  { file: 'Inter-Regular.ttf', family: 'Inter', weight: 'normal' },
  { file: 'Inter-Bold.ttf',    family: 'Inter', weight: 'bold'   },
  { file: 'Inter.ttf',         family: 'Inter', weight: 'normal' },
];
let FONT_FAMILY = 'Arial, sans-serif'; // fallback if no font file found
for (const f of FONT_DEFS) {
  const fp = path.join(FONTS_DIR, f.file);
  if (fs.existsSync(fp)) {
    try {
      registerFont(fp, { family: f.family, weight: f.weight });
      FONT_FAMILY = 'Inter, Arial, sans-serif';
      console.log('[spotlight] Font registered:', f.file);
    } catch(e) {
      console.warn('[spotlight] Font register error:', e.message);
    }
    break;
  }
}

// Background color presets — static gradients for server-side render
const BG_PRESETS = {
  aurora:   { top: '#16121e', mid: '#0d0b12', bot: '#120d1a', glow: 'rgba(232,194,122,0.28)' },
  midnight: { top: '#0a0a1a', mid: '#0d0520', bot: '#050010', glow: null },
  ember:    { top: '#1a0500', mid: '#2a0a00', bot: '#5a1500', glow: 'rgba(180,60,10,0.3)' },
  ocean:    { top: '#003a5a', mid: '#001a30', bot: '#000810', glow: 'rgba(0,100,180,0.2)' },
  forest:   { top: '#051808', mid: '#0d3010', bot: '#020a02', glow: 'rgba(20,100,20,0.2)' },
  void:     { top: '#0a050f', mid: '#22103a', bot: '#020105', glow: 'rgba(100,50,180,0.2)' },
  gold:     { top: '#080600', mid: '#3a2800', bot: '#1a1200', glow: 'rgba(180,130,0,0.3)' },
  rose:     { top: '#0a0208', mid: '#420d22', bot: '#1e0510', glow: 'rgba(180,30,80,0.25)' },
  coins:    { top: '#0d0800', mid: '#141000', bot: '#1a1000', glow: 'rgba(200,140,10,0.35)' },
  vault:    { top: '#020106', mid: '#07040f', bot: '#12082a', glow: 'rgba(120,80,200,0.15)' },
  pedestal: { top: '#05030a', mid: '#1a1428', bot: '#0a0816', glow: 'rgba(220,200,140,0.15)' },
  stars:    { top: '#020108', mid: '#060312', bot: '#0a0620', glow: 'rgba(100,60,200,0.12)' },
  velvet:   { top: '#060806', mid: '#0c1209', bot: '#141a10', glow: 'rgba(30,120,15,0.2)' },
  trophy:   { top: '#060810', mid: '#0e1318', bot: '#0a0d12', glow: 'rgba(100,130,160,0.1)' },
};

function drawBackground(ctx, W, H, bgKey) {
  const preset = BG_PRESETS[bgKey] || BG_PRESETS.aurora;

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, preset.top);
  grad.addColorStop(0.5, preset.mid);
  grad.addColorStop(1, preset.bot);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  if (preset.glow) {
    const glow = ctx.createRadialGradient(W/2, H*0.85, 0, W/2, H*0.85, W*0.75);
    glow.addColorStop(0, preset.glow);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  }

  const holoGrad = ctx.createLinearGradient(0, 0, W, H);
  holoGrad.addColorStop(0,    'rgba(124,232,214,0.04)');
  holoGrad.addColorStop(0.33, 'rgba(167,139,250,0.03)');
  holoGrad.addColorStop(0.66, 'rgba(240,166,200,0.03)');
  holoGrad.addColorStop(1,    'rgba(255,217,138,0.04)');
  ctx.fillStyle = holoGrad;
  ctx.fillRect(0, 0, W, H);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

router.post('/render', requireAuth, async (req, res) => {
  const {
    card_name,
    card_set,
    card_number,
    card_rarity,
    card_image_url,
    price,
    trend,
    trend_up,
    caption_eyebrow,
    caption_big,
    username,
    background,
  } = req.body;

  if (!card_name) {
    return res.status(400).json({ error: 'card_name is required.' });
  }

  const W = 540;
  const H = 960;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ---- BACKGROUND ----
  const bgKey = background || 'aurora';
  drawBackground(ctx, W, H, bgKey);

  // ---- GRAIN TEXTURE OVERLAY ----
  ctx.save();
  ctx.globalAlpha = 0.03;
  for (let y = 0; y < H; y += 3) {
    for (let x = 0; x < W; x += 3) {
      if (Math.random() > 0.5) {
        ctx.fillStyle = 'white';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  ctx.restore();

  // ---- BRAND ----
  ctx.fillStyle = '#e8c27a';
  ctx.font = `bold 22px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.fillText('VAULTIAC', 28, 52);

  ctx.fillStyle = 'rgba(154,147,166,0.7)';
  ctx.font = `11px ${FONT_FAMILY}`;
  ctx.textAlign = 'right';
  ctx.fillText('card spotlight', W - 28, 52);

  // ---- CAPTION ----
  const eyebrow = caption_eyebrow || 'Latest Pickup';
  const bigline = caption_big || 'Just Pulled It.';

  ctx.fillStyle = '#e8c27a';
  ctx.font = `700 12px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.fillText(eyebrow.toUpperCase(), W/2, 106);

  ctx.fillStyle = '#f3eee6';
  ctx.font = `bold 40px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.fillText(bigline, W/2, 152);

  // ---- CARD IMAGE ----
  const cardW = 220;
  const cardH = Math.round(cardW * 88/63);
  const cardX = (W - cardW) / 2;
  const cardY = 180;

  // Gold border
  ctx.save();
  roundRect(ctx, cardX - 6, cardY - 6, cardW + 12, cardH + 12, 16);
  const borderGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
  borderGrad.addColorStop(0, '#f6d77a');
  borderGrad.addColorStop(0.4, '#c8902a');
  borderGrad.addColorStop(0.65, '#f3e3a1');
  borderGrad.addColorStop(1, '#b8902f');
  ctx.fillStyle = borderGrad;
  ctx.fill();
  ctx.restore();

  // Card inner background
  ctx.save();
  roundRect(ctx, cardX, cardY, cardW, cardH, 10);
  ctx.fillStyle = '#2b3a57';
  ctx.fill();
  ctx.restore();

  // Card image
  if (card_image_url) {
    try {
      const img = await loadImage(card_image_url);
      ctx.save();
      roundRect(ctx, cardX, cardY, cardW, cardH, 10);
      ctx.clip();
      ctx.drawImage(img, cardX, cardY, cardW, cardH);
      ctx.restore();
    } catch(e) {
      console.error('[spotlight] card image load error:', e.message);
      ctx.save();
      roundRect(ctx, cardX, cardY, cardW, cardH, 10);
      const ph = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
      ph.addColorStop(0, '#2b3a57');
      ph.addColorStop(1, '#3a2a52');
      ctx.fillStyle = ph;
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = `bold 36px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.fillText('✦', W/2, cardY + cardH/2 + 12);
      ctx.restore();
    }
  } else {
    ctx.save();
    roundRect(ctx, cardX, cardY, cardW, cardH, 10);
    const ph = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
    ph.addColorStop(0, '#2b3a57');
    ph.addColorStop(1, '#3a2a52');
    ctx.fillStyle = ph;
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = `bold 36px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.fillText('✦', W/2, cardY + cardH/2 + 12);
    ctx.restore();
  }

  // ---- CARD METADATA ----
  const metaY = cardY + cardH + 28;

  ctx.fillStyle = '#f3eee6';
  ctx.font = `bold 26px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  let displayName = card_name;
  if (displayName.length > 24) displayName = displayName.slice(0, 22) + '…';
  ctx.fillText(displayName, W/2, metaY);

  const subParts = [card_set, card_number, card_rarity].filter(Boolean);
  if (subParts.length > 0) {
    ctx.fillStyle = 'rgba(154,147,166,0.8)';
    ctx.font = `13px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    let subText = subParts.join(' · ');
    if (subText.length > 40) subText = subText.slice(0, 38) + '…';
    ctx.fillText(subText, W/2, metaY + 26);
  }

  // ---- PRICE ----
  if (price) {
    const priceY = metaY + 72;

    ctx.fillStyle = 'rgba(154,147,166,0.7)';
    ctx.font = `700 10px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.fillText('MARKET VALUE', W/2, priceY - 16);

    const priceGrad = ctx.createLinearGradient(W/2 - 80, 0, W/2 + 80, 0);
    priceGrad.addColorStop(0, '#ffffff');
    priceGrad.addColorStop(1, '#e8c27a');
    ctx.fillStyle = priceGrad;
    ctx.font = `bold 52px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.fillText(price, W/2, priceY + 36);

    if (trend) {
      const trendText = (trend_up ? '▲ ' : '▼ ') + trend + ' this week';
      const trendColor  = trend_up ? '#7ce8d6' : '#f0a6c8';
      const trendBg     = trend_up ? 'rgba(124,232,214,0.1)' : 'rgba(240,100,100,0.1)';
      const trendBorder = trend_up ? 'rgba(124,232,214,0.28)' : 'rgba(240,100,100,0.28)';

      ctx.font = `700 13px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      const trendW = ctx.measureText(trendText).width + 28;
      const trendX = W/2 - trendW/2;
      const trendY2 = priceY + 56;

      roundRect(ctx, trendX, trendY2, trendW, 30, 15);
      ctx.fillStyle = trendBg;
      ctx.fill();
      roundRect(ctx, trendX, trendY2, trendW, 30, 15);
      ctx.strokeStyle = trendBorder;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = trendColor;
      ctx.fillText(trendText, W/2, trendY2 + 20);
    }
  }

  // ---- FOOTER ----
  const footY = H - 32;

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(28, footY - 18);
  ctx.lineTo(W - 28, footY - 18);
  ctx.stroke();

  const displayUser = username ? '@' + username : '@vaultiac';
  ctx.fillStyle = '#f3eee6';
  ctx.font = `700 13px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.fillText(displayUser + ' · pulled this', 28, footY);

  const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase();
  ctx.fillStyle = 'rgba(154,147,166,0.7)';
  ctx.font = `12px ${FONT_FAMILY}`;
  ctx.textAlign = 'right';
  ctx.fillText(dateStr, W - 28, footY);

  // ---- OUTPUT ----
  const buffer = canvas.toBuffer('image/png');
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', 'attachment; filename="vaultiac-spotlight.png"');
  res.send(buffer);
});

module.exports = router;

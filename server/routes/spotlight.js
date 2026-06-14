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

const BG_PRESETS = {
  aurora:   { type: 'color', top: '#16121e', mid: '#0d0b12', bot: '#120d1a', glow: { cx: 0.5, cy: 0.88, r: 0.75, color: 'rgba(232,194,122,0.28)' } },
  midnight: { type: 'color', top: '#0a0a1a', mid: '#0d0520', bot: '#050010', glow: null },
  ember:    { type: 'color', top: '#0a0200', mid: '#1a0500', bot: '#5a1500', glow: { cx: 0.5, cy: 0.95, r: 0.6, color: 'rgba(180,60,10,0.35)' } },
  ocean:    { type: 'color', top: '#003a5a', mid: '#001a30', bot: '#000810', glow: { cx: 0.5, cy: 0.05, r: 0.6, color: 'rgba(0,120,200,0.25)' } },
  forest:   { type: 'color', top: '#020a02', mid: '#051808', bot: '#0d3010', glow: { cx: 0.15, cy: 0.72, r: 0.45, color: 'rgba(30,130,15,0.22)' } },
  void:     { type: 'color', top: '#020105', mid: '#0a050f', bot: '#22103a', glow: { cx: 0.5, cy: 0.5, r: 0.55, color: 'rgba(120,60,220,0.22)' } },
  gold:     { type: 'color', top: '#080600', mid: '#1a1200', bot: '#3a2800', glow: { cx: 0.5, cy: 0.2, r: 0.55, color: 'rgba(200,150,0,0.28)' } },
  rose:     { type: 'color', top: '#0a0208', mid: '#1e0510', bot: '#420d22', glow: { cx: 0.5, cy: 0.9, r: 0.55, color: 'rgba(200,40,90,0.28)' } },
  coins:    { type: 'scene_coins' },
  vault:    { type: 'scene_vault' },
  pedestal: { type: 'scene_pedestal' },
  stars:    { type: 'scene_stars' },
  velvet:   { type: 'scene_velvet' },
  trophy:   { type: 'scene_trophy' },
};

function drawBackground(ctx, W, H, bgKey) {
  const preset = BG_PRESETS[bgKey] || BG_PRESETS.aurora;

  if (preset.type === 'color') {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, preset.top);
    grad.addColorStop(0.5, preset.mid);
    grad.addColorStop(1, preset.bot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    if (preset.glow) {
      const { cx, cy, r, color } = preset.glow;
      const glow = ctx.createRadialGradient(cx*W, cy*H, 0, cx*W, cy*H, r*W);
      glow.addColorStop(0, color);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
    }
  } else if (preset.type === 'scene_coins') {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d0800'); bg.addColorStop(1, '#1a1000');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const pile = ctx.createRadialGradient(W/2, H*0.88, 0, W/2, H*0.88, W*0.75);
    pile.addColorStop(0, 'rgba(200,140,10,0.5)');
    pile.addColorStop(0.4, 'rgba(160,100,5,0.25)');
    pile.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pile; ctx.fillRect(0, 0, W, H);
    const coins = [{x:0.3,y:0.75,r:18,ry:7},{x:0.55,y:0.80,r:22,ry:9},{x:0.7,y:0.72,r:16,ry:6},
      {x:0.42,y:0.85,r:20,ry:8},{x:0.62,y:0.88,r:14,ry:5},{x:0.25,y:0.82,r:12,ry:5},
      {x:0.78,y:0.84,r:18,ry:7},{x:0.5,y:0.78,r:24,ry:10}];
    coins.forEach(c => {
      const cx2 = c.x * W, cy2 = c.y * H;
      const g = ctx.createRadialGradient(cx2-c.r*0.3, cy2-c.ry*0.4, c.r*0.05, cx2, cy2, c.r);
      g.addColorStop(0, 'rgba(255,245,160,0.95)'); g.addColorStop(0.4, 'rgba(230,180,60,0.9)');
      g.addColorStop(0.75, 'rgba(180,120,20,0.88)'); g.addColorStop(1, 'rgba(90,55,5,0.8)');
      ctx.beginPath(); ctx.ellipse(cx2, cy2, c.r, c.ry, 0, 0, Math.PI*2);
      ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx2, cy2, c.r, c.ry, 0, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(255,240,130,0.5)'; ctx.lineWidth = c.r * 0.1; ctx.stroke();
    });

  } else if (preset.type === 'scene_vault') {
    const bg = ctx.createRadialGradient(W/2, H*0.5, 0, W/2, H*0.5, H*0.9);
    bg.addColorStop(0, 'rgba(18,10,32,1)'); bg.addColorStop(0.5, 'rgba(7,4,16,1)'); bg.addColorStop(1, 'rgba(2,1,6,1)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const motes = [{x:0.3,y:0.2,r:3},{x:0.65,y:0.15,r:2},{x:0.8,y:0.4,r:2.5},
      {x:0.2,y:0.55,r:2},{x:0.5,y:0.35,r:3.5},{x:0.72,y:0.62,r:2},{x:0.35,y:0.72,r:2.5},
      {x:0.58,y:0.78,r:2},{x:0.15,y:0.3,r:1.5},{x:0.88,y:0.25,r:2}];
    motes.forEach(m => {
      const mx = m.x * W, my = m.y * H;
      const halo = ctx.createRadialGradient(mx, my, 0, mx, my, m.r * 8);
      halo.addColorStop(0, 'rgba(255,248,180,0.5)');
      halo.addColorStop(0.4, 'rgba(255,220,110,0.15)');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo; ctx.fillRect(mx-m.r*9, my-m.r*9, m.r*18, m.r*18);
      ctx.beginPath(); ctx.arc(mx, my, m.r, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,252,210,0.9)'; ctx.fill();
      const arm = m.r * 5;
      ctx.strokeStyle = 'rgba(255,248,190,0.5)'; ctx.lineWidth = m.r * 0.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(mx-arm,my); ctx.lineTo(mx+arm,my); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx,my-arm); ctx.lineTo(mx,my+arm); ctx.stroke();
    });

  } else if (preset.type === 'scene_pedestal') {
    const bg = ctx.createRadialGradient(W/2, H*0.3, 0, W/2, H*0.5, H*0.85);
    bg.addColorStop(0, '#1a1428'); bg.addColorStop(1, '#05030a');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.save();
    const beam = ctx.createRadialGradient(W/2, -H*0.05, 0, W/2, -H*0.05, H*0.9);
    beam.addColorStop(0, 'rgba(255,240,200,0.18)');
    beam.addColorStop(0.2, 'rgba(255,220,150,0.10)');
    beam.addColorStop(0.6, 'rgba(200,170,80,0.03)');
    beam.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.moveTo(W/2, 0); ctx.lineTo(W*0.15, H); ctx.lineTo(W*0.85, H); ctx.closePath();
    ctx.clip(); ctx.fillStyle = beam; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    const pw = W*0.44, ph = H*0.12, px = (W-pw)/2, py = H*0.80;
    const top = ctx.createLinearGradient(px, py, px+pw, py+ph*0.12);
    top.addColorStop(0, '#c8bea8'); top.addColorStop(0.5, '#e8e0d0'); top.addColorStop(1, '#a89880');
    ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(px+pw,py); ctx.lineTo(px+pw-pw*0.08,py+ph*0.12); ctx.lineTo(px+pw*0.08,py+ph*0.12); ctx.closePath();
    ctx.fillStyle = top; ctx.fill();
    const front = ctx.createLinearGradient(px, py, px, py+ph);
    front.addColorStop(0, '#968878'); front.addColorStop(0.5, '#7a6c5e'); front.addColorStop(1, '#504438');
    ctx.beginPath(); ctx.moveTo(px+pw*0.08,py+ph*0.12); ctx.lineTo(px+pw-pw*0.08,py+ph*0.12); ctx.lineTo(px+pw-pw*0.04,py+ph); ctx.lineTo(px+pw*0.04,py+ph); ctx.closePath();
    ctx.fillStyle = front; ctx.fill();

  } else if (preset.type === 'scene_stars') {
    const bg = ctx.createRadialGradient(W*0.4, H*0.3, 0, W*0.5, H*0.5, H*0.9);
    bg.addColorStop(0, '#0a0620'); bg.addColorStop(0.4, '#060312'); bg.addColorStop(1, '#020108');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    [[W*0.3,H*0.25,'rgba(80,20,140,0.18)'],[W*0.7,H*0.6,'rgba(20,60,120,0.14)'],[W*0.5,H*0.45,'rgba(140,30,80,0.10)']].forEach(([nx,ny,nc])=>{
      const ng = ctx.createRadialGradient(nx,ny,0,nx,ny,W*0.55);
      ng.addColorStop(0,nc); ng.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=ng; ctx.fillRect(0,0,W,H);
    });
    for (let i = 0; i < 140; i++) {
      const sx = Math.random()*W, sy = Math.random()*H;
      const sr = Math.random()*1.8 + 0.3;
      const sa = Math.random()*0.6 + 0.3;
      ctx.beginPath(); ctx.arc(sx,sy,sr,0,Math.PI*2);
      ctx.fillStyle = `rgba(255,255,255,${sa})`; ctx.fill();
    }

  } else if (preset.type === 'scene_velvet') {
    const bg = ctx.createRadialGradient(W/2,H*0.3,0,W/2,H*0.5,H*0.9);
    bg.addColorStop(0,'#141a10'); bg.addColorStop(0.4,'#0c1209'); bg.addColorStop(1,'#060806');
    ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#1a1f15';
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(W*0.22,H*0.18); ctx.lineTo(W*0.22,H); ctx.lineTo(0,H); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(W,0); ctx.lineTo(W*0.78,H*0.18); ctx.lineTo(W*0.78,H); ctx.lineTo(W,H); ctx.closePath(); ctx.fill();
    [[W*0.06,H*0.1,H*0.5,0.8],[W*0.92,H*0.08,H*0.45,0.7]].forEach(([sx,sy,sh,alpha])=>{
      const slg=ctx.createLinearGradient(sx,sy,sx,sy+sh);
      slg.addColorStop(0,'rgba(20,90,10,0)'); slg.addColorStop(0.3,`rgba(30,130,15,${alpha})`); slg.addColorStop(1,'rgba(15,70,8,0)');
      ctx.strokeStyle=slg; ctx.lineWidth=W*0.008; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(sx,sy+sh); ctx.stroke();
    });
    const waterY = H*0.75;
    const wg=ctx.createLinearGradient(0,waterY,0,H);
    wg.addColorStop(0,'rgba(10,35,8,0.92)'); wg.addColorStop(1,'rgba(4,16,3,1)');
    ctx.fillStyle=wg; ctx.fillRect(0,waterY,W,H-waterY);
    const ag=ctx.createRadialGradient(W*0.15,waterY,0,W*0.15,waterY,W*0.4);
    ag.addColorStop(0,'rgba(30,120,15,0.25)'); ag.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=ag; ctx.fillRect(0,waterY-W*0.2,W*0.5,W*0.5);

  } else if (preset.type === 'scene_trophy') {
    const sky=ctx.createLinearGradient(0,0,0,H);
    sky.addColorStop(0,'#0a0d12'); sky.addColorStop(0.4,'#0e1318'); sky.addColorStop(1,'#060810');
    ctx.fillStyle=sky; ctx.fillRect(0,0,W,H);
    for (let i = 0; i < 80; i++) {
      const rx = Math.random()*W, ry = Math.random()*H;
      const rlen = (Math.random()*0.06+0.03)*H;
      const ra = Math.random()*0.25+0.08;
      const rg=ctx.createLinearGradient(rx,ry,rx-rlen*0.12,ry+rlen);
      rg.addColorStop(0,'rgba(140,170,200,0)');
      rg.addColorStop(0.3,`rgba(160,190,220,${ra})`);
      rg.addColorStop(1,'rgba(180,210,240,0)');
      ctx.beginPath(); ctx.moveTo(rx,ry); ctx.lineTo(rx-rlen*0.12,ry+rlen);
      ctx.strokeStyle=rg; ctx.lineWidth=Math.random()*0.5+0.3; ctx.stroke();
    }
    const puddleY=H*0.85;
    const pg=ctx.createLinearGradient(0,puddleY,0,H);
    pg.addColorStop(0,'rgba(20,30,45,0.65)'); pg.addColorStop(1,'rgba(10,15,22,0.9)');
    ctx.fillStyle=pg; ctx.fillRect(0,puddleY,W,H-puddleY);
  }

  // Holo sheen overlay
  const holoGrad = ctx.createLinearGradient(0, 0, W, H);
  holoGrad.addColorStop(0,    'rgba(124,232,214,0.03)');
  holoGrad.addColorStop(0.33, 'rgba(167,139,250,0.025)');
  holoGrad.addColorStop(0.66, 'rgba(240,166,200,0.025)');
  holoGrad.addColorStop(1,    'rgba(255,217,138,0.03)');
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

  // ---- GRAIN TEXTURE ----
  ctx.save();
  ctx.globalAlpha = 0.025;
  for (let y = 0; y < H; y += 4) {
    for (let x = 0; x < W; x += 4) {
      if (Math.random() > 0.5) { ctx.fillStyle = 'white'; ctx.fillRect(x, y, 1, 1); }
    }
  }
  ctx.restore();

  // ---- LAYOUT CONSTANTS ----
  const PAD = 28;
  const BRAND_Y = 52;
  const EYEBROW_Y = 108;
  const BIGLINE_Y = 158;

  const cardW = 210;
  const cardH = Math.round(cardW * 88 / 63);

  const FOOTER_H = 80;
  const contentTop = BIGLINE_Y + 20;
  const contentBottom = H - FOOTER_H;
  const contentH = contentBottom - contentTop;

  const metaH = 60;
  const priceH = price ? 110 : 0;
  const totalContentH = cardH + 24 + metaH + (price ? 16 + priceH : 0);
  const contentStartY = contentTop + Math.max(0, (contentH - totalContentH) / 2);

  const cardX = (W - cardW) / 2;
  const cardY = contentStartY;
  const metaY = cardY + cardH + 24;
  const priceStartY = metaY + metaH + 8;

  // ---- BRAND ----
  ctx.fillStyle = '#e8c27a';
  ctx.font = `bold 20px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.fillText('VAULTIAC', PAD, BRAND_Y);

  ctx.fillStyle = 'rgba(154,147,166,0.7)';
  ctx.font = `11px ${FONT_FAMILY}`;
  ctx.textAlign = 'right';
  ctx.fillText('card spotlight', W - PAD, BRAND_Y);

  // ---- CAPTION ----
  const eyebrow = (caption_eyebrow || 'Latest Pickup').toUpperCase();
  const bigline = caption_big || 'Just Pulled It.';

  ctx.fillStyle = '#e8c27a';
  ctx.font = `700 11px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.fillText(eyebrow, W / 2, EYEBROW_Y);

  ctx.fillStyle = '#f3eee6';
  ctx.font = `bold 44px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.fillText(bigline, W / 2, BIGLINE_Y);

  // ---- CARD BORDER ----
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

  // ---- CARD INNER ----
  ctx.save();
  roundRect(ctx, cardX, cardY, cardW, cardH, 10);
  ctx.fillStyle = '#2b3a57';
  ctx.fill();
  ctx.restore();

  // ---- CARD IMAGE ----
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
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = `bold 40px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.fillText('✦', W / 2, cardY + cardH / 2 + 14);
      ctx.restore();
    }
  }

  // ---- CARD SHADOW ----
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 14;
  roundRect(ctx, cardX - 6, cardY - 6, cardW + 12, cardH + 12, 16);
  ctx.strokeStyle = 'rgba(0,0,0,0)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // ---- CARD NAME ----
  ctx.fillStyle = '#f3eee6';
  ctx.font = `bold 28px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  let displayName = card_name || 'My Card';
  if (displayName.length > 22) displayName = displayName.slice(0, 20) + '…';
  ctx.fillText(displayName, W / 2, metaY + 28);

  // ---- CARD SUB ----
  const subParts = [card_set, card_number, card_rarity].filter(Boolean);
  if (subParts.length > 0) {
    ctx.fillStyle = 'rgba(154,147,166,0.8)';
    ctx.font = `13px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    let subText = subParts.join(' · ');
    if (subText.length > 38) subText = subText.slice(0, 36) + '…';
    ctx.fillText(subText, W / 2, metaY + 52);
  }

  // ---- PRICE ----
  if (price) {
    ctx.fillStyle = 'rgba(154,147,166,0.65)';
    ctx.font = `700 10px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.fillText('MARKET VALUE', W / 2, priceStartY + 14);

    const priceGrad = ctx.createLinearGradient(W / 2 - 90, 0, W / 2 + 90, 0);
    priceGrad.addColorStop(0, '#ffffff');
    priceGrad.addColorStop(1, '#e8c27a');
    ctx.fillStyle = priceGrad;
    ctx.font = `bold 56px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.fillText(price, W / 2, priceStartY + 72);

    if (trend) {
      const trendText = (trend_up ? '▲ ' : '▼ ') + trend + ' this week';
      const trendColor  = trend_up ? '#7ce8d6' : '#f0a6c8';
      const trendBg     = trend_up ? 'rgba(124,232,214,0.1)'  : 'rgba(240,100,100,0.1)';
      const trendBorder = trend_up ? 'rgba(124,232,214,0.28)' : 'rgba(240,100,100,0.28)';
      ctx.font = `700 13px ${FONT_FAMILY}`;
      const trendW = ctx.measureText(trendText).width + 28;
      const trendX2 = W / 2 - trendW / 2;
      const trendY3 = priceStartY + 90;
      roundRect(ctx, trendX2, trendY3, trendW, 30, 15);
      ctx.fillStyle = trendBg; ctx.fill();
      roundRect(ctx, trendX2, trendY3, trendW, 30, 15);
      ctx.strokeStyle = trendBorder; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = trendColor;
      ctx.textAlign = 'center';
      ctx.fillText(trendText, W / 2, trendY3 + 20);
    }
  }

  // ---- FOOTER ----
  const footY = H - 28;
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, footY - 22);
  ctx.lineTo(W - PAD, footY - 22);
  ctx.stroke();

  const displayUser = username ? '@' + username : '@vaultiac';
  ctx.fillStyle = '#f3eee6';
  ctx.font = `700 13px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.fillText(displayUser + ' · pulled this', PAD, footY);

  const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase();
  ctx.fillStyle = 'rgba(154,147,166,0.7)';
  ctx.font = `12px ${FONT_FAMILY}`;
  ctx.textAlign = 'right';
  ctx.fillText(dateStr, W - PAD, footY);

  // ---- OUTPUT ----
  const buffer = canvas.toBuffer('image/png');
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', 'attachment; filename="vaultiac-spotlight.png"');
  res.send(buffer);
});

module.exports = router;

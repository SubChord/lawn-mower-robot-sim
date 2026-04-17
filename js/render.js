/* ============================================================
   Rendering + tile sprites
   ============================================================ */

// Pre-render grass tile gradients via offscreen caches keyed by
// (bucket, species, tileSize, themeId). Theme swaps invalidate this cache.
const tileCache = {};
function clearTileCache() { for (const k in tileCache) delete tileCache[k]; }
function getTileImage(heightBucket, speciesIdx = 0) {
  const theme = (typeof activeTheme === 'function') ? activeTheme() : null;
  const themeId = theme ? theme.id : 'classic';
  const key = heightBucket + '_' + speciesIdx + '_' + tileSize + '_' + themeId;
  if (tileCache[key]) return tileCache[key];
  const off = document.createElement('canvas');
  off.width = tileSize; off.height = tileSize;
  const c = off.getContext('2d');
  const h = heightBucket / 10;
  const spec = (typeof GRASS_TYPES !== 'undefined' && GRASS_TYPES[speciesIdx]) || null;
  const palette = (theme && theme.grass) || { base: [30,70,28], delta: [24,110,44], bladeTop: [170,220,120], bladeRoot: [20,60,25] };
  let baseR, baseG, baseB;
  if (spec && spec.color) {
    // Species tiles ignore the theme base entirely — full species colour
    // with a brightness ramp from the growth bucket so they stay distinct.
    const dim = 0.55 + h * 0.45; // 0.55..1.0
    baseR = spec.color[0] * dim;
    baseG = spec.color[1] * dim;
    baseB = spec.color[2] * dim;
  } else {
    baseR = palette.base[0] + h * palette.delta[0];
    baseG = palette.base[1] + h * palette.delta[1];
    baseB = palette.base[2] + h * palette.delta[2];
  }
  c.fillStyle = `rgb(${baseR|0},${baseG|0},${baseB|0})`;
  c.fillRect(0, 0, tileSize, tileSize);
  if (h > 0.2) {
    const blades = Math.floor(2 + h * 5);
    for (let i = 0; i < blades; i++) {
      const bx = Math.random() * tileSize;
      const bh = (0.2 + Math.random() * 0.8) * h * tileSize * 0.7;
      const bw = 1;
      const gr = c.createLinearGradient(bx, tileSize, bx, tileSize - bh);
      let botR, botG, botB, topR, topG, topB;
      if (spec && spec.color) {
        botR = spec.color[0] * 0.45; botG = spec.color[1] * 0.45; botB = spec.color[2] * 0.45;
        const acc = spec.accent || spec.color;
        topR = acc[0]; topG = acc[1]; topB = acc[2];
      } else {
        botR = palette.bladeRoot[0]; botG = palette.bladeRoot[1]; botB = palette.bladeRoot[2];
        topR = palette.bladeTop[0] + h * 50 - 30;
        topG = palette.bladeTop[1];
        topB = palette.bladeTop[2];
      }
      gr.addColorStop(0, `rgba(${botR|0},${botG|0},${botB|0},0.9)`);
      gr.addColorStop(1, `rgba(${topR|0},${topG|0},${topB|0},0.95)`);
      c.fillStyle = gr;
      c.fillRect(bx, tileSize - bh, bw, bh);
    }
  }
  c.fillStyle = 'rgba(255,255,255,0.02)';
  c.fillRect(0, 0, tileSize, tileSize / 2);
  // Species-specific accent marks so each is instantly recognisable.
  if (spec && spec.accent) {
    const [ar, ag, ab] = spec.accent;
    c.fillStyle = `rgba(${ar},${ag},${ab},0.9)`;
    if (speciesIdx === 1) {
      // Clover: tiny 3-dot shamrock.
      const cx = tileSize * 0.5, cy = tileSize * 0.55;
      c.fillRect((cx - 1.5) | 0, cy | 0, 1, 1);
      c.fillRect((cx + 0.5) | 0, cy | 0, 1, 1);
      c.fillRect(cx | 0, (cy - 1.5) | 0, 1, 1);
    } else if (speciesIdx === 2) {
      // Thick turf: a small amber "X" to break up the field.
      c.fillRect((tileSize * 0.35) | 0, (tileSize * 0.45) | 0, 2, 1);
      c.fillRect((tileSize * 0.45) | 0, (tileSize * 0.6) | 0, 1, 2);
    } else if (speciesIdx === 3) {
      // Crystal: two bright sparkles.
      c.fillRect((tileSize * 0.6) | 0, (tileSize * 0.25) | 0, 1, 1);
      c.fillRect((tileSize * 0.3) | 0, (tileSize * 0.65) | 0, 1, 1);
    } else if (speciesIdx === 4) {
      // Golden: sparkle cluster.
      c.fillRect((tileSize * 0.5) | 0, (tileSize * 0.3) | 0, 1, 1);
      c.fillRect((tileSize * 0.7) | 0, (tileSize * 0.55) | 0, 1, 1);
      c.fillRect((tileSize * 0.3) | 0, (tileSize * 0.7) | 0, 1, 1);
    } else if (speciesIdx === 5) {
      // Obsidian: silver vein across the tile.
      c.fillRect((tileSize * 0.25) | 0, (tileSize * 0.5) | 0, Math.max(2, (tileSize * 0.5) | 0), 1);
      c.fillRect((tileSize * 0.45) | 0, (tileSize * 0.3) | 0, 1, Math.max(2, (tileSize * 0.4) | 0));
    } else if (speciesIdx === 6) {
      // Frost: four-point snowflake-ish speckle.
      const cx = (tileSize * 0.5) | 0, cy = (tileSize * 0.5) | 0;
      c.fillRect(cx, cy - 2, 1, 5);
      c.fillRect(cx - 2, cy, 5, 1);
      c.fillRect(cx - 1, cy - 1, 1, 1);
      c.fillRect(cx + 1, cy + 1, 1, 1);
    } else if (speciesIdx === 7) {
      // Void: neon scatter with a bigger violet pulse dot.
      c.fillRect((tileSize * 0.35) | 0, (tileSize * 0.35) | 0, 2, 2);
      c.fillRect((tileSize * 0.65) | 0, (tileSize * 0.6) | 0, 1, 1);
      c.fillRect((tileSize * 0.2) | 0, (tileSize * 0.75) | 0, 1, 1);
    }
  }
  tileCache[key] = off;
  return off;
}

// Which "side" of the active mow pattern a tile belongs to. Pure function of
// tile coords and current pattern key; reused by the AI to bias robot paths
// so the bots actually trace the pattern you equipped.
function mowPatternIsDark(x, y, key) {
  const k = key || state.activeMowPattern;
  if (!k || k === 'plain') return false;
  switch (k) {
    case 'stripes':  return (y & 1) === 0;
    case 'diagonal': return (((x + y) >> 1) & 1) === 0;
    case 'checker':  return (((x >> 1) + (y >> 1)) & 1) === 0;
    case 'diamonds': {
      const a = (((x + y) >> 1) & 1) === 0;
      const b = (((x - y + 1024) >> 1) & 1) === 0;
      return a !== b;
    }
    case 'zigzag':   return (((x + ((y >> 1) & 1) * 2) & 3) < 2);
    default:         return false;
  }
}

// Visual tint strength per tile, strongest on freshly cut (short) grass.
function mowPatternTint(x, y, h) {
  const key = state.activeMowPattern;
  if (!key || key === 'plain') return null;
  const alpha = Math.max(0, 0.28 - h * 0.24);
  if (alpha < 0.015) return null;
  return { dark: mowPatternIsDark(x, y, key), alpha };
}

function drawGrass() {
  const ts = tileSize;
  for (let y = 0; y < CFG.gridH; y++) {
    for (let x = 0; x < CFG.gridW; x++) {
      const k = idx(x, y);
      if (tiles[k] === T.GRASS) {
        const h = grass[k];
        const bucket = Math.min(10, Math.max(0, Math.round(h * 10)));
        const spec = grassSpecies ? grassSpecies[k] : 0;
        ctx.drawImage(getTileImage(bucket, spec), x * ts, y * ts);
        const tint = mowPatternTint(x, y, h);
        if (tint) {
          ctx.fillStyle = tint.dark
            ? `rgba(0,0,0,${tint.alpha.toFixed(3)})`
            : `rgba(255,255,255,${(tint.alpha * 0.65).toFixed(3)})`;
          ctx.fillRect(x * ts, y * ts, ts, ts);
        }
      } else {
        ctx.drawImage(getTileImage(2), x * ts, y * ts);
      }
    }
  }
}

// ---------- Sprites for tile types ----------
function drawTree(x, y) {
  const ts = tileSize;
  const cx = (x + 0.5) * ts, cy = (y + 0.5) * ts;
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath(); ctx.ellipse(cx + 1, cy + ts * 0.38, ts * 0.46, ts * 0.18, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5a3a1e';
  roundRect(ctx, cx - ts * 0.09, cy - ts * 0.05, ts * 0.18, ts * 0.46, 2); ctx.fill();
  ctx.fillStyle = '#3e2612';
  ctx.fillRect(cx - ts * 0.03, cy - ts * 0.02, 1.5, ts * 0.44);
  const canopy = ctx.createRadialGradient(cx - ts * 0.15, cy - ts * 0.4, 2, cx, cy - ts * 0.2, ts * 0.75);
  canopy.addColorStop(0, '#6cc255');
  canopy.addColorStop(0.5, '#3a8f33');
  canopy.addColorStop(1, '#1f5a23');
  ctx.fillStyle = canopy;
  ctx.beginPath(); ctx.arc(cx - ts * 0.18, cy - ts * 0.18, ts * 0.42, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + ts * 0.22, cy - ts * 0.12, ts * 0.36, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + ts * 0.02, cy - ts * 0.42, ts * 0.38, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(180,255,180,0.35)';
  ctx.beginPath(); ctx.arc(cx - ts * 0.25, cy - ts * 0.32, ts * 0.09, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + ts * 0.12, cy - ts * 0.4,  ts * 0.07, 0, Math.PI * 2); ctx.fill();
}

function drawRock(x, y) {
  const ts = tileSize;
  const cx = (x + 0.5) * ts, cy = (y + 0.5) * ts;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(cx, cy + ts * 0.32, ts * 0.38, ts * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  const grad = ctx.createLinearGradient(cx, cy - ts * 0.35, cx, cy + ts * 0.3);
  grad.addColorStop(0, '#b9c0c7');
  grad.addColorStop(0.6, '#7f868c');
  grad.addColorStop(1, '#4a5157');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(cx - ts * 0.38, cy + ts * 0.2);
  ctx.lineTo(cx - ts * 0.28, cy - ts * 0.22);
  ctx.lineTo(cx - ts * 0.08, cy - ts * 0.35);
  ctx.lineTo(cx + ts * 0.18, cy - ts * 0.28);
  ctx.lineTo(cx + ts * 0.36, cy - ts * 0.05);
  ctx.lineTo(cx + ts * 0.32, cy + ts * 0.22);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - ts * 0.22, cy - ts * 0.15);
  ctx.lineTo(cx + ts * 0.06, cy - ts * 0.28);
  ctx.stroke();
}

function drawPond(x, y) {
  const ts = tileSize;
  const cx = (x + 0.5) * ts, cy = (y + 0.5) * ts;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(cx, cy + 2, ts * 0.48, ts * 0.32, 0, 0, Math.PI * 2); ctx.fill();
  const grad = ctx.createRadialGradient(cx - ts * 0.1, cy - ts * 0.1, 2, cx, cy, ts * 0.5);
  grad.addColorStop(0, '#7ed8ff');
  grad.addColorStop(0.6, '#2aa2dd');
  grad.addColorStop(1, '#155b85');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.ellipse(cx, cy, ts * 0.46, ts * 0.30, 0, 0, Math.PI * 2); ctx.fill();
  const t = performance.now() / 1000;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 2; i++) {
    const r = (t * 0.6 + i * 0.5) % 1;
    ctx.globalAlpha = (1 - r) * 0.7;
    ctx.beginPath(); ctx.ellipse(cx, cy, ts * 0.3 * r, ts * 0.2 * r, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawFlower(x, y) {
  const ts = tileSize;
  const cx = (x + 0.5) * ts, cy = (y + 0.5) * ts;
  const palette = FLOWER_PALETTE[flowerColors[idx(x, y)] || 0];
  ctx.fillStyle = '#3c9042';
  ctx.fillRect(x * ts, y * ts + ts * 0.7, ts, ts * 0.3);
  const positions = [
    [cx - ts * 0.22, cy - ts * 0.1],
    [cx + ts * 0.2, cy - ts * 0.2],
    [cx - ts * 0.05, cy + ts * 0.1],
    [cx + ts * 0.24, cy + ts * 0.18],
  ];
  for (const [fx, fy] of positions) {
    ctx.strokeStyle = '#2a6a2d'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy + ts * 0.3); ctx.stroke();
    ctx.fillStyle = palette[0];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const px = fx + Math.cos(a) * ts * 0.10;
      const py = fy + Math.sin(a) * ts * 0.10;
      ctx.beginPath(); ctx.arc(px, py, ts * 0.08, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = palette[1];
    ctx.beginPath(); ctx.arc(fx, fy, ts * 0.06, 0, Math.PI * 2); ctx.fill();
  }
}

function drawBeehive(x, y) {
  const ts = tileSize;
  const cx = (x + 0.5) * ts, cy = (y + 0.5) * ts;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(cx, cy + ts * 0.38, ts * 0.38, ts * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  const layers = 4;
  for (let i = 0; i < layers; i++) {
    const yy = cy + ts * 0.32 - (i * ts * 0.16);
    const w = ts * (0.46 - i * 0.06);
    const h = ts * 0.14;
    const grad = ctx.createLinearGradient(0, yy - h, 0, yy + h);
    grad.addColorStop(0, '#ffd26a');
    grad.addColorStop(1, '#c58620');
    ctx.fillStyle = grad;
    roundRect(ctx, cx - w, yy - h, w * 2, h * 2, 4); ctx.fill();
  }
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(cx, cy + ts * 0.22, ts * 0.08, 0, Math.PI * 2); ctx.fill();
}

function drawFountain(x, y) {
  const ts = tileSize;
  const cx = (x + 0.5) * ts, cy = (y + 0.5) * ts;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(cx, cy + ts * 0.35, ts * 0.45, ts * 0.14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#a1a8ad';
  ctx.beginPath(); ctx.ellipse(cx, cy + ts * 0.15, ts * 0.44, ts * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3fb8f0';
  ctx.beginPath(); ctx.ellipse(cx, cy + ts * 0.13, ts * 0.38, ts * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c7ced3';
  ctx.fillRect(cx - ts * 0.08, cy - ts * 0.25, ts * 0.16, ts * 0.4);
  ctx.fillStyle = '#d9e0e5';
  ctx.beginPath(); ctx.ellipse(cx, cy - ts * 0.28, ts * 0.2, ts * 0.06, 0, 0, Math.PI * 2); ctx.fill();
  const t = performance.now() / 300;
  ctx.fillStyle = 'rgba(120, 210, 255, 0.9)';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const r = ts * 0.14 + Math.sin(t + i) * ts * 0.03;
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy - ts * 0.35 + Math.abs(Math.sin(a)) * -ts * 0.08, 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(200, 240, 255, 0.7)';
  ctx.beginPath(); ctx.arc(cx, cy - ts * 0.42, ts * 0.06, 0, Math.PI * 2); ctx.fill();
}

function drawShed(x, y) {
  const ts = tileSize;
  const cx = (x + 0.5) * ts, cy = (y + 0.5) * ts;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(cx, cy + ts * 0.38, ts * 0.4, ts * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#9b6a3a';
  ctx.fillRect(cx - ts * 0.35, cy - ts * 0.08, ts * 0.7, ts * 0.44);
  ctx.strokeStyle = '#5a3d1e'; ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const yy = cy - ts * 0.08 + i * ts * 0.11;
    ctx.beginPath(); ctx.moveTo(cx - ts * 0.35, yy); ctx.lineTo(cx + ts * 0.35, yy); ctx.stroke();
  }
  ctx.fillStyle = '#5a2a2a';
  ctx.beginPath();
  ctx.moveTo(cx - ts * 0.45, cy - ts * 0.08);
  ctx.lineTo(cx, cy - ts * 0.4);
  ctx.lineTo(cx + ts * 0.45, cy - ts * 0.08);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#4a2e14';
  ctx.fillRect(cx - ts * 0.09, cy + ts * 0.06, ts * 0.18, ts * 0.3);
  ctx.fillStyle = '#ffd34e';
  ctx.beginPath(); ctx.arc(cx + ts * 0.06, cy + ts * 0.2, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#aee4ff';
  ctx.fillRect(cx + ts * 0.14, cy + ts * 0.04, ts * 0.14, ts * 0.12);
}

function drawGnome(x, y) {
  const ts = tileSize;
  const cx = (x + 0.5) * ts, cy = (y + 0.5) * ts;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(cx, cy + ts * 0.36, ts * 0.25, ts * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3a82d9';
  ctx.beginPath(); ctx.arc(cx, cy + ts * 0.12, ts * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(cx - ts * 0.18, cy - ts * 0.02);
  ctx.quadraticCurveTo(cx, cy + ts * 0.3, cx + ts * 0.18, cy - ts * 0.02);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f4d5b1';
  ctx.beginPath(); ctx.arc(cx, cy - ts * 0.06, ts * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d93a3a';
  ctx.beginPath();
  ctx.moveTo(cx - ts * 0.18, cy - ts * 0.12);
  ctx.lineTo(cx, cy - ts * 0.42);
  ctx.lineTo(cx + ts * 0.18, cy - ts * 0.12);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.fillRect(cx - ts * 0.04, cy - ts * 0.07, 1.5, 1.5);
  ctx.fillRect(cx + ts * 0.025, cy - ts * 0.07, 1.5, 1.5);
}

function drawFence(x, y) {
  const ts = tileSize;
  const px = x * ts, py = y * ts;
  ctx.fillStyle = '#8b5a2b';
  ctx.fillRect(px + ts * 0.2, py + ts * 0.1, ts * 0.6, ts * 0.8);
  ctx.strokeStyle = '#5a3b1a';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + ts * 0.2, py + ts * 0.1, ts * 0.6, ts * 0.8);
}

function drawPath(x, y) {
  const ts = tileSize;
  ctx.fillStyle = '#c9b894';
  ctx.fillRect(x * ts, y * ts, ts, ts);
}

function drawDriveway(x, y) {
  const ts = tileSize;
  ctx.fillStyle = '#7a7a7a';
  ctx.fillRect(x * ts, y * ts, ts, ts);
}

function drawPatio(x, y) {
  const ts = tileSize;
  const px = x * ts, py = y * ts;
  ctx.fillStyle = '#a0826d';
  ctx.fillRect(px, py, ts, ts);
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fillRect(px + ts * 0.5, py, 1, ts);
  ctx.fillRect(px, py + ts * 0.5, ts, 1);
}

function drawHouseBuilding(x, y) {
  const ts = tileSize;
  const px = x * ts, py = y * ts;
  ctx.fillStyle = '#c97a5a';
  ctx.fillRect(px, py, ts, ts);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(px, py, ts, ts * 0.2);
}

function drawPool(x, y) {
  const ts = tileSize;
  const px = x * ts, py = y * ts;
  ctx.fillStyle = '#4fb3d9';
  ctx.fillRect(px + 1, py + 1, ts - 2, ts - 2);
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, ts - 2, ts - 2);
}

function drawFeatures() {
  for (let y = 0; y < CFG.gridH; y++) {
    for (let x = 0; x < CFG.gridW; x++) {
      const k = idx(x, y);
      const t = tiles[k];
      if (t === T.GRASS) continue;
      switch (t) {
        case T.TREE:           drawTree(x, y); break;
        case T.ROCK:           drawRock(x, y); break;
        case T.POND:           drawPond(x, y); break;
        case T.FLOWER:         drawFlower(x, y); break;
        case T.BEEHIVE:        drawBeehive(x, y); break;
        case T.FOUNTAIN:       drawFountain(x, y); break;
        case T.SHED:           drawShed(x, y); break;
        case T.GNOME:          drawGnome(x, y); break;
        case T.FENCE:          drawFence(x, y); break;
        case T.PATH:           drawPath(x, y); break;
        case T.DRIVEWAY:       drawDriveway(x, y); break;
        case T.PATIO:          drawPatio(x, y); break;
        case T.HOUSE_BUILDING: drawHouseBuilding(x, y); break;
        case T.POOL:           drawPool(x, y); break;
      }
    }
  }
}

function drawBee(b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(0, 5, 5, 1.5, 0, 0, Math.PI * 2); ctx.fill();
  const wingY = Math.sin(b.wingPhase) * 1.2;
  ctx.fillStyle = 'rgba(230,240,255,0.75)';
  ctx.beginPath(); ctx.ellipse(-1, -3 + wingY * 0.2, 4, 2, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-1,  3 - wingY * 0.2, 4, 2,  0.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffcf3a';
  ctx.beginPath(); ctx.ellipse(0, 0, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.fillRect(-2, -3, 1.2, 6);
  ctx.fillRect( 1, -3, 1.2, 6);
  ctx.fillStyle = '#1c1c1c';
  ctx.beginPath(); ctx.arc(3.2, 0, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function skinBodyColors(skinKey, t) {
  const skin = SKIN_BY_KEY[skinKey] || SKIN_BY_KEY.default;
  if (skin.body[0] === 'rainbow') {
    const hueA = (t * 60) % 360;
    const hueB = (hueA + 60) % 360;
    return [`hsl(${hueA},95%,60%)`, `hsl(${hueB},85%,38%)`, skin.trim, skin.accent, skin.panel];
  }
  return [skin.body[0], skin.body[1], skin.trim, skin.accent, skin.panel];
}

function drawRobot(r) {
  ctx.save();
  ctx.translate(r.x, r.y + Math.sin(r.bob) * 0.6);
  const rivalryOn = !(state.settings && state.settings.rivalry === false);
  if (r.name && getSetting('showRobotNames')) {
    const s = Math.max(10, tileSize * 0.9);
    const fs = Math.max(6, Math.round(tileSize * 0.38));
    ctx.font = `bold ${fs}px Inter,sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillText(r.name, 1, -s * 0.62 + 1);
    ctx.fillStyle = r.isChampion && rivalryOn ? '#ffd34e' : '#fffde0';
    ctx.fillText(r.name, 0, -s * 0.62);
  }
  if (r.isChampion && rivalryOn) {
    const s = Math.max(10, tileSize * 0.9);
    const fs = Math.max(9, Math.round(tileSize * 0.7));
    const nameOffset = (r.name && getSetting('showRobotNames')) ? s * 0.9 : s * 0.7;
    const bob = Math.sin(performance.now() / 220 + r.bob) * 1.5;
    ctx.font = `${fs}px Inter,sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('👑', 0, -nameOffset + bob);
  }
  ctx.rotate(r.angle);

  const s = Math.max(10, tileSize * 0.9);
  const w = s * 1.4, h = s;

  const rad = mowRadius();
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
  grad.addColorStop(0, 'rgba(255, 230, 130, 0.20)');
  grad.addColorStop(0.7, 'rgba(255, 230, 130, 0.06)');
  grad.addColorStop(1, 'rgba(255, 230, 130, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, rad, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(0, h * 0.45, w * 0.55, h * 0.22, 0, 0, Math.PI * 2); ctx.fill();

  const now = performance.now() / 1000;
  const [bodyTop, bodyBot, trimCol, accentCol, panelCol] = skinBodyColors(state.activeSkin, now);

  const bodyGrad = ctx.createLinearGradient(0, -h/2, 0, h/2);
  bodyGrad.addColorStop(0, bodyTop);
  bodyGrad.addColorStop(1, bodyBot);
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, -w/2, -h/2, w, h, s * 0.24);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundRect(ctx, -w/2 + 2, -h/2 + 2, w - 4, h * 0.28, s * 0.18);
  ctx.fill();

  ctx.fillStyle = trimCol;
  roundRect(ctx, w/2 - s*0.35, -h*0.22, s*0.30, h*0.44, s*0.08);
  ctx.fill();
  ctx.fillStyle = panelCol;
  ctx.fillRect(w/2 - s*0.22, -h*0.12, s*0.06, s*0.08);
  ctx.fillRect(w/2 - s*0.22, h*0.04,  s*0.06, s*0.08);

  ctx.fillStyle = '#111';
  roundRect(ctx, -w*0.38, -h*0.62, w*0.22, h*0.22, s*0.08); ctx.fill();
  roundRect(ctx, -w*0.38,  h*0.40, w*0.22, h*0.22, s*0.08); ctx.fill();
  roundRect(ctx,  w*0.18, -h*0.62, w*0.22, h*0.22, s*0.08); ctx.fill();
  roundRect(ctx,  w*0.18,  h*0.40, w*0.22, h*0.22, s*0.08); ctx.fill();

  ctx.save();
  ctx.rotate(r.bladePhase);
  ctx.fillStyle = 'rgba(220,220,220,0.9)';
  ctx.beginPath(); ctx.arc(0, 0, s*0.26, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.save(); ctx.rotate(i * Math.PI / 2);
    ctx.fillStyle = '#7a7a7a';
    ctx.fillRect(-s*0.22, -1, s*0.44, 2);
    ctx.restore();
  }
  ctx.restore();

  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-w*0.25, 0); ctx.lineTo(-w*0.25, -h*0.7); ctx.stroke();
  ctx.fillStyle = accentCol;
  ctx.beginPath(); ctx.arc(-w*0.25, -h*0.72, 2, 0, Math.PI*2); ctx.fill();

  ctx.restore();
}

// ---------- Visitor Gnome (animated wanderer) ----------
function drawVisitorGnome(g) {
  const ts = tileSize;
  const scale = ts / 16;
  ctx.save();
  ctx.translate(g.x, g.y);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(0, ts * 0.42, ts * 0.30, ts * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  if (g.name && getSetting('showGnomeNames')) {
    const fs = Math.max(6, Math.round(tileSize * 0.35));
    ctx.font = `bold ${fs}px Inter,sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(g.name, 1, -ts * 0.6 + 1);
    ctx.fillStyle = '#b4ffa8';
    ctx.fillText(g.name, 0, -ts * 0.6);
  }
  ctx.scale(g.facing, 1);

  const walking = g.state === 'walking' || g.state === 'leaving';
  const step = walking ? Math.sin(g.walkPhase) : 0;
  const bob = walking ? Math.abs(Math.cos(g.walkPhase)) * -1.5 : 0;

  ctx.translate(0, bob);

  // Legs (brown pants, boots)
  const legSwing = step * ts * 0.12;
  ctx.fillStyle = '#6a4a1f';
  roundRect(ctx, -ts * 0.14, ts * 0.08, ts * 0.12, ts * 0.24, 1); ctx.fill();
  roundRect(ctx,  ts * 0.02 + legSwing * 0.3, ts * 0.08, ts * 0.12, ts * 0.24 - Math.abs(legSwing) * 0.3, 1); ctx.fill();
  // Boots
  ctx.fillStyle = '#2a1a0a';
  roundRect(ctx, -ts * 0.16, ts * 0.30, ts * 0.18, ts * 0.08, 1); ctx.fill();
  roundRect(ctx,  ts * 0.00 + legSwing * 0.3, ts * 0.30, ts * 0.18, ts * 0.08, 1); ctx.fill();

  // Body (blue tunic with belt)
  const bodyGrad = ctx.createLinearGradient(0, -ts * 0.1, 0, ts * 0.16);
  bodyGrad.addColorStop(0, '#5486d6');
  bodyGrad.addColorStop(1, '#2d5aa3');
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, -ts * 0.22, -ts * 0.1, ts * 0.44, ts * 0.28, ts * 0.08); ctx.fill();
  // Belt
  ctx.fillStyle = '#3a2410';
  ctx.fillRect(-ts * 0.22, ts * 0.10, ts * 0.44, ts * 0.05);
  ctx.fillStyle = '#ffd34e';
  ctx.fillRect(-ts * 0.04, ts * 0.10, ts * 0.08, ts * 0.05);

  // Arms (swinging while walking, shovel-wielding while digging)
  const armSwing = step * ts * 0.18;
  if (g.state === 'digging') {
    // Shovel arm down + pumping
    const pump = Math.sin(g.stateTime * 10) * ts * 0.12;
    ctx.save();
    ctx.translate(ts * 0.18, -ts * 0.02 + pump);
    ctx.rotate(0.6 + pump * 0.02);
    ctx.fillStyle = '#f4d5b1';
    roundRect(ctx, -ts * 0.04, -ts * 0.04, ts * 0.1, ts * 0.18, 1); ctx.fill();
    // Shovel
    ctx.fillStyle = '#5a3a1e';
    ctx.fillRect(ts * 0.02, ts * 0.12, ts * 0.04, ts * 0.22);
    ctx.fillStyle = '#9ca4ab';
    roundRect(ctx, -ts * 0.04, ts * 0.30, ts * 0.16, ts * 0.10, 1); ctx.fill();
    ctx.restore();
    // Other arm on hip
    ctx.fillStyle = '#f4d5b1';
    roundRect(ctx, -ts * 0.22, ts * 0.0, ts * 0.1, ts * 0.14, 1); ctx.fill();
  } else {
    ctx.fillStyle = '#f4d5b1';
    roundRect(ctx, -ts * 0.28, -ts * 0.02 - armSwing, ts * 0.1, ts * 0.18, 1); ctx.fill();
    roundRect(ctx,  ts * 0.18, -ts * 0.02 + armSwing, ts * 0.1, ts * 0.18, 1); ctx.fill();
  }

  // Head (skin tone)
  ctx.fillStyle = '#f4d5b1';
  ctx.beginPath(); ctx.arc(0, -ts * 0.16, ts * 0.14, 0, Math.PI * 2); ctx.fill();

  // Beard (fluffy white)
  ctx.fillStyle = '#f4f6f8';
  ctx.beginPath();
  ctx.moveTo(-ts * 0.14, -ts * 0.14);
  ctx.quadraticCurveTo(-ts * 0.10, ts * 0.06, 0, ts * 0.04);
  ctx.quadraticCurveTo( ts * 0.10, ts * 0.06, ts * 0.14, -ts * 0.14);
  ctx.quadraticCurveTo( ts * 0.00, -ts * 0.04, -ts * 0.14, -ts * 0.14);
  ctx.closePath(); ctx.fill();

  // Mustache
  ctx.fillStyle = '#e6ebef';
  ctx.beginPath(); ctx.ellipse(-ts * 0.04, -ts * 0.10, ts * 0.05, ts * 0.02, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse( ts * 0.04, -ts * 0.10, ts * 0.05, ts * 0.02, 0, 0, Math.PI * 2); ctx.fill();

  // Nose (round, warm)
  ctx.fillStyle = '#e09a78';
  ctx.beginPath(); ctx.arc(0, -ts * 0.12, ts * 0.035, 0, Math.PI * 2); ctx.fill();

  // Eyes (tiny sparkle)
  ctx.fillStyle = '#20110a';
  ctx.beginPath(); ctx.arc(-ts * 0.05, -ts * 0.18, 1.2 * scale, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc( ts * 0.05, -ts * 0.18, 1.2 * scale, 0, Math.PI * 2); ctx.fill();

  // Hat (tall red cone with floppy tip)
  const hatSway = Math.sin(g.walkPhase * 0.7) * 0.12;
  ctx.save();
  ctx.translate(0, -ts * 0.26);
  ctx.rotate(hatSway);
  ctx.fillStyle = '#c7302f';
  ctx.beginPath();
  ctx.moveTo(-ts * 0.16, 0);
  ctx.lineTo(ts * 0.16, 0);
  ctx.quadraticCurveTo(ts * 0.05, -ts * 0.22, ts * 0.02, -ts * 0.34);
  ctx.quadraticCurveTo(-ts * 0.08, -ts * 0.22, -ts * 0.16, 0);
  ctx.closePath(); ctx.fill();
  // Hat band
  ctx.fillStyle = '#8a1a1a';
  ctx.fillRect(-ts * 0.16, -ts * 0.02, ts * 0.32, ts * 0.04);
  // Pom-pom
  ctx.fillStyle = '#f4f6f8';
  ctx.beginPath(); ctx.arc(ts * 0.025, -ts * 0.36, ts * 0.04, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // dig dirt mound
  if (g.state === 'digging') {
    const moundY = ts * 0.34;
    ctx.fillStyle = '#5a3a1e';
    ctx.beginPath();
    ctx.ellipse(-ts * 0.3 * g.facing, moundY, ts * 0.18, ts * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a5024';
    ctx.beginPath();
    ctx.ellipse(-ts * 0.3 * g.facing, moundY - 1, ts * 0.14, ts * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// ---------- Treasure (animated chest) ----------
function drawTreasure(t) {
  const ts = tileSize;
  ctx.save();
  const baseY = t.y + Math.sin(t.phase * 2) * 1.2;
  ctx.translate(t.x, baseY);

  // ground glow
  const glowAlpha = 0.25 + Math.sin(t.phase * 4) * 0.1;
  const glow = ctx.createRadialGradient(0, ts * 0.28, 0, 0, ts * 0.28, ts * 0.7);
  glow.addColorStop(0, `rgba(255, 220, 80, ${glowAlpha})`);
  glow.addColorStop(1, 'rgba(255, 220, 80, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, ts * 0.28, ts * 0.7, 0, Math.PI * 2); ctx.fill();

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(0, ts * 0.3, ts * 0.3, ts * 0.08, 0, 0, Math.PI * 2); ctx.fill();

  const isSkin = t.type === 'skin';
  const isPattern = t.type === 'pattern';
  // Pattern chests: emerald/green to echo the mowed-grass tint you'd see
  // once the pattern equips. Keeps the three chest types instantly readable.
  const chestBody  = isSkin ? '#6d2fbd' : isPattern ? '#1f7a44' : '#8a5a1f';
  const chestDark  = isSkin ? '#2d0f5a' : isPattern ? '#0b3820' : '#4a2f10';
  const chestLight = isSkin ? '#b94dff' : isPattern ? '#58d07c' : '#c58620';
  const trim       = isSkin ? '#ff6bcf' : isPattern ? '#8ff09e' : '#ffd34e';

  // chest body
  const bodyGrad = ctx.createLinearGradient(0, 0, 0, ts * 0.28);
  bodyGrad.addColorStop(0, chestLight);
  bodyGrad.addColorStop(1, chestDark);
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, -ts * 0.28, 0, ts * 0.56, ts * 0.3, ts * 0.04); ctx.fill();

  // vertical planks
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  for (let i = -1; i <= 2; i++) {
    const px = i * ts * 0.14;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, ts * 0.3); ctx.stroke();
  }

  // lid (slightly tilted open, breathing)
  const lidOpen = Math.sin(t.phase * 3) * 0.06 + 0.12;
  ctx.save();
  ctx.translate(0, 0);
  ctx.rotate(-lidOpen);
  ctx.fillStyle = chestBody;
  roundRect(ctx, -ts * 0.3, -ts * 0.14, ts * 0.6, ts * 0.16, ts * 0.06); ctx.fill();
  // lid trim
  ctx.fillStyle = trim;
  ctx.fillRect(-ts * 0.3, 0, ts * 0.6, ts * 0.025);
  // lock
  ctx.fillStyle = trim;
  roundRect(ctx, -ts * 0.04, -ts * 0.04, ts * 0.08, ts * 0.08, 1); ctx.fill();
  ctx.fillStyle = '#2a1a00';
  ctx.fillRect(-ts * 0.008, -ts * 0.01, ts * 0.018, ts * 0.035);
  ctx.restore();

  // inner glow + contents peeking
  const shineAlpha = 0.7 + Math.sin(t.phase * 6) * 0.25;
  ctx.fillStyle = isSkin
    ? `rgba(255, 170, 240, ${shineAlpha})`
    : isPattern
      ? `rgba(170, 255, 200, ${shineAlpha})`
      : `rgba(255, 220, 80, ${shineAlpha})`;
  ctx.beginPath(); ctx.ellipse(0, ts * 0.02, ts * 0.22, ts * 0.05, 0, 0, Math.PI * 2); ctx.fill();

  // sparkle icon above
  const iconY = -ts * 0.34 + Math.sin(t.phase * 3) * 1.5;
  ctx.fillStyle = trim;
  ctx.font = `bold ${Math.max(9, ts * 0.5)}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = 3;
  const label = isSkin ? '?' : isPattern ? '🪚' : '✦';
  ctx.strokeText(label, 0, iconY);
  ctx.fillText(label, 0, iconY);

  // expiration ring when low
  if (t.life < 15) {
    const pct = t.life / 15;
    ctx.strokeStyle = `rgba(255, 90, 90, ${0.9})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, ts * 0.14, ts * 0.42, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    ctx.stroke();
  }

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawParticles(dt) {
  if (!getSetting('showParticles')) {
    // Keep physics ticking (particles still expire) but skip drawing.
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt * 0.8;
      if (p.life <= 0) particles.splice(i, 1);
    }
    return;
  }
  ctx.save();
  ctx.font = 'bold 14px Inter, sans-serif';
  ctx.textAlign = 'center';
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt * 0.8;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.gravity * dt;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
    ctx.fillStyle = p.color;
    ctx.font = `bold ${p.size}px Inter, sans-serif`;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 3;
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.restore();
}

function drawPlayer() {
  if (!player.active) return;
  const ts = tileSize;
  const rad = playerMowRadius();
  const px = player.x, py = player.y;

  // cutting-radius glow
  const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
  g.addColorStop(0, 'rgba(143,240,158,0.30)');
  g.addColorStop(0.75, 'rgba(143,240,158,0.10)');
  g.addColorStop(1, 'rgba(143,240,158,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(143,240,158,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2); ctx.stroke();

  // spinning blades inside the circle
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(player.bladePhase);
  ctx.fillStyle = 'rgba(220,220,220,0.85)';
  const br = Math.max(4, rad * 0.35);
  ctx.beginPath(); ctx.arc(0, 0, br, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7a7a7a';
  for (let i = 0; i < 3; i++) {
    ctx.save(); ctx.rotate((i / 3) * Math.PI * 2);
    ctx.fillRect(-br * 0.9, -1.2, br * 1.8, 2.4);
    ctx.restore();
  }
  ctx.fillStyle = '#ffd34e';
  ctx.beginPath(); ctx.arc(0, 0, Math.max(2, br * 0.25), 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrass();
  ctx.fillStyle = 'rgba(0,0,0,0.04)';
  for (let x = 0; x < CFG.gridW; x += 2) {
    ctx.fillRect(x * tileSize, 0, tileSize, canvas.height);
  }
  drawFeatures();
  for (const t of treasures) drawTreasure(t);
  for (const r of robots) drawRobot(r);
  for (const b of bees) drawBee(b);
  for (const g of visitorGnomes) drawVisitorGnome(g);
  drawPlayer();
  drawParticles(1/60);
  // Atmosphere last: darken the scene for night, then layer weather on top so
  // rain/snow stays visible even at night. Lightning still punches through.
  if (typeof drawDayNightOverlay === 'function') drawDayNightOverlay();
  if (typeof drawWeather === 'function') drawWeather();
}

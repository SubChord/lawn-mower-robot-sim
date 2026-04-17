/* ============================================================
   Rendering + tile sprites
   ============================================================ */

// Pre-render grass tile gradients via offscreen caches keyed by height buckets
const tileCache = {};
function getTileImage(heightBucket) {
  const key = heightBucket + '_' + tileSize;
  if (tileCache[key]) return tileCache[key];
  const off = document.createElement('canvas');
  off.width = tileSize; off.height = tileSize;
  const c = off.getContext('2d');
  const h = heightBucket / 10;
  const baseR = 30 + h * 24;
  const baseG = 70 + h * 110;
  const baseB = 28 + h * 44;
  c.fillStyle = `rgb(${baseR|0},${baseG|0},${baseB|0})`;
  c.fillRect(0, 0, tileSize, tileSize);
  if (h > 0.2) {
    const blades = Math.floor(2 + h * 5);
    for (let i = 0; i < blades; i++) {
      const bx = Math.random() * tileSize;
      const bh = (0.2 + Math.random() * 0.8) * h * tileSize * 0.7;
      const bw = 1;
      const gr = c.createLinearGradient(bx, tileSize, bx, tileSize - bh);
      gr.addColorStop(0, `rgba(20,60,25,0.9)`);
      gr.addColorStop(1, `rgba(${140 + h * 50},${220},${120},0.9)`);
      c.fillStyle = gr;
      c.fillRect(bx, tileSize - bh, bw, bh);
    }
  }
  c.fillStyle = 'rgba(255,255,255,0.02)';
  c.fillRect(0, 0, tileSize, tileSize / 2);
  tileCache[key] = off;
  return off;
}

function drawGrass() {
  const ts = tileSize;
  for (let y = 0; y < CFG.gridH; y++) {
    for (let x = 0; x < CFG.gridW; x++) {
      const k = idx(x, y);
      if (tiles[k] === T.GRASS) {
        const h = grass[k];
        const bucket = Math.min(10, Math.max(0, Math.round(h * 10)));
        ctx.drawImage(getTileImage(bucket), x * ts, y * ts);
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

function drawFeatures() {
  for (let y = 0; y < CFG.gridH; y++) {
    for (let x = 0; x < CFG.gridW; x++) {
      const k = idx(x, y);
      const t = tiles[k];
      if (t === T.GRASS) continue;
      switch (t) {
        case T.TREE:     drawTree(x, y); break;
        case T.ROCK:     drawRock(x, y); break;
        case T.POND:     drawPond(x, y); break;
        case T.FLOWER:   drawFlower(x, y); break;
        case T.BEEHIVE:  drawBeehive(x, y); break;
        case T.FOUNTAIN: drawFountain(x, y); break;
        case T.SHED:     drawShed(x, y); break;
        case T.GNOME:    drawGnome(x, y); break;
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

function drawRobot(r) {
  ctx.save();
  if (state.fuel <= 0) ctx.globalAlpha = 0.35;
  ctx.translate(r.x, r.y + Math.sin(r.bob) * 0.6);
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

  const bodyGrad = ctx.createLinearGradient(0, -h/2, 0, h/2);
  bodyGrad.addColorStop(0, '#ff7a2e');
  bodyGrad.addColorStop(1, '#c0421a');
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, -w/2, -h/2, w, h, s * 0.24);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundRect(ctx, -w/2 + 2, -h/2 + 2, w - 4, h * 0.28, s * 0.18);
  ctx.fill();

  ctx.fillStyle = '#1a1a1a';
  roundRect(ctx, w/2 - s*0.35, -h*0.22, s*0.30, h*0.44, s*0.08);
  ctx.fill();
  ctx.fillStyle = '#58ffa0';
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
  ctx.fillStyle = '#ff4a4a';
  ctx.beginPath(); ctx.arc(-w*0.25, -h*0.72, 2, 0, Math.PI*2); ctx.fill();

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

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrass();
  ctx.fillStyle = 'rgba(0,0,0,0.04)';
  for (let x = 0; x < CFG.gridW; x += 2) {
    ctx.fillRect(x * tileSize, 0, tileSize, canvas.height);
  }
  drawFeatures();
  for (const r of robots) drawRobot(r);
  for (const b of bees) drawBee(b);
  drawParticles(1/60);
}

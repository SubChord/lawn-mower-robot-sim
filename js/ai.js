/* ============================================================
   Robot AI, Bee AI, grass + flower income
   ============================================================ */

function pickTarget(r) {
  const ts = tileSize;
  const cx = Math.floor(r.x / ts);
  const cy = Math.floor(r.y / ts);
  const searchR = 10;
  let best = null; let bestScore = -Infinity;
  for (let dy = -searchR; dy <= searchR; dy++) {
    for (let dx = -searchR; dx <= searchR; dx++) {
      const x = cx + dx, y = cy + dy;
      if (!inBounds(x, y)) continue;
      if (tiles[idx(x, y)] !== T.GRASS) continue;
      const h = grass[idx(x, y)];
      if (h < 0.2) continue;
      const dist = Math.hypot(dx, dy) + 0.1;
      const score = h * h / dist - Math.random() * 0.05;
      if (score > bestScore) { bestScore = score; best = { x, y }; }
    }
  }
  if (!best) {
    let bh = 0, bi = -1;
    for (let i = 0; i < grass.length; i++) {
      if (tiles[i] !== T.GRASS) continue;
      if (grass[i] > bh) { bh = grass[i]; bi = i; }
    }
    if (bi >= 0) best = { x: bi % CFG.gridW, y: Math.floor(bi / CFG.gridW) };
    else {
      for (let i = 0; i < 20; i++) {
        const rx = Math.floor(Math.random() * CFG.gridW);
        const ry = Math.floor(Math.random() * CFG.gridH);
        if (tiles[idx(rx, ry)] === T.GRASS) { best = { x: rx, y: ry }; break; }
      }
      if (!best) best = { x: cx, y: cy };
    }
  }
  r.target = best;
  r.lastTargetCheck = 0;
}

function obstacleRepulsion(px, py) {
  const ts = tileSize;
  const cx = Math.floor(px / ts), cy = Math.floor(py / ts);
  let ax = 0, ay = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx, y = cy + dy;
      if (!inBounds(x, y)) {
        const wx = Math.max(0, Math.min(CFG.gridW * ts, px));
        const wy = Math.max(0, Math.min(CFG.gridH * ts, py));
        const dX = px - wx, dY = py - wy;
        const d2 = dX*dX + dY*dY + 1;
        ax += dX / d2 * 500;
        ay += dY / d2 * 500;
        continue;
      }
      if (!OBSTACLE.has(tiles[idx(x, y)])) continue;
      const tcx = (x + 0.5) * ts, tcy = (y + 0.5) * ts;
      const dX = px - tcx, dY = py - tcy;
      const d = Math.hypot(dX, dY) + 0.001;
      if (d > ts * 1.8) continue;
      const strength = Math.pow((ts * 1.8 - d) / (ts * 1.8), 2);
      ax += (dX / d) * strength;
      ay += (dY / d) * strength;
    }
  }
  return { ax, ay };
}

function updateRobot(r, dt) {
  const ts = tileSize;
  if (!r.target) pickTarget(r);
  r.lastTargetCheck += dt;
  if (r.target) {
    const t = tiles[idx(r.target.x, r.target.y)];
    const th = grass[idx(r.target.x, r.target.y)];
    if (t !== T.GRASS || th < 0.1 || r.lastTargetCheck > CFG.targetRecheck) pickTarget(r);
  }
  if (!r.target) return;

  const tx = (r.target.x + 0.5) * ts;
  const ty = (r.target.y + 0.5) * ts;
  const dx = tx - r.x, dy = ty - r.y;
  const dist = Math.hypot(dx, dy);
  const seekX = dx / (dist + 0.001);
  const seekY = dy / (dist + 0.001);

  const rep = obstacleRepulsion(r.x, r.y);
  const avoidWeight = 2.8;
  let vx = seekX + rep.ax * avoidWeight;
  let vy = seekY + rep.ay * avoidWeight;
  const vmag = Math.hypot(vx, vy) + 0.001;
  vx /= vmag; vy /= vmag;

  const desiredAngle = Math.atan2(vy, vx);
  let angDiff = desiredAngle - r.angle;
  while (angDiff > Math.PI) angDiff -= 2 * Math.PI;
  while (angDiff < -Math.PI) angDiff += 2 * Math.PI;
  r.angle += angDiff * Math.min(1, dt * 10);

  const speed = robotSpeed();
  if (dist > 2) {
    const nx = r.x + Math.cos(r.angle) * speed * dt;
    const ny = r.y + Math.sin(r.angle) * speed * dt;
    const tnx = Math.floor(nx / ts), tny = Math.floor(ny / ts);
    if (inBounds(tnx, tny) && !OBSTACLE.has(tiles[idx(tnx, tny)])) {
      r.x = nx; r.y = ny;
    } else {
      const tnx2 = Math.floor(nx / ts), tny2 = Math.floor(r.y / ts);
      if (inBounds(tnx2, tny2) && !OBSTACLE.has(tiles[idx(tnx2, tny2)])) r.x = nx;
      const tnx3 = Math.floor(r.x / ts), tny3 = Math.floor(ny / ts);
      if (inBounds(tnx3, tny3) && !OBSTACLE.has(tiles[idx(tnx3, tny3)])) r.y = ny;
    }
  }

  r.bladePhase += dt * 25;
  r.bob += dt * 10;

  // Mow
  const rad = mowRadius();
  const rate = mowRate();
  const cellRad = Math.ceil(rad / ts) + 1;
  const ccx = Math.floor(r.x / ts);
  const ccy = Math.floor(r.y / ts);
  let mowedThisTick = 0;
  let critHit = false;
  for (let dy2 = -cellRad; dy2 <= cellRad; dy2++) {
    for (let dx2 = -cellRad; dx2 <= cellRad; dx2++) {
      const gx = ccx + dx2, gy = ccy + dy2;
      if (!inBounds(gx, gy)) continue;
      const k = idx(gx, gy);
      if (tiles[k] !== T.GRASS) continue;
      const tcx = (gx + 0.5) * ts, tcy = (gy + 0.5) * ts;
      const d = Math.hypot(tcx - r.x, tcy - r.y);
      if (d > rad) continue;
      const prev = grass[k];
      if (prev <= 0) continue;
      const cut = Math.min(prev, rate * dt * (1 - d / rad * 0.4));
      grass[k] = Math.max(0, prev - cut);
      mowedThisTick += cut;
      if (prev > 0.9 && grass[k] <= 0.9) state.totalTilesMowed++;
    }
  }
  if (mowedThisTick > 0) {
    let coins = mowedThisTick * CFG.coinPerUnitBase * coinMult();
    if (Math.random() < critChance()) { coins *= critMult(); critHit = true; }
    state.coins += coins;
    state.totalEarnedAllTime += coins;
    state.totalEarnedThisRun += coins;
    if (Math.random() < 0.04 + (critHit ? 0.9 : 0)) {
      addParticle(r.x, r.y - 4, {
        text: (critHit ? 'CRIT! +' : '+') + formatShort(coins),
        color: critHit ? '#ff6bcf' : '#ffd34e',
        size: critHit ? 14 : 11,
      });
    }
  }
}

// ---------- Bee AI ----------
function pickBeeTarget(b) {
  const flowerIdxs = [];
  for (let i = 0; i < tiles.length; i++) if (tiles[i] === T.FLOWER) flowerIdxs.push(i);
  const ts = tileSize;
  if (flowerIdxs.length === 0) {
    const angle = Math.random() * Math.PI * 2;
    const radius = ts * 1.2 + Math.random() * ts;
    b.target = {
      x: (b.homeX + 0.5) * ts + Math.cos(angle) * radius,
      y: (b.homeY + 0.5) * ts + Math.sin(angle) * radius,
      tx: -1, ty: -1,
    };
    return;
  }
  const pick = flowerIdxs[Math.floor(Math.random() * flowerIdxs.length)];
  const fx = pick % CFG.gridW, fy = Math.floor(pick / CFG.gridW);
  b.target = { x: (fx + 0.5) * ts, y: (fy + 0.5) * ts, tx: fx, ty: fy };
}

function updateBee(b, dt) {
  b.wingPhase += dt * 28;
  b.jitter += dt;
  if (!b.target) pickBeeTarget(b);
  const t = b.target;
  const ts = tileSize;
  if (b.state === 'flying') {
    const jx = Math.sin(b.jitter * 6) * 4;
    const jy = Math.cos(b.jitter * 7) * 4;
    const dx = (t.x + jx) - b.x, dy = (t.y + jy) - b.y;
    const dist = Math.hypot(dx, dy);
    b.angle = Math.atan2(dy, dx);
    if (dist < 4) {
      b.state = 'visiting';
      b.stateTime = 0;
    } else {
      b.x += (dx / dist) * CFG.beeSpeed * dt;
      b.y += (dy / dist) * CFG.beeSpeed * dt;
    }
  } else {
    b.stateTime += dt;
    b.x += Math.sin(b.stateTime * 12) * 0.2;
    b.y += Math.cos(b.stateTime * 14) * 0.15;
    if (b.stateTime > CFG.beeVisitDuration) {
      if (t.tx >= 0 && tiles[idx(t.tx, t.ty)] === T.FLOWER) {
        const coins = CFG.beeRewardPerVisit * coinMult();
        state.coins += coins;
        state.totalEarnedAllTime += coins;
        state.totalEarnedThisRun += coins;
        if (Math.random() < 0.35) addParticle(b.x, b.y - 4, { text: '+' + formatShort(coins), color: '#fff4a8', size: 10 });
        beep(900 + Math.random() * 400, 0.02, 'triangle', 0.015);
      }
      b.state = 'flying';
      pickBeeTarget(b);
    }
  }
}

// ---------- Grass + Flower income ----------
function updateGrass(dt) {
  const rate = growthRate() * dt;
  for (let i = 0; i < grass.length; i++) {
    if (tiles[i] !== T.GRASS) { grass[i] = 0; continue; }
    const h = grass[i];
    if (h < 1.0) grass[i] = Math.min(1.0, h + rate * (1 - h * 0.6));
  }
}

let flowerIncomeAccum = 0;
function updateFlowerIncome(dt) {
  const flowers = state.garden.flower;
  if (flowers <= 0) return;
  const perSec = flowers * CFG.flowerCoinPerSec * coinMult();
  const earned = perSec * dt;
  state.coins += earned;
  state.totalEarnedAllTime += earned;
  state.totalEarnedThisRun += earned;
  flowerIncomeAccum += earned;
  if (flowerIncomeAccum > 5) {
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] === T.FLOWER && Math.random() < 0.02) {
        const fx = i % CFG.gridW, fy = Math.floor(i / CFG.gridW);
        const ts = tileSize;
        addParticle((fx + 0.5) * ts, (fy + 0.2) * ts, { text: '+' + formatShort(flowerIncomeAccum), color: '#ffb6ef', size: 10 });
        flowerIncomeAccum = 0;
        break;
      }
    }
    if (flowerIncomeAccum > 20) flowerIncomeAccum = 0;
  }
}

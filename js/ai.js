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

function updateFuel(dt) {
  // Zen Mode: infinite fuel, no drain, no refueling needed.
  if (state.zenMode) { state.fuel = CFG.fuelMax; return; }
  const ft = activeFuelType();
  const net = (ft.recharge - fuelDrainRate()) * dt;
  state.fuel = Math.min(CFG.fuelMax, Math.max(0, state.fuel + net));
}

function updatePlayer(dt) {
  player.bladePhase += dt * 30;
  if (!player.active) return;
  const ts = tileSize;
  const rad = playerMowRadius();
  const rate = playerMowRate();
  const cellRad = Math.ceil(rad / ts) + 1;
  const ccx = Math.floor(player.x / ts);
  const ccy = Math.floor(player.y / ts);
  let mowedThisTick = 0;
  let critHit = false;
  let coinUnits = 0;
  for (let dy = -cellRad; dy <= cellRad; dy++) {
    for (let dx = -cellRad; dx <= cellRad; dx++) {
      const gx = ccx + dx, gy = ccy + dy;
      if (!inBounds(gx, gy)) continue;
      const k = idx(gx, gy);
      if (tiles[k] !== T.GRASS) continue;
      const tcx = (gx + 0.5) * ts, tcy = (gy + 0.5) * ts;
      const d = Math.hypot(tcx - player.x, tcy - player.y);
      if (d > rad) continue;
      const prev = grass[k];
      if (prev <= 0) continue;
      const spec = GRASS_TYPES[grassSpecies[k]] || GRASS_TYPES[0];
      const cut = Math.min(prev, (rate * dt * (1 - d / rad * 0.4)) / spec.toughness);
      grass[k] = Math.max(0, prev - cut);
      mowedThisTick += cut;
      coinUnits += cut * spec.coinMult;
      if (prev > 0.9 && grass[k] <= 0.9) state.totalTilesMowed++;
      if (grass[k] <= 0 && grassSpecies[k] !== 0) grassSpecies[k] = 0;
    }
  }
  if (mowedThisTick > 0) {
    player.lastMowed = performance.now();
    let coins = coinUnits * CFG.coinPerUnitBase * coinMult();
    if (Math.random() < critChance()) { coins *= critMult(); critHit = true; }
    state.coins += coins;
    state.totalEarnedAllTime += coins;
    state.totalEarnedThisRun += coins;
    if (Math.random() < 0.06 + (critHit ? 0.9 : 0)) {
      addParticle(player.x, player.y - 6, {
        text: (critHit ? 'CRIT! +' : '+') + formatShort(coins),
        color: critHit ? '#ff6bcf' : '#ffd34e',
        size: critHit ? 22 : 18,
      });
    }
  }
}

function updateRobot(r, dt) {
  if (state.fuel <= 0) return;
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
  let coinUnits = 0;
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
      const spec = GRASS_TYPES[grassSpecies[k]] || GRASS_TYPES[0];
      const cut = Math.min(prev, (rate * dt * (1 - d / rad * 0.4)) / spec.toughness);
      grass[k] = Math.max(0, prev - cut);
      mowedThisTick += cut;
      coinUnits += cut * spec.coinMult;
      if (prev > 0.9 && grass[k] <= 0.9) state.totalTilesMowed++;
      if (grass[k] <= 0 && grassSpecies[k] !== 0) grassSpecies[k] = 0;
    }
  }
  if (mowedThisTick > 0) {
    let coins = coinUnits * CFG.coinPerUnitBase * coinMult();
    if (Math.random() < critChance()) { coins *= critMult(); critHit = true; }
    state.coins += coins;
    state.totalEarnedAllTime += coins;
    state.totalEarnedThisRun += coins;
    if (Math.random() < 0.04 + (critHit ? 0.9 : 0)) {
      addParticle(r.x, r.y - 4, {
        text: (critHit ? 'CRIT! +' : '+') + formatShort(coins),
        color: critHit ? '#ff6bcf' : '#ffd34e',
        size: critHit ? 22 : 18,
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
        if (Math.random() < 0.35) addParticle(b.x, b.y - 4, { text: '+' + formatShort(coins), color: '#fff4a8', size: 16 });
        beep(900 + Math.random() * 400, 0.02, 'triangle', 0.015);
      }
      b.state = 'flying';
      pickBeeTarget(b);
    }
  }
}

// ---------- Grass + Flower income ----------
// ---------- Special grass spawning ----------
// Attempts to convert one fully-grown grass tile per call into a rare species,
// weighted by each species' base weight + (spawnLevel * 0.5) bonus per level.
// Called on a timer from updateGrassSpawn.
function trySpawnSpecialGrass() {
  if (!grass || !grassSpecies) return;
  // Gather weights for unlocked species
  const weights = [];
  let total = 0;
  for (let i = 1; i < GRASS_TYPES.length; i++) {
    const def = GRASS_TYPES[i];
    const st = state.grassTypes?.[def.key];
    if (!st?.unlocked) continue;
    const w = def.spawnBase * (1 + st.spawnLevel * 0.5);
    weights.push([i, w]);
    total += w;
  }
  if (total <= 0) return;
  // Pick a random fully-grown normal grass tile (a few tries)
  for (let i = 0; i < 12; i++) {
    const k = Math.floor(Math.random() * grass.length);
    if (tiles[k] !== T.GRASS) continue;
    if (grass[k] < 0.85) continue;
    if (grassSpecies[k] !== 0) continue;
    // Roll species
    let r = Math.random() * total;
    for (const [idx, w] of weights) {
      r -= w;
      if (r <= 0) { grassSpecies[k] = idx; return; }
    }
    return;
  }
}

let grassSpawnTimer = 0;
function updateGrassSpawn(dt) {
  grassSpawnTimer += dt;
  // Try every ~1.5s; each unlocked species with spawnLevel accelerates further
  let totalLevels = 0;
  for (let i = 1; i < GRASS_TYPES.length; i++) {
    const st = state.grassTypes?.[GRASS_TYPES[i].key];
    if (st?.unlocked) totalLevels += 1 + st.spawnLevel;
  }
  if (totalLevels === 0) return;
  const interval = Math.max(0.25, 1.8 / Math.sqrt(totalLevels));
  while (grassSpawnTimer >= interval) {
    grassSpawnTimer -= interval;
    trySpawnSpecialGrass();
  }
}

function updateGrass(dt) {
  const rate = growthRate() * dt;
  for (let i = 0; i < grass.length; i++) {
    if (tiles[i] !== T.GRASS) { grass[i] = 0; continue; }
    const h = grass[i];
    if (h < 1.0) grass[i] = Math.min(1.0, h + rate * (1 - h * 0.6));
  }
}

// ---------- Visitor Gnome + Treasure AI ----------
function updateGnomeSpawnTimer(dt) {
  state.gnomeTimer -= dt;
  if (state.gnomeTimer <= 0) {
    if (visitorGnomes.length < 2) spawnVisitorGnome();
    const mult = gnomeSpawnIntervalMult();
    state.gnomeTimer = (CFG.gnomeSpawnMin + Math.random() * (CFG.gnomeSpawnMax - CFG.gnomeSpawnMin)) * mult;
  }
}

function updateVisitorGnome(g, dt) {
  const ts = tileSize;
  const speed = CFG.gnomeWalkSpeed;
  const moveTo = (tx, ty) => {
    const dx = tx - g.x, dy = ty - g.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) return true;
    const step = Math.min(dist, speed * dt);
    g.x += (dx / dist) * step;
    g.y += (dy / dist) * step;
    if (Math.abs(dx) > 0.5) g.facing = dx > 0 ? 1 : -1;
    return false;
  };

  if (g.state === 'walking') {
    g.walkPhase += dt * 9;
    if (moveTo(g.targetX, g.targetY)) {
      g.state = 'digging';
      g.stateTime = 0;
    }
  } else if (g.state === 'digging') {
    g.stateTime += dt;
    g.walkPhase += dt * 3;
    // Drop a treasure halfway through the dig
    if (!g.hasDropped && g.stateTime > CFG.gnomeDigDuration * 0.55) {
      spawnTreasureAt(g.digCell.x, g.digCell.y);
      g.hasDropped = true;
      const cx = (g.digCell.x + 0.5) * ts;
      const cy = (g.digCell.y + 0.5) * ts;
      for (let i = 0; i < 6; i++) {
        addParticle(cx + (Math.random() - 0.5) * ts, cy - 2, {
          text: '·', color: '#8b5a2b', size: 10 + Math.random() * 6,
        });
      }
      playGnomeGiggle();
      toast('🧙 A gnome hid something in the garden!', '#c6a8ff');
    }
    if (g.stateTime > CFG.gnomeDigDuration) {
      g.state = 'leaving';
      g.stateTime = 0;
    }
  } else if (g.state === 'leaving') {
    g.walkPhase += dt * 10;
    if (moveTo(g.exitX, g.exitY)) {
      g.state = 'gone';
    }
  }
}

function updateVisitorGnomes(dt) {
  for (let i = visitorGnomes.length - 1; i >= 0; i--) {
    updateVisitorGnome(visitorGnomes[i], dt);
    if (visitorGnomes[i].state === 'gone') visitorGnomes.splice(i, 1);
  }
}

function updateTreasures(dt) {
  for (let i = treasures.length - 1; i >= 0; i--) {
    const t = treasures[i];
    t.life -= dt;
    t.born += dt;
    t.phase += dt;
    if (t.life <= 0) {
      treasures.splice(i, 1);
      continue;
    }
    // Sparkles
    if (Math.random() < 0.12) {
      addParticle(t.x + (Math.random() - 0.5) * tileSize * 0.9,
                  t.y - tileSize * 0.25 + (Math.random() - 0.5) * 4, {
        text: '✦', color: t.type === 'skin' ? '#ff6bcf' : '#ffd34e',
        size: t.type === 'skin' ? 11 : 9, gravity: -20,
      });
    }
  }
}

function updateCrew(dt) {
  // Auto-refueler
  if (hasCrew('autoRefuel') && !isElectric()) {
    const pct = state.fuel / CFG.fuelMax;
    if (pct < 0.25) {
      const cost = fuelRefillCost();
      if (state.coins >= cost) {
        state.coins -= cost;
        state.fuel = CFG.fuelMax;
        beep(380, 0.05, 'sine', 0.04);
        addParticle(canvas.width * 0.5, 24, {
          text: '⛽ Auto-refueled', color: '#ff9f1c', size: 13, gravity: 40,
        });
      }
    }
  }
  // Treasure scout
  if (hasCrew('scout')) {
    for (let i = treasures.length - 1; i >= 0; i--) {
      const t = treasures[i];
      if (t.born > CFG.scoutAutoDelay) {
        collectTreasureIndex(i, true);
      }
    }
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
        addParticle((fx + 0.5) * ts, (fy + 0.2) * ts, { text: '+' + formatShort(flowerIncomeAccum), color: '#ffb6ef', size: 16 });
        flowerIncomeAccum = 0;
        break;
      }
    }
    if (flowerIncomeAccum > 20) flowerIncomeAccum = 0;
  }
}

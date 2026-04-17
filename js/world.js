/* ============================================================
   World grid, robots, bees
   ============================================================ */

let grass;        // Float32Array (height 0..1)
let tiles;        // Uint8Array (tile type)
let flowerColors; // Uint8Array (palette index per flower)

function idx(x, y) { return y * CFG.gridW + x; }
function inBounds(x, y) { return x >= 0 && y >= 0 && x < CFG.gridW && y < CFG.gridH; }

function initWorld() {
  grass = new Float32Array(CFG.gridW * CFG.gridH);
  tiles = new Uint8Array(CFG.gridW * CFG.gridH);
  flowerColors = new Uint8Array(CFG.gridW * CFG.gridH);
  for (let i = 0; i < grass.length; i++) grass[i] = 0.7 + Math.random() * 0.3;

  const treeCount = 8 + Math.floor(Math.random() * 4);
  const rockCount = 6 + Math.floor(Math.random() * 4);
  for (let i = 0; i < treeCount; i++) placeAtRandomGrass(T.TREE);
  for (let i = 0; i < rockCount; i++) placeAtRandomGrass(T.ROCK);
  placePondBlob();
}

function placeAtRandomGrass(type, triesMax = 40) {
  for (let i = 0; i < triesMax; i++) {
    const x = 1 + Math.floor(Math.random() * (CFG.gridW - 2));
    const y = 1 + Math.floor(Math.random() * (CFG.gridH - 2));
    if (tiles[idx(x, y)] !== T.GRASS) continue;
    if (tileNearRobot(x, y)) continue;
    tiles[idx(x, y)] = type;
    grass[idx(x, y)] = 0;
    if (type === T.FLOWER) {
      flowerColors[idx(x, y)] = Math.floor(Math.random() * FLOWER_PALETTE.length);
    }
    return { x, y };
  }
  return null;
}

function placePondBlob() {
  const cx = 2 + Math.floor(Math.random() * (CFG.gridW - 4));
  const cy = 2 + Math.floor(Math.random() * (CFG.gridH - 4));
  const cells = [[cx, cy], [cx + 1, cy], [cx, cy + 1], [cx + 1, cy + 1]];
  for (const [x, y] of cells) {
    if (inBounds(x, y) && tiles[idx(x, y)] === T.GRASS) {
      tiles[idx(x, y)] = T.POND;
      grass[idx(x, y)] = 0;
    }
  }
}

function tileNearRobot(tx, ty) {
  if (!robots || robots.length === 0) return false;
  const ts = tileSize || 16;
  const cx = (tx + 0.5) * ts, cy = (ty + 0.5) * ts;
  for (const r of robots) if (Math.hypot(r.x - cx, r.y - cy) < ts * 2) return true;
  return false;
}

// ---------- Player (mouse-controlled mower) ----------
let player = {
  x: 0, y: 0,
  active: false,        // true while cursor is over canvas
  bladePhase: 0,
  lastMowed: 0,         // timestamp of last non-zero cut (for trail effects)
};

// ---------- Robots ----------
let robots = [];

function spawnRobot() {
  const ts = getTileSize();
  let tx = 1, ty = 1;
  for (let i = 0; i < 60; i++) {
    const rx = 1 + Math.floor(Math.random() * (CFG.gridW - 2));
    const ry = 1 + Math.floor(Math.random() * (CFG.gridH - 2));
    if (tiles[idx(rx, ry)] === T.GRASS) { tx = rx; ty = ry; break; }
  }
  robots.push({
    x: (tx + 0.5) * ts,
    y: (ty + 0.5) * ts,
    angle: Math.random() * Math.PI * 2,
    target: null,
    bladePhase: Math.random() * Math.PI * 2,
    lastTargetCheck: 0,
    bob: Math.random() * Math.PI * 2,
    name: ROBOT_NAMES[robots.length % ROBOT_NAMES.length],
  });
}

function ensureRobotCount() {
  while (robots.length < state.upgrades.robots) spawnRobot();
  while (robots.length > state.upgrades.robots) robots.pop();
}

// ---------- Bees ----------
let bees = [];

function spawnBee(homeTileX, homeTileY) {
  const ts = getTileSize();
  bees.push({
    x: (homeTileX + 0.5) * ts,
    y: (homeTileY + 0.5) * ts,
    homeX: homeTileX, homeY: homeTileY,
    angle: Math.random() * Math.PI * 2,
    target: null,
    state: 'flying',
    stateTime: 0,
    wingPhase: Math.random() * 10,
    jitter: Math.random() * 10,
  });
}

function ensureBeesFromHives() {
  const hives = [];
  for (let y = 0; y < CFG.gridH; y++)
    for (let x = 0; x < CFG.gridW; x++)
      if (tiles[idx(x, y)] === T.BEEHIVE) hives.push({ x, y });
  const want = hives.length * CFG.beePerHive;
  while (bees.length < want) {
    const h = hives[Math.floor(Math.random() * hives.length)];
    spawnBee(h.x, h.y);
  }
  while (bees.length > want) bees.pop();
}

// ---------- Wandering Gnomes + Treasures ----------
let visitorGnomes = []; // mischievous gnomes that hide treasures
let treasures = [];     // { x, y, tileX, tileY, type: 'coin'|'skin', amount, skinKey, life, born, phase }

function findGrassTile() {
  for (let i = 0; i < 80; i++) {
    const x = 2 + Math.floor(Math.random() * (CFG.gridW - 4));
    const y = 2 + Math.floor(Math.random() * (CFG.gridH - 4));
    if (tiles[idx(x, y)] === T.GRASS) return { x, y };
  }
  return null;
}

function spawnVisitorGnome() {
  const ts = getTileSize();
  const gw = CFG.gridW, gh = CFG.gridH;
  const edge = Math.floor(Math.random() * 4);
  let sx, sy, ex, ey;
  if (edge === 0)      { sx = -1;      sy = 2 + Math.random() * (gh - 4); ex = gw + 1; ey = 2 + Math.random() * (gh - 4); }
  else if (edge === 1) { sx = gw + 1;  sy = 2 + Math.random() * (gh - 4); ex = -1;     ey = 2 + Math.random() * (gh - 4); }
  else if (edge === 2) { sx = 2 + Math.random() * (gw - 4); sy = -1;      ex = 2 + Math.random() * (gw - 4); ey = gh + 1; }
  else                 { sx = 2 + Math.random() * (gw - 4); sy = gh + 1;  ex = 2 + Math.random() * (gw - 4); ey = -1;     }

  const dig = findGrassTile() || { x: Math.floor(gw/2), y: Math.floor(gh/2) };
  visitorGnomes.push({
    x: sx * ts, y: sy * ts,
    targetX: (dig.x + 0.5) * ts, targetY: (dig.y + 0.5) * ts,
    exitX: ex * ts, exitY: ey * ts,
    digCell: dig,
    facing: 1,
    state: 'walking',
    stateTime: 0,
    walkPhase: Math.random() * 10,
    hasDropped: false,
    name: GNOME_NAMES[Math.floor(Math.random() * GNOME_NAMES.length)],
  });
}

function rollTreasurePayload() {
  if (Math.random() < skinDropChance()) {
    const locked = SKIN_DEFS.filter(s => state.skinsUnlocked.indexOf(s.key) < 0);
    if (locked.length > 0) {
      const pick = locked[Math.floor(Math.random() * locked.length)];
      return { type: 'skin', skinKey: pick.key, amount: 0 };
    }
  }
  const ref = typeof displayedRate === 'number' && displayedRate > 0 ? displayedRate : 4;
  const base = Math.max(60, Math.floor(ref * (25 + Math.random() * 90)));
  const withGems = Math.floor(base * (1 + state.gems * 0.05));
  return { type: 'coin', amount: withGems, skinKey: null };
}

function spawnTreasureAt(tx, ty) {
  const ts = getTileSize();
  const pay = rollTreasurePayload();
  treasures.push({
    tileX: tx, tileY: ty,
    x: (tx + 0.5) * ts,
    y: (ty + 0.5) * ts,
    type: pay.type,
    amount: pay.amount,
    skinKey: pay.skinKey,
    life: CFG.treasureLifetime,
    born: 0,
    phase: Math.random() * 10,
  });
}

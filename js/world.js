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

/* ============================================================
   State, costs, garden defs, derived values
   ============================================================ */

let state = {
  coins: 0,
  gems: 0,
  totalEarnedAllTime: 0,
  totalEarnedThisRun: 0,
  totalTilesMowed: 0,
  lastUpdate: Date.now(),
  muted: false,
  upgrades: {
    robots: 1, speed: 0, range: 0, value: 0, growth: 0, rate: 0, crit: 0,
    fuelEff: 0, fuelType: 0, tool: 0,
  },
  fuel: 100,
  garden: {
    tree: 0, rock: 0, pond: 0, flower: 0, beehive: 0, fountain: 0, shed: 0, gnome: 0,
  },
  crew: [],                 // unlocked skill-tree node ids
  skinsUnlocked: ['default'],
  activeSkin: 'default',
  gnomeTimer: 60 + Math.random() * 30, // seconds until next wandering gnome
  treasuresCollected: 0,
  // Per-species unlock + spawn-rate upgrade levels. Entries keyed by GRASS_TYPES.key.
  // 'normal' is always the default (idx 0) and doesn't live in here.
  grassTypes: {
    clover:  { unlocked: false, spawnLevel: 0 },
    thick:   { unlocked: false, spawnLevel: 0 },
    crystal: { unlocked: false, spawnLevel: 0 },
    golden:  { unlocked: false, spawnLevel: 0 },
  },
  settings: {
    showRobotNames: true,
    showGnomeNames: true,
    showParticles: true,
  },
  zenMode: false,
  zenConfig: {
    robots: 6,
    flowers: 14,
    beehives: 3,
    trees: 10,
    rocks: 6,
    ponds: 2,
    gnomes: 2,
  },
};

// ---------- Zen Mode: configurable screensaver world ----------
// Fully decoupled from the main game: the zen screensaver has its own world
// composition. Counts below are sliders in the zen setup modal.
const ZEN_SLIDERS = [
  { key: 'robots',   icon: '🤖', label: 'Mowers',   min: 0, max: 20, step: 1 },
  { key: 'flowers',  icon: '🌸', label: 'Flowers',  min: 0, max: 40, step: 1 },
  { key: 'beehives', icon: '🐝', label: 'Beehives', min: 0, max: 12, step: 1 },
  { key: 'trees',    icon: '🌳', label: 'Trees',    min: 0, max: 20, step: 1 },
  { key: 'rocks',    icon: '🪨', label: 'Rocks',    min: 0, max: 20, step: 1 },
  { key: 'ponds',    icon: '💧', label: 'Ponds',    min: 0, max: 6,  step: 1 },
  { key: 'gnomes',   icon: '🧙', label: 'Gnomes',   min: 0, max: 10, step: 1 },
];
const ZEN_CONFIG_DEFAULT = { robots: 6, flowers: 14, beehives: 3, trees: 10, rocks: 6, ponds: 2, gnomes: 2 };

// ---------- Settings ----------
// Each entry is a toggle in the settings modal. Add more here; they render
// automatically and are persisted via save/load.
const SETTING_DEFS = [
  { key: 'showRobotNames', label: 'Show robot names',  hint: 'Display nameplates above each mower.' },
  { key: 'showGnomeNames', label: 'Show gnome names',  hint: 'Display names above visiting gnomes.' },
  { key: 'showParticles',  label: 'Floating numbers',  hint: 'Show +coin pop-ups over the lawn.' },
];
function getSetting(key) {
  if (!state.settings) state.settings = {};
  return state.settings[key];
}

const FUEL_TYPES = [
  { name: 'Benzine',  icon: '⛽', drainMult: 1.00, recharge: 0.0, refuelable: true,  upgradeCost: 2000,  barColor: 'linear-gradient(90deg,#ff8c00,#ffb830)' },
  { name: 'Diesel',   icon: '🛢️', drainMult: 0.75, recharge: 0.0, refuelable: true,  upgradeCost: 8000,  barColor: 'linear-gradient(90deg,#c8a000,#f0c800)' },
  { name: 'Hybrid',   icon: '🔋', drainMult: 0.50, recharge: 0.8, refuelable: true,  upgradeCost: 20000, barColor: 'linear-gradient(90deg,#00b86e,#3affa0)' },
  { name: 'Electric', icon: '⚡', drainMult: 0.25, recharge: 1.5, refuelable: false, upgradeCost: null,  barColor: 'linear-gradient(90deg,#3bd4ff,#72f2ff)' },
];

// ---------- Grass species ----------
// Index 0 is normal; others are unlockable rare species that randomly spawn
// on existing grass tiles. Higher coinMult = more coins per mow unit.
// toughness divides mow rate, so tougher grass takes longer to cut.
// spawnBase is the relative weight before any spawn-rate upgrades.
// Colors: [baseR, baseG, baseB] for the tile tint (blended with grass bucket).
const GRASS_TYPES = [
  { key: 'normal',  name: 'Regular Grass', icon: '🌱',
    coinMult: 1.0, toughness: 1.0, unlockCost: null, spawnBase: 0,
    color: null },
  { key: 'clover',  name: 'Lucky Clover',  icon: '☘️',
    coinMult: 2.2, toughness: 1.6, unlockCost: 3500, spawnBase: 12,
    color: [70, 180, 90] },
  { key: 'thick',   name: 'Thick Turf',    icon: '🌾',
    coinMult: 4.0, toughness: 2.4, unlockCost: 18000, spawnBase: 7,
    color: [120, 160, 40] },
  { key: 'crystal', name: 'Crystal Grass', icon: '💎',
    coinMult: 9.0, toughness: 4.0, unlockCost: 110000, spawnBase: 3,
    color: [120, 230, 255] },
  { key: 'golden',  name: 'Golden Grass',  icon: '🌟',
    coinMult: 22.0, toughness: 7.0, unlockCost: 650000, spawnBase: 1,
    color: [255, 210, 80] },
];
const GRASS_BY_KEY = Object.fromEntries(GRASS_TYPES.map((g, i) => [g.key, { ...g, idx: i }]));
// Cost to bump a species' spawn rate (per level, with growth).
function grassSpawnCost(key) {
  const def = GRASS_BY_KEY[key]; if (!def || !def.unlockCost) return Infinity;
  const lvl = state.grassTypes?.[key]?.spawnLevel ?? 0;
  return Math.ceil(def.unlockCost * 0.4 * Math.pow(1.6, lvl));
}
const GRASS_SPAWN_MAX_LEVEL = 12;

// ---------- Player tools (progressive tiers) ----------
// rateMult multiplies CFG.playerBaseMowRate; radiusTiles is cutting radius in tile units.
const TOOL_TYPES = [
  { name: 'Rusty Scissors',   icon: '🪒', rateMult: 1.0,  radiusTiles: 0.6, upgradeCost: null },
  { name: 'Hedge Shears',     icon: '✂️', rateMult: 2.0,  radiusTiles: 0.8, upgradeCost: 250 },
  { name: 'Push Mower',       icon: '🌾', rateMult: 3.6,  radiusTiles: 1.0, upgradeCost: 1800 },
  { name: 'Electric Trimmer', icon: '⚡', rateMult: 6.0,  radiusTiles: 1.2, upgradeCost: 9000 },
  { name: 'Pro Mower X1',     icon: '🏎️', rateMult: 10.0, radiusTiles: 1.5, upgradeCost: 45000 },
  { name: 'Industrial Beast', icon: '🚜', rateMult: 18.0, radiusTiles: 2.0, upgradeCost: 200000 },
];

const COST = {
  robots:   (n) => Math.ceil(25   * Math.pow(1.45, n - 1)),
  speed:    (n) => Math.ceil(40   * Math.pow(1.35, n)),
  range:    (n) => Math.ceil(60   * Math.pow(1.40, n)),
  value:    (n) => Math.ceil(80   * Math.pow(1.42, n)),
  growth:   (n) => Math.ceil(120  * Math.pow(1.45, n)),
  rate:     (n) => Math.ceil(150  * Math.pow(1.40, n)),
  crit:     (n) => Math.ceil(500  * Math.pow(1.55, n)),
  fuelEff:  (n) => Math.ceil(80   * Math.pow(1.45, n)),
  fuelType: (n) => FUEL_TYPES[n]?.upgradeCost ?? Infinity,
  tool:     (n) => TOOL_TYPES[n + 1]?.upgradeCost ?? Infinity,
};
const MAX = {
  robots: 50, speed: 120, range: 60, value: 120, growth: 80, rate: 80, crit: 40,
  fuelEff: 10, fuelType: 3, tool: TOOL_TYPES.length - 1,
};

const GARDEN_DEFS = [
  { key: 'flower',   type: T.FLOWER,   icon: '🌸', name: 'Flower Bed',
    desc: () => `+${CFG.flowerCoinPerSec} coins/sec each; attracts bees`,
    baseCost: 150,  mult: 1.28, max: 80 },
  { key: 'tree',     type: T.TREE,     icon: '🌳', name: 'Shade Tree',
    desc: () => `+1% grass growth each (shade retains moisture)`,
    baseCost: 500,  mult: 1.40, max: 40 },
  { key: 'rock',     type: T.ROCK,     icon: '🪨', name: 'Garden Rock',
    desc: () => `+0.5% coin value each (hidden treasure!)`,
    baseCost: 250,  mult: 1.32, max: 40 },
  { key: 'pond',     type: T.POND,     icon: '💧', name: 'Koi Pond',
    desc: () => `+3% grass growth each (dew everywhere)`,
    baseCost: 3000, mult: 1.60, max: 10 },
  { key: 'beehive',  type: T.BEEHIVE,  icon: '🐝', name: 'Beehive',
    desc: () => `Spawns ${CFG.beePerHive} bees; each pollination = coins`,
    baseCost: 3000, mult: 1.60, max: 12 },
  { key: 'fountain', type: T.FOUNTAIN, icon: '⛲', name: 'Fountain',
    desc: () => `+8% global coin income each (opulence boost)`,
    baseCost: 10000,mult: 1.75, max: 10 },
  { key: 'shed',     type: T.SHED,     icon: '🏚️', name: 'Garden Shed',
    desc: () => `+5% robot speed each (tune-ups!)`,
    baseCost: 4000, mult: 1.55, max: 15 },
  { key: 'gnome',    type: T.GNOME,    icon: '🧙', name: 'Garden Gnome',
    desc: () => `+1% crit chance each (mischievous luck)`,
    baseCost: 1800, mult: 1.50, max: 20 },
];
const GARDEN_BY_KEY = Object.fromEntries(GARDEN_DEFS.map(d => [d.key, d]));
function gardenCost(key) {
  const def = GARDEN_BY_KEY[key];
  return Math.ceil(def.baseCost * Math.pow(def.mult, state.garden[key]));
}

// ---------- Crew skill tree ----------
// 3-tier tree, each node unlocks once (no levels). (col is 0..2 for rendering)
const SKILL_TREE = [
  { id: 'foreman',    tier: 0, col: 1, icon: '👷', name: 'Hire Foreman',    crewName: 'Big Ron',
    desc: 'Recruit your first hand. +5% robot speed.',
    cost: 1200, req: null },

  { id: 'mechanic',   tier: 1, col: 0, icon: '🧰', name: 'Apprentice Mechanic', crewName: 'Grease McFix',
    desc: 'Refuel costs -25% and drain -5%.',
    cost: 3500, req: 'foreman' },
  { id: 'keenEye',    tier: 1, col: 1, icon: '👁️', name: 'Keen Eye',           crewName: 'Eagle-Eye Brenda',
    desc: 'Gnomes visit 35% more often · +60% skin drop chance.',
    cost: 4500, req: 'foreman' },
  { id: 'qualityControl', tier: 1, col: 2, icon: '🎯', name: 'Quality Control', crewName: 'Picky Patricia',
    desc: '+4% crit chance (stacks with gnomes).',
    cost: 5000, req: 'foreman' },

  { id: 'autoRefuel', tier: 2, col: 0, icon: '⛽', name: 'Auto-Refueler',      crewName: 'Nozzle Dave',
    desc: 'Automatically refuel when fuel hits 25%.',
    cost: 12000, req: 'mechanic' },
  { id: 'scout',      tier: 2, col: 1, icon: '🔍', name: 'Treasure Scout',     crewName: 'Sneaky Steve',
    desc: 'Auto-collects gnome treasures after 8s.',
    cost: 15000, req: 'keenEye' },
  { id: 'efficiency', tier: 2, col: 2, icon: '⚙️', name: 'Efficiency Expert',  crewName: 'Spreadsheet Karen',
    desc: '+20% mow rate and +10% global coin income.',
    cost: 18000, req: 'qualityControl' },
];
const SKILL_BY_ID = Object.fromEntries(SKILL_TREE.map(s => [s.id, s]));
function hasCrew(id) { return state.crew && state.crew.indexOf(id) >= 0; }
function crewUnlockable(id) {
  const s = SKILL_BY_ID[id]; if (!s) return false;
  if (hasCrew(id)) return false;
  if (s.req && !hasCrew(s.req)) return false;
  return true;
}

// ---------- Mower skins ----------
const SKIN_DEFS = [
  { key: 'default', name: 'Classic Orange', rarity: 'base',
    body: ['#ff7a2e', '#c0421a'], trim: '#1a1a1a', accent: '#ff4a4a', panel: '#58ffa0' },
  { key: 'cherry',  name: 'Cherry Blaze', rarity: 'common',
    body: ['#ff3b5a', '#7c0e1f'], trim: '#2a0a0f', accent: '#ffd34e', panel: '#fff1c4' },
  { key: 'sky',     name: 'Sky Patrol', rarity: 'common',
    body: ['#5ccaff', '#1e6fa3'], trim: '#0a1a25', accent: '#ffd34e', panel: '#e9fbe7' },
  { key: 'forest',  name: 'Forest Ranger', rarity: 'uncommon',
    body: ['#58c85f', '#1e5d2c'], trim: '#0a1f12', accent: '#ffd34e', panel: '#8ff09e' },
  { key: 'neon',    name: 'Neon Rave', rarity: 'rare',
    body: ['#b94dff', '#3b1565'], trim: '#0f0322', accent: '#58ffa0', panel: '#72f2ff' },
  { key: 'stealth', name: 'Stealth Mk.II', rarity: 'rare',
    body: ['#3a3f45', '#0e1014'], trim: '#000000', accent: '#d0d3d9', panel: '#72f2ff' },
  { key: 'gold',    name: 'Gold Plated', rarity: 'epic',
    body: ['#ffe15a', '#b8860b'], trim: '#5a3a1e', accent: '#ff3333', panel: '#fff1c4' },
  { key: 'rainbow', name: 'Rainbow Runner', rarity: 'legendary',
    body: ['rainbow'], trim: '#1a1a1a', accent: '#ffffff', panel: '#ffffff' },
];
const SKIN_BY_KEY = Object.fromEntries(SKIN_DEFS.map(s => [s.key, s]));
const RARITY_COLORS = {
  base:      '#9fc4a2',
  common:    '#c6d4c8',
  uncommon:  '#5ccaff',
  rare:      '#b94dff',
  epic:      '#ffd34e',
  legendary: '#ff6bcf',
};
function skinDropChance() {
  return CFG.treasureSkinChance * (hasCrew('keenEye') ? 1.6 : 1);
}
function gnomeSpawnIntervalMult() {
  return hasCrew('keenEye') ? 1 / 1.35 : 1;
}

// ---------- Derived values ----------
function gemMult()      { return 1 + state.gems * 0.10; }
function activeFuelType(){ return FUEL_TYPES[state.upgrades.fuelType] || FUEL_TYPES[0]; }
function isElectric()   { return !activeFuelType().refuelable; }
function fuelEffMult()  {
  const mechanic = hasCrew('mechanic') ? 0.95 : 1;
  return Math.max(0.1, (1 - state.upgrades.fuelEff * 0.08) * mechanic);
}
function fuelDrainRate(){ return CFG.fuelDrainBase * state.upgrades.robots * fuelEffMult() * activeFuelType().drainMult; }
function fuelRefillCost(){
  const mechanicDisc = hasCrew('mechanic') ? 0.75 : 1;
  return Math.ceil(25 * state.upgrades.robots * fuelEffMult() * mechanicDisc);
}
function shedMult()    { return 1 + state.garden.shed * 0.05; }
function fountainMult(){ return 1 + state.garden.fountain * 0.08; }
function rockMult()    { return 1 + state.garden.rock * 0.005; }
function treeGrowth()  { return state.garden.tree * 0.01 + state.garden.pond * 0.03; }
function gnomeCritBonus(){ return state.garden.gnome * 0.01; }
function crewSpeedMult(){ return hasCrew('foreman') ? 1.05 : 1; }
function crewCoinMult(){ return hasCrew('efficiency') ? 1.10 : 1; }
function crewMowRateMult(){ return hasCrew('efficiency') ? 1.20 : 1; }
function crewCritBonus(){ return hasCrew('qualityControl') ? 0.04 : 0; }

function robotSpeed()  { return CFG.mowSpeedBase * (1 + state.upgrades.speed * 0.10) * shedMult() * crewSpeedMult(); }
function mowRadius()   { return CFG.mowRadiusBase * (1 + state.upgrades.range * 0.08); }
function coinMult()    { return (1 + state.upgrades.value * 0.15) * gemMult() * fountainMult() * rockMult() * crewCoinMult(); }
function growthRate()  { return CFG.growthRateBase * (1 + state.upgrades.growth * 0.12 + treeGrowth()); }
function mowRate()     { return CFG.mowRateBase * (1 + state.upgrades.rate * 0.15) * crewMowRateMult(); }
function critChance()  { return Math.min(0.75, state.upgrades.crit * 0.02 + gnomeCritBonus() + crewCritBonus()); }
function critMult()    { return 5; }

function activeTool()  { return TOOL_TYPES[state.upgrades.tool] || TOOL_TYPES[0]; }
function playerMowRate()   { return CFG.playerBaseMowRate * activeTool().rateMult * crewMowRateMult(); }
function playerMowRadius() { return tileSize * activeTool().radiusTiles; }

// ---------- Formatting ----------
const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
function formatShort(n) {
  if (!isFinite(n)) return '∞';
  if (n > 0 && n < 1) return n.toFixed(2);
  if (n < 10)  return n.toFixed(1).replace(/\.0$/, '');
  if (n < 1000) return (n | 0).toString();
  let i = 0;
  while (n >= 1000 && i < SUFFIX.length - 1) { n /= 1000; i++; }
  return n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0) + SUFFIX[i];
}

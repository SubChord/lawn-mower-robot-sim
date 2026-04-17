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
  },
  garden: {
    tree: 0, rock: 0, pond: 0, flower: 0, beehive: 0, fountain: 0, shed: 0, gnome: 0,
  },
};

const COST = {
  robots:  (n) => Math.ceil(25   * Math.pow(1.45, n - 1)),
  speed:   (n) => Math.ceil(40   * Math.pow(1.35, n)),
  range:   (n) => Math.ceil(60   * Math.pow(1.40, n)),
  value:   (n) => Math.ceil(80   * Math.pow(1.42, n)),
  growth:  (n) => Math.ceil(120  * Math.pow(1.45, n)),
  rate:    (n) => Math.ceil(150  * Math.pow(1.40, n)),
  crit:    (n) => Math.ceil(500  * Math.pow(1.55, n)),
};
const MAX = {
  robots: 50, speed: 120, range: 60, value: 120, growth: 80, rate: 80, crit: 40,
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

// ---------- Derived values ----------
function gemMult()     { return 1 + state.gems * 0.10; }
function shedMult()    { return 1 + state.garden.shed * 0.05; }
function fountainMult(){ return 1 + state.garden.fountain * 0.08; }
function rockMult()    { return 1 + state.garden.rock * 0.005; }
function treeGrowth()  { return state.garden.tree * 0.01 + state.garden.pond * 0.03; }
function gnomeCritBonus(){ return state.garden.gnome * 0.01; }

function robotSpeed()  { return CFG.mowSpeedBase * (1 + state.upgrades.speed * 0.10) * shedMult(); }
function mowRadius()   { return CFG.mowRadiusBase * (1 + state.upgrades.range * 0.08); }
function coinMult()    { return (1 + state.upgrades.value * 0.15) * gemMult() * fountainMult() * rockMult(); }
function growthRate()  { return CFG.growthRateBase * (1 + state.upgrades.growth * 0.12 + treeGrowth()); }
function mowRate()     { return CFG.mowRateBase * (1 + state.upgrades.rate * 0.15); }
function critChance()  { return Math.min(0.75, state.upgrades.crit * 0.02 + gnomeCritBonus()); }
function critMult()    { return 5; }

// ---------- Formatting ----------
const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
function formatShort(n) {
  if (!isFinite(n)) return '∞';
  if (n < 1000) return (n | 0).toString();
  let i = 0;
  while (n >= 1000 && i < SUFFIX.length - 1) { n /= 1000; i++; }
  return n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0) + SUFFIX[i];
}

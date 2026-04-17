/* ============================================================
   LAWNBOT TYCOON — config / constants
   ============================================================ */

const CFG = {
  gridW: 48,
  gridH: 30,
  growthRateBase: 0.013,
  mowSpeedBase: 90,
  mowRadiusBase: 14,
  mowRateBase: 1.6,
  coinPerUnitBase: 1.0,
  targetRecheck: 0.35,
  maxParticles: 260,
  prestigeThreshold: 10000,
  prestigeFormula: (totalThisRun) => Math.floor(Math.pow(totalThisRun / 2500, 0.55)),
  beePerHive: 3,
  beeSpeed: 80,
  flowerCoinPerSec: 0.35,
  beeRewardPerVisit: 2.2,
  beeVisitDuration: 0.55,
  fuelDrainBase: 0.25,  // fuel per robot per second (benzine)
  fuelMax: 100,
  gnomeSpawnMin: 75,   // seconds between wandering gnome visits (min)
  gnomeSpawnMax: 180,  // seconds between wandering gnome visits (max)
  gnomeWalkSpeed: 34,  // px/sec
  gnomeDigDuration: 2.2,
  treasureLifetime: 75, // seconds before a treasure vanishes
  treasureSkinChance: 0.045, // 4.5% chance a treasure contains a skin
  scoutAutoDelay: 8,   // seconds scout employee waits before grabbing
  playerBaseRadiusTiles: 0.6, // starter-tool cutting radius, in tile units
  playerBaseMowRate: 2.4,     // grass units/sec cut by the starter tool
};

// Tile types
const T = {
  GRASS: 0, TREE: 1, ROCK: 2, POND: 3, FLOWER: 4,
  BEEHIVE: 5, FOUNTAIN: 6, SHED: 7, GNOME: 8,
};
const OBSTACLE = new Set([T.TREE, T.ROCK, T.POND, T.FLOWER, T.BEEHIVE, T.FOUNTAIN, T.SHED, T.GNOME]);

const FLOWER_PALETTE = [
  ['#ff7fb4', '#ffe24b'],
  ['#ffd447', '#ff7a1f'],
  ['#b07bff', '#ffffff'],
  ['#ff3f56', '#ffe45a'],
  ['#ffffff', '#ffe24b'],
  ['#ff9f1c', '#fff1cf'],
];

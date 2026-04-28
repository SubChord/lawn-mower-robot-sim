// ===== AUTO-IMPORTS =====
import { state } from './state.js';
// ===== END AUTO-IMPORTS =====

/* ============================================================
   SKILL TREE — PoE-style passive tree
   Replaces the legacy Bots / Tools / Crew tabs with a single
   ~120-node passive tree the player allocates SP into.

   Effect model:
     treeMult(stat)        Π over allocated nodes of (1 + value)
     treeAdd(stat)         Σ over allocated nodes of value
     hasNode(flagId)       boolean — drives feature toggles
     nodeRank(tierKey)     count of allocated tier nodes for that key
     treeOfflineMult(stat) like treeMult but ignores `conditional` nodes
   ============================================================ */

// ---------- SP economy ----------
// Milestone tier: every TILE_PER_SP tiles mowed lifetime grants +1 SP.
const TILE_PER_SP = 2500;
// Damped sqrt curve so big late-game prestiges don't dump 200 SP at once.
function prestigeSPGain(gemsThisPrestige) {
  if (!gemsThisPrestige || gemsThisPrestige <= 0) return 0;
  return Math.floor(Math.sqrt(gemsThisPrestige) * 2);
}

function ensureSkillTreeShape() {
  if (!state.skillTree || typeof state.skillTree !== 'object') {
    state.skillTree = { allocated: [], milestoneSP: 0, prestigeSP: 0, lastAllocated: null };
  }
  if (!Array.isArray(state.skillTree.allocated)) state.skillTree.allocated = [];
  if (!isFinite(state.skillTree.milestoneSP)) state.skillTree.milestoneSP = 0;
  if (!isFinite(state.skillTree.prestigeSP))  state.skillTree.prestigeSP = 0;
  if (state.skillTree.lastAllocated === undefined) state.skillTree.lastAllocated = null;
}

// Hooked from ai.js whenever totalTilesMowed crosses a TILE_PER_SP boundary.
function recordTileMowed(prev, next) {
  ensureSkillTreeShape();
  const before = Math.floor((prev || 0) / TILE_PER_SP);
  const after  = Math.floor((next || 0) / TILE_PER_SP);
  const delta = after - before;
  if (delta > 0) state.skillTree.milestoneSP += delta;
}

// Recompute milestoneSP from scratch — used on save migration.
function recomputeMilestoneSP() {
  ensureSkillTreeShape();
  state.skillTree.milestoneSP = Math.floor((state.totalTilesMowed || 0) / TILE_PER_SP);
}

function awardPrestigeSP(gemsGained) {
  ensureSkillTreeShape();
  state.skillTree.prestigeSP += prestigeSPGain(gemsGained);
}

// One-time bonuses: repurposed gem `startTool` now grants 2 SP/lvl, ruby
// `startCrew` grants 5 SP/lvl. Both feed into prestigeSP at fresh-run init.
function startingSPFromOrphans(gemStartTool, rubyStartCrew) {
  return (gemStartTool || 0) * 2 + (rubyStartCrew || 0) * 5;
}

function getSpentSP() { ensureSkillTreeShape(); return state.skillTree.allocated.length; }
function getTotalSP() { ensureSkillTreeShape(); return state.skillTree.milestoneSP + state.skillTree.prestigeSP; }
function getAvailableSP() { return getTotalSP() - getSpentSP(); }

// ---------- Branch DSL ----------
// Each branch radiates from the Start node at a polar angle. Rings are
// concentric distances. Ring entries are turned into nodes by buildSkillTree().
//
// Ring entry shapes:
//   { kind:'small',    stat, op:'mult'|'add', value, desc }
//   { kind:'notable',  name, icon, effects:[{stat,op,value}], desc, flagId?, drawback?, conditional? }
//   { kind:'keystone', name, icon, effects, desc, drawback, conditional? }
//   { kind:'tier',     tierKey, name, icon, effects, desc }
//   { kind:'flag',     flagId, name, icon, desc, effects? }
//
// Notables/keystones may also set flagId to expose a hasNode() switch.

const BRANCHES = [
  // ---------- MOW: speed, mow rate, robots, fuel basics ----------
  {
    id: 'mow', name: 'Mow', icon: '⚡', color: '#7df09e', angle: -90,
    rings: [
      { kind: 'small',   stat: 'mowSpeed', op: 'mult', value: 0.04, desc: '+4% robot move speed' },
      { kind: 'small',   stat: 'mowRate',  op: 'mult', value: 0.04, desc: '+4% mow rate' },
      { kind: 'small',   stat: 'mowSpeed', op: 'mult', value: 0.04, desc: '+4% robot move speed' },
      { kind: 'small',   stat: 'mowRate',  op: 'mult', value: 0.05, desc: '+5% mow rate' },
      { kind: 'notable', name: 'Tuned Engines', icon: '🔧',
        effects: [{ stat: 'mowSpeed', op: 'mult', value: 0.10 }, { stat: 'mowRate', op: 'mult', value: 0.10 }],
        desc: '+10% robot speed AND +10% mow rate' },
      { kind: 'small',   stat: 'mowSpeed', op: 'mult', value: 0.05, desc: '+5% robot move speed' },
      { kind: 'small',   stat: 'mowRate',  op: 'mult', value: 0.06, desc: '+6% mow rate' },
      { kind: 'small',   stat: 'robots',   op: 'add',  value: 1,    desc: '+1 robot' },
      { kind: 'small',   stat: 'mowSpeed', op: 'mult', value: 0.06, desc: '+6% robot move speed' },
      { kind: 'small',   stat: 'mowRate',  op: 'mult', value: 0.06, desc: '+6% mow rate' },
      { kind: 'notable', name: 'Whirlwind', icon: '🌀',
        effects: [{ stat: 'mowRate', op: 'mult', value: 0.20 }],
        desc: '+20% mow rate' },
      { kind: 'small',   stat: 'mowSpeed', op: 'mult', value: 0.07, desc: '+7% robot move speed' },
      { kind: 'small',   stat: 'mowRate',  op: 'mult', value: 0.07, desc: '+7% mow rate' },
      { kind: 'small',   stat: 'robots',   op: 'add',  value: 1,    desc: '+1 robot' },
      { kind: 'keystone', name: 'Workaholic', icon: '🤖', flagId: 'workaholic',
        effects: [
          { stat: 'mowSpeed',  op: 'mult', value: 0.40 },
          { stat: 'mowRate',   op: 'mult', value: 0.40 },
          { stat: 'fuelDrain', op: 'mult', value: 1.00 },
        ],
        drawback: 'Fuel drains 2× faster',
        desc: '+40% speed AND +40% mow rate · drawback: fuel drains 2× faster' },
    ],
  },

  // ---------- YIELD: coin value, crit ----------
  {
    id: 'yield', name: 'Yield', icon: '💰', color: '#ffd34e', angle: -30,
    rings: [
      { kind: 'small', stat: 'coinValue',  op: 'mult', value: 0.05,  desc: '+5% coin value' },
      { kind: 'small', stat: 'critChance', op: 'add',  value: 0.01,  desc: '+1% crit chance' },
      { kind: 'small', stat: 'coinValue',  op: 'mult', value: 0.05,  desc: '+5% coin value' },
      { kind: 'small', stat: 'critChance', op: 'add',  value: 0.01,  desc: '+1% crit chance' },
      { kind: 'notable', name: 'Golden Clippings', icon: '✨',
        effects: [{ stat: 'coinValue', op: 'mult', value: 0.20 }],
        desc: '+20% coin value' },
      { kind: 'small', stat: 'coinValue',  op: 'mult', value: 0.06,  desc: '+6% coin value' },
      { kind: 'small', stat: 'critChance', op: 'add',  value: 0.015, desc: '+1.5% crit chance' },
      { kind: 'small', stat: 'coinValue',  op: 'mult', value: 0.06,  desc: '+6% coin value' },
      { kind: 'small', stat: 'critChance', op: 'add',  value: 0.015, desc: '+1.5% crit chance' },
      { kind: 'small', stat: 'coinValue',  op: 'mult', value: 0.07,  desc: '+7% coin value' },
      { kind: 'notable', name: 'Eagle Eye', icon: '🎯',
        effects: [{ stat: 'critChance', op: 'add', value: 0.05 }],
        desc: '+5% crit chance' },
      { kind: 'small', stat: 'coinValue',  op: 'mult', value: 0.07,  desc: '+7% coin value' },
      { kind: 'small', stat: 'critChance', op: 'add',  value: 0.02,  desc: '+2% crit chance' },
      { kind: 'small', stat: 'coinValue',  op: 'mult', value: 0.08,  desc: '+8% coin value' },
      { kind: 'keystone', name: 'Glass Cannon', icon: '💥', conditional: true,
        effects: [{ stat: 'critChance', op: 'add', value: 0.25 }, { stat: 'coinValue', op: 'mult', value: -0.25 }],
        drawback: 'Base coin value -25%',
        desc: '+25% crit chance · drawback: base coin value -25%' },
    ],
  },

  // ---------- TOOLS: player rate / radius / robot radius / tool tier ----------
  {
    id: 'tools', name: 'Tools', icon: '🛠️', color: '#c896ff', angle: 30,
    rings: [
      { kind: 'small', stat: 'playerRate',   op: 'mult', value: 0.10, desc: '+10% player mow rate' },
      { kind: 'small', stat: 'playerRadius', op: 'mult', value: 0.05, desc: '+5% player mow radius' },
      { kind: 'small', stat: 'mowRadius',    op: 'mult', value: 0.04, desc: '+4% robot cut radius' },
      { kind: 'small', stat: 'playerRate',   op: 'mult', value: 0.12, desc: '+12% player mow rate' },
      { kind: 'tier',  tierKey: 'tool', name: 'Tool Tier ↑', icon: '✂️',
        effects: [{ stat: 'playerRate', op: 'mult', value: 0.50 }, { stat: 'playerRadius', op: 'mult', value: 0.15 }],
        desc: 'Upgrade hand tool: +50% rate AND +15% radius' },
      { kind: 'small', stat: 'mowRadius',    op: 'mult', value: 0.05, desc: '+5% robot cut radius' },
      { kind: 'small', stat: 'playerRate',   op: 'mult', value: 0.15, desc: '+15% player mow rate' },
      { kind: 'small', stat: 'playerRadius', op: 'mult', value: 0.06, desc: '+6% player mow radius' },
      { kind: 'tier',  tierKey: 'tool', name: 'Tool Tier ↑', icon: '✂️',
        effects: [{ stat: 'playerRate', op: 'mult', value: 0.60 }, { stat: 'playerRadius', op: 'mult', value: 0.18 }],
        desc: 'Upgrade hand tool: +60% rate AND +18% radius' },
      { kind: 'notable', name: 'Wide Blades', icon: '📏',
        effects: [{ stat: 'mowRadius', op: 'mult', value: 0.20 }],
        desc: '+20% robot cutting radius' },
      { kind: 'small', stat: 'playerRate',   op: 'mult', value: 0.18, desc: '+18% player mow rate' },
      { kind: 'small', stat: 'playerRadius', op: 'mult', value: 0.08, desc: '+8% player mow radius' },
      { kind: 'tier',  tierKey: 'tool', name: 'Tool Tier ↑', icon: '🚜',
        effects: [{ stat: 'playerRate', op: 'mult', value: 0.80 }, { stat: 'playerRadius', op: 'mult', value: 0.22 }],
        desc: 'Top-tier hand tool: +80% rate AND +22% radius' },
      { kind: 'small', stat: 'mowRadius',    op: 'mult', value: 0.07, desc: '+7% robot cut radius' },
      { kind: 'keystone', name: 'Long Reach', icon: '🦾',
        effects: [
          { stat: 'mowRadius',    op: 'mult', value: 0.50 },
          { stat: 'playerRadius', op: 'mult', value: 0.50 },
          { stat: 'mowRate',      op: 'mult', value: -0.20 },
        ],
        drawback: 'Mow rate -20%',
        desc: '+50% radius (robots and player) · drawback: mow rate -20%' },
    ],
  },

  // ---------- HAZARDS: fuel, moles, gnomes, weather, treasure ----------
  // Includes legacy crew flagIds for behavior compatibility (autoRefuel, etc.)
  {
    id: 'hazards', name: 'Hazards', icon: '🛡️', color: '#5ccaff', angle: 90,
    rings: [
      { kind: 'small', stat: 'fuelEff',      op: 'mult', value: 0.05,  desc: '-5% fuel use' },
      { kind: 'small', stat: 'moleInterval', op: 'mult', value: 0.10,  desc: '+10% time between moles' },
      { kind: 'small', stat: 'fuelEff',      op: 'mult', value: 0.05,  desc: '-5% fuel use' },
      { kind: 'small', stat: 'moleLifetime', op: 'mult', value: -0.08, desc: '-8% mole hole lifetime' },
      { kind: 'notable', name: 'Foreman', icon: '👷', flagId: 'foreman', crewName: 'Big Ron',
        effects: [{ stat: 'mowSpeed', op: 'mult', value: 0.05 }, { stat: 'fuelEff', op: 'mult', value: 0.10 }],
        desc: '+5% robot speed AND -10% fuel use (Big Ron joins your crew)' },
      { kind: 'small', stat: 'fuelEff',      op: 'mult', value: 0.06,  desc: '-6% fuel use' },
      { kind: 'small', stat: 'moleInterval', op: 'mult', value: 0.15,  desc: '+15% time between moles' },
      { kind: 'tier', tierKey: 'fuelType', name: 'Better Fuel', icon: '⛽',
        effects: [{ stat: 'fuelDrain', op: 'mult', value: -0.20 }],
        desc: 'Upgrade fuel type: -20% fuel drain (cumulative)' },
      { kind: 'small', stat: 'moleLifetime', op: 'mult', value: -0.10, desc: '-10% mole hole lifetime' },
      { kind: 'notable', name: 'Mechanic', icon: '🧰', flagId: 'mechanic', crewName: 'Grease McFix',
        effects: [{ stat: 'fuelEff', op: 'mult', value: 0.15 }, { stat: 'fuelDrain', op: 'mult', value: -0.05 }],
        desc: '+15% fuel efficiency AND -5% fuel drain (Grease joins your crew)' },
      { kind: 'flag',   flagId: 'autoRefuel', name: 'Auto-Refueler', icon: '⛽', crewName: 'Nozzle Dave',
        desc: 'Robots auto-refuel when fuel hits 25%' },
      { kind: 'notable', name: 'Mole Warden', icon: '🐹', flagId: 'moleWarden', crewName: 'Burrow Bob',
        effects: [{ stat: 'moleInterval', op: 'mult', value: 1.0 }, { stat: 'moleLifetime', op: 'mult', value: -0.50 }],
        desc: 'Moles appear half as often AND last 50% shorter' },
      { kind: 'tier', tierKey: 'fuelType', name: 'Better Fuel', icon: '🔋',
        effects: [{ stat: 'fuelDrain', op: 'mult', value: -0.25 }],
        desc: 'Upgrade fuel type: -25% fuel drain (cumulative)' },
      { kind: 'flag',   flagId: 'scout', name: 'Treasure Scout', icon: '🔍', crewName: 'Sneaky Steve',
        desc: 'Auto-collects gnome treasures after 8s' },
      { kind: 'flag',   flagId: 'keenEye', name: 'Keen Eye', icon: '👁️', crewName: 'Eagle-Eye Brenda',
        desc: 'Gnomes visit 35% more often · +60% skin/pattern drop chance' },
      { kind: 'tier', tierKey: 'fuelType', name: 'Electric', icon: '⚡',
        effects: [{ stat: 'fuelDrain', op: 'mult', value: -0.50 }],
        desc: 'Top-tier electric: -50% fuel drain' },
      { kind: 'keystone', name: 'Off the Grid', icon: '🔌', flagId: 'offGrid',
        effects: [{ stat: 'fuelDrain', op: 'mult', value: -0.80 }, { stat: 'mowSpeed', op: 'mult', value: -0.10 }],
        drawback: 'Robot speed -10%',
        desc: '-80% fuel drain · drawback: robot speed -10%' },
    ],
  },

  // ---------- GARDEN: growth, garden synergies, flowers/bees ----------
  {
    id: 'garden', name: 'Garden', icon: '🌱', color: '#ffb6ef', angle: 150,
    rings: [
      { kind: 'small', stat: 'growthRate', op: 'mult', value: 0.05,  desc: '+5% grass growth' },
      { kind: 'small', stat: 'growthRate', op: 'mult', value: 0.05,  desc: '+5% grass growth' },
      { kind: 'small', stat: 'flowerYield', op: 'mult', value: 0.08, desc: '+8% flower coin/sec' },
      { kind: 'small', stat: 'growthRate', op: 'mult', value: 0.06,  desc: '+6% grass growth' },
      { kind: 'notable', name: 'Sprinkler Tech', icon: '💧', flagId: 'sprinkler', crewName: 'Drizzle Doug',
        effects: [{ stat: 'growthRate', op: 'mult', value: 0.15 }],
        desc: '+15% grass growth' },
      { kind: 'small', stat: 'flowerYield', op: 'mult', value: 0.10, desc: '+10% flower coin/sec' },
      { kind: 'small', stat: 'beeYield',    op: 'mult', value: 0.08, desc: '+8% bee yield' },
      { kind: 'small', stat: 'growthRate', op: 'mult', value: 0.07,  desc: '+7% grass growth' },
      { kind: 'small', stat: 'flowerYield', op: 'mult', value: 0.10, desc: '+10% flower coin/sec' },
      { kind: 'notable', name: 'Head Gardener', icon: '🌻', flagId: 'headGardener', crewName: 'Flora Faye',
        effects: [{ stat: 'growthRate', op: 'mult', value: 0.30 }],
        desc: '+30% grass growth (stacks with Sprinkler Tech)' },
      { kind: 'small', stat: 'beeYield', op: 'mult', value: 0.12, desc: '+12% bee yield' },
      { kind: 'small', stat: 'growthRate', op: 'mult', value: 0.08, desc: '+8% grass growth' },
      { kind: 'small', stat: 'flowerYield', op: 'mult', value: 0.12, desc: '+12% flower coin/sec' },
      { kind: 'notable', name: 'Quality Control', icon: '✅', flagId: 'qualityControl', crewName: 'Picky Patricia',
        effects: [{ stat: 'critChance', op: 'add', value: 0.04 }, { stat: 'coinValue', op: 'mult', value: 0.10 }],
        desc: '+4% crit chance AND +10% coin value' },
      { kind: 'small', stat: 'growthRate', op: 'mult', value: 0.10, desc: '+10% grass growth' },
      { kind: 'keystone', name: 'Hive Mind', icon: '🐝',
        effects: [{ stat: 'beeYield', op: 'mult', value: 1.50 }, { stat: 'flowerYield', op: 'mult', value: -0.30 }],
        drawback: 'Flower income -30%',
        desc: '+150% bee yield · drawback: flower income -30%' },
    ],
  },

  // ---------- FLEET: efficiency, robot count, cooperative bots ----------
  {
    id: 'fleet', name: 'Fleet', icon: '🤖', color: '#ff8a3d', angle: 210,
    rings: [
      { kind: 'small', stat: 'mowRate',  op: 'mult', value: 0.05, desc: '+5% mow rate' },
      { kind: 'small', stat: 'fuelEff',  op: 'mult', value: 0.04, desc: '-4% fuel use' },
      { kind: 'small', stat: 'mowSpeed', op: 'mult', value: 0.05, desc: '+5% robot speed' },
      { kind: 'small', stat: 'robots',   op: 'add',  value: 1, desc: '+1 robot' },
      { kind: 'notable', name: 'Refill Pro', icon: '⛽',
        effects: [{ stat: 'refillDisc', op: 'mult', value: 0.25 }],
        desc: 'Refueling costs 25% less' },
      { kind: 'small', stat: 'mowRate',  op: 'mult', value: 0.06, desc: '+6% mow rate' },
      { kind: 'small', stat: 'robots',   op: 'add',  value: 1, desc: '+1 robot' },
      { kind: 'small', stat: 'mowSpeed', op: 'mult', value: 0.06, desc: '+6% robot speed' },
      { kind: 'small', stat: 'fuelEff',  op: 'mult', value: 0.06, desc: '-6% fuel use' },
      { kind: 'notable', name: 'Efficiency Expert', icon: '⚙️', flagId: 'efficiency', crewName: 'Spreadsheet Karen',
        effects: [{ stat: 'mowRate', op: 'mult', value: 0.20 }, { stat: 'coinValue', op: 'mult', value: 0.10 }],
        desc: '+20% mow rate AND +10% coin income' },
      { kind: 'small', stat: 'robots',   op: 'add',  value: 1, desc: '+1 robot' },
      { kind: 'small', stat: 'mowRate',  op: 'mult', value: 0.08, desc: '+8% mow rate' },
      { kind: 'small', stat: 'mowSpeed', op: 'mult', value: 0.08, desc: '+8% robot speed' },
      { kind: 'small', stat: 'robots',   op: 'add',  value: 1, desc: '+1 robot' },
      { kind: 'small', stat: 'mowRate',  op: 'mult', value: 0.10, desc: '+10% mow rate' },
      { kind: 'small', stat: 'robots',   op: 'add',  value: 1, desc: '+1 robot' },
      { kind: 'keystone', name: 'Swarm', icon: '🐜',
        effects: [{ stat: 'robots', op: 'add', value: 5 }, { stat: 'mowRate', op: 'mult', value: -0.20 }],
        drawback: 'Per-robot mow rate -20%',
        desc: '+5 robots · drawback: per-robot mow rate -20%' },
    ],
  },
];

// ---------- Layout / build ----------
// The tree lays out as 6 triangular "fans" radiating from a central Start
// node, one fan per branch. Each fan is a hex-grid triangle: depth-1 row has
// 1 node, depth-2 row has 2, depth-3 has 3, etc. Each branch's rings array is
// poured into this triangle in row-major order (innermost → outermost,
// left→right within a row), so small +stat nodes sit near Start, notables
// fall in the middle rows, and keystones land on the outer edge of their fan.
//
// Connections form a real web rather than a single chain:
//   • Each node connects to up to 2 "parent" nodes one row inward.
//   • Each node connects to its lateral siblings on the same row.
//   • Innermost-row nodes connect to Start.
//   • Boundary nodes (leftmost / rightmost of their row) cross-link to the
//     mirroring boundary node of the adjacent branch's fan, stitching the
//     fans together along their shared sector edges.
// Result: every node has 2-4 neighbours (interior up to 4-6).
const CENTER_X = 0;
const CENTER_Y = 0;
const FAN_R0 = 130;          // radial distance to row 1 of every branch
const FAN_DR = 112;          // radial distance between successive rows
const FAN_SPACING = 130;     // lateral spacing between siblings within a row

// Triangular-row layout: ring index i in the branch's flat list maps to
// (depth d, position k) where d is 1-indexed and k is 0-indexed within row.
// Row d holds d nodes; cumulative count after row d is d(d+1)/2. We allow
// "overflow" rows past the perfect triangle so branches with more rings than
// a clean triangle (e.g. 17) just extend one more partial row.
function tri(idx) {
  let d = 1, count = 0;
  while (count + d <= idx) { count += d; d++; }
  return { depth: d, pos: idx - count };
}

function buildSkillTree() {
  const nodes = [];
  nodes.push({
    id: 'start', name: 'Start', icon: '🌳', desc: 'Where your story begins.',
    kind: 'start', x: CENTER_X, y: CENTER_Y, branchId: null,
    depth: 0, pos: 0,
    effects: [], conn: [], flagId: null, tierKey: null,
  });

  // Capacity of the perfect triangle in each branch — rings beyond this go
  // into a partial overflow row that still follows the same lattice.
  BRANCHES.forEach((branch) => {
    const rad = branch.angle * Math.PI / 180;
    const cosA = Math.cos(rad), sinA = Math.sin(rad);
    // Perpendicular unit vector (rotate radial by +90°).
    const pCosA = -sinA, pSinA = cosA;

    branch.rings.forEach((ring, i) => {
      const { depth, pos } = tri(i);
      // Width of this depth row = `depth` slots; centre them around 0 in the
      // perpendicular axis. Even-depth rows are offset by half a slot to the
      // right so consecutive rows interlock like a hex grid (staggered).
      const radial = FAN_R0 + (depth - 1) * FAN_DR;
      const lateral = FAN_SPACING * (pos - (depth - 1) / 2);
      const id = `${branch.id}_${i}`;
      const node = {
        id,
        branchId: branch.id,
        branchName: branch.name,
        branchColor: branch.color,
        depth, pos,
        x: CENTER_X + cosA * radial + pCosA * lateral,
        y: CENTER_Y + sinA * radial + pSinA * lateral,
        kind: ring.kind,
        name: ring.name || `${branch.name}: ${ring.desc}`,
        icon: ring.icon || branch.icon,
        desc: ring.desc,
        crewName: ring.crewName || null,
        drawback: ring.drawback || null,
        conditional: !!ring.conditional,
        tierKey: ring.tierKey || null,
        flagId: ring.flagId || null,
        effects: ring.effects || (ring.stat ? [{ stat: ring.stat, op: ring.op, value: ring.value }] : []),
        conn: [],
      };
      nodes.push(node);
    });
  });

  // ---------- Edges ----------
  const seen = new Set();
  const tryLink = (idA, idB) => {
    if (idA === idB) return;
    const key = idA < idB ? idA + '|' + idB : idB + '|' + idA;
    if (seen.has(key)) return;
    const nodeA = nodes.find(n => n.id === idA);
    const nodeB = nodes.find(n => n.id === idB);
    if (!nodeA || !nodeB) return;
    nodeA.conn.push(idB);
    seen.add(key);
  };

  // Helper: the index in branch's rings array for (depth, pos), or -1 if the
  // branch doesn't have enough rings to fill that slot.
  const idxOf = (branchId, depth, pos) => {
    const branch = BRANCHES.find(b => b.id === branchId);
    if (!branch) return -1;
    if (depth < 1 || pos < 0 || pos >= depth) return -1;
    const idx = (depth * (depth - 1)) / 2 + pos;
    if (idx >= branch.rings.length) return -1;
    return idx;
  };

  for (const branch of BRANCHES) {
    branch.rings.forEach((ring, i) => {
      const { depth, pos } = tri(i);
      const id = `${branch.id}_${i}`;
      // 1. Two parent links to the row above (depth-1, pos-1) and (depth-1, pos).
      //    Row d has d slots; row d-1 has d-1 slots, so pos-1 and pos in row d-1
      //    are the two natural up-left / up-right hex neighbours.
      if (depth === 1) {
        tryLink(id, 'start');
      } else {
        const pIdxL = idxOf(branch.id, depth - 1, pos - 1);
        const pIdxR = idxOf(branch.id, depth - 1, pos);
        if (pIdxL >= 0) tryLink(id, `${branch.id}_${pIdxL}`);
        if (pIdxR >= 0) tryLink(id, `${branch.id}_${pIdxR}`);
      }
      // 2. Sibling link to the left-neighbour on the same row.
      if (pos > 0) {
        const sIdx = idxOf(branch.id, depth, pos - 1);
        if (sIdx >= 0) tryLink(id, `${branch.id}_${sIdx}`);
      }
    });
  }

  // 3. Cross-branch links along shared sector boundaries. Branch b's rightmost
  //    column (pos = depth - 1) sits geometrically next to branch (b+1)'s
  //    leftmost column (pos = 0) at the same depth. Link them at every depth.
  const branchN = BRANCHES.length;
  for (let bi = 0; bi < branchN; bi++) {
    const a = BRANCHES[bi];
    const b = BRANCHES[(bi + 1) % branchN];
    const maxDepthA = tri(a.rings.length - 1).depth;
    const maxDepthB = tri(b.rings.length - 1).depth;
    const maxDepth = Math.min(maxDepthA, maxDepthB);
    for (let d = 1; d <= maxDepth; d++) {
      const idxA = idxOf(a.id, d, d - 1);
      const idxB = idxOf(b.id, d, 0);
      if (idxA < 0 || idxB < 0) continue;
      tryLink(`${a.id}_${idxA}`, `${b.id}_${idxB}`);
    }
  }

  return nodes;
}

const SKILL_NODES = buildSkillTree();
const NODE_BY_ID = Object.fromEntries(SKILL_NODES.map(n => [n.id, n]));

// Bidirectional adjacency derived from `conn` lists.
const ADJ = (() => {
  const m = {};
  for (const n of SKILL_NODES) m[n.id] = new Set();
  for (const n of SKILL_NODES) {
    for (const c of n.conn) {
      m[n.id].add(c);
      if (m[c]) m[c].add(n.id);
    }
  }
  return m;
})();

function isAllocated(id) {
  ensureSkillTreeShape();
  if (id === 'start') return true;
  return state.skillTree.allocated.indexOf(id) >= 0;
}

function canAllocate(id) {
  if (id === 'start') return false;
  if (isAllocated(id)) return false;
  if (getAvailableSP() < 1) return false;
  for (const adj of ADJ[id] || []) {
    if (isAllocated(adj)) return true;
  }
  return false;
}

function allocate(id) {
  if (!canAllocate(id)) return false;
  state.skillTree.allocated.push(id);
  state.skillTree.lastAllocated = id;
  return true;
}

function refund(id) {
  ensureSkillTreeShape();
  if (id === 'start') return false;
  const i = state.skillTree.allocated.indexOf(id);
  if (i < 0) return false;
  state.skillTree.allocated.splice(i, 1);
  pruneDisconnected();
  if (state.skillTree.lastAllocated === id) state.skillTree.lastAllocated = null;
  return true;
}

function refundAll() {
  ensureSkillTreeShape();
  state.skillTree.allocated = [];
  state.skillTree.lastAllocated = null;
}

function undoLast() {
  ensureSkillTreeShape();
  const id = state.skillTree.lastAllocated;
  if (!id) return false;
  return refund(id);
}

// BFS from Start; refund anything no longer reachable.
function pruneDisconnected() {
  ensureSkillTreeShape();
  const ok = new Set(['start']);
  const queue = ['start'];
  const allocSet = new Set(state.skillTree.allocated);
  while (queue.length) {
    const id = queue.shift();
    for (const adj of ADJ[id] || []) {
      if (allocSet.has(adj) && !ok.has(adj)) {
        ok.add(adj); queue.push(adj);
      }
    }
  }
  state.skillTree.allocated = state.skillTree.allocated.filter(id => ok.has(id));
}

// ---------- Effect aggregators ----------
function treeMult(stat) {
  ensureSkillTreeShape();
  let m = 1;
  for (const id of state.skillTree.allocated) {
    const n = NODE_BY_ID[id]; if (!n) continue;
    for (const e of n.effects) {
      if (e.stat === stat && e.op === 'mult') m *= (1 + e.value);
    }
  }
  return Math.max(0.01, m);
}

function treeAdd(stat) {
  ensureSkillTreeShape();
  let s = 0;
  for (const id of state.skillTree.allocated) {
    const n = NODE_BY_ID[id]; if (!n) continue;
    for (const e of n.effects) {
      if (e.stat === stat && e.op === 'add') s += e.value;
    }
  }
  return s;
}

function treeOfflineMult(stat) {
  ensureSkillTreeShape();
  let m = 1;
  for (const id of state.skillTree.allocated) {
    const n = NODE_BY_ID[id]; if (!n) continue;
    if (n.conditional) continue;
    for (const e of n.effects) {
      if (e.stat === stat && e.op === 'mult') m *= (1 + e.value);
    }
  }
  return Math.max(0.01, m);
}

function hasNode(flagId) {
  ensureSkillTreeShape();
  for (const id of state.skillTree.allocated) {
    const n = NODE_BY_ID[id]; if (!n) continue;
    if (n.flagId === flagId) return true;
  }
  return false;
}

function nodeRank(tierKey) {
  ensureSkillTreeShape();
  let r = 0;
  for (const id of state.skillTree.allocated) {
    const n = NODE_BY_ID[id]; if (!n) continue;
    if (n.tierKey === tierKey) r++;
  }
  return r;
}

function allocatedCrewNames() {
  ensureSkillTreeShape();
  const names = [];
  for (const id of state.skillTree.allocated) {
    const n = NODE_BY_ID[id];
    if (n && n.crewName) names.push(n.crewName);
  }
  return names;
}

// ---------- Save migration support ----------
// Estimate "legacy spend" of a v4 save's upgrades + crew + grass-unlock
// state. Used to seed startingSP on the first migrated load.
function estimateLegacySpend(savedState) {
  let spend = 0;
  const ups = savedState && savedState.upgrades;
  if (ups) {
    const cost = {
      robots:   (n) => Math.ceil(25  * Math.pow(1.45, n - 1)),
      speed:    (n) => Math.ceil(40  * Math.pow(1.35, n)),
      range:    (n) => Math.ceil(60  * Math.pow(1.40, n)),
      value:    (n) => Math.ceil(80  * Math.pow(1.42, n)),
      growth:   (n) => Math.ceil(120 * Math.pow(1.45, n)),
      rate:     (n) => Math.ceil(150 * Math.pow(1.40, n)),
      crit:     (n) => Math.ceil(500 * Math.pow(1.55, n)),
      fuelEff:  (n) => Math.ceil(80  * Math.pow(1.45, n)),
      pest:     (n) => Math.ceil(400 * Math.pow(1.48, n)),
    };
    const fuelTypeCosts = [0, 2000, 8000, 20000];
    const toolCosts     = [0, 250, 1800, 9000, 45000, 200000];
    for (const [k, fn] of Object.entries(cost)) {
      const lvl = ups[k] || 0;
      const start = k === 'robots' ? 1 : 0;
      for (let i = start; i < lvl; i++) spend += fn(i);
    }
    for (let i = 1; i <= (ups.fuelType || 0); i++) spend += fuelTypeCosts[i] || 0;
    for (let i = 1; i <= (ups.tool     || 0); i++) spend += toolCosts[i]     || 0;
  }
  const crewCosts = {
    foreman: 1200, mechanic: 3500, keenEye: 4500, qualityControl: 5000,
    moleWarden: 6000, sprinkler: 5500, autoRefuel: 12000, scout: 15000,
    efficiency: 18000, headGardener: 20000, accountant: 30000,
  };
  if (Array.isArray(savedState?.crew)) {
    for (const id of savedState.crew) spend += crewCosts[id] || 0;
  }
  return spend;
}

// In-place migration of a v4 save's `state` to v5 shape. Returns the
// startingSP granted.
function migrateV4ToV5(savedState) {
  ensureSkillTreeShape();
  const spend = estimateLegacySpend(savedState);
  const startingSP = Math.min(40, Math.floor(spend / 50000));
  recomputeMilestoneSP();
  const fromMilestones = state.skillTree.milestoneSP;
  state.skillTree.prestigeSP = Math.max(0, startingSP - fromMilestones);
  state.skillTree.allocated = [];
  state.skillTree.lastAllocated = null;
  return startingSP;
}

// ===== AUTO-EXPORTS =====
export {
  BRANCHES, SKILL_NODES, NODE_BY_ID, ADJ,
  TILE_PER_SP,
  ensureSkillTreeShape, recordTileMowed, recomputeMilestoneSP,
  awardPrestigeSP, prestigeSPGain, startingSPFromOrphans,
  getSpentSP, getTotalSP, getAvailableSP,
  isAllocated, canAllocate, allocate, refund, refundAll, undoLast, pruneDisconnected,
  treeMult, treeAdd, treeOfflineMult, hasNode, nodeRank,
  allocatedCrewNames,
  estimateLegacySpend, migrateV4ToV5,
};

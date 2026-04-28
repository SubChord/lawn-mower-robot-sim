// ===== AUTO-IMPORTS =====
import { AREA_BY_ID, MOW_PATTERN_BY_KEY, QUEST_BY_ID, SKIN_BY_KEY, ZEN_CONFIG_DEFAULT, applyMapDimensions, coinMult, formatShort, gemShopOfflineMult, mowRadius, mowRate, recomputeFromTree, rubyShopOfflineCapHours, state, techOfflineMult } from './state.js';
import { CFG, T } from './config.js';
import { achieved, toast } from './ui.js';
import { allocateWorldArrays, flowerColors, grass, grassSpecies, idx, inBounds, robots, tiles } from './world.js';
import { ensureSkillTreeShape, migrateV4ToV5, recomputeMilestoneSP, treeOfflineMult } from './skilltree.js';
// ===== END AUTO-IMPORTS =====

/* ============================================================
   Save / Load / offline earnings / reset
   ============================================================ */

const SAVE_KEY = 'lawnbotTycoonSave_v5';
const LEGACY_SAVE_KEYS = ['lawnbotTycoonSave_v4'];
let lastSave = 0;
let resetInProgress = false;

function saveGame() {
  if (resetInProgress) return;
  if (state.zenMode) return;
  const tilePack = [];
  if (tiles) {
    for (let y = 0; y < CFG.gridH; y++) {
      for (let x = 0; x < CFG.gridW; x++) {
        const t = tiles[idx(x, y)];
        if (t !== T.GRASS && t !== T.MOLE_HOLE) {
          const entry = [t, x, y];
          if (t === T.FLOWER) entry.push(flowerColors[idx(x, y)] || 0);
          tilePack.push(entry);
        }
      }
    }
  }
  const payload = {
    state: {
      coins: state.coins,
      gems: state.gems,
      totalEarnedAllTime: state.totalEarnedAllTime,
      totalEarnedThisRun: state.totalEarnedThisRun,
      totalTilesMowed: state.totalTilesMowed,
      muted: state.muted,
      upgrades: state.upgrades,
      garden: state.garden,
      skillTree: state.skillTree,
      skinsUnlocked: state.skinsUnlocked,
      activeSkin: state.activeSkin,
      treasuresCollected: state.treasuresCollected,
      gnomeTimer: state.gnomeTimer,
      goldenGnomeTimer: state.goldenGnomeTimer,
      activeBuffs: state.activeBuffs,
      fuel: state.fuel,
      patternsUnlocked: state.patternsUnlocked,
      activeMowPattern: state.activeMowPattern,
      settings: state.settings,
      areasUnlocked: state.areasUnlocked,
      activeArea: state.activeArea,
      areaExpanded: state.areaExpanded,
      gemUpgrades: state.gemUpgrades,
      critCascadeStack: state.critCascadeStack,
      totalGemsEarned: state.totalGemsEarned,
      prestigeCount: state.prestigeCount,
      ascendCount: state.ascendCount,
      rubies: state.rubies,
      totalRubiesEarned: state.totalRubiesEarned,
      rubyUpgrades: state.rubyUpgrades,
      zenConfig: state.zenConfig,
      timeOfDay: state.timeOfDay,
      weather: state.weather,
      activeQuest: state.activeQuest,
      questTimer: state.questTimer,
      questsCompleted: state.questsCompleted,
      questHistory: state.questHistory,
      activeEvent: state.activeEvent,
      eventTimer: state.eventTimer,
    },
    achieved: [...achieved],
    tiles: tilePack,
    grass: (() => {
      if (!grass) return null;
      let bin = '';
      for (let i = 0; i < grass.length; i++) bin += String.fromCharCode(Math.round(grass[i] * 255));
      return btoa(bin);
    })(),
    grassSpecies: (() => {
      if (!grassSpecies) return null;
      let bin = '';
      for (let i = 0; i < grassSpecies.length; i++) bin += String.fromCharCode(grassSpecies[i]);
      return btoa(bin);
    })(),
    robots: robots.map(r => [+r.x.toFixed(1), +r.y.toFixed(1), +r.angle.toFixed(3), r.name || '']),
    ts: Date.now(),
    saveVersion: 5,
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(payload)); } catch(e) {}
  lastSave = performance.now();
  const s = document.getElementById('saveStatus');
  if (s) s.textContent = '💾 Saved ' + new Date().toLocaleTimeString();
}

function loadGame() {
  try {
    let raw = localStorage.getItem(SAVE_KEY);
    let migratedFrom = null;
    if (!raw) {
      for (const legacyKey of LEGACY_SAVE_KEYS) {
        const legacyRaw = localStorage.getItem(legacyKey);
        if (legacyRaw) { raw = legacyRaw; migratedFrom = legacyKey; break; }
      }
    }
    if (!raw) return false;
    const data = JSON.parse(raw);
    Object.assign(state, data.state);
    // Skill tree replaces legacy upgrades.{speed,range,value,growth,rate,crit,fuelEff,pest}
    // and state.crew. Keep state.upgrades as a small derived cache.
    state.upgrades = Object.assign({ robots: 1, fuelType: 0, tool: 0 }, state.upgrades || {});
    delete state.upgrades.speed; delete state.upgrades.range; delete state.upgrades.value;
    delete state.upgrades.growth; delete state.upgrades.rate; delete state.upgrades.crit;
    delete state.upgrades.fuelEff; delete state.upgrades.pest; delete state.upgrades.electric;
    state.garden   = Object.assign({ tree: 0, rock: 0, pond: 0, flower: 0, beehive: 0, fountain: 0, shed: 0, gnome: 0 }, state.garden || {});
    delete state.crew;
    if (!Array.isArray(state.skinsUnlocked) || state.skinsUnlocked.length === 0) state.skinsUnlocked = ['default'];
    if (!state.activeSkin || !SKIN_BY_KEY[state.activeSkin]) state.activeSkin = 'default';
    if (state.skinsUnlocked.indexOf(state.activeSkin) < 0) state.activeSkin = 'default';
    if (!isFinite(state.treasuresCollected)) state.treasuresCollected = 0;
    if (!isFinite(state.gnomeTimer)) state.gnomeTimer = 60 + Math.random() * 30;
    if (!isFinite(state.goldenGnomeTimer)) state.goldenGnomeTimer = 60 + Math.random() * 60;
    if (!Array.isArray(state.activeBuffs)) state.activeBuffs = [];
    else state.activeBuffs = state.activeBuffs.filter(b => b && typeof b.key === 'string' && isFinite(b.expires) && b.expires > 0);
    if (state.fuel == null) state.fuel = CFG.fuelMax;
    if (state.questTimer == null || !isFinite(state.questTimer)) state.questTimer = 80 + Math.random() * 60;
    if (!isFinite(state.questsCompleted)) state.questsCompleted = 0;
    if (!isFinite(state.critCascadeStack)) state.critCascadeStack = 0;
    if (state.activeQuest && !QUEST_BY_ID[state.activeQuest.id]) state.activeQuest = null;
    if (!Array.isArray(state.questHistory)) state.questHistory = [];
    if (state.activeEvent && typeof state.activeEvent === 'object') {
      const remaining = (state.activeEvent.duration || 0) - ((Date.now() / 1000) - (state.activeEvent.started || 0));
      if (!isFinite(remaining) || remaining <= 0) state.activeEvent = null;
    } else {
      state.activeEvent = null;
    }
    if (!isFinite(state.eventTimer)) state.eventTimer = 240 + Math.random() * 180;
    state.settings = Object.assign({
      showRobotNames: true, showGnomeNames: true, showParticles: true,
      scientificNumbers: false,
      theme: 'classic', dayNight: 'auto', weather: 'auto', rivalry: true,
      autoCollectTreasures: false, newsTicker: true,
    }, state.settings || {});
    delete state.settings.autoBuyer;
    delete state.autoBuyTimer;
    if (!isFinite(state.timeOfDay)) state.timeOfDay = 12;
    if (!state.weather || typeof state.weather !== 'object') {
      state.weather = { id: 'clear', intensity: 0, cycleTimer: 90 };
    } else {
      if (typeof state.weather.id !== 'string') state.weather.id = 'clear';
      if (!isFinite(state.weather.intensity)) state.weather.intensity = 0;
      if (!isFinite(state.weather.cycleTimer)) state.weather.cycleTimer = 90;
    }
    if (!Array.isArray(state.patternsUnlocked) || state.patternsUnlocked.length === 0) state.patternsUnlocked = ['plain'];
    if (!state.activeMowPattern || !MOW_PATTERN_BY_KEY[state.activeMowPattern]) state.activeMowPattern = 'plain';
    if (state.patternsUnlocked.indexOf(state.activeMowPattern) < 0) state.activeMowPattern = 'plain';
    state.zenConfig = Object.assign({}, ZEN_CONFIG_DEFAULT, state.zenConfig || {});
    state.zenMode = false;
    if (Array.isArray(data.achieved)) data.achieved.forEach(id => achieved.add(id));
    state.gemUpgrades = Object.assign({
      startCoins: 0, coinMult: 0, growth: 0, crit: 0,
      offline: 0, prestigeBoost: 0, startRobot: 0, startTool: 0,
      autoQuest: 0,
      pollination: 0, coopBots: 0, symbiosis: 0, critCascade: 0,
    }, state.gemUpgrades || {});
    state.techTree = Object.assign({ tier1: null, tier2: null, tier3: null }, state.techTree || {});
    if (!Array.isArray(state.areasUnlocked) || state.areasUnlocked.length === 0) state.areasUnlocked = ['home'];
    if (!state.activeArea || !AREA_BY_ID[state.activeArea]) state.activeArea = 'home';
    if (state.areasUnlocked.indexOf(state.activeArea) < 0) state.activeArea = 'home';
    if (!state.areaExpanded || typeof state.areaExpanded !== 'object') state.areaExpanded = {};
    const legacyUnlock = {
      clover: 'clover', thick: 'thicket', crystal: 'crystal',
      golden: 'goldshire', obsidian: 'obsidian', frost: 'frostmoor', void: 'voidlands',
    };
    if (state.grassTypes && typeof state.grassTypes === 'object') {
      for (const [species, areaId] of Object.entries(legacyUnlock)) {
        if (state.grassTypes[species]?.unlocked && state.areasUnlocked.indexOf(areaId) < 0) {
          state.areasUnlocked.push(areaId);
        }
      }
    }
    if (data.state && isFinite(data.state.gemUpgrades?.mapExpand) && data.state.gemUpgrades.mapExpand > 0) {
      state.areaExpanded.home = true;
    }
    delete state.grassTypes;
    applyMapDimensions();
    allocateWorldArrays();
    if (data.grass) {
      try {
        const bin = atob(data.grass);
        for (let i = 0; i < grass.length && i < bin.length; i++) grass[i] = bin.charCodeAt(i) / 255;
      } catch(e) { for (let i = 0; i < grass.length; i++) grass[i] = 0.7 + Math.random() * 0.3; }
    } else {
      for (let i = 0; i < grass.length; i++) grass[i] = 0.7 + Math.random() * 0.3;
    }
    if (data.grassSpecies) {
      try {
        const bin = atob(data.grassSpecies);
        for (let i = 0; i < grassSpecies.length && i < bin.length; i++) grassSpecies[i] = bin.charCodeAt(i);
      } catch(e) { /* leave zeroed */ }
    }
    if (!isFinite(state.totalGemsEarned)) state.totalGemsEarned = state.gems || 0;
    if (!isFinite(state.prestigeCount)) state.prestigeCount = 0;
    if (!isFinite(state.ascendCount)) state.ascendCount = 0;
    if (!isFinite(state.rubies)) state.rubies = 0;
    if (!isFinite(state.totalRubiesEarned)) state.totalRubiesEarned = 0;
    state.rubyUpgrades = Object.assign({
      coinMult: 0, gemBank: 0, speed: 0, crit: 0, growth: 0,
      prestigeGemBoost: 0, ascendBoost: 0, startCrew: 0, offlineCap: 0,
      weatherControl: 0, unlockAreas: 0,
    }, state.rubyUpgrades || {});
    state.pedia = Object.assign({
      species: [], gnomes: [], treasures: 0, treasureRare: [],
      weather: {}, buffs: [], photos: [],
    }, state.pedia || {});
    if (!Array.isArray(state.pedia.species))      state.pedia.species = [];
    if (!Array.isArray(state.pedia.gnomes))       state.pedia.gnomes = [];
    if (!isFinite(state.pedia.treasures))         state.pedia.treasures = 0;
    if (!Array.isArray(state.pedia.treasureRare)) state.pedia.treasureRare = [];
    if (!state.pedia.weather || typeof state.pedia.weather !== 'object') state.pedia.weather = {};
    if (!Array.isArray(state.pedia.buffs))        state.pedia.buffs = [];
    if (!Array.isArray(state.pedia.photos))       state.pedia.photos = [];
    if (state.pedia.photos.length > 12) state.pedia.photos = state.pedia.photos.slice(-12);
    if (Array.isArray(data.robots)) state._savedRobots = data.robots;
    if (Array.isArray(data.tiles)) {
      for (const entry of data.tiles) {
        const [t, x, y, col] = entry;
        if (!inBounds(x, y)) continue;
        tiles[idx(x, y)] = t;
        grass[idx(x, y)] = 0;
        if (t === T.FLOWER) flowerColors[idx(x, y)] = col || 0;
      }
    }
    // Skill-tree shape: ensure object exists, then run v4→v5 migration if needed.
    ensureSkillTreeShape();
    if (migratedFrom) {
      const grantedSP = migrateV4ToV5(data.state || {});
      try { localStorage.removeItem(migratedFrom); } catch(e) {}
      if (typeof toast === 'function') {
        toast(`🌳 Skill tree unlocked — ${grantedSP} starting Skill Points to spend.`);
      }
    } else {
      // Make sure milestone SP is consistent with totalTilesMowed even on
      // saves that already wrote v5 (e.g., dev preview).
      const desired = Math.floor((state.totalTilesMowed || 0) / 2500);
      if ((state.skillTree.milestoneSP || 0) < desired) recomputeMilestoneSP();
    }
    recomputeFromTree();
    const elapsed = Math.min(rubyShopOfflineCapHours() * 3600, (Date.now() - data.ts) / 1000);
    if (elapsed > 10) {
      const ts = 16;
      // Use full coinMult() for offline since the only conditional keystone
      // (Glass Cannon) attaches a flat -25% coinValue penalty that should
      // still apply when AFK; treeOfflineMult only matters for stats with
      // truly conditional bonuses (none currently).
      const safeMult = coinMult();
      const tilesPerSec = state.upgrades.robots * mowRate() * Math.PI * Math.pow(mowRadius()/ts, 2) * 0.25;
      const offlineBonus = gemShopOfflineMult() * techOfflineMult();
      const mowOffline = Math.floor(tilesPerSec * CFG.coinPerUnitBase * safeMult * elapsed * 0.5 * offlineBonus);
      const flowerOffline = Math.floor(state.garden.flower * CFG.flowerCoinPerSec * safeMult * treeOfflineMult('flowerYield') * elapsed * offlineBonus);
      const beeOffline = Math.floor(state.garden.beehive * CFG.beePerHive * (CFG.beeRewardPerVisit / (CFG.beeVisitDuration + 0.5)) * safeMult * treeOfflineMult('beeYield') * elapsed * 0.6 * offlineBonus);
      const offlineCoins = mowOffline + flowerOffline + beeOffline;
      if (offlineCoins > 0) {
        state.coins += offlineCoins;
        state.totalEarnedAllTime += offlineCoins;
        state.totalEarnedThisRun += offlineCoins;
        showOfflineModal(offlineCoins, elapsed);
      }
    }
    return true;
  } catch(e) { console.warn('Failed to load save', e); return false; }
}

function resetGame() {
  if (!confirm('⚠️ Reset EVERYTHING — coins, gems, rubies, skill tree, skins, patterns, stats. Cannot be undone.')) return;
  resetInProgress = true;
  localStorage.removeItem(SAVE_KEY);
  for (const k of LEGACY_SAVE_KEYS) localStorage.removeItem(k);
  location.reload();
}

function showOfflineModal(coins, seconds) {
  const hours = (seconds / 3600);
  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `
    <div class="modal">
      <h2>🌞 WELCOME BACK!</h2>
      <p>Your robots were busy while you were away for <b>${hours.toFixed(1)} hour${hours >= 1.5 ? 's' : ''}</b>.</p>
      <div class="big">+💰 ${formatShort(coins)}</div>
      <p>They never stop. The grass never wins.</p>
      <button id="okBtn">Awesome!</button>
    </div>`;
  document.body.appendChild(back);
  back.querySelector('#okBtn').addEventListener('click', () => back.remove());
}

// ===== AUTO-EXPORTS =====
export { SAVE_KEY, loadGame, resetGame, saveGame };

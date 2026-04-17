/* ============================================================
   Save / Load / offline earnings / reset
   ============================================================ */

const SAVE_KEY = 'lawnbotTycoonSave_v5';
let lastSave = 0;

// Base64-encode a typed array using a per-element mapper (value → 0..255 int).
function encodeBase64Bytes(arr, mapFn) {
  if (!arr) return null;
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(mapFn(arr[i]) & 0xff);
  try { return btoa(bin); } catch (e) { return null; }
}

// Decode base64 string back into a typed-array `target` (in place), with
// optional postFn applied per byte. Returns the target.
function decodeBase64Into(target, b64, postFn) {
  if (!b64) return target;
  try {
    const bin = atob(b64);
    const len = Math.min(target.length, bin.length);
    for (let i = 0; i < len; i++) target[i] = postFn ? postFn(bin.charCodeAt(i)) : bin.charCodeAt(i);
  } catch (e) { /* leave zeroed */ }
  return target;
}

// Sparse tilePack: [type, x, y] or [type, x, y, flowerColor] for FLOWER.
function encodeTilePack(tilesArr, flowerArr, gw, gh) {
  const pack = [];
  if (!tilesArr) return pack;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const t = tilesArr[y * gw + x];
      if (t === T.GRASS) continue;
      const entry = [t, x, y];
      if (t === T.FLOWER) entry.push((flowerArr && flowerArr[y * gw + x]) || 0);
      pack.push(entry);
    }
  }
  return pack;
}

function serializeHouse(h) {
  return {
    owned: !!h.owned,
    gridW: h.gridW,
    gridH: h.gridH,
    initialized: !!h.initialized,
    totalTilesMowed: h.totalTilesMowed || 0,
    tiles: encodeTilePack(h.tiles, h.flowerColors, h.gridW, h.gridH),
    grass: encodeBase64Bytes(h.grass, v => Math.round(v * 255)),
    grassSpecies: encodeBase64Bytes(h.grassSpecies, v => v),
    zones: encodeBase64Bytes(h.zones, v => v),
    robots: (h.robots || []).map(r => [+r.x.toFixed(1), +r.y.toFixed(1), +r.angle.toFixed(3), r.name || '']),
    bees: (h.bees || []).map(b => [+b.x.toFixed(1), +b.y.toFixed(1), b.homeX ?? 0, b.homeY ?? 0]),
  };
}

function saveGame() {
  // While in Zen Mode the world is a temporary screensaver snapshot. Don't
  // overwrite the real save with zen state — the real game is restored on exit.
  if (state.zenMode) return;
  const payload = {
    version: 5,
    state: {
      coins: state.coins,
      gems: state.gems,
      totalEarnedAllTime: state.totalEarnedAllTime,
      totalEarnedThisRun: state.totalEarnedThisRun,
      totalTilesMowed: state.totalTilesMowed,
      muted: state.muted,
      upgrades: state.upgrades,
      garden: state.garden,
      crew: state.crew,
      skinsUnlocked: state.skinsUnlocked,
      activeSkin: state.activeSkin,
      treasuresCollected: state.treasuresCollected,
      gnomeTimer: state.gnomeTimer,
      patternsUnlocked: state.patternsUnlocked,
      activeMowPattern: state.activeMowPattern,
      settings: state.settings,
      grassTypes: state.grassTypes,
      gemUpgrades: state.gemUpgrades,
      totalGemsEarned: state.totalGemsEarned,
      zenConfig: state.zenConfig,
      timeOfDay: state.timeOfDay,
      weather: state.weather,
      activeQuest: state.activeQuest,
      questTimer: state.questTimer,
      questsCompleted: state.questsCompleted,
      questHistory: state.questHistory,
    },
    achieved: [...achieved],
    town: {
      unlocked: !!state.town.unlocked,
      activeHouseKey: state.town.activeHouseKey || 'starter',
      // inTownView intentionally NOT saved; always load in house view.
      houses: Object.fromEntries(
        Object.entries(state.town.houses).map(([k, h]) => [k, serializeHouse(h)])
      ),
    },
    ts: Date.now(),
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(payload)); } catch(e) {}
  lastSave = performance.now();
  const s = document.getElementById('saveStatus');
  if (s) s.textContent = '💾 Saved ' + new Date().toLocaleTimeString();
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || data.version !== 5) return false;
    Object.assign(state, data.state);
    state.upgrades = Object.assign({ robots: 1, speed: 0, range: 0, value: 0, growth: 0, rate: 0, crit: 0, tool: 0 }, state.upgrades || {});
    delete state.upgrades.fuelEff;
    delete state.upgrades.fuelType;
    delete state.upgrades.electric;
    state.garden   = Object.assign({ tree: 0, rock: 0, pond: 0, flower: 0, beehive: 0, fountain: 0, shed: 0, gnome: 0 }, state.garden || {});
    if (!Array.isArray(state.crew)) state.crew = [];
    if (!Array.isArray(state.skinsUnlocked) || state.skinsUnlocked.length === 0) state.skinsUnlocked = ['default'];
    if (!state.activeSkin || !SKIN_BY_KEY[state.activeSkin]) state.activeSkin = 'default';
    if (state.skinsUnlocked.indexOf(state.activeSkin) < 0) state.activeSkin = 'default';
    if (!isFinite(state.treasuresCollected)) state.treasuresCollected = 0;
    if (!isFinite(state.gnomeTimer)) state.gnomeTimer = 60 + Math.random() * 30;
    if (state.questTimer == null || !isFinite(state.questTimer)) state.questTimer = 80 + Math.random() * 60;
    if (!isFinite(state.questsCompleted)) state.questsCompleted = 0;
    if (state.activeQuest && !QUEST_BY_ID[state.activeQuest.id]) state.activeQuest = null;
    if (!Array.isArray(state.questHistory)) state.questHistory = [];
    state.settings = Object.assign({
      showRobotNames: true, showGnomeNames: true, showParticles: true,
      theme: 'classic', dayNight: 'auto', weather: 'auto', rivalry: true,
    }, state.settings || {});
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
    state.zenMode = false; // session-only: always start outside Zen after reload
    if (Array.isArray(data.achieved)) data.achieved.forEach(id => achieved.add(id));
    state.grassTypes = Object.assign({
      clover:   { unlocked: false, spawnLevel: 0 },
      thick:    { unlocked: false, spawnLevel: 0 },
      crystal:  { unlocked: false, spawnLevel: 0 },
      golden:   { unlocked: false, spawnLevel: 0 },
      obsidian: { unlocked: false, spawnLevel: 0 },
      frost:    { unlocked: false, spawnLevel: 0 },
      void:     { unlocked: false, spawnLevel: 0 },
    }, state.grassTypes || {});
    state.gemUpgrades = Object.assign({
      startCoins: 0, coinMult: 0, growth: 0, crit: 0,
      offline: 0, prestigeBoost: 0, startRobot: 0, startTool: 0,
      grassObsidian: 0, grassFrost: 0, grassVoid: 0,
      townUnlock: 0,
    }, state.gemUpgrades || {});
    applyGemGrassUnlocks();
    // Back-fill totalGemsEarned for saves predating the field.
    if (!isFinite(state.totalGemsEarned)) state.totalGemsEarned = state.gems || 0;

    // ---------- Town / per-house rehydration ----------
    state.town.unlocked = !!(data.town && data.town.unlocked);
    state.town.activeHouseKey = (data.town && data.town.activeHouseKey) || 'starter';
    state.town.inTownView = false;
    state.town.houses = {};
    if (data.town && data.town.houses) {
      for (const [k, sh] of Object.entries(data.town.houses)) {
        if (!HOUSE_BY_KEY[k]) continue; // unknown house def — drop
        const fresh = makePerHouseState(k);
        fresh.owned = !!sh.owned;
        fresh.initialized = !!sh.initialized;
        fresh.totalTilesMowed = sh.totalTilesMowed || 0;
        decodeBase64Into(fresh.grass, sh.grass, byte => byte / 255);
        decodeBase64Into(fresh.grassSpecies, sh.grassSpecies);
        decodeBase64Into(fresh.zones, sh.zones);
        // tilePack → tiles + flowerColors
        if (Array.isArray(sh.tiles)) {
          for (const [t, x, y, col] of sh.tiles) {
            if (x < 0 || y < 0 || x >= fresh.gridW || y >= fresh.gridH) continue;
            fresh.tiles[y * fresh.gridW + x] = t;
            fresh.grass[y * fresh.gridW + x] = 0;
            if (t === T.FLOWER) fresh.flowerColors[y * fresh.gridW + x] = col || 0;
          }
        }
        // Rehydrate robots with all runtime fields spawnRobot would set.
        fresh.robots = (sh.robots || []).map(r => ({
          x: r[0], y: r[1], angle: r[2],
          target: null, lastTargetCheck: 0,
          bladePhase: Math.random() * Math.PI * 2,
          bob: Math.random() * Math.PI * 2,
          name: r[3] || ROBOT_NAMES[Math.floor(Math.random() * ROBOT_NAMES.length)],
          dragging: false,
        }));
        // Bees: minimal rehydration; ensureBeesFromHives() will reconcile count.
        fresh.bees = (sh.bees || []).map(b => ({
          x: b[0], y: b[1],
          homeX: b[2] || 0, homeY: b[3] || 0,
          angle: Math.random() * Math.PI * 2,
          target: null, state: 'flying', stateTime: 0,
          wingPhase: Math.random() * 10, jitter: Math.random() * 10,
        }));
        state.town.houses[k] = fresh;
      }
    }
    // Guarantee starter exists (defensive for corrupt saves).
    if (!state.town.houses.starter) {
      state.town.houses.starter = Object.assign(makePerHouseState('starter'), { owned: true });
    }
    switchHouseBindings(state.town.activeHouseKey in state.town.houses ? state.town.activeHouseKey : 'starter');

    const elapsed = Math.min(12 * 3600, (Date.now() - data.ts) / 1000);
    if (elapsed > 10) {
      const ts = 16;
      const tilesPerSec = state.upgrades.robots * mowRate() * Math.PI * Math.pow(mowRadius()/ts, 2) * 0.25;
      const offlineBonus = gemShopOfflineMult();
      const mowOffline = Math.floor(tilesPerSec * CFG.coinPerUnitBase * coinMult() * elapsed * 0.5 * offlineBonus);
      const flowerOffline = Math.floor(state.garden.flower * CFG.flowerCoinPerSec * coinMult() * elapsed * offlineBonus);
      const beeOffline = Math.floor(state.garden.beehive * CFG.beePerHive * (CFG.beeRewardPerVisit / (CFG.beeVisitDuration + 0.5)) * coinMult() * elapsed * 0.6 * offlineBonus);
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
  if (!confirm('⚠️ Reset ALL progress including gems? This cannot be undone.')) return;
  localStorage.removeItem(SAVE_KEY);
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

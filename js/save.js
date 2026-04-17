/* ============================================================
   Save / Load / offline earnings / reset
   ============================================================ */

const SAVE_KEY = 'lawnbotTycoonSave_v4';
let lastSave = 0;

function saveGame() {
  // While in Zen Mode the world is a temporary screensaver snapshot. Don't
  // overwrite the real save with zen state — the real game is restored on exit.
  if (state.zenMode) return;
  const tilePack = [];
  if (tiles) {
    for (let y = 0; y < CFG.gridH; y++) {
      for (let x = 0; x < CFG.gridW; x++) {
        const t = tiles[idx(x, y)];
        if (t !== T.GRASS) {
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
      crew: state.crew,
      skinsUnlocked: state.skinsUnlocked,
      activeSkin: state.activeSkin,
      treasuresCollected: state.treasuresCollected,
      gnomeTimer: state.gnomeTimer,
      fuel: state.fuel,
      settings: state.settings,
      grassTypes: state.grassTypes,
      zenConfig: state.zenConfig,
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
    Object.assign(state, data.state);
    state.upgrades = Object.assign({ robots: 1, speed: 0, range: 0, value: 0, growth: 0, rate: 0, crit: 0, fuelEff: 0, fuelType: 0, tool: 0 }, state.upgrades || {});
    if (state.upgrades.electric != null) {
      if (state.upgrades.fuelType === 0 && state.upgrades.electric >= 1) state.upgrades.fuelType = 3;
      delete state.upgrades.electric;
    }
    state.garden   = Object.assign({ tree: 0, rock: 0, pond: 0, flower: 0, beehive: 0, fountain: 0, shed: 0, gnome: 0 }, state.garden || {});
    if (!Array.isArray(state.crew)) state.crew = [];
    if (!Array.isArray(state.skinsUnlocked) || state.skinsUnlocked.length === 0) state.skinsUnlocked = ['default'];
    if (!state.activeSkin || !SKIN_BY_KEY[state.activeSkin]) state.activeSkin = 'default';
    if (state.skinsUnlocked.indexOf(state.activeSkin) < 0) state.activeSkin = 'default';
    if (!isFinite(state.treasuresCollected)) state.treasuresCollected = 0;
    if (!isFinite(state.gnomeTimer)) state.gnomeTimer = 60 + Math.random() * 30;
    if (state.fuel == null) state.fuel = CFG.fuelMax;
    state.settings = Object.assign({ showRobotNames: true, showGnomeNames: true, showParticles: true }, state.settings || {});
    state.zenConfig = Object.assign({}, ZEN_CONFIG_DEFAULT, state.zenConfig || {});
    state.zenMode = false; // session-only: always start outside Zen after reload
    if (Array.isArray(data.achieved)) data.achieved.forEach(id => achieved.add(id));
    grass = new Float32Array(CFG.gridW * CFG.gridH);
    tiles = new Uint8Array(CFG.gridW * CFG.gridH);
    flowerColors = new Uint8Array(CFG.gridW * CFG.gridH);
    grassSpecies = new Uint8Array(CFG.gridW * CFG.gridH);
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
    state.grassTypes = Object.assign({
      clover:  { unlocked: false, spawnLevel: 0 },
      thick:   { unlocked: false, spawnLevel: 0 },
      crystal: { unlocked: false, spawnLevel: 0 },
      golden:  { unlocked: false, spawnLevel: 0 },
    }, state.grassTypes || {});
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
    const elapsed = Math.min(12 * 3600, (Date.now() - data.ts) / 1000);
    if (elapsed > 10) {
      const ts = 16;
      const tilesPerSec = state.upgrades.robots * mowRate() * Math.PI * Math.pow(mowRadius()/ts, 2) * 0.25;
      const mowOffline = Math.floor(tilesPerSec * CFG.coinPerUnitBase * coinMult() * elapsed * 0.5);
      const flowerOffline = Math.floor(state.garden.flower * CFG.flowerCoinPerSec * coinMult() * elapsed);
      const beeOffline = Math.floor(state.garden.beehive * CFG.beePerHive * (CFG.beeRewardPerVisit / (CFG.beeVisitDuration + 0.5)) * coinMult() * elapsed * 0.6);
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

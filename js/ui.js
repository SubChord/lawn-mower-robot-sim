/* ============================================================
   HUD, shop UI, toasts, achievements, tabs, footer buttons
   ============================================================ */

// ---------- HUD ----------
let lastCoinDisplay = 0;
let lastRateSample = { t: performance.now(), coins: 0 };
let displayedRate = 0;
function updateHUD() {
  const coinAmt = document.getElementById('coinAmt');
  const newVal = formatShort(state.coins);
  if (coinAmt.textContent !== newVal) {
    coinAmt.textContent = newVal;
    if (state.coins - lastCoinDisplay > 0.0001) flashCoin();
    lastCoinDisplay = state.coins;
  }
  document.getElementById('gemAmt').textContent = formatShort(state.gems);
  document.getElementById('gemBonus').textContent = `+${(state.gems * 10)}% bonus`;

  const now = performance.now();
  if (now - lastRateSample.t > 700) {
    const dt = (now - lastRateSample.t) / 1000;
    const earned = state.totalEarnedAllTime - lastRateSample.coins;
    const rate = earned / dt;
    displayedRate = displayedRate * 0.7 + rate * 0.3;
    lastRateSample.t = now; lastRateSample.coins = state.totalEarnedAllTime;
    document.getElementById('coinRate').textContent = `+${formatShort(displayedRate)} / sec`;
  }

  const fuelPct = state.fuel / CFG.fuelMax;
  const ft = activeFuelType();
  const fuelBar = document.getElementById('hudFuelBar');
  const fuelLabel = document.getElementById('hudFuelLabel');
  const refuelBtn = document.getElementById('refuelBtn');
  fuelBar.style.width = (fuelPct * 100) + '%';
  fuelBar.style.background = fuelPct < 0.25 ? 'linear-gradient(90deg,#ff2222,#ff6644)' : ft.barColor;
  const netRate = ft.recharge - fuelDrainRate();
  const rateStr = (netRate >= 0 ? '+' : '') + netRate.toFixed(2) + '/s';
  fuelLabel.textContent = ft.icon + ' ' + ft.name + ' ' + Math.round(fuelPct * 100) + '% (' + rateStr + ')';
  refuelBtn.style.display = ft.refuelable ? '' : 'none';
  const refillCost = fuelRefillCost();
  refuelBtn.disabled = state.coins < refillCost || state.fuel >= CFG.fuelMax;
  document.getElementById('refuelCost').textContent = '💰' + formatShort(refillCost);

  document.getElementById('hudRobots').textContent = state.upgrades.robots;
  let total = 0, count = 0;
  for (let i = 0; i < grass.length; i++) {
    if (tiles[i] === T.GRASS) { total += grass[i]; count++; }
  }
  const pct = count > 0 ? Math.round(total / count * 100) : 0;
  document.getElementById('hudGrass').textContent = pct + '%';
  document.getElementById('hudFlowers').textContent = state.garden.flower;
  document.getElementById('hudBees').textContent = bees.length;
  document.getElementById('hudTotal').textContent = formatShort(state.totalTilesMowed);
}

// ---------- Shop / Upgrades UI ----------
const UPGRADE_DEFS = [
  { key: 'robots', icon: '🤖', name: 'Deploy Robot',
    desc: (s) => `Robots on lawn: ${s.upgrades.robots}`,
    effect: (s) => `+1 robot`, show: () => true },
  { key: 'speed',  icon: '⚡', name: 'Turbo Motors',
    desc: (s) => `Move speed +${s.upgrades.speed * 10}%`,
    effect: (s) => `+10% robot speed` },
  { key: 'range',  icon: '📏', name: 'Wider Blades',
    desc: (s) => `Cut range +${s.upgrades.range * 8}%`,
    effect: (s) => `+8% cutting range` },
  { key: 'rate',   icon: '🌀', name: 'Sharper Blades',
    desc: (s) => `Mow rate +${s.upgrades.rate * 15}%`,
    effect: (s) => `+15% mow speed` },
  { key: 'value',  icon: '💰', name: 'Golden Clippings',
    desc: (s) => `Coin value +${s.upgrades.value * 15}%`,
    effect: (s) => `+15% coins per mow` },
  { key: 'growth', icon: '🌱', name: 'Fertilizer',
    desc: (s) => `Grass growth +${s.upgrades.growth * 12}%`,
    effect: (s) => `+12% grass regrowth` },
  { key: 'crit',    icon: '🎯', name: 'Lucky Lawnmower',
    desc: (s) => `Crit chance ${(critChance()*100).toFixed(1)}% (×${critMult()})`,
    effect: (s) => `+2% crit chance` },
  { key: 'fuelEff', icon: '🔩', name: 'Fuel Efficiency',
    desc: (s) => `Fuel drain -${s.upgrades.fuelEff * 8}% (${fuelDrainRate().toFixed(2)}/s now)`,
    effect: () => `-8% fuel consumption` },
  { key: 'fuelType', icon: '⛽', name: 'Upgrade Fuel Type',
    desc: (s) => {
      const cur = FUEL_TYPES[s.upgrades.fuelType];
      const nxt = FUEL_TYPES[s.upgrades.fuelType + 1];
      return `${cur.icon} ${cur.name} (${(cur.drainMult*100)|0}% drain, ${cur.recharge}/s regen)${nxt ? ` → ${nxt.icon} ${nxt.name}` : ' — MAX'}`;
    },
    effect: (s) => {
      const nxt = FUEL_TYPES[s.upgrades.fuelType + 1];
      return nxt ? `${(nxt.drainMult*100)|0}% drain · ${nxt.recharge}/s regen${nxt.refuelable ? '' : ' · no refuel needed'}` : '';
    },
  },
];

let activeTab = 'upgrades';
function renderShop() {
  const list = document.getElementById('shopList');
  list.innerHTML = '';

  if (activeTab === 'prestige') { renderPrestige(list); return; }
  if (activeTab === 'garden')   { renderGarden(list);   return; }

  for (const up of UPGRADE_DEFS) {
    if (up.show && !up.show()) continue;
    const lvl = state.upgrades[up.key];
    const maxed = lvl >= MAX[up.key];
    const cost = maxed ? Infinity : COST[up.key](lvl);
    const affordable = state.coins >= cost && !maxed;
    const row = document.createElement('div');
    row.className = 'upgrade' + (affordable ? ' affordable' : '');
    row.innerHTML = `
      <div class="icon">${up.icon}</div>
      <div class="info">
        <div class="name">${up.name} ${up.key !== 'robots' ? `<span class="lvl">Lv ${lvl}</span>` : ''}</div>
        <div class="lvl">${up.desc(state)}</div>
        <div class="effect">${maxed ? '⭐ MAXED' : up.effect(state)}</div>
      </div>
      <button class="buy" ${affordable ? '' : 'disabled'}>
        ${maxed ? 'MAX' : 'Buy'}
        <span class="cost">${maxed ? '—' : '💰 ' + formatShort(cost)}</span>
      </button>
    `;
    row.querySelector('.buy').addEventListener('click', () => buy(up.key));
    list.appendChild(row);
  }
}

function renderGarden(list) {
  const header = document.createElement('div');
  header.innerHTML = `
    <p style="font-size:12px; color:var(--ink-dim); margin-bottom:10px; line-height:1.4;">
      Build your dream garden. Placements auto-drop on random grass.<br>
      <b style="color:var(--grass-xlight);">Bonuses stack.</b> 🌸 flowers feed 🐝 bees.
    </p>`;
  list.appendChild(header);
  for (const def of GARDEN_DEFS) {
    const owned = state.garden[def.key];
    const maxed = owned >= def.max;
    const cost = maxed ? Infinity : gardenCost(def.key);
    const affordable = state.coins >= cost && !maxed;
    const row = document.createElement('div');
    row.className = 'upgrade' + (affordable ? ' affordable' : '');
    row.innerHTML = `
      <div class="icon">${def.icon}</div>
      <div class="info">
        <div class="name">${def.name} <span class="lvl">× ${owned}/${def.max}</span></div>
        <div class="effect">${def.desc()}</div>
      </div>
      <button class="buy" ${affordable ? '' : 'disabled'}>
        ${maxed ? 'MAX' : 'Place'}
        <span class="cost">${maxed ? '—' : '💰 ' + formatShort(cost)}</span>
      </button>
    `;
    row.querySelector('.buy').addEventListener('click', () => buyGarden(def.key));
    list.appendChild(row);
  }
}

function buyGarden(key) {
  const def = GARDEN_BY_KEY[key];
  const owned = state.garden[key];
  if (owned >= def.max) return;
  const cost = gardenCost(key);
  if (state.coins < cost) return;
  const placed = placeAtRandomGrass(def.type);
  if (!placed) {
    toast('⚠️ No free grass tile found!', '#ffb4b4');
    return;
  }
  state.coins -= cost;
  state.garden[key] = owned + 1;
  beep(500 + owned * 15, 0.08, 'sine', 0.07);
  if (key === 'beehive') {
    ensureBeesFromHives();
    toast('🐝 Beehive placed! Bees deployed.', '#ffd34e');
  } else {
    addParticle((placed.x + 0.5) * tileSize, (placed.y + 0.5) * tileSize, {
      text: '+' + def.icon, color: '#8ff09e', size: 18,
    });
  }
  renderShop();
  saveGame();
}

function renderPrestige(list) {
  const can = state.totalEarnedThisRun >= CFG.prestigeThreshold;
  const gain = CFG.prestigeFormula(state.totalEarnedThisRun);
  const wrap = document.createElement('div');
  wrap.className = 'prestige';
  wrap.innerHTML = `
    <h3>🌟 FERTILIZE THE LAWN</h3>
    <p>Reset your run (coins, robots, upgrades) for permanent gems.<br>
    Each gem grants <b>+10% coin bonus</b>, forever.</p>
    <div class="gain">💎 +${gain} gems</div>
    <p style="font-size:11px; opacity:0.7;">Threshold: ${formatShort(CFG.prestigeThreshold)} coins earned this run<br>
    Earned this run: ${formatShort(state.totalEarnedThisRun)}</p>
    <button id="prestigeBtn" ${can && gain > 0 ? '' : 'disabled'}>Fertilize (+${gain} 💎)</button>
  `;
  list.appendChild(wrap);
  const btn = wrap.querySelector('#prestigeBtn');
  if (btn) btn.addEventListener('click', doPrestige);

  const info = document.createElement('div');
  info.className = 'upgrade';
  info.style.gridTemplateColumns = '42px 1fr';
  info.innerHTML = `
    <div class="icon">💎</div>
    <div class="info">
      <div class="name">Current Gems: ${state.gems}</div>
      <div class="effect">Global bonus: +${(state.gems * 10)}% to all coin income</div>
    </div>
  `;
  list.appendChild(info);
}

function buy(key) {
  const lvl = state.upgrades[key];
  if (lvl >= MAX[key]) return;
  const cost = COST[key](lvl);
  if (state.coins < cost) return;
  state.coins -= cost;
  state.upgrades[key] = lvl + 1;
  if (key === 'robots') {
    ensureRobotCount();
    addParticle(canvas.width / 2, canvas.height / 2, { text: 'NEW ROBOT!', color: '#8ff09e', size: 18 });
  }
  beep(660 + lvl * 10, 0.08, 'square', 0.08);
  renderShop();
  saveGame();
}

function doPrestige() {
  const gain = CFG.prestigeFormula(state.totalEarnedThisRun);
  if (gain <= 0) return;
  if (!confirm(`Fertilize? You will gain ${gain} 💎 gems (permanent +${gain * 10}% bonus), but reset coins, robots, upgrades and garden.`)) return;
  state.gems += gain;
  state.coins = 0;
  state.totalEarnedThisRun = 0;
  state.upgrades = { robots: 1, speed: 0, range: 0, value: 0, growth: 0, rate: 0, crit: 0, fuelEff: 0, fuelType: 0 };
  state.garden   = { tree: 0, rock: 0, pond: 0, flower: 0, beehive: 0, fountain: 0, shed: 0, gnome: 0 };
  state.fuel     = CFG.fuelMax;
  robots = [];
  bees = [];
  initWorld();
  ensureRobotCount();
  ensureBeesFromHives();
  toast(`🌟 Gained ${gain} 💎 Gems!`, '#8ff09e');
  beep(880, 0.15, 'triangle', 0.12);
  setTimeout(() => beep(1320, 0.2, 'triangle', 0.1), 100);
  renderShop();
  saveGame();
}

// ---------- Toasts ----------
function toast(msg, color = '#ffd34e') {
  const c = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = 'toast';
  t.style.background = `linear-gradient(180deg, ${color}ee, ${color}aa)`;
  t.innerHTML = `<span class="t-ico">🏆</span> ${msg}`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ---------- Achievements ----------
const ACHIEVEMENTS = [
  { id: 'first',  cond: s => s.totalEarnedAllTime >= 100,   msg: 'Rookie Mower: earned 100 coins' },
  { id: 'k1',     cond: s => s.totalEarnedAllTime >= 1000,  msg: 'Green Thumb: earned 1K coins' },
  { id: 'k10',    cond: s => s.totalEarnedAllTime >= 10000, msg: 'Lawn Baron: earned 10K coins' },
  { id: 'k100',   cond: s => s.totalEarnedAllTime >= 1e5,   msg: 'Grass Tycoon: earned 100K coins' },
  { id: 'm1',     cond: s => s.totalEarnedAllTime >= 1e6,   msg: 'Turf Millionaire!' },
  { id: 'robot5', cond: s => s.upgrades.robots >= 5,        msg: '5-Bot Fleet assembled' },
  { id: 'robot15',cond: s => s.upgrades.robots >= 15,       msg: '15-Bot Army deployed' },
  { id: 'gems1',  cond: s => s.gems >= 1,                   msg: 'First Fertilization: +10% forever' },
];
const achieved = new Set();
function checkAchievements() {
  for (const a of ACHIEVEMENTS) {
    if (!achieved.has(a.id) && a.cond(state)) {
      achieved.add(a.id);
      toast('🏆 ' + a.msg, '#ffd34e');
      beep(1200, 0.1, 'triangle', 0.08);
    }
  }
}

// ---------- Tabs + footer buttons ----------
function wireUIEvents() {
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      activeTab = t.dataset.tab;
      renderShop();
    });
  });

  document.getElementById('refuelBtn').addEventListener('click', () => {
    if (isElectric()) return;
    const cost = fuelRefillCost();
    if (state.coins < cost || state.fuel >= CFG.fuelMax) return;
    state.coins -= cost;
    state.fuel = CFG.fuelMax;
    beep(440, 0.06, 'sine', 0.05);
    toast('⛽ Robots refueled!', '#ff9f1c');
    saveGame();
  });

  document.getElementById('saveBtn').addEventListener('click', () => { saveGame(); toast('💾 Game saved!', '#8ff09e'); });
  document.getElementById('resetBtn').addEventListener('click', resetGame);
  const muteBtn = document.getElementById('muteBtn');
  muteBtn.addEventListener('click', () => {
    state.muted = !state.muted;
    muteBtn.textContent = state.muted ? '🔇 Muted' : '🔊 Sound';
    saveGame();
  });
}

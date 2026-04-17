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
  if (activeTab === 'crew')     { renderCrew(list);     return; }
  if (activeTab === 'skins')    { renderSkins(list);    return; }
  if (activeTab === 'tools')    { renderTools(list);    return; }

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

function renderTools(list) {
  const cur = activeTool();
  const header = document.createElement('div');
  header.innerHTML = `
    <p style="font-size:12px; color:var(--ink-dim); margin-bottom:10px; line-height:1.4;">
      Your character follows the mouse and mows grass where the cursor stands.<br>
      <b style="color:var(--grass-xlight);">Equipped:</b> ${cur.icon} ${cur.name}
      — ${playerMowRate().toFixed(1)} grass/sec · radius ${cur.radiusTiles.toFixed(1)} tiles.
    </p>`;
  list.appendChild(header);

  for (let i = 0; i < TOOL_TYPES.length; i++) {
    const tool = TOOL_TYPES[i];
    const owned = state.upgrades.tool >= i;
    const isNext = i === state.upgrades.tool + 1;
    const cost = tool.upgradeCost ?? 0;
    const affordable = isNext && state.coins >= cost;
    const row = document.createElement('div');
    const classes = ['upgrade'];
    if (affordable) classes.push('affordable');
    if (i === state.upgrades.tool) classes.push('active');
    row.className = classes.join(' ');
    let btn;
    if (owned) {
      btn = `<button class="buy" disabled>${i === state.upgrades.tool ? '✔ EQUIPPED' : 'OWNED'}</button>`;
    } else if (isNext) {
      btn = `<button class="buy" ${affordable ? '' : 'disabled'}>Buy<span class="cost">💰 ${formatShort(cost)}</span></button>`;
    } else {
      btn = `<button class="buy" disabled>🔒 LOCKED</button>`;
    }
    row.innerHTML = `
      <div class="icon">${tool.icon}</div>
      <div class="info">
        <div class="name">${tool.name}</div>
        <div class="lvl">${tool.rateMult.toFixed(1)}× rate · ${tool.radiusTiles.toFixed(1)}-tile radius</div>
        <div class="effect">${i === 0 ? 'Starter tool — always owned' : `+${(((tool.rateMult / TOOL_TYPES[i-1].rateMult) - 1) * 100) | 0}% faster than prev`}</div>
      </div>
      ${btn}
    `;
    const buyBtn = row.querySelector('.buy');
    if (buyBtn && isNext && affordable) buyBtn.addEventListener('click', () => buyTool(i));
    list.appendChild(row);
  }
}

function buyTool(idx) {
  if (idx !== state.upgrades.tool + 1) return;
  const tool = TOOL_TYPES[idx];
  if (!tool) return;
  const cost = tool.upgradeCost;
  if (state.coins < cost) return;
  state.coins -= cost;
  state.upgrades.tool = idx;
  beep(700 + idx * 40, 0.08, 'sine', 0.07);
  setTimeout(() => beep(1040 + idx * 50, 0.1, 'triangle', 0.06), 90);
  toast(`${tool.icon} Equipped: ${tool.name}!`, '#8ff09e');
  addParticle(canvas.width / 2, canvas.height / 2, {
    text: tool.icon + ' ' + tool.name, color: '#8ff09e', size: 22,
  });
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
  state.upgrades = { robots: 1, speed: 0, range: 0, value: 0, growth: 0, rate: 0, crit: 0, fuelEff: 0, fuelType: 0, tool: 0 };
  state.garden   = { tree: 0, rock: 0, pond: 0, flower: 0, beehive: 0, fountain: 0, shed: 0, gnome: 0 };
  state.crew     = [];
  state.fuel     = CFG.fuelMax;
  state.gnomeTimer = 60 + Math.random() * 30;
  robots = [];
  bees = [];
  visitorGnomes = [];
  treasures = [];
  initWorld();
  ensureRobotCount();
  ensureBeesFromHives();
  toast(`🌟 Gained ${gain} 💎 Gems!`, '#8ff09e');
  beep(880, 0.15, 'triangle', 0.12);
  setTimeout(() => beep(1320, 0.2, 'triangle', 0.1), 100);
  renderShop();
  saveGame();
}

// ---------- Crew skill tree ----------
function renderCrew(list) {
  const header = document.createElement('div');
  header.innerHTML = `
    <p style="font-size:12px; color:var(--ink-dim); margin-bottom:10px; line-height:1.4;">
      Hire specialists to automate the farm. Each tier requires the one above.
      🧙 A gnome might also drop by with gifts — collect his treasures or let your <b>Scout</b> grab them.
    </p>`;
  list.appendChild(header);

  const tree = document.createElement('div');
  tree.className = 'crew-tree';

  // SVG connectors: the tree has 3 tiers with 3 cols (foreman is col1/tier0).
  // Tier 0 → all tier 1 nodes (fan-out from foreman).
  // Tier 1 → matching tier 2 node (vertical).
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'crew-connectors');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  // coords in percentage space (0..100)
  const COL_X = [16.67, 50, 83.33];
  const TIER_Y = [14, 50, 86];
  const lines = [
    { from: [COL_X[1], TIER_Y[0]], to: [COL_X[0], TIER_Y[1]], id: 'mechanic' },
    { from: [COL_X[1], TIER_Y[0]], to: [COL_X[1], TIER_Y[1]], id: 'keenEye' },
    { from: [COL_X[1], TIER_Y[0]], to: [COL_X[2], TIER_Y[1]], id: 'qualityControl' },
    { from: [COL_X[0], TIER_Y[1]], to: [COL_X[0], TIER_Y[2]], id: 'autoRefuel', parent: 'mechanic' },
    { from: [COL_X[1], TIER_Y[1]], to: [COL_X[1], TIER_Y[2]], id: 'scout', parent: 'keenEye' },
    { from: [COL_X[2], TIER_Y[1]], to: [COL_X[2], TIER_Y[2]], id: 'efficiency', parent: 'qualityControl' },
  ];
  for (const L of lines) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', L.from[0]);
    line.setAttribute('y1', L.from[1]);
    line.setAttribute('x2', L.to[0]);
    line.setAttribute('y2', L.to[1]);
    const parentId = L.parent || 'foreman';
    const active = hasCrew(L.id) && hasCrew(parentId);
    const reachable = hasCrew(parentId);
    line.setAttribute('stroke', active ? '#ffd34e' : (reachable ? 'rgba(143,240,158,0.45)' : 'rgba(143,240,158,0.15)'));
    line.setAttribute('stroke-width', active ? '3' : '2');
    line.setAttribute('stroke-linecap', 'round');
    if (active) line.setAttribute('filter', 'drop-shadow(0 0 4px #ffd34e)');
    svg.appendChild(line);
  }
  tree.appendChild(svg);

  // Nodes positioned absolutely on the same 300x300 grid (% translated by CSS)
  for (const node of SKILL_TREE) {
    const el = document.createElement('div');
    const owned = hasCrew(node.id);
    const reqOk = !node.req || hasCrew(node.req);
    const affordable = state.coins >= node.cost;
    const buyable = !owned && reqOk && affordable;
    const locked = !reqOk;
    el.className = 'crew-node'
      + (owned ? ' owned' : '')
      + (buyable ? ' buyable' : '')
      + (locked ? ' locked' : '');
    el.style.left = COL_X[node.col] + '%';
    el.style.top  = TIER_Y[node.tier] + '%';
    el.innerHTML = `
      <div class="crew-icon">${node.icon}</div>
      <div class="crew-name">${node.name}</div>
      <div class="crew-desc">${node.desc}</div>
      <div class="crew-cost">${owned ? '✅ HIRED' : (locked ? '🔒 locked' : '💰 ' + formatShort(node.cost))}</div>
    `;
    if (buyable) {
      el.addEventListener('click', () => buyCrew(node.id));
    }
    tree.appendChild(el);
  }

  list.appendChild(tree);
}

function buyCrew(id) {
  const node = SKILL_BY_ID[id];
  if (!node) return;
  if (hasCrew(id)) return;
  if (node.req && !hasCrew(node.req)) return;
  if (state.coins < node.cost) return;
  state.coins -= node.cost;
  state.crew.push(id);
  beep(700, 0.10, 'triangle', 0.08);
  setTimeout(() => beep(1040, 0.12, 'triangle', 0.07), 90);
  toast(`${node.icon} Hired: ${node.name}!`, '#8ff09e');
  addParticle(canvas.width / 2, canvas.height / 2, {
    text: node.icon + ' ' + node.name, color: '#8ff09e', size: 18,
  });
  renderShop();
  saveGame();
}

// ---------- Skins tab ----------
function renderSkins(list) {
  const header = document.createElement('div');
  const unlocked = state.skinsUnlocked.length;
  header.innerHTML = `
    <p style="font-size:12px; color:var(--ink-dim); margin-bottom:10px; line-height:1.4;">
      Equip a skin for your mower fleet. Unlock rare skins from 🧙 <b>gnome treasures</b>.<br>
      Collected: <b style="color:var(--grass-xlight);">${unlocked}/${SKIN_DEFS.length}</b> · Treasures opened: <b style="color:var(--gold);">${state.treasuresCollected || 0}</b>
    </p>`;
  list.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'skin-grid';
  for (const skin of SKIN_DEFS) {
    const owned = state.skinsUnlocked.indexOf(skin.key) >= 0;
    const active = state.activeSkin === skin.key;
    const card = document.createElement('div');
    card.className = 'skin-card' + (owned ? ' owned' : ' locked') + (active ? ' active' : '');
    const preview = skinPreviewHTML(skin, owned);
    const rarityColor = RARITY_COLORS[skin.rarity] || '#9fc4a2';
    card.innerHTML = `
      <div class="skin-preview">${preview}</div>
      <div class="skin-name">${owned ? skin.name : '???'}</div>
      <div class="skin-rarity" style="color:${rarityColor};">${skin.rarity.toUpperCase()}</div>
      <div class="skin-action">${active ? '✔ Equipped' : (owned ? 'Equip' : '🔒 Locked')}</div>
    `;
    if (owned && !active) {
      card.addEventListener('click', () => {
        state.activeSkin = skin.key;
        beep(660, 0.08, 'sine', 0.06);
        toast(`🎨 Equipped ${skin.name}`, '#8ff09e');
        renderShop();
        saveGame();
      });
    }
    grid.appendChild(card);
  }
  list.appendChild(grid);
}

function skinPreviewHTML(skin, owned) {
  if (!owned) return `<div class="skin-silhouette">?</div>`;
  let grad;
  if (skin.body[0] === 'rainbow') {
    grad = `linear-gradient(135deg, #ff4a4a, #ffd34e, #58ffa0, #5ccaff, #b94dff)`;
  } else {
    grad = `linear-gradient(180deg, ${skin.body[0]}, ${skin.body[1]})`;
  }
  return `
    <div class="skin-chip" style="background:${grad}; border-color:${skin.trim};">
      <div class="skin-dot" style="background:${skin.accent};"></div>
      <div class="skin-panel" style="background:${skin.panel};"></div>
    </div>`;
}

// ---------- Treasure collection ----------
function collectTreasureIndex(i, silent) {
  const t = treasures[i];
  if (!t) return;
  treasures.splice(i, 1);
  state.treasuresCollected = (state.treasuresCollected || 0) + 1;
  if (t.type === 'skin' && t.skinKey && state.skinsUnlocked.indexOf(t.skinKey) < 0) {
    state.skinsUnlocked.push(t.skinKey);
    const skin = SKIN_BY_KEY[t.skinKey];
    showSkinUnlockModal(skin);
    beep(660, 0.10, 'triangle', 0.09);
    setTimeout(() => beep(990, 0.10, 'triangle', 0.08), 90);
    setTimeout(() => beep(1320, 0.18, 'triangle', 0.08), 200);
  } else {
    // fallback if the skin was already owned or for coin treasure
    let coins = t.amount;
    if (!coins || t.type === 'skin') {
      coins = Math.max(120, Math.floor((displayedRate || 4) * 60));
    }
    state.coins += coins;
    state.totalEarnedAllTime += coins;
    state.totalEarnedThisRun += coins;
    addParticle(t.x, t.y - 6, {
      text: '+' + formatShort(coins), color: '#ffd34e', size: 18,
    });
    if (!silent) toast('🪙 Treasure opened: +' + formatShort(coins), '#ffd34e');
    beep(820, 0.08, 'triangle', 0.08);
    setTimeout(() => beep(1100, 0.1, 'triangle', 0.06), 80);
  }
  saveGame();
}

function showSkinUnlockModal(skin) {
  const rarityColor = RARITY_COLORS[skin.rarity] || '#ffd34e';
  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `
    <div class="modal skin-modal">
      <h2>🧙 GNOME'S GIFT!</h2>
      <p style="color:${rarityColor}; font-weight:800; letter-spacing:1px;">${skin.rarity.toUpperCase()} SKIN UNLOCKED</p>
      <div class="skin-modal-preview">${skinPreviewHTML(skin, true)}</div>
      <div class="big" style="color:${rarityColor};">${skin.name}</div>
      <p>Equip it now from the 🎨 Skins tab.</p>
      <button id="okBtn">Sweet!</button>
    </div>`;
  document.body.appendChild(back);
  back.querySelector('#okBtn').addEventListener('click', () => back.remove());
}

function handleCanvasClick(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top)  * (canvas.height / rect.height);
  for (let i = treasures.length - 1; i >= 0; i--) {
    const t = treasures[i];
    const dx = t.x - x, dy = t.y - y;
    if (Math.hypot(dx, dy) < tileSize * 0.8) {
      collectTreasureIndex(i, false);
      return;
    }
  }
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

  canvas.addEventListener('click', handleCanvasClick);
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top)  * (canvas.height / rect.height);
    player.x = x; player.y = y; player.active = true;
    let hover = false;
    for (const t of treasures) {
      if (Math.hypot(t.x - x, t.y - y) < tileSize * 0.8) { hover = true; break; }
    }
    canvas.style.cursor = hover ? 'pointer' : 'none';
  });
  canvas.addEventListener('mouseleave', () => { player.active = false; canvas.style.cursor = 'default'; });
  canvas.addEventListener('mouseenter', () => { player.active = true; canvas.style.cursor = 'none'; });

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

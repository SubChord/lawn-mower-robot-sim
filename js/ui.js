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

  const qBanner = document.getElementById('questBanner');
  if (qBanner) {
    const q = state.activeQuest;
    if (q) {
      const tpl = QUEST_BY_ID[q.id];
      const progress = tpl ? Math.max(0, tpl.getDelta(q)) : 0;
      const pctQ = Math.min(100, (progress / q.goal) * 100);
      const remaining = Math.max(0, q.duration - q.elapsed);
      const rewardStr = q.rewardType === 'gems' ? `+${q.reward}💎` : `+${formatShort(q.reward)}💰`;
      qBanner.style.display = '';
      qBanner.innerHTML =
        `<span class="q-name">👋 ${q.neighbor}</span>` +
        `<span class="q-title">${q.title}</span>` +
        `<div class="q-bar"><div class="q-fill" style="width:${pctQ}%"></div></div>` +
        `<span class="q-progress">${formatShort(progress)}/${formatShort(q.goal)}</span>` +
        `<span class="q-time">⏱ ${remaining.toFixed(0)}s</span>` +
        `<span class="q-reward">${rewardStr}</span>`;
    } else {
      qBanner.style.display = 'none';
    }
  }
}

function showQuestOfferModal(quest) {
  if (document.querySelector('.quest-offer')) return;
  const back = document.createElement('div');
  back.className = 'modal-backdrop quest-offer';
  const rewardStr = quest.rewardType === 'gems'
    ? `+${quest.reward} 💎`
    : `+${formatShort(quest.reward)} 💰`;
  back.innerHTML = `
    <div class="modal">
      <h2>👋 ${quest.neighbor}</h2>
      <p style="font-style:italic; opacity:0.85;">"${quest.flavor}"</p>
      <div class="big">${quest.title}</div>
      <p>Time limit: <b>${quest.duration}s</b> · Reward: <b>${rewardStr}</b></p>
      <div style="display:flex; gap:10px; justify-content:center; margin-top:12px;">
        <button id="qAccept">Accept</button>
        <button id="qDecline" class="danger">Decline</button>
      </div>
    </div>`;
  document.body.appendChild(back);
  back.querySelector('#qAccept').addEventListener('click', () => {
    state.activeQuest = quest;
    back.remove();
    beep(660, 0.08, 'sine', 0.06);
    toast(`📋 Quest accepted: ${quest.title}`, '#ffd34e');
  });
  back.querySelector('#qDecline').addEventListener('click', () => {
    back.remove();
    toast(`${quest.neighbor} grumbles and leaves...`, '#aaa');
    state.questTimer = CFG.questDeclineCooldown + Math.random() * 40;
  });
}

// ---------- Shop / Upgrades UI ----------
// Compact rows: short name, one-line status. Next-step detail lives in the button tooltip.
const UPGRADE_DEFS = [
  { key: 'robots', icon: '🤖', name: 'Robot',
    desc: (s) => `Fleet: ${s.upgrades.robots}`,
    effect: () => `Deploy one more robot on the lawn`, show: () => true },
  { key: 'speed',  icon: '⚡', name: 'Turbo Motors',
    desc: (s) => `+${s.upgrades.speed * 10}% move speed`,
    effect: () => `+10% robot move speed` },
  { key: 'range',  icon: '📏', name: 'Wider Blades',
    desc: (s) => `+${s.upgrades.range * 8}% cut range`,
    effect: () => `+8% cutting radius` },
  { key: 'rate',   icon: '🌀', name: 'Sharper Blades',
    desc: (s) => `+${s.upgrades.rate * 15}% mow rate`,
    effect: () => `+15% mow speed` },
  { key: 'value',  icon: '💰', name: 'Golden Clippings',
    desc: (s) => `+${s.upgrades.value * 15}% coin value`,
    effect: () => `+15% coins per mow` },
  { key: 'growth', icon: '🌱', name: 'Fertilizer',
    desc: (s) => `+${s.upgrades.growth * 12}% growth`,
    effect: () => `+12% grass regrowth` },
  { key: 'crit',    icon: '🎯', name: 'Lucky Mower',
    desc: () => `Crit ${(critChance()*100).toFixed(1)}% · ×${critMult()}`,
    effect: () => `+2% crit chance` },
  { key: 'fuelEff', icon: '🔩', name: 'Fuel Efficiency',
    desc: () => `Drain ${fuelDrainRate().toFixed(2)}/s`,
    effect: () => `-8% fuel consumption` },
  { key: 'fuelType', icon: '⛽', name: 'Fuel Type',
    desc: (s) => {
      const cur = FUEL_TYPES[s.upgrades.fuelType];
      const nxt = FUEL_TYPES[s.upgrades.fuelType + 1];
      return nxt ? `${cur.icon} ${cur.name} → ${nxt.icon} ${nxt.name}` : `${cur.icon} ${cur.name} · MAX`;
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
  if (activeTab === 'grass')    { renderGrassShop(list); return; }
  if (activeTab === 'quests')   { renderQuests(list);    return; }

  for (const up of UPGRADE_DEFS) {
    if (up.show && !up.show()) continue;
    const lvl = state.upgrades[up.key];
    const maxed = lvl >= MAX[up.key];
    const cost = maxed ? Infinity : COST[up.key](lvl);
    const affordable = state.coins >= cost && !maxed;
    const row = document.createElement('div');
    row.className = 'upgrade' + (affordable ? ' affordable' : '') + (maxed ? ' maxed' : '');
    const tooltip = maxed ? 'Fully upgraded' : up.effect(state);
    row.innerHTML = `
      <div class="icon">${up.icon}</div>
      <div class="info">
        <div class="name">${up.name} ${up.key !== 'robots' ? `<span class="lvl">Lv ${lvl}</span>` : ''}</div>
        <div class="effect">${maxed ? '⭐ MAXED' : up.desc(state)}</div>
      </div>
      <button class="buy" ${affordable ? '' : 'disabled'} title="${tooltip.replace(/"/g,'&quot;')}">
        ${maxed ? 'MAX' : 'Buy'}
        <span class="cost">${maxed ? '—' : '💰 ' + formatShort(cost)}</span>
      </button>
    `;
    row.querySelector('.buy').addEventListener('click', () => buy(up.key));
    list.appendChild(row);
  }
}

function renderQuests(list) {
  const q = state.activeQuest;
  const nextIn = Math.max(0, state.questTimer || 0);

  const header = document.createElement('div');
  header.innerHTML = `
    <p style="font-size:12px; color:var(--ink-dim); margin-bottom:10px; line-height:1.4;">
      Neighbors drop by with odd jobs. Finish in time → earn
      <b style="color:#ffd34e;">coins</b> or rare <b style="color:#72f2ff;">gems</b>.
      Decline and they sulk off for a bit.
    </p>`;
  list.appendChild(header);

  const summary = document.createElement('div');
  summary.className = 'upgrade';
  summary.style.gridTemplateColumns = '42px 1fr auto';
  summary.innerHTML = `
    <div class="icon">📋</div>
    <div class="info">
      <div class="name">Quests Completed <span class="lvl">×${state.questsCompleted || 0}</span></div>
      <div class="effect">${q ? '🔥 Quest in progress' : `Next neighbor in ~${Math.ceil(nextIn)}s`}</div>
    </div>
    <div style="font-size:22px; text-align:right;">${q ? '👋' : '🕒'}</div>
  `;
  list.appendChild(summary);

  if (q) {
    const tpl = QUEST_BY_ID[q.id];
    const progress = tpl ? Math.max(0, tpl.getDelta(q)) : 0;
    const pctQ = Math.min(100, (progress / q.goal) * 100);
    const remaining = Math.max(0, q.duration - q.elapsed);
    const rewardStr = q.rewardType === 'gems' ? `+${q.reward} 💎` : `+${formatShort(q.reward)} 💰`;
    const active = document.createElement('div');
    active.className = 'upgrade affordable';
    active.innerHTML = `
      <div class="icon">👋</div>
      <div class="info">
        <div class="name">${q.neighbor} <span class="lvl">ACTIVE</span></div>
        <div class="effect">${q.title}</div>
        <div class="q-bar" style="margin-top:6px; width:100%;"><div class="q-fill" style="width:${pctQ}%"></div></div>
        <div style="font-size:11px; color:var(--ink-dim); margin-top:4px;">
          ${formatShort(progress)} / ${formatShort(q.goal)} · ⏱ ${remaining.toFixed(0)}s · ${rewardStr}
        </div>
      </div>
    `;
    list.appendChild(active);
  }

  const history = Array.isArray(state.questHistory) ? state.questHistory : [];
  const heading = document.createElement('p');
  heading.style.cssText = 'font-size:11px; color:var(--ink-dim); margin:14px 0 6px; text-transform:uppercase; letter-spacing:0.5px;';
  heading.textContent = history.length ? 'History' : 'No quests accepted yet';
  list.appendChild(heading);

  for (const h of history) {
    const ok = h.outcome === 'success';
    const rewardStr = h.rewardType === 'gems' ? `+${h.reward} 💎` : `+${formatShort(h.reward)} 💰`;
    const row = document.createElement('div');
    row.className = 'upgrade' + (ok ? '' : ' maxed');
    row.style.gridTemplateColumns = '42px 1fr auto';
    row.innerHTML = `
      <div class="icon">${ok ? '✅' : '❌'}</div>
      <div class="info">
        <div class="name">${h.neighbor}</div>
        <div class="effect">${h.title}</div>
      </div>
      <div style="text-align:right; font-size:11px;">
        <div style="color:${ok ? '#8ff09e' : '#ffb4b4'}; font-weight:700;">${ok ? 'SUCCESS' : 'FAILED'}</div>
        <div style="color:${ok ? '#ffd34e' : 'var(--ink-dim)'};">${ok ? rewardStr : '—'}</div>
      </div>
    `;
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

// ---------- Grass shop ----------
function countSpecies() {
  const counts = new Array(GRASS_TYPES.length).fill(0);
  if (!grassSpecies) return counts;
  for (let i = 0; i < grassSpecies.length; i++) {
    if (tiles[i] !== T.GRASS) continue;
    counts[grassSpecies[i]]++;
  }
  return counts;
}

function renderGrassShop(list) {
  const header = document.createElement('div');
  header.innerHTML = `
    <p style="font-size:12px; color:var(--ink-dim); margin-bottom:10px; line-height:1.4;">
      Unlock rare grass species that spawn randomly on your lawn.
      They pay more coins per mow but are tougher to cut.
      <b style="color:var(--grass-xlight);">Buy spawn-rate upgrades</b> to see them more often.
    </p>`;
  list.appendChild(header);

  const counts = countSpecies();
  for (let i = 1; i < GRASS_TYPES.length; i++) {
    const def = GRASS_TYPES[i];
    const st = state.grassTypes[def.key];
    const unlocked = !!st?.unlocked;
    const cost = unlocked ? grassSpawnCost(def.key) : def.unlockCost;
    const maxed = unlocked && st.spawnLevel >= GRASS_SPAWN_MAX_LEVEL;
    const affordable = !maxed && state.coins >= cost;
    const row = document.createElement('div');
    const cls = ['upgrade'];
    if (affordable) cls.push('affordable');
    if (maxed) cls.push('maxed');
    row.className = cls.join(' ');
    const lvlBadge = unlocked ? `<span class="lvl">Lv ${st.spawnLevel}/${GRASS_SPAWN_MAX_LEVEL}</span>` : `<span class="lvl">🔒</span>`;
    const effectText = unlocked
      ? `${def.coinMult.toFixed(1)}× coins · ${def.toughness.toFixed(1)}× tough · on lawn: <b>${counts[i]}</b>`
      : `${def.coinMult.toFixed(1)}× coins · ${def.toughness.toFixed(1)}× tough — unlock to spawn`;
    let btn;
    if (maxed) btn = `<button class="buy" disabled>MAX</button>`;
    else if (!unlocked) btn = `<button class="buy" ${affordable ? '' : 'disabled'}>Unlock<span class="cost">💰 ${formatShort(cost)}</span></button>`;
    else btn = `<button class="buy" ${affordable ? '' : 'disabled'}>Spawn +<span class="cost">💰 ${formatShort(cost)}</span></button>`;
    row.innerHTML = `
      <div class="icon">${def.icon}</div>
      <div class="info">
        <div class="name">${def.name} ${lvlBadge}</div>
        <div class="effect">${effectText}</div>
      </div>
      ${btn}
    `;
    const btnEl = row.querySelector('.buy');
    if (btnEl && affordable) {
      btnEl.addEventListener('click', () => unlocked ? upgradeGrassSpawn(def.key) : unlockGrass(def.key));
    }
    list.appendChild(row);
  }
}

function unlockGrass(key) {
  const def = GRASS_BY_KEY[key]; if (!def) return;
  const st = state.grassTypes[key];
  if (!st || st.unlocked) return;
  if (state.coins < def.unlockCost) return;
  state.coins -= def.unlockCost;
  st.unlocked = true;
  beep(600, 0.08, 'sine', 0.07);
  setTimeout(() => beep(960, 0.10, 'triangle', 0.06), 90);
  toast(`${def.icon} Unlocked ${def.name}!`, '#8ff09e');
  addParticle(canvas.width / 2, canvas.height / 2, {
    text: def.icon + ' ' + def.name, color: '#8ff09e', size: 22,
  });
  renderShop();
  saveGame();
}

function upgradeGrassSpawn(key) {
  const def = GRASS_BY_KEY[key]; if (!def) return;
  const st = state.grassTypes[key];
  if (!st?.unlocked) return;
  if (st.spawnLevel >= GRASS_SPAWN_MAX_LEVEL) return;
  const cost = grassSpawnCost(key);
  if (state.coins < cost) return;
  state.coins -= cost;
  st.spawnLevel += 1;
  beep(700 + st.spawnLevel * 20, 0.06, 'triangle', 0.06);
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
  state.activeQuest = null;
  state.questTimer = 80 + Math.random() * 60;
  state.questHistory = [];
  state.questsCompleted = 0;
  state.grassTypes = {
    clover:  { unlocked: false, spawnLevel: 0 },
    thick:   { unlocked: false, spawnLevel: 0 },
    crystal: { unlocked: false, spawnLevel: 0 },
    golden:  { unlocked: false, spawnLevel: 0 },
  };
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
      <div class="crew-name">${owned ? node.crewName : node.name}</div>
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

  // ---------- Mowing Patterns ----------
  const patHeader = document.createElement('div');
  const patOwned = state.patternsUnlocked.length;
  patHeader.innerHTML = `
    <p style="font-size:12px; color:var(--ink-dim); margin:16px 0 10px; line-height:1.4;">
      🪚 <b style="color:var(--grass-xlight);">Mowing Patterns</b> — styles your robots cut into the lawn.<br>
      Unlocked: <b style="color:var(--grass-xlight);">${patOwned}/${MOW_PATTERN_DEFS.length}</b> · Visible on freshly cut grass.
    </p>`;
  list.appendChild(patHeader);

  const patGrid = document.createElement('div');
  patGrid.className = 'pattern-grid';
  for (const pat of MOW_PATTERN_DEFS) {
    const owned = state.patternsUnlocked.indexOf(pat.key) >= 0;
    const active = state.activeMowPattern === pat.key;
    const affordable = !owned && state.coins >= pat.unlockCost;
    const card = document.createElement('div');
    card.className = 'pattern-card' + (owned ? ' owned' : ' locked') + (active ? ' active' : '') + (affordable ? ' affordable' : '');
    const preview = patternPreviewCanvas(pat.key);
    card.appendChild(preview);
    const meta = document.createElement('div');
    meta.className = 'pattern-meta';
    meta.innerHTML = `
      <div class="pattern-name">${pat.icon} ${pat.name}</div>
      <div class="pattern-desc">${pat.desc}</div>
      <div class="pattern-action">${active ? '✔ Equipped' : owned ? 'Equip' : (pat.unlockCost > 0 ? '💰 ' + formatShort(pat.unlockCost) : 'Unlock')}</div>`;
    card.appendChild(meta);
    if (owned && !active) {
      card.addEventListener('click', () => {
        state.activeMowPattern = pat.key;
        robots.forEach(rb => { rb.target = null; }); // re-route to new pattern
        beep(680, 0.08, 'sine', 0.06);
        toast(`🪚 Equipped ${pat.name}`, '#8ff09e');
        renderShop();
        saveGame();
      });
    } else if (!owned && affordable) {
      card.addEventListener('click', () => {
        if (state.coins < pat.unlockCost) return;
        state.coins -= pat.unlockCost;
        state.patternsUnlocked.push(pat.key);
        state.activeMowPattern = pat.key;
        robots.forEach(rb => { rb.target = null; });
        beep(720, 0.08, 'triangle', 0.07);
        setTimeout(() => beep(1080, 0.1, 'triangle', 0.06), 80);
        toast(`🪚 Unlocked ${pat.name}!`, '#ffd34e');
        renderShop();
        saveGame();
      });
    }
    patGrid.appendChild(card);
  }
  list.appendChild(patGrid);
}

// Draw a small preview of the pattern on a fake green tile grid so the
// player can recognize each style at a glance in the shop.
function patternPreviewCanvas(key) {
  const size = 72;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  c.className = 'pattern-preview';
  const g = c.getContext('2d');
  g.fillStyle = '#3a8840';
  g.fillRect(0, 0, size, size);
  const cells = 8;
  const cell = size / cells;
  const prev = state.activeMowPattern;
  state.activeMowPattern = key;
  for (let ty = 0; ty < cells; ty++) {
    for (let tx = 0; tx < cells; tx++) {
      const tint = mowPatternTint(tx, ty, 0);
      if (!tint) continue;
      g.fillStyle = tint.dark
        ? `rgba(0,0,0,${tint.alpha.toFixed(3)})`
        : `rgba(255,255,255,${(tint.alpha * 0.65).toFixed(3)})`;
      g.fillRect(tx * cell, ty * cell, cell, cell);
    }
  }
  state.activeMowPattern = prev;
  return c;
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

// ---------- Settings modal ----------
function openSettingsModal() {
  if (document.querySelector('.settings-modal-backdrop')) return;
  const back = document.createElement('div');
  back.className = 'modal-backdrop settings-modal-backdrop';
  const rows = SETTING_DEFS.map(def => {
    if (def.type === 'select') {
      const options = typeof def.options === 'function' ? def.options() : (def.options || []);
      const current = state.settings[def.key];
      const chips = options.map(opt => {
        const active = opt.value === current;
        return `<button type="button" class="settings-chip${active ? ' active' : ''}" data-key="${def.key}" data-value="${opt.value}" title="${(opt.desc || '').replace(/"/g,'&quot;')}">${opt.label}</button>`;
      }).join('');
      return `
        <div class="settings-row settings-row-stack">
          <div class="settings-info">
            <div class="settings-label">${def.label}</div>
            <div class="settings-hint">${def.hint || ''}</div>
          </div>
          <div class="settings-chips">${chips}</div>
        </div>`;
    }
    const on = !!state.settings[def.key];
    return `
      <label class="settings-row" data-key="${def.key}">
        <div class="settings-info">
          <div class="settings-label">${def.label}</div>
          <div class="settings-hint">${def.hint || ''}</div>
        </div>
        <span class="toggle ${on ? 'on' : ''}" data-key="${def.key}"><span class="knob"></span></span>
      </label>`;
  }).join('');
  back.innerHTML = `
    <div class="modal settings-modal">
      <h2>⚙️ SETTINGS</h2>
      <div class="settings-list">${rows}</div>
      <button id="settingsCloseBtn">Done</button>
    </div>`;
  document.body.appendChild(back);
  back.querySelectorAll('.toggle').forEach(t => {
    t.addEventListener('click', (e) => {
      e.preventDefault();
      const key = t.dataset.key;
      state.settings[key] = !state.settings[key];
      t.classList.toggle('on', !!state.settings[key]);
      beep(state.settings[key] ? 720 : 520, 0.05, 'sine', 0.05);
      saveGame();
    });
  });
  back.querySelectorAll('.settings-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const value = btn.dataset.value;
      state.settings[key] = value;
      // refresh active state among siblings
      btn.parentElement.querySelectorAll('.settings-chip').forEach(s => s.classList.toggle('active', s === btn));
      if (key === 'theme' && typeof applyThemeDom === 'function') applyThemeDom();
      beep(620, 0.05, 'sine', 0.05);
      saveGame();
    });
  });
  const close = () => back.remove();
  back.querySelector('#settingsCloseBtn').addEventListener('click', close);
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
}

// ---------- Zen Mode ----------
// Zen is a standalone screensaver world: a fresh garden composed from
// sliders (mowers, flowers, beehives, ...), completely decoupled from the
// player's progression. On enter we snapshot the live game; on exit we
// restore it. No coins, upgrades, or unlocks are affected by zen activity.
let zenSnapshot = null;

function openZenSetupModal() {
  if (state.zenMode) { exitZenMode(); return; }
  if (document.querySelector('.zen-setup-backdrop')) return;
  const cfg = Object.assign({}, ZEN_CONFIG_DEFAULT, state.zenConfig || {});
  const back = document.createElement('div');
  back.className = 'modal-backdrop zen-setup-backdrop';
  const rows = ZEN_SLIDERS.map(s => `
    <div class="zen-slider-row" data-key="${s.key}">
      <div class="zen-slider-head">
        <span class="zen-slider-ico">${s.icon}</span>
        <span class="zen-slider-label">${s.label}</span>
        <span class="zen-slider-value" data-val="${s.key}">${cfg[s.key]}</span>
      </div>
      <input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${cfg[s.key]}" data-key="${s.key}">
    </div>`).join('');

  // Skin + mowing pattern chip pickers. In zen we let the player preview any
  // skin or pattern regardless of their real-game unlock state — it's a
  // screensaver, not a progression tab.
  const skinChips = SKIN_DEFS.map(s => {
    const active = cfg.skin === s.key;
    return `<button type="button" class="settings-chip${active ? ' active' : ''}" data-zen-key="skin" data-value="${s.key}" title="${(s.name || '').replace(/"/g,'&quot;')}">${s.name}</button>`;
  }).join('');
  const patternChips = MOW_PATTERN_DEFS.map(p => {
    const active = cfg.pattern === p.key;
    return `<button type="button" class="settings-chip${active ? ' active' : ''}" data-zen-key="pattern" data-value="${p.key}" title="${(p.desc || '').replace(/"/g,'&quot;')}">${p.icon} ${p.name}</button>`;
  }).join('');
  const extraRows = `
    <div class="zen-slider-row">
      <div class="zen-slider-head">
        <span class="zen-slider-ico">🎨</span>
        <span class="zen-slider-label">Mower Skin</span>
      </div>
      <div class="settings-chips">${skinChips}</div>
    </div>
    <div class="zen-slider-row">
      <div class="zen-slider-head">
        <span class="zen-slider-ico">🪚</span>
        <span class="zen-slider-label">Mowing Pattern</span>
      </div>
      <div class="settings-chips">${patternChips}</div>
    </div>`;

  back.innerHTML = `
    <div class="modal zen-modal">
      <h2>🧘 ZEN MODE</h2>
      <p>Compose your garden screensaver. No fuel, no shopping — just watch.<br>
         <span style="opacity:0.7; font-size:11px;">Your real game is paused and untouched.</span></p>
      <div class="zen-sliders">${rows}${extraRows}</div>
      <div class="zen-actions">
        <button id="zenResetBtn" class="ghost">Defaults</button>
        <button id="zenCancelBtn" class="ghost">Cancel</button>
        <button id="zenStartBtn">Start Zen</button>
      </div>
    </div>`;
  document.body.appendChild(back);

  back.querySelectorAll('input[type="range"]').forEach(input => {
    input.addEventListener('input', () => {
      const key = input.dataset.key;
      const val = parseInt(input.value, 10) || 0;
      state.zenConfig[key] = val;
      back.querySelector(`[data-val="${key}"]`).textContent = val;
    });
  });
  back.querySelectorAll('.settings-chip[data-zen-key]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.zenKey;
      state.zenConfig[key] = btn.dataset.value;
      back.querySelectorAll(`.settings-chip[data-zen-key="${key}"]`).forEach(s => s.classList.toggle('active', s === btn));
    });
  });
  const close = () => back.remove();
  back.querySelector('#zenCancelBtn').addEventListener('click', close);
  back.querySelector('#zenResetBtn').addEventListener('click', () => {
    Object.assign(state.zenConfig, ZEN_CONFIG_DEFAULT);
    back.querySelectorAll('input[type="range"]').forEach(input => {
      const key = input.dataset.key;
      input.value = state.zenConfig[key];
      back.querySelector(`[data-val="${key}"]`).textContent = state.zenConfig[key];
    });
    back.querySelectorAll('.settings-chip[data-zen-key]').forEach(btn => {
      const key = btn.dataset.zenKey;
      btn.classList.toggle('active', btn.dataset.value === state.zenConfig[key]);
    });
  });
  back.querySelector('#zenStartBtn').addEventListener('click', () => {
    close();
    enterZenMode();
  });
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
}

function enterZenMode() {
  if (state.zenMode) return;
  saveGame(); // persist real game first
  zenSnapshot = {
    coins: state.coins,
    gems: state.gems,
    totalEarnedAllTime: state.totalEarnedAllTime,
    totalEarnedThisRun: state.totalEarnedThisRun,
    totalTilesMowed: state.totalTilesMowed,
    fuel: state.fuel,
    upgrades: Object.assign({}, state.upgrades),
    garden: Object.assign({}, state.garden),
    gnomeTimer: state.gnomeTimer,
    skinsUnlocked: state.skinsUnlocked.slice(),
    activeSkin: state.activeSkin,
    activeMowPattern: state.activeMowPattern,
    patternsUnlocked: state.patternsUnlocked.slice(),
    treasuresCollected: state.treasuresCollected,
    grass: new Float32Array(grass),
    tiles: new Uint8Array(tiles),
    flowerColors: new Uint8Array(flowerColors),
    grassSpecies: grassSpecies ? new Uint8Array(grassSpecies) : null,
    robots, bees, visitorGnomes, treasures,
    particles: particles.slice(),
  };

  state.zenMode = true;
  document.body.classList.add('zen-mode');
  buildZenWorld(state.zenConfig);

  const el = document.documentElement;
  if (el.requestFullscreen && !document.fullscreenElement) {
    el.requestFullscreen().catch(() => {});
  }
  refitCanvas();
  toast('🧘 Zen Mode — breathe and watch.', '#c6a8ff');
}

function exitZenMode() {
  if (!state.zenMode || !zenSnapshot) {
    state.zenMode = false;
    document.body.classList.remove('zen-mode');
    return;
  }
  // Restore live game
  state.coins = zenSnapshot.coins;
  state.gems = zenSnapshot.gems;
  state.totalEarnedAllTime = zenSnapshot.totalEarnedAllTime;
  state.totalEarnedThisRun = zenSnapshot.totalEarnedThisRun;
  state.totalTilesMowed = zenSnapshot.totalTilesMowed;
  state.fuel = zenSnapshot.fuel;
  state.upgrades = zenSnapshot.upgrades;
  state.garden = zenSnapshot.garden;
  state.gnomeTimer = zenSnapshot.gnomeTimer;
  state.skinsUnlocked = zenSnapshot.skinsUnlocked;
  state.activeSkin = zenSnapshot.activeSkin;
  state.activeMowPattern = zenSnapshot.activeMowPattern;
  state.patternsUnlocked = zenSnapshot.patternsUnlocked;
  state.treasuresCollected = zenSnapshot.treasuresCollected;
  grass = zenSnapshot.grass;
  tiles = zenSnapshot.tiles;
  flowerColors = zenSnapshot.flowerColors;
  if (zenSnapshot.grassSpecies) grassSpecies = zenSnapshot.grassSpecies;
  robots = zenSnapshot.robots;
  bees = zenSnapshot.bees;
  visitorGnomes = zenSnapshot.visitorGnomes;
  treasures = zenSnapshot.treasures;
  particles.length = 0;
  for (const p of zenSnapshot.particles) particles.push(p);
  zenSnapshot = null;

  state.zenMode = false;
  document.body.classList.remove('zen-mode');
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
  refitCanvas();
  renderShop();
  saveGame();
}

function buildZenWorld(cfg) {
  grass = new Float32Array(CFG.gridW * CFG.gridH);
  tiles = new Uint8Array(CFG.gridW * CFG.gridH);
  flowerColors = new Uint8Array(CFG.gridW * CFG.gridH);
  grassSpecies = new Uint8Array(CFG.gridW * CFG.gridH);
  for (let i = 0; i < grass.length; i++) grass[i] = 0.7 + Math.random() * 0.3;
  robots = [];
  bees = [];
  visitorGnomes = [];
  treasures = [];
  particles.length = 0;

  const placeMany = (type, n) => { for (let i = 0; i < n; i++) placeAtRandomGrass(type); };
  placeMany(T.TREE,    cfg.trees);
  placeMany(T.ROCK,    cfg.rocks);
  placeMany(T.POND,    cfg.ponds);
  placeMany(T.FLOWER,  cfg.flowers);
  placeMany(T.BEEHIVE, cfg.beehives);
  placeMany(T.GNOME,   cfg.gnomes);

  // Bump gameplay knobs that drive robot/bee/flower counts.
  state.upgrades.robots = cfg.robots;
  state.garden = Object.assign({}, state.garden, {
    flower: cfg.flowers, beehive: cfg.beehives, tree: cfg.trees,
    rock: cfg.rocks, pond: cfg.ponds, gnome: cfg.gnomes,
  });
  ensureRobotCount();
  ensureBeesFromHives();
  state.fuel = CFG.fuelMax;

  // Apply zen-only cosmetic overrides. Any skin/pattern is fair game in zen,
  // regardless of the player's real unlocks — it's a preview space.
  if (cfg.skin && SKIN_BY_KEY[cfg.skin]) state.activeSkin = cfg.skin;
  if (cfg.pattern && MOW_PATTERN_BY_KEY[cfg.pattern]) state.activeMowPattern = cfg.pattern;

  // Suppress visitor gnomes & their treasure popups — zen stays peaceful.
  state.gnomeTimer = Number.POSITIVE_INFINITY;
}

// Resize canvas to current container and rescale entity positions.
function refitCanvas() {
  const prev = tileSize;
  resizeCanvas();
  if (!prev || prev === tileSize) return;
  const scale = tileSize / prev;
  robots.forEach(r => { r.x *= scale; r.y *= scale; });
  bees.forEach(b => {
    b.x *= scale; b.y *= scale;
    if (b.target) { b.target.x *= scale; b.target.y *= scale; }
  });
  visitorGnomes.forEach(g => {
    g.x *= scale; g.y *= scale;
    g.targetX *= scale; g.targetY *= scale;
    g.exitX *= scale; g.exitY *= scale;
  });
  treasures.forEach(t => {
    t.x = (t.tileX + 0.5) * tileSize;
    t.y = (t.tileY + 0.5) * tileSize;
  });
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

  document.getElementById('settingsBtn').addEventListener('click', openSettingsModal);
  document.getElementById('zenBtn').addEventListener('click', openZenSetupModal);
  document.getElementById('zenExit').addEventListener('click', exitZenMode);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.zenMode) exitZenMode();
  });
  document.addEventListener('fullscreenchange', () => {
    // If the user exits fullscreen via browser UI, leave zen mode too.
    if (!document.fullscreenElement && state.zenMode) exitZenMode();
  });
}

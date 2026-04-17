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
  document.getElementById('gemBonus').textContent = `+${Math.round((gemMult() - 1) * 100)}% bonus`;

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

  // Atmosphere pill: weather icon + name, plus a small clock when relevant.
  const atmoEl = document.getElementById('hudAtmo');
  if (atmoEl && typeof activeWeather === 'function') {
    const w = activeWeather();
    const hour = Math.floor(state.timeOfDay || 12);
    const mode = (state.settings && state.settings.dayNight) || 'auto';
    let timeIco = '';
    if (mode !== 'off') {
      if (hour < 5 || hour >= 20) timeIco = ' 🌙';
      else if (hour < 7)          timeIco = ' 🌅';
      else if (hour < 17)         timeIco = '';        // daytime — no icon clutter
      else if (hour < 20)         timeIco = ' 🌇';
    }
    atmoEl.textContent = `${w.icon} ${w.name}${timeIco}`;
  }

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
  { key: 'pest',   icon: '🐹', name: 'Pest Control',
    desc: (s) => `Moles: +${s.upgrades.pest * 15}% interval · -${s.upgrades.pest * 8}% lifetime`,
    effect: () => `Rarer moles, shorter dig-ins` },
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

// ---------- Bulk-buy modifier ----------
// Hold Shift for ×10, Ctrl/Cmd for ×100, both for Max affordable.
// Session-only — never persisted.
let buyMult = 1;
function updateBuyMult(e) {
  const shift = !!e.shiftKey;
  const ctrl = !!(e.ctrlKey || e.metaKey);
  let next = 1;
  if (shift && ctrl) next = Infinity;
  else if (ctrl) next = 100;
  else if (shift) next = 10;
  if (next !== buyMult) {
    buyMult = next;
    renderShop();
  }
}
function buyMultLabel() {
  if (buyMult === Infinity) return 'MAX';
  if (buyMult > 1) return '×' + buyMult;
  return '';
}
// Plan a sequence of purchases. `nextCost(i)` returns cost of the (i+1)-th purchase,
// `canBuyMore(i)` returns true if another purchase is still allowed (not maxed).
// Returns { count, total } limited by buyMult and current coins.
function planBulk(nextCost, canBuyMore) {
  let count = 0, total = 0, coinsLeft = state.coins;
  while (count < buyMult && canBuyMore(count)) {
    const c = nextCost(count);
    if (!isFinite(c) || coinsLeft < c) break;
    coinsLeft -= c;
    total += c;
    count++;
  }
  return { count, total };
}

function renderShop() {
  const list = document.getElementById('shopList');
  list.innerHTML = '';

  if (buyMult !== 1) {
    const hint = document.createElement('div');
    hint.className = 'buy-mode-hint';
    hint.textContent = `Bulk-buy mode: ${buyMultLabel()} (Shift ×10 · Ctrl ×100 · Shift+Ctrl MAX)`;
    list.appendChild(hint);
  }

  if (activeTab === 'prestige') { renderPrestige(list); return; }
  if (activeTab === 'garden')   { renderGarden(list);   return; }
  if (activeTab === 'crew')     { renderCrew(list);     return; }
  if (activeTab === 'skins')    { renderSkins(list);    return; }
  if (activeTab === 'tools')    { renderTools(list);    return; }
  if (activeTab === 'grass')    { renderGrassShop(list); return; }
  if (activeTab === 'quests')   { renderQuests(list);    return; }
  if (activeTab === 'gemshop')  { renderGemShop(list);   return; }
  if (activeTab === 'rubyshop') { renderRubyShop(list);  return; }

  for (const up of UPGRADE_DEFS) {
    if (up.show && !up.show()) continue;
    const lvl = state.upgrades[up.key];
    const maxed = lvl >= MAX[up.key];
    const plan = maxed ? { count: 0, total: 0 } : planBulk(
      (i) => COST[up.key](lvl + i),
      (i) => lvl + i < MAX[up.key],
    );
    const singleCost = maxed ? Infinity : COST[up.key](lvl);
    const affordable = plan.count > 0;
    const row = document.createElement('div');
    row.className = 'upgrade' + (affordable ? ' affordable' : '') + (maxed ? ' maxed' : '');
    const tooltip = maxed ? 'Fully upgraded' : up.effect(state);
    const buyLabel = maxed ? 'MAX' : (plan.count > 1 ? `Buy ×${plan.count}` : 'Buy');
    const costLabel = maxed ? '—' : '💰 ' + formatShort(plan.count > 0 ? plan.total : singleCost);
    row.innerHTML = `
      <div class="icon">${up.icon}</div>
      <div class="info">
        <div class="name">${up.name} ${up.key !== 'robots' ? `<span class="lvl">Lv ${lvl}</span>` : ''}</div>
        <div class="effect">${maxed ? '⭐ MAXED' : up.desc(state)}</div>
      </div>
      <button class="buy" ${affordable ? '' : 'disabled'} title="${tooltip.replace(/"/g,'&quot;')}">
        ${buyLabel}
        <span class="cost">${costLabel}</span>
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
    const plan = maxed ? { count: 0, total: 0 } : planBulk(
      (i) => Math.ceil(def.baseCost * Math.pow(def.mult, owned + i)),
      (i) => owned + i < def.max,
    );
    const singleCost = maxed ? Infinity : gardenCost(def.key);
    const affordable = plan.count > 0;
    const row = document.createElement('div');
    row.className = 'upgrade' + (affordable ? ' affordable' : '');
    const placeLabel = maxed ? 'MAX' : (plan.count > 1 ? `Place ×${plan.count}` : 'Place');
    const costLabel = maxed ? '—' : '💰 ' + formatShort(plan.count > 0 ? plan.total : singleCost);
    row.innerHTML = `
      <div class="icon">${def.icon}</div>
      <div class="info">
        <div class="name">${def.name} <span class="lvl">× ${owned}/${def.max}</span></div>
        <div class="effect">${def.desc()}</div>
      </div>
      <button class="buy" ${affordable ? '' : 'disabled'}>
        ${placeLabel}
        <span class="cost">${costLabel}</span>
      </button>
    `;
    row.querySelector('.buy').addEventListener('click', () => buyGarden(def.key));
    list.appendChild(row);
  }
}

function buyGarden(key) {
  const def = GARDEN_BY_KEY[key];
  const startOwned = state.garden[key];
  // Plan with predictive cost, but each buy also has to actually find free grass —
  // so we commit one-at-a-time and stop if a placement fails.
  const plan = planBulk(
    (i) => Math.ceil(def.baseCost * Math.pow(def.mult, startOwned + i)),
    (i) => startOwned + i < def.max,
  );
  if (plan.count === 0) return;
  let placedCount = 0;
  let spentSoFar = 0;
  let lastPlacement = null;
  for (let i = 0; i < plan.count; i++) {
    const cost = Math.ceil(def.baseCost * Math.pow(def.mult, startOwned + i));
    const placed = placeAtRandomGrass(def.type);
    if (!placed) break;
    state.coins -= cost;
    state.garden[key] = startOwned + i + 1;
    spentSoFar += cost;
    placedCount++;
    lastPlacement = placed;
  }
  if (placedCount === 0) {
    toast('⚠️ No free grass tile found!', '#ffb4b4');
    return;
  }
  beep(500 + startOwned * 15, 0.08, 'sine', 0.07);
  if (key === 'beehive') {
    ensureBeesFromHives();
    toast(`🐝 Placed ${placedCount} beehive${placedCount > 1 ? 's' : ''}!`, '#ffd34e');
  } else if (lastPlacement) {
    addParticle((lastPlacement.x + 0.5) * tileSize, (lastPlacement.y + 0.5) * tileSize, {
      text: (placedCount > 1 ? `×${placedCount} ` : '+') + def.icon, color: '#8ff09e', size: 18,
    });
  }
  if (placedCount < plan.count) toast(`⚠️ Only ${placedCount} of ${plan.count} placed — lawn is full.`, '#ffb4b4');
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

  const startIdx = state.upgrades.tool;
  const toolPlan = planBulk(
    (i) => TOOL_TYPES[startIdx + 1 + i]?.upgradeCost ?? Infinity,
    (i) => startIdx + 1 + i < TOOL_TYPES.length,
  );
  // Which tiers will this click skip past?
  const skipUntil = startIdx + toolPlan.count;

  for (let i = 0; i < TOOL_TYPES.length; i++) {
    const tool = TOOL_TYPES[i];
    const owned = state.upgrades.tool >= i;
    const isNext = i === state.upgrades.tool + 1;
    const row = document.createElement('div');
    const classes = ['upgrade'];
    if (isNext && toolPlan.count > 0) classes.push('affordable');
    if (i === state.upgrades.tool) classes.push('active');
    if (isNext && i <= skipUntil && toolPlan.count > 1) classes.push('affordable');
    row.className = classes.join(' ');
    let btn;
    if (owned) {
      btn = `<button class="buy" disabled>${i === state.upgrades.tool ? '✔ EQUIPPED' : 'OWNED'}</button>`;
    } else if (isNext) {
      const canBuy = toolPlan.count > 0;
      const label = canBuy && toolPlan.count > 1 ? `Buy ×${toolPlan.count}` : 'Buy';
      const costText = canBuy ? formatShort(toolPlan.total) : formatShort(tool.upgradeCost ?? 0);
      btn = `<button class="buy" ${canBuy ? '' : 'disabled'}>${label}<span class="cost">💰 ${costText}</span></button>`;
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
    if (buyBtn && isNext && toolPlan.count > 0) buyBtn.addEventListener('click', () => buyTool(i));
    list.appendChild(row);
  }
}

function buyTool(idx) {
  if (idx !== state.upgrades.tool + 1) return;
  // Tiers are strictly sequential, so bulk = advance as many tiers as affordable.
  const startIdx = state.upgrades.tool;
  const plan = planBulk(
    (i) => TOOL_TYPES[startIdx + 1 + i]?.upgradeCost ?? Infinity,
    (i) => startIdx + 1 + i < TOOL_TYPES.length,
  );
  if (plan.count === 0) return;
  state.coins -= plan.total;
  state.upgrades.tool = startIdx + plan.count;
  const tool = TOOL_TYPES[state.upgrades.tool];
  beep(700 + state.upgrades.tool * 40, 0.08, 'sine', 0.07);
  setTimeout(() => beep(1040 + state.upgrades.tool * 50, 0.1, 'triangle', 0.06), 90);
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
    const maxed = unlocked && st.spawnLevel >= GRASS_SPAWN_MAX_LEVEL;
    const gemGated = !!def.gemGated;
    let plan = { count: 0, total: 0 };
    let affordable = false;
    let cost = 0;
    if (!unlocked && !gemGated) {
      cost = def.unlockCost;
      affordable = state.coins >= cost;
    } else if (!maxed && unlocked) {
      plan = planBulk(
        (n) => Math.ceil(grassSpawnBaseCost(def) * Math.pow(1.6, st.spawnLevel + n)),
        (n) => st.spawnLevel + n < GRASS_SPAWN_MAX_LEVEL,
      );
      cost = plan.count > 0 ? plan.total : grassSpawnCost(def.key);
      affordable = plan.count > 0;
    }
    const row = document.createElement('div');
    const cls = ['upgrade'];
    if (affordable) cls.push('affordable');
    if (maxed) cls.push('maxed');
    row.className = cls.join(' ');
    const lvlBadge = unlocked ? `<span class="lvl">Lv ${st.spawnLevel}/${GRASS_SPAWN_MAX_LEVEL}</span>` : `<span class="lvl">🔒</span>`;
    const effectText = unlocked
      ? `${def.coinMult.toFixed(1)}× coins · ${def.toughness.toFixed(1)}× tough · on lawn: <b>${counts[i]}</b>`
      : gemGated
      ? `${def.coinMult.toFixed(1)}× coins · ${def.toughness.toFixed(1)}× tough — unlock with 💎 in the Gems tab`
      : `${def.coinMult.toFixed(1)}× coins · ${def.toughness.toFixed(1)}× tough — unlock to spawn`;
    let btn;
    if (maxed) {
      btn = `<button class="buy" disabled>MAX</button>`;
    } else if (!unlocked && gemGated) {
      btn = `<button class="buy" disabled>🔒 💎 Gem Shop</button>`;
    } else if (!unlocked) {
      btn = `<button class="buy" ${affordable ? '' : 'disabled'}>Unlock<span class="cost">💰 ${formatShort(cost)}</span></button>`;
    } else {
      const label = plan.count > 1 ? `Spawn ×${plan.count}` : 'Spawn +';
      btn = `<button class="buy" ${affordable ? '' : 'disabled'}>${label}<span class="cost">💰 ${formatShort(cost)}</span></button>`;
    }
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
  const startLvl = st.spawnLevel;
  const plan = planBulk(
    (i) => Math.ceil(grassSpawnBaseCost(def) * Math.pow(1.6, startLvl + i)),
    (i) => startLvl + i < GRASS_SPAWN_MAX_LEVEL,
  );
  if (plan.count === 0) return;
  state.coins -= plan.total;
  st.spawnLevel = startLvl + plan.count;
  beep(700 + st.spawnLevel * 20, 0.06, 'triangle', 0.06);
  renderShop();
  saveGame();
}

// ---------- Gem shop (permanent, persists through prestige) ----------
function planGemBulk(key) {
  const def = GEM_BY_KEY[key]; if (!def) return { count: 0, total: 0 };
  let lvl = gemLvl(key);
  let gemsLeft = state.gems;
  let count = 0, total = 0;
  while (count < buyMult && lvl < def.max) {
    const c = gemUpgradeCost(key, lvl);
    if (!isFinite(c) || gemsLeft < c) break;
    gemsLeft -= c;
    total += c;
    count++;
    lvl++;
  }
  return { count, total };
}

function renderGemShop(list) {
  const header = document.createElement('div');
  header.innerHTML = `
    <p style="font-size:12px; color:var(--ink-dim); margin-bottom:10px; line-height:1.4;">
      Spend 💎 gems on permanent upgrades. <b style="color:var(--gem);">These survive prestige.</b><br>
      Available: <b style="color:var(--gem);">${formatShort(state.gems)} 💎</b>
      · Lifetime: ${formatShort(state.totalGemsEarned || 0)} 💎 (${Math.round(gemMult() * 100 - 100)}% passive coin bonus)
    </p>`;
  list.appendChild(header);

  for (const def of GEM_UPGRADES) {
    const lvl = gemLvl(def.key);
    const maxed = lvl >= def.max;
    const plan = maxed ? { count: 0, total: 0 } : planGemBulk(def.key);
    const singleCost = maxed ? Infinity : gemUpgradeCost(def.key, lvl);
    const affordable = plan.count > 0;
    const row = document.createElement('div');
    row.className = 'upgrade' + (affordable ? ' affordable' : '') + (maxed ? ' maxed' : '');
    const label = maxed ? 'MAX' : (plan.count > 1 ? `Buy ×${plan.count}` : 'Buy');
    const costLabel = maxed ? '—' : '💎 ' + formatShort(plan.count > 0 ? plan.total : singleCost);
    row.innerHTML = `
      <div class="icon">${def.icon}</div>
      <div class="info">
        <div class="name">${def.name} <span class="lvl">Lv ${lvl}/${def.max}</span></div>
        <div class="effect">${def.statusText(lvl)}</div>
        <div class="effect" style="opacity:0.7;">${def.desc}</div>
      </div>
      <button class="buy" ${affordable ? '' : 'disabled'}>
        ${label}
        <span class="cost">${costLabel}</span>
      </button>
    `;
    const btn = row.querySelector('.buy');
    if (btn && affordable) btn.addEventListener('click', () => buyGemUpgrade(def.key));
    list.appendChild(row);
  }
}

function buyGemUpgrade(key) {
  const def = GEM_BY_KEY[key]; if (!def) return;
  const plan = planGemBulk(key);
  if (plan.count === 0) return;
  state.gems -= plan.total;
  state.gemUpgrades[key] = gemLvl(key) + plan.count;
  applyGemGrassUnlocks();
  beep(720 + state.gemUpgrades[key] * 35, 0.08, 'triangle', 0.07);
  setTimeout(() => beep(1120 + state.gemUpgrades[key] * 45, 0.1, 'sine', 0.06), 80);
  addParticle(canvas.width / 2, canvas.height / 2, {
    text: `${def.icon} ${def.name} Lv ${state.gemUpgrades[key]}`,
    color: '#72f2ff', size: 20,
  });
  renderShop();
  saveGame();
}

// ---------- Ruby shop (persists through Ascend) ----------
function planRubyBulk(key) {
  const def = RUBY_BY_KEY[key]; if (!def) return { count: 0, total: 0 };
  let lvl = rubyLvl(key);
  let rubiesLeft = state.rubies || 0;
  let count = 0, total = 0;
  while (count < buyMult && lvl < def.max) {
    const c = rubyUpgradeCost(key, lvl);
    if (!isFinite(c) || rubiesLeft < c) break;
    rubiesLeft -= c;
    total += c;
    count++;
    lvl++;
  }
  return { count, total };
}

function renderRubyShop(list) {
  const header = document.createElement('div');
  const gainableNow = Math.floor(CFG.ascendFormula(state.totalGemsEarned || 0) * rubyShopAscendMult());
  header.innerHTML = `
    <p style="font-size:12px; color:var(--ink-dim); margin-bottom:10px; line-height:1.4;">
      Spend ♦️ rubies on the deepest permanent upgrades. <b style="color:#ff6b8b;">These survive every prestige AND ascend.</b><br>
      Rubies: <b style="color:#ff6b8b;">${formatShort(state.rubies || 0)} ♦️</b>
      · Lifetime: ${formatShort(state.totalRubiesEarned || 0)} ♦️
      · Pending at Ascend: <b style="color:#ff6b8b;">+${gainableNow}</b>
    </p>`;
  list.appendChild(header);

  for (const def of RUBY_UPGRADES) {
    const lvl = rubyLvl(def.key);
    const maxed = lvl >= def.max;
    const plan = maxed ? { count: 0, total: 0 } : planRubyBulk(def.key);
    const singleCost = maxed ? Infinity : rubyUpgradeCost(def.key, lvl);
    const affordable = plan.count > 0;
    const row = document.createElement('div');
    row.className = 'upgrade' + (affordable ? ' affordable' : '') + (maxed ? ' maxed' : '');
    const label = maxed ? 'MAX' : (plan.count > 1 ? `Buy ×${plan.count}` : 'Buy');
    const costLabel = maxed ? '—' : '♦️ ' + formatShort(plan.count > 0 ? plan.total : singleCost);
    row.innerHTML = `
      <div class="icon">${def.icon}</div>
      <div class="info">
        <div class="name">${def.name} <span class="lvl">Lv ${lvl}/${def.max}</span></div>
        <div class="effect" style="color:#ff8ea5;">${def.statusText(lvl)}</div>
        <div class="effect" style="opacity:0.7;">${def.desc}</div>
      </div>
      <button class="buy" ${affordable ? '' : 'disabled'}>
        ${label}
        <span class="cost">${costLabel}</span>
      </button>
    `;
    const btn = row.querySelector('.buy');
    if (btn && affordable) btn.addEventListener('click', () => buyRubyUpgrade(def.key));
    list.appendChild(row);
  }
}

function buyRubyUpgrade(key) {
  const def = RUBY_BY_KEY[key]; if (!def) return;
  const plan = planRubyBulk(key);
  if (plan.count === 0) return;
  state.rubies = (state.rubies || 0) - plan.total;
  state.rubyUpgrades[key] = rubyLvl(key) + plan.count;
  beep(520 + state.rubyUpgrades[key] * 30, 0.09, 'triangle', 0.08);
  setTimeout(() => beep(780 + state.rubyUpgrades[key] * 40, 0.1, 'sine', 0.07), 80);
  addParticle(canvas.width / 2, canvas.height / 2, {
    text: `${def.icon} ${def.name} Lv ${state.rubyUpgrades[key]}`,
    color: '#ff6b8b', size: 22,
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
      <div class="effect">Global bonus: +${Math.round((gemMult() - 1) * 100)}% to all coin income</div>
    </div>
  `;
  list.appendChild(info);

  // --- Ascend (ruby prestige) ---
  const ascendBase = CFG.ascendFormula(state.totalGemsEarned || 0);
  const ascendGain = Math.floor(ascendBase * rubyShopAscendMult());
  const canAscend = (state.totalGemsEarned || 0) >= CFG.ascendThreshold && ascendGain > 0;
  const ascend = document.createElement('div');
  ascend.className = 'prestige';
  ascend.style.background = 'linear-gradient(180deg, rgba(160, 30, 60, 0.65), rgba(40, 8, 20, 0.8))';
  ascend.style.borderColor = 'rgba(255, 90, 120, 0.55)';
  ascend.innerHTML = `
    <h3 style="color:#ff6b8b; text-shadow: 0 0 10px rgba(255,90,120,0.5);">♦️ ASCEND</h3>
    <p>A deeper reset. <b>Wipes everything</b> — coins, runs, upgrades,
    garden, crew, grass species, 💎 gems, gem shop. Keeps ♦️ rubies,
    ruby shop, skins, and patterns.</p>
    <div class="gain" style="color:#ff6b8b; text-shadow:0 0 10px rgba(255,90,120,0.4);">♦️ +${ascendGain} rubies</div>
    <p style="font-size:11px; opacity:0.7;">Threshold: ${CFG.ascendThreshold} 💎 earned cumulatively<br>
    Lifetime 💎 earned: ${formatShort(state.totalGemsEarned || 0)}</p>
    <button id="ascendBtn" ${canAscend ? '' : 'disabled'}
      style="background: linear-gradient(180deg,#ff4a6a,#9e1230); box-shadow: 0 4px 14px rgba(255,90,120,0.35);">
      Ascend (+${ascendGain} ♦️)
    </button>
  `;
  list.appendChild(ascend);
  const ab = ascend.querySelector('#ascendBtn');
  if (ab) ab.addEventListener('click', doAscend);

  const rubyInfo = document.createElement('div');
  rubyInfo.className = 'upgrade';
  rubyInfo.style.gridTemplateColumns = '42px 1fr';
  rubyInfo.innerHTML = `
    <div class="icon">♦️</div>
    <div class="info">
      <div class="name" style="color:#ff6b8b;">Current Rubies: ${state.rubies || 0}</div>
      <div class="effect">Lifetime ♦️: ${state.totalRubiesEarned || 0} · Spend in the ♦️ Rubies tab</div>
    </div>
  `;
  list.appendChild(rubyInfo);
}

function buy(key) {
  const startLvl = state.upgrades[key];
  const plan = planBulk(
    (i) => COST[key](startLvl + i),
    (i) => startLvl + i < MAX[key],
  );
  if (plan.count === 0) return;
  state.coins -= plan.total;
  state.upgrades[key] = startLvl + plan.count;
  if (key === 'robots') {
    ensureRobotCount();
    addParticle(canvas.width / 2, canvas.height / 2, {
      text: plan.count > 1 ? `+${plan.count} ROBOTS!` : 'NEW ROBOT!',
      color: '#8ff09e', size: 18,
    });
  }
  beep(660 + startLvl * 10, 0.08, 'square', 0.08);
  renderShop();
  saveGame();
}

function doPrestige() {
  const baseGain = CFG.prestigeFormula(state.totalEarnedThisRun);
  const gain = Math.floor(baseGain * gemShopPrestigeMult() * rubyShopPrestigeMult());
  if (gain <= 0) return;
  if (!confirm(`Fertilize? You will gain ${gain} 💎 gems (permanent +${gain * 10}% bonus), but reset coins, robots, upgrades and garden.`)) return;
  state.gems += gain;
  state.totalGemsEarned = (state.totalGemsEarned || 0) + gain;
  state.coins = startingCoinsFor(gemLvl('startCoins'));
  state.totalEarnedThisRun = 0;
  state.upgrades = {
    robots: 1 + gemLvl('startRobot'),
    speed: 0, range: 0, value: 0, growth: 0, rate: 0, crit: 0,
    fuelEff: 0, pest: 0, fuelType: 0,
    tool: Math.min(gemLvl('startTool'), TOOL_TYPES.length - 1),
  };
  state.garden   = { tree: 0, rock: 0, pond: 0, flower: 0, beehive: 0, fountain: 0, shed: 0, gnome: 0 };
  state.crew     = [];
  state.fuel     = CFG.fuelMax;
  state.gnomeTimer = 60 + Math.random() * 30;
  state.activeQuest = null;
  state.questTimer = 80 + Math.random() * 60;
  state.questHistory = [];
  state.questsCompleted = 0;
  state.grassTypes = {
    clover:   { unlocked: false, spawnLevel: 0 },
    thick:    { unlocked: false, spawnLevel: 0 },
    crystal:  { unlocked: false, spawnLevel: 0 },
    golden:   { unlocked: false, spawnLevel: 0 },
    obsidian: { unlocked: false, spawnLevel: 0 },
    frost:    { unlocked: false, spawnLevel: 0 },
    void:     { unlocked: false, spawnLevel: 0 },
  };
  applyGemGrassUnlocks();
  robots = [];
  bees = [];
  visitorGnomes = [];
  treasures = [];
  moles = [];
  initWorld();
  ensureRobotCount();
  ensureBeesFromHives();
  toast(`🌟 Gained ${gain} 💎 Gems!`, '#8ff09e');
  beep(880, 0.15, 'triangle', 0.12);
  setTimeout(() => beep(1320, 0.2, 'triangle', 0.1), 100);
  renderShop();
  saveGame();
}

function doAscend() {
  const baseGain = CFG.ascendFormula(state.totalGemsEarned || 0);
  const gain = Math.floor(baseGain * rubyShopAscendMult());
  if (gain <= 0) return;
  if (!confirm(
    `♦️ ASCEND for ${gain} rubies?\n\n` +
    `This WIPES everything: coins, upgrades, garden, crew, grass unlocks, gems, gem-shop upgrades.\n` +
    `Your rubies, ruby-shop upgrades, skins, and mow patterns are KEPT.\n\n` +
    `Rubies are much rarer than gems — spend them wisely.`
  )) return;

  state.rubies = (state.rubies || 0) + gain;
  state.totalRubiesEarned = (state.totalRubiesEarned || 0) + gain;

  // Full wipe of the gem tier and below.
  state.coins = 0;
  state.totalEarnedThisRun = 0;
  state.gems = rubyShopStartGems();
  state.totalGemsEarned = 0;
  state.gemUpgrades = {
    startCoins: 0, coinMult: 0, growth: 0, crit: 0,
    offline: 0, prestigeBoost: 0, startRobot: 0, startTool: 0,
    grassObsidian: 0, grassFrost: 0, grassVoid: 0,
  };
  state.upgrades = {
    robots: 1, speed: 0, range: 0, value: 0, growth: 0, rate: 0, crit: 0,
    fuelEff: 0, fuelType: 0, tool: 0,
  };
  state.garden   = { tree: 0, rock: 0, pond: 0, flower: 0, beehive: 0, fountain: 0, shed: 0, gnome: 0 };
  state.crew     = rubyShopHasStartCrew() ? ['foreman'] : [];
  state.fuel     = CFG.fuelMax;
  state.gnomeTimer = 60 + Math.random() * 30;
  state.activeQuest = null;
  state.questTimer = 80 + Math.random() * 60;
  state.questHistory = [];
  state.questsCompleted = 0;
  state.grassTypes = {
    clover:   { unlocked: false, spawnLevel: 0 },
    thick:    { unlocked: false, spawnLevel: 0 },
    crystal:  { unlocked: false, spawnLevel: 0 },
    golden:   { unlocked: false, spawnLevel: 0 },
    obsidian: { unlocked: false, spawnLevel: 0 },
    frost:    { unlocked: false, spawnLevel: 0 },
    void:     { unlocked: false, spawnLevel: 0 },
  };
  robots = [];
  bees = [];
  visitorGnomes = [];
  treasures = [];
  initWorld();
  ensureRobotCount();
  ensureBeesFromHives();
  toast(`♦️ Ascended! +${gain} rubies.`, '#ff6b8b');
  beep(440, 0.18, 'triangle', 0.12);
  setTimeout(() => beep(660, 0.18, 'triangle', 0.10), 140);
  setTimeout(() => beep(990, 0.22, 'triangle', 0.08), 300);
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
  const COL_X = [12.5, 37.5, 62.5, 87.5];
  const TIER_Y = [14, 50, 86];
  // Foreman sits between cols 1 and 2 so the fan-out stays symmetric across 4 cols.
  const FOREMAN_X = (COL_X[1] + COL_X[2]) / 2;
  const lines = [
    { from: [FOREMAN_X, TIER_Y[0]], to: [COL_X[0], TIER_Y[1]], id: 'mechanic' },
    { from: [FOREMAN_X, TIER_Y[0]], to: [COL_X[1], TIER_Y[1]], id: 'keenEye' },
    { from: [FOREMAN_X, TIER_Y[0]], to: [COL_X[2], TIER_Y[1]], id: 'qualityControl' },
    { from: [FOREMAN_X, TIER_Y[0]], to: [COL_X[3], TIER_Y[1]], id: 'moleWarden' },
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
    // Foreman (tier 0) centers between the 4 cols; others sit on grid cols.
    const x = (node.tier === 0 && node.id === 'foreman') ? FOREMAN_X : COL_X[node.col];
    el.style.left = x + '%';
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
  } else if (t.type === 'pattern' && t.patternKey && state.patternsUnlocked.indexOf(t.patternKey) < 0) {
    state.patternsUnlocked.push(t.patternKey);
    const pat = MOW_PATTERN_BY_KEY[t.patternKey];
    showPatternUnlockModal(pat);
    beep(560, 0.10, 'triangle', 0.09);
    setTimeout(() => beep(880, 0.10, 'triangle', 0.08), 90);
    setTimeout(() => beep(1180, 0.18, 'triangle', 0.08), 200);
  } else {
    // fallback if the skin/pattern was already owned or for coin treasure
    let coins = t.amount;
    if (!coins || t.type === 'skin' || t.type === 'pattern') {
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

function showPatternUnlockModal(pat) {
  if (!pat) return;
  const preview = patternPreviewCanvas(pat.key);
  preview.style.cssText = 'width:120px; height:120px; display:block; margin:8px auto; border-radius:8px; border:1px solid rgba(0,0,0,0.45); box-shadow: inset 0 -8px 12px rgba(0,0,0,0.25);';
  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `
    <div class="modal skin-modal">
      <h2>🧙 GNOME'S BLUEPRINT!</h2>
      <p style="color:#8ff09e; font-weight:800; letter-spacing:1px;">MOWING PATTERN UNLOCKED</p>
      <div class="skin-modal-preview" id="patUnlockPreview"></div>
      <div class="big" style="color:#8ff09e;">${pat.icon} ${pat.name}</div>
      <p>${pat.desc}<br>Equip it now from the 🎨 Skins tab.</p>
      <button id="okBtn">Sweet!</button>
    </div>`;
  document.body.appendChild(back);
  back.querySelector('#patUnlockPreview').appendChild(preview);
  back.querySelector('#okBtn').addEventListener('click', () => back.remove());
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

  const sliderRow = (s) => `
    <div class="zen-slider" data-key="${s.key}">
      <div class="zen-slider-head">
        <span class="zen-slider-ico">${s.icon}</span>
        <span class="zen-slider-label">${s.label}</span>
        <span class="zen-slider-value" data-val="${s.key}">${cfg[s.key]}</span>
      </div>
      <input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${cfg[s.key]}" data-key="${s.key}">
    </div>`;
  const sliderGrid = ZEN_SLIDERS.map(sliderRow).join('');

  back.innerHTML = `
    <div class="modal zen-modal">
      <h2>🧘 ZEN MODE</h2>
      <p class="zen-tagline">Compose your garden screensaver.<br>
        <span class="zen-subnote">No fuel, no shopping — your real game is paused and untouched.</span></p>

      <div class="zen-body">
        <section class="zen-section">
          <div class="zen-section-head">Garden</div>
          <div class="zen-slider-grid">${sliderGrid}</div>
        </section>

        <section class="zen-section">
          <div class="zen-section-head">Mower Skin</div>
          <div class="zen-skin-grid" id="zenSkinGrid"></div>
        </section>

        <section class="zen-section">
          <div class="zen-section-head">Mowing Pattern</div>
          <div class="zen-pattern-grid" id="zenPatternGrid"></div>
        </section>

        <section class="zen-section">
          <div class="zen-section-head">Atmosphere</div>
          <div class="zen-atmosphere">
            <div class="zen-atmo-row" id="zenWeatherRow">
              <span class="zen-atmo-label">Weather</span>
              <div class="zen-atmo-chips" id="zenWeatherChips"></div>
            </div>
            <div class="zen-atmo-row" id="zenTimeRow">
              <span class="zen-atmo-label">Time of day</span>
              <div class="zen-atmo-chips" id="zenTimeChips"></div>
            </div>
            <div class="zen-atmo-row" id="zenRivalryRow">
              <span class="zen-atmo-label">Rivalry crown</span>
              <span class="toggle ${cfg.rivalry ? 'on' : ''}" id="zenRivalryToggle"><span class="knob"></span></span>
            </div>
          </div>
        </section>
      </div>

      <div class="zen-actions">
        <button id="zenResetBtn" class="ghost">Defaults</button>
        <button id="zenCancelBtn" class="ghost">Cancel</button>
        <button id="zenStartBtn">▶ Start Zen</button>
      </div>
    </div>`;
  document.body.appendChild(back);

  // Visual skin swatches — compact, single-row. Name in tooltip.
  const skinGrid = back.querySelector('#zenSkinGrid');
  for (const skin of SKIN_DEFS) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'zen-skin-tile' + (cfg.skin === skin.key ? ' active' : '');
    tile.dataset.zenKey = 'skin';
    tile.dataset.value = skin.key;
    tile.title = skin.name + ' · ' + (skin.rarity || 'base');
    tile.innerHTML = skinPreviewHTML(skin, true);
    skinGrid.appendChild(tile);
  }

  // Pattern thumbnails — compact, single-row. Name in tooltip.
  const patternGrid = back.querySelector('#zenPatternGrid');
  for (const pat of MOW_PATTERN_DEFS) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'zen-pattern-tile' + (cfg.pattern === pat.key ? ' active' : '');
    tile.dataset.zenKey = 'pattern';
    tile.dataset.value = pat.key;
    tile.title = pat.name + ' — ' + pat.desc;
    tile.appendChild(patternPreviewCanvas(pat.key));
    patternGrid.appendChild(tile);
  }

  // Weather chips: Auto + each weather type with icon.
  const weatherChips = back.querySelector('#zenWeatherChips');
  const weatherOptions = [{ id: 'auto', name: 'Auto', icon: '🔁' }, ...WEATHER_TYPES];
  for (const w of weatherOptions) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'settings-chip' + (cfg.weather === w.id ? ' active' : '');
    chip.dataset.zenKey = 'weather';
    chip.dataset.value = w.id;
    chip.title = w.name;
    chip.innerHTML = `${w.icon || ''} ${w.name}`.trim();
    weatherChips.appendChild(chip);
  }

  // Time-of-day chips: auto/dawn/day/dusk/night/off.
  const timeChips = back.querySelector('#zenTimeChips');
  const timeIcons = { auto: '🔁', dawn: '🌅', day: '☀️', dusk: '🌇', night: '🌙', off: '🚫' };
  for (const key of DAY_TIME_KEYS) {
    const preset = DAY_TIME_PRESETS[key];
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'settings-chip' + (cfg.dayTime === key ? ' active' : '');
    chip.dataset.zenKey = 'dayTime';
    chip.dataset.value = key;
    chip.title = preset.label || key;
    chip.innerHTML = `${timeIcons[key] || ''} ${preset.label || key}`.trim();
    timeChips.appendChild(chip);
  }

  // Rivalry toggle (zen-local).
  const rivalryToggle = back.querySelector('#zenRivalryToggle');
  rivalryToggle.addEventListener('click', () => {
    state.zenConfig.rivalry = !state.zenConfig.rivalry;
    rivalryToggle.classList.toggle('on', !!state.zenConfig.rivalry);
    beep(state.zenConfig.rivalry ? 720 : 520, 0.05, 'sine', 0.04);
  });

  back.querySelectorAll('input[type="range"]').forEach(input => {
    input.addEventListener('input', () => {
      const key = input.dataset.key;
      const val = parseInt(input.value, 10) || 0;
      state.zenConfig[key] = val;
      back.querySelector(`[data-val="${key}"]`).textContent = val;
    });
  });
  back.querySelectorAll('[data-zen-key]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.zenKey;
      state.zenConfig[key] = btn.dataset.value;
      back.querySelectorAll(`[data-zen-key="${key}"]`).forEach(s => s.classList.toggle('active', s === btn));
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
    back.querySelectorAll('[data-zen-key]').forEach(btn => {
      const key = btn.dataset.zenKey;
      btn.classList.toggle('active', btn.dataset.value === state.zenConfig[key]);
    });
    rivalryToggle.classList.toggle('on', !!state.zenConfig.rivalry);
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
    settings: Object.assign({}, state.settings),
    timeOfDay: state.timeOfDay,
    weather: state.weather && { id: state.weather.id, intensity: state.weather.intensity, cycleTimer: state.weather.cycleTimer },
    grass: new Float32Array(grass),
    tiles: new Uint8Array(tiles),
    flowerColors: new Uint8Array(flowerColors),
    grassSpecies: grassSpecies ? new Uint8Array(grassSpecies) : null,
    robots, bees, visitorGnomes, treasures,
    moles: moles.slice(),
    particles: particles.slice(),
  };
  moles = [];

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
  if (zenSnapshot.settings) state.settings = zenSnapshot.settings;
  if (zenSnapshot.timeOfDay != null) state.timeOfDay = zenSnapshot.timeOfDay;
  if (zenSnapshot.weather) state.weather = zenSnapshot.weather;
  grass = zenSnapshot.grass;
  tiles = zenSnapshot.tiles;
  flowerColors = zenSnapshot.flowerColors;
  if (zenSnapshot.grassSpecies) grassSpecies = zenSnapshot.grassSpecies;
  robots = zenSnapshot.robots;
  bees = zenSnapshot.bees;
  visitorGnomes = zenSnapshot.visitorGnomes;
  treasures = zenSnapshot.treasures;
  moles = zenSnapshot.moles || [];
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
  moles = [];
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

  // Atmosphere overrides: mutate the live `state.settings` so the update
  // functions pick them up. The snapshot's original settings are restored on
  // exit, so this isn't destructive to the main game.
  if (cfg.weather && (typeof WEATHER_BY_ID === 'undefined' || cfg.weather === 'auto' || WEATHER_BY_ID[cfg.weather])) {
    state.settings.weather = cfg.weather;
  }
  if (cfg.dayTime && (typeof DAY_TIME_PRESETS === 'undefined' || DAY_TIME_PRESETS[cfg.dayTime])) {
    state.settings.dayNight = cfg.dayTime;
  }
  if (typeof cfg.rivalry === 'boolean') state.settings.rivalry = cfg.rivalry;

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

  canvas.addEventListener('click', (e) => {
    if (suppressNextClick) { suppressNextClick = false; return; }
    handleCanvasClick(e);
  });

  // ---------- Robot drag-and-drop ----------
  // Player can pick up any robot and drop it somewhere else on the lawn.
  // While dragged, a robot pauses its AI (see updateRobot early-out on r.dragging).
  let draggingRobot = null;
  let dragOffX = 0, dragOffY = 0;
  let suppressNextClick = false;
  let dragMoved = false;
  function canvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top)  * (canvas.height / rect.height),
    };
  }
  function robotAt(x, y) {
    // Hit-test robots back-to-front so the topmost (last drawn) wins.
    for (let i = robots.length - 1; i >= 0; i--) {
      const r = robots[i];
      const s = Math.max(10, tileSize * 0.9);
      // Body is ~1.4s × s; use the larger half-extent as a forgiving circle.
      if (Math.hypot(r.x - x, r.y - y) < s * 0.8) return r;
    }
    return null;
  }
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const { x, y } = canvasCoords(e);
    const r = robotAt(x, y);
    if (!r) return;
    draggingRobot = r;
    r.dragging = true;
    dragOffX = r.x - x;
    dragOffY = r.y - y;
    dragMoved = false;
    canvas.style.cursor = 'grabbing';
    player.active = false; // hide the manual mower while dragging
    e.preventDefault();
  });
  window.addEventListener('mouseup', (e) => {
    if (!draggingRobot) return;
    draggingRobot.dragging = false;
    draggingRobot.target = null; // repick a fresh target at the new location
    draggingRobot.lastTargetCheck = 0;
    draggingRobot = null;
    canvas.style.cursor = 'none';
    if (dragMoved) suppressNextClick = true; // don't treat the drop as a treasure click
  });

  canvas.addEventListener('mousemove', (e) => {
    const { x, y } = canvasCoords(e);
    if (draggingRobot) {
      dragMoved = true;
      // Clamp to canvas bounds so the robot can't be flung off-screen.
      const nx = Math.max(0, Math.min(canvas.width, x + dragOffX));
      const ny = Math.max(0, Math.min(canvas.height, y + dragOffY));
      draggingRobot.x = nx;
      draggingRobot.y = ny;
      return;
    }
    player.x = x; player.y = y; player.active = true;
    let hover = false;
    for (const t of treasures) {
      if (Math.hypot(t.x - x, t.y - y) < tileSize * 0.8) { hover = true; break; }
    }
    if (robotAt(x, y)) {
      canvas.style.cursor = 'grab';
    } else {
      canvas.style.cursor = hover ? 'pointer' : 'none';
    }
  });
  canvas.addEventListener('mouseleave', () => {
    if (draggingRobot) return; // keep dragging even if the cursor slips out
    player.active = false; canvas.style.cursor = 'default';
  });
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
    // Photo mode: `P` snapshots the canvas to a PNG download while in Zen.
    // Ignore when typing in an input and require no modifier keys so we
    // don't clash with browser shortcuts.
    if (state.zenMode && (e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const tgt = e.target;
      const typing = tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable);
      if (!typing) {
        e.preventDefault();
        takeZenPhoto();
      }
    }
    updateBuyMult(e);
  });
  document.addEventListener('keyup', updateBuyMult);
  window.addEventListener('blur', () => { if (buyMult !== 1) { buyMult = 1; renderShop(); } });
  document.addEventListener('fullscreenchange', () => {
    // If the user exits fullscreen via browser UI, leave zen mode too.
    if (!document.fullscreenElement && state.zenMode) exitZenMode();
  });
}

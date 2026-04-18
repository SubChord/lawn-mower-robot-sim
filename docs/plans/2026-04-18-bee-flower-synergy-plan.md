# Bee & Flower Synergy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn bees + flowers into a parallel income engine with pollination cycles, bee streaks, flower clusters, and five new gem-shop upgrades (per `docs/plans/2026-04-18-bee-flower-synergy-design.md`).

**Architecture:** Per-flower pollination meter stored in a new `flowerPollen: Float32Array`. Bees accumulate pollen on visit; when a flower's meter fills it emits a burst (`bloomBurstBase × coinMult × streakMult × clusterMult`) and enters a brief wilted state. Five new permanent gem-shop upgrades scale bees-per-hive, burst value, streak ceiling, throughput, and flower cap. Balance re-validated via existing `sim/` auto-player.

**Tech Stack:** Vanilla JS + Canvas2D, no build, no test framework. Classic `<script>` global scope. Verification via `node --check`, `node sim/simulate.js`, and manual browser load.

**Verification instead of TDD:** Each task finishes with (a) `node --check` on touched JS files, (b) where applicable `node sim/simulate.js` for economic impact, (c) manual browser verification of visible behavior. Steps state the expected observation.

**Skills to invoke when relevant:** `@superpowers:verification-before-completion` before claiming any task complete, `@superpowers:systematic-debugging` on any unexpected behavior.

---

## Pre-flight

### Task 0: Establish the feature flag

**Files:**
- Modify: `js/config.js` (append to CFG object)

**Step 1: Add flag**

In `js/config.js`, inside the `CFG` object, append:
```js
  // --- Bee/Flower Synergy v2 (see docs/plans/2026-04-18-bee-flower-synergy-design.md) ---
  beeFlowerV2: true,   // master flag, flip to false to revert to v1 behavior
```

**Step 2: Verify**
```bash
node --check js/config.js
```
Expected: no output (syntax ok).

**Step 3: Commit**
```bash
git add js/config.js
git commit -m "feat(bees): add beeFlowerV2 feature flag"
```

---

## Phase 1 — Constants and per-tile state

### Task 1: Add new CFG constants

**Files:**
- Modify: `js/config.js`

**Step 1:** Inside `CFG`, add a new "Bee/flower synergy" section. Use placeholder names matching the design §6. Do **not** remove `beeRewardPerVisit` yet — Task 3 handles the removal with a gated replacement.

```js
  // Bee/flower synergy (v2 — gated by beeFlowerV2)
  flowerCoinPerSecV2: 0.15,    // trickle (lowered from 0.35 in v2 path only)
  bloomBurstBase: 4.0,
  pollenPerVisit: 0.20,
  wiltedDuration: 1.5,
  streakCap: 10,
  streakCoeff: 0.15,
  streakDecaySeconds: 6.0,
  clusterRadius: 2,
  clusterCoeff: 0.08,
  clusterCap: 12,
```

**Step 2:** `node --check js/config.js`

**Step 3:** Commit: `feat(bees): add v2 pollination/streak/cluster constants`

---

### Task 2: flowerPollen typed array + wilted-timer array in world.js

**Files:**
- Modify: `js/world.js`

**Step 1:** Near the existing `flowerColors` declaration (`world.js:7`), add:
```js
let flowerPollen  = new Float32Array(CFG.gridW * CFG.gridH); // 0..1 pollination meter
let flowerWiltedT = new Float32Array(CFG.gridW * CFG.gridH); // seconds remaining of wilt; 0 = healthy
```

**Step 2:** Find the helper that resets grid state (search for where `flowerColors` is zeroed/re-created on prestige/ascend/zen). In the same helper, zero the two new arrays. If no such helper exists, create `resetFlowerState()`:
```js
function resetFlowerState() {
  flowerPollen.fill(0);
  flowerWiltedT.fill(0);
}
```
and call it from the existing prestige/ascend/zen world-rebuild paths (check `ui.js:doPrestige`, `ui.js:doAscend`, zen-mode handler around `ui.js:1757`).

**Step 3:** On flower placement (look for where `flowerColors[idx] = …` is assigned in placement code), also set `flowerPollen[idx] = 0; flowerWiltedT[idx] = 0;`.

**Step 4:** Verify: `node --check js/world.js js/ui.js`

**Step 5:** Commit: `feat(bees): add flowerPollen + flowerWiltedT per-tile state`

---

## Phase 2 — Core mechanics (v2 path only, behind flag)

### Task 3: Pollen accumulation on bee visit

**Files:**
- Modify: `js/ai.js:312-320` (bee visit payout block in `updateBee`)

**Step 1:** Replace the current visit-payout block. Keep v1 path intact when flag is off:
```js
// inside updateBee, at the visit-complete branch:
if (tiles[idx(b.target.tx, b.target.ty)] === T.FLOWER) {
  if (CFG.beeFlowerV2) {
    // v2: pollen accumulates; burst handled in a separate update
    const fi = idx(b.target.tx, b.target.ty);
    if (flowerWiltedT[fi] <= 0) {
      const add = CFG.pollenPerVisit * (1 + (state.gemUpgrades.royalJelly || 0) * 0.25);
      flowerPollen[fi] = Math.min(1, flowerPollen[fi] + add);
      // burst check below (Task 4)
    }
  } else {
    // v1 legacy
    state.coins += CFG.beeRewardPerVisit * coinMult();
    flashCoin(b.x, b.y, CFG.beeRewardPerVisit * coinMult());
  }
}
```

**Step 2:** `node --check js/ai.js`. Load `http://localhost:8765` and visually confirm: v2 bees no longer pay on each visit (income from bees drops to 0). This is expected — Task 4 restores it via bursts.

**Step 3:** Commit: `feat(bees): bees accumulate pollen on visit (v2 path)`

---

### Task 4: Burst on full meter + particle + meter reset

**Files:**
- Modify: `js/ai.js` (inside `updateBee`, right after the pollen-add block from Task 3)

**Step 1:** Add the burst-trigger. Extract a helper since clusterMult needs its own function (Task 6 fills it in — stub for now):
```js
function clusterMultAt(tx, ty) { return 1; } // stubbed; Task 6 replaces
```
Put the stub near `updateBee` in `ai.js`.

Then in the v2 visit branch, after updating `flowerPollen[fi]`:
```js
if (flowerPollen[fi] >= 1) {
  const pollenYieldMult = 1 + (state.gemUpgrades.pollenYield || 0) * 0.15;
  const streakM = streakMultOf(b);   // Task 5 adds this
  const clusterM = clusterMultAt(b.target.tx, b.target.ty);
  const burst = CFG.bloomBurstBase * pollenYieldMult * coinMult() * streakM * clusterM;
  state.coins += burst;
  state.garden.burstIncomeRecent = (state.garden.burstIncomeRecent || 0) + burst;
  flashCoin(b.x, b.y, burst);
  flowerPollen[fi] = 0;
  const wilt = CFG.wiltedDuration * (1 - (state.gemUpgrades.royalJelly || 0) * 0.25);
  flowerWiltedT[fi] = Math.max(0.1, wilt);
  // Task 5 will increment b.streak here
}
```

**Step 2:** Add `streakMultOf` stub next to `clusterMultAt`:
```js
function streakMultOf(b) { return 1; } // Task 5 replaces
```

**Step 3:** Add a global tick-down for `flowerWiltedT` in `updateGrass` or alongside `updateFlowerIncome` in `ai.js`:
```js
function updateFlowerWilt(dt) {
  if (!CFG.beeFlowerV2) return;
  for (let i = 0; i < flowerWiltedT.length; i++) {
    if (flowerWiltedT[i] > 0) flowerWiltedT[i] = Math.max(0, flowerWiltedT[i] - dt);
  }
}
```
Wire it into the main tick (search for `updateFlowerIncome(dt)` call site and add `updateFlowerWilt(dt)` next to it).

**Step 4:** In `pickBeeTarget` (`ai.js:252-269`), exclude wilted tiles when scanning for flower targets: skip tile `i` if `flowerWiltedT[i] > 0`.

**Step 5:** `node --check js/ai.js`. Browser test: place 3+ flowers and 1+ hive, watch — bees should visit, then after ~5 visits a flower should emit a "+N" particle, briefly pause, then resume accepting visits.

**Step 6:** Commit: `feat(bees): pollination burst + wilted state`

---

### Task 5: Bee streaks

**Files:**
- Modify: `js/world.js` (`spawnBee`, add `streak: 0, streakTimer: 0` to the bee object)
- Modify: `js/ai.js` (replace `streakMultOf` stub; increment in burst; decay in `updateBee`)

**Step 1:** In `spawnBee` (`world.js:102-115`), add `streak: 0, streakTimer: 0` fields to the returned object.

**Step 2:** Replace the `streakMultOf` stub in `ai.js`:
```js
function streakMultOf(b) {
  const cap = CFG.streakCap + (state.gemUpgrades.nectarRush || 0) * 2;
  const coeff = CFG.streakCoeff + (state.gemUpgrades.nectarRush || 0) * 0.02;
  return 1 + Math.min(b.streak || 0, cap) * coeff;
}
```

**Step 3:** In the burst block from Task 4, after paying out, add:
```js
b.streak = (b.streak || 0) + 1;
b.streakTimer = 0;
```

**Step 4:** Add streak decay in `updateBee`. Near the top of the function, after the weather check:
```js
if (CFG.beeFlowerV2) {
  b.streakTimer = (b.streakTimer || 0) + dt;
  if (b.streakTimer >= CFG.streakDecaySeconds) {
    b.streakTimer = 0;
    if (b.streak > 0) b.streak -= 1;
  }
}
```

**Step 5:** `node --check js/ai.js js/world.js`. Browser test: with 1 hive + a tight cluster of flowers, expect burst payouts to grow visibly after several consecutive bursts by the same bee.

**Step 6:** Commit: `feat(bees): per-bee streak multiplier with decay`

---

### Task 6: Flower cluster bonus

**Files:**
- Modify: `js/ai.js` (replace `clusterMultAt` stub)

**Step 1:** Replace the stub:
```js
function clusterMultAt(tx, ty) {
  let count = 0;
  const r = CFG.clusterRadius;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = tx + dx, ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= CFG.gridW || ny >= CFG.gridH) continue;
      if (tiles[idx(nx, ny)] === T.FLOWER) count++;
    }
  }
  return 1 + CFG.clusterCoeff * Math.min(count, CFG.clusterCap);
}
```

**Step 2:** `node --check js/ai.js`. Browser test: place a 3×3 flower patch + hive; compare burst sizes to a single isolated flower. Should see ~1.5–2× larger bursts in the cluster.

**Step 3:** Commit: `feat(bees): flower cluster bonus on bursts`

---

### Task 7: Lower trickle in v2 path

**Files:**
- Modify: `js/ai.js:685-708` (`updateFlowerIncome`)

**Step 1:** Replace the hardcoded `CFG.flowerCoinPerSec` with:
```js
const perFlower = CFG.beeFlowerV2 ? CFG.flowerCoinPerSecV2 : CFG.flowerCoinPerSec;
```
and use `perFlower` in the income calc.

**Step 2:** Same substitution in offline-earnings calc at `save.js:190`.

**Step 3:** `node --check js/ai.js js/save.js`

**Step 4:** Commit: `feat(bees): lower passive flower trickle in v2 path`

---

## Phase 3 — Gem-shop upgrades

### Task 8: Declare the 5 new gem upgrades

**Files:**
- Modify: `js/state.js` — `GEM_UPGRADES` table (around `state.js:261-314`)

**Step 1:** Append five entries. Follow the existing schema exactly (don't invent new fields):
```js
  queenBee:      { name: 'Queen Bee',     desc: '+1 bee per hive per level.',                max: 5, baseCost: 4, growth: 1.40 },
  pollenYield:   { name: 'Pollen Yield',  desc: '+15% pollination burst coins per level.',   max: 10, baseCost: 3, growth: 1.35 },
  nectarRush:    { name: 'Nectar Rush',   desc: '+2 streak cap and +2% per-streak per level.', max: 5, baseCost: 5, growth: 1.45 },
  royalJelly:    { name: 'Royal Jelly',   desc: 'Flowers fill +25%/lvl faster; wilt -25%/lvl.', max: 5, baseCost: 4, growth: 1.40 },
  flowerMastery: { name: 'Flower Mastery',desc: '+20 flower cap per level.',                 max: 5, baseCost: 3, growth: 1.35 },
```

Check the existing entries first — copy the exact field names (`name`/`desc` may be `label`/`description` etc.).

**Step 2:** `node --check js/state.js`

**Step 3:** Commit: `feat(bees): add 5 apiary gem-shop upgrades`

---

### Task 9: queenBee → adjust bees per hive

**Files:**
- Modify: `js/world.js` — `ensureBeesFromHives` (around `world.js:117-128`)

**Step 1:** Change the `want` calc:
```js
const perHive = CFG.beePerHive + (state.gemUpgrades?.queenBee || 0);
const want = hiveCount * perHive;
```

**Step 2:** Call `ensureBeesFromHives()` whenever `queenBee` is purchased. Find the gem-shop purchase handler in `ui.js` (search for `gemUpgrades[key]++` or similar) and add after the mutation:
```js
if (key === 'queenBee') ensureBeesFromHives();
if (key === 'flowerMastery') { /* no grid rebuild needed, cap is read dynamically */ }
```

**Step 3:** Verify the garden cap for flowers reads dynamically. Find `GARDEN_DEFS.flower.max` usage (around `state.js:420-422` + buy guard in `ui.js`). Replace the static `max: 80` access with a function or compute at buy time:
```js
// in buy-guard / shop render:
const flowerMax = GARDEN_DEFS.flower.max + (state.gemUpgrades.flowerMastery || 0) * 20;
```

**Step 4:** `node --check js/world.js js/ui.js js/state.js`. Browser: hack gems (`state.gems = 99`) in devtools, buy Queen Bee, confirm bee count jumps. Buy Flower Mastery, confirm can place more flowers.

**Step 5:** Commit: `feat(bees): queenBee and flowerMastery gem upgrades effects`

---

### Task 10: Verify pollenYield / nectarRush / royalJelly are wired

**Files:** none (should already be read in Tasks 3/4/5)

**Step 1:** Grep:
```bash
grep -n "pollenYield\|nectarRush\|royalJelly" js/ai.js
```
Expected: references in `updateBee` (pollen fill, burst value, streak coefficients) and `updateFlowerWilt` wilt reduction.

**Step 2:** If any upgrade isn't read, fix the site now. Otherwise this is a no-op verification task.

**Step 3:** Commit (only if changes): `fix(bees): wire remaining apiary upgrade effects`

---

## Phase 4 — Rendering

### Task 11: Pollen-meter ring on flowers

**Files:**
- Modify: `js/render.js` — `drawFlower` (around `render.js:230`)

**Step 1:** At end of `drawFlower(tx, ty)`:
```js
if (CFG.beeFlowerV2) {
  const i = idx(tx, ty);
  const p = flowerPollen[i];
  if (p > 0.15) {
    ctx.strokeStyle = 'rgba(255, 220, 80, 0.7)';
    ctx.lineWidth = Math.max(1, tileSize * 0.08);
    ctx.beginPath();
    ctx.arc(
      tx * tileSize + tileSize / 2,
      ty * tileSize + tileSize / 2,
      tileSize * 0.42,
      -Math.PI / 2,
      -Math.PI / 2 + p * Math.PI * 2
    );
    ctx.stroke();
  }
}
```

**Step 2:** `node --check js/render.js`. Browser: place flowers + hive, expect yellow arcs to fill as bees visit.

**Step 3:** Commit: `feat(bees): render pollen-meter arc on flower tiles`

---

### Task 12: Wilted flower tint

**Files:**
- Modify: `js/render.js` — `drawFlower` (top of the function)

**Step 1:** At start of `drawFlower`, before drawing petals:
```js
let wiltAlpha = 0;
if (CFG.beeFlowerV2) {
  const w = flowerWiltedT[idx(tx, ty)];
  if (w > 0) wiltAlpha = Math.min(0.6, w / CFG.wiltedDuration * 0.6);
}
```

Then after drawing the flower, if `wiltAlpha > 0`, overlay a gray rect:
```js
if (wiltAlpha > 0) {
  ctx.fillStyle = `rgba(120, 120, 120, ${wiltAlpha})`;
  ctx.fillRect(tx * tileSize, ty * tileSize, tileSize, tileSize);
}
```

**Step 2:** `node --check js/render.js`. Browser: watch a flower burst → brief gray overlay → fade.

**Step 3:** Commit: `feat(bees): render wilted flower tint`

---

### Task 13: Bee streak glow

**Files:**
- Modify: `js/render.js` — `drawBee` (search for its definition)

**Step 1:** Before drawing the bee body, add:
```js
if (CFG.beeFlowerV2 && b.streak >= 3) {
  const strong = b.streak >= 7;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = strong ? 'rgba(255, 220, 60, 0.55)' : 'rgba(255, 220, 60, 0.3)';
  const r = strong ? 10 : 7;
  ctx.beginPath();
  ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
```

**Step 2:** `node --check js/render.js`. Browser: dense flower cluster → some bees should visibly glow.

**Step 3:** Commit: `feat(bees): render streak glow halo on bees`

---

## Phase 5 — HUD and shop UI

### Task 14: Garden coins/s EMA readout

**Files:**
- Modify: `js/state.js` — add `state.garden.burstIncomeRecent = 0`, `state.garden.gardenCpsEma = 0`
- Modify: `js/ai.js` — in the main tick / `updateFlowerIncome`, fold burst income + trickle into an EMA
- Modify: `js/ui.js` — HUD render

**Step 1:** Initialize EMA. In the per-tick garden income path (`updateFlowerIncome`):
```js
const tickIncome = flowers * perFlower * coinMult() * wMult * dt;  // trickle
const burstIncome = state.garden.burstIncomeRecent || 0;
state.garden.burstIncomeRecent = 0;
const instCps = (tickIncome + burstIncome) / Math.max(dt, 1e-6);
const alpha = 1 - Math.exp(-dt / 10);  // ~10s time constant
state.garden.gardenCpsEma = (state.garden.gardenCpsEma || 0) * (1 - alpha) + instCps * alpha;
```

**Step 2:** In `ui.js` HUD render (near the existing "🌸 flowers feed 🐝 bees" line, `ui.js:370`):
```js
const gardenCps = state.garden.gardenCpsEma || 0;
// append to the same HUD block:
`<div>Garden: ${formatShort(gardenCps)}/s</div>`
```

**Step 3:** `node --check js/state.js js/ai.js js/ui.js`. Browser: expect a Garden c/s readout that tracks garden activity.

**Step 4:** Commit: `feat(bees): HUD Garden coins/s EMA readout`

---

### Task 15: Apiary section header in gem shop

**Files:**
- Modify: `js/ui.js` — gem-shop render branch

**Step 1:** Find the gem-shop render loop (search for iteration over `GEM_UPGRADES`). Add a section-header row before the first apiary key is rendered:
```js
const apiaryKeys = ['queenBee','pollenYield','nectarRush','royalJelly','flowerMastery'];
// when about to render the first apiary-key entry, prepend:
html += `<div class="gem-shop-section">🌻 Apiary</div>`;
```

Reorder the gem upgrades if needed so apiary entries are contiguous. Add a CSS rule in `styles.css`:
```css
.gem-shop-section { margin: 8px 0 4px; font-weight: bold; opacity: 0.85; }
```

**Step 2:** `node --check js/ui.js`. Browser: open gem shop, expect a "🌻 Apiary" header above the 5 new upgrades.

**Step 3:** Commit: `feat(bees): Apiary section header in gem shop`

---

## Phase 6 — Save/load + migration

### Task 16: Serialize flowerPollen; bump SAVE_KEY; migration toast

**Files:**
- Modify: `js/save.js`

**Step 1:** Bump version:
```js
const SAVE_KEY = 'lawnbotTycoonSave_v3';
const OLD_SAVE_KEYS = ['lawnbotTycoonSave_v2'];
```

**Step 2:** In `saveGame`, add a `flowerPollen` field only if any value is nonzero:
```js
let pollenOut = null;
for (let i = 0; i < flowerPollen.length; i++) {
  if (flowerPollen[i] > 0.001) { pollenOut = Array.from(flowerPollen); break; }
}
if (pollenOut) data.flowerPollen = pollenOut;
```

**Step 3:** In `loadGame`, on v3: restore `flowerPollen` if present. `flowerWiltedT` always zeroed on load. On v2 fallback: run `loadGame` against the v2 key; after load, show a one-shot toast:
```js
toast("🌻 Apiary unlocked! Bees and flowers overhauled — check the Gem shop.");
```
and re-save under v3.

**Step 4:** `node --check js/save.js`. Browser: on an existing v2 save, reload and expect the toast once, new gem upgrades default to 0, no crash.

**Step 5:** Commit: `feat(bees): SAVE_KEY v3 + flowerPollen serialization + v2 migration`

---

## Phase 7 — Simulator + balance re-validation

### Task 17: Mirror new constants in sim/balance.js

**Files:**
- Modify: `sim/balance.js` — PROPOSED block

**Step 1:** Under PROPOSED (around `sim/balance.js:152-211`), add:
```js
  bloomBurstBase: 4.0,
  pollenPerVisit: 0.20,
  wiltedDuration: 1.5,
  streakCap: 10,
  streakCoeff: 0.15,
  streakDecaySeconds: 6.0,
  clusterRadius: 2,
  clusterCoeff: 0.08,
  clusterCap: 12,
  flowerCoinPerSecV2: 0.15,
```
And inside `PROPOSED.GEM_UPGRADES`:
```js
  queenBee:      { max: 5,  baseCost: 4, growth: 1.40 },
  pollenYield:   { max: 10, baseCost: 3, growth: 1.35 },
  nectarRush:    { max: 5,  baseCost: 5, growth: 1.45 },
  royalJelly:    { max: 5,  baseCost: 4, growth: 1.40 },
  flowerMastery: { max: 5,  baseCost: 3, growth: 1.35 },
```

**Step 2:** `node --check sim/balance.js`

**Step 3:** Commit: `sim: add v2 apiary constants + gem upgrades to PROPOSED`

---

### Task 18: Garden income model in sim auto-player

**Files:**
- Modify: `sim/simulate.js`

**Step 1:** Add an analytical garden-income function. This is a heuristic, not a tile-by-tile sim — we use expected values:

```js
function gardenCoinsPerSec(s, cfg) {
  if (!cfg.bloomBurstBase) return 0; // current/legacy variants
  const flowers = s.garden.flower || 0;
  const hives   = s.garden.beehive || 0;
  if (flowers === 0 || hives === 0) {
    return flowers * cfg.flowerCoinPerSecV2 * cfg.coinMult(s);
  }
  const bees = hives * (cfg.beePerHive + (s.gemUpgrades.queenBee || 0));
  const pollenGain = cfg.pollenPerVisit * (1 + (s.gemUpgrades.royalJelly || 0) * 0.25);
  const avgTimeToFill = 1 / pollenGain;   // visits to fill
  // bee visit cadence: assume ~1 visit/sec/bee average (flight + visit)
  const visitsPerSec = bees;
  const burstsPerSec = visitsPerSec / avgTimeToFill;
  const pollenYieldMult = 1 + (s.gemUpgrades.pollenYield || 0) * 0.15;
  const avgStreakMult = 1 + Math.min(5, cfg.streakCap / 2) *
    (cfg.streakCoeff + (s.gemUpgrades.nectarRush || 0) * 0.02);
  // cluster ~ sqrt(flowers) rough heuristic: more flowers, denser avg
  const avgCluster = 1 + cfg.clusterCoeff * Math.min(cfg.clusterCap, Math.sqrt(flowers) * 1.2);
  const burst = cfg.bloomBurstBase * pollenYieldMult * avgStreakMult * avgCluster * cfg.coinMult(s);
  const trickle = flowers * cfg.flowerCoinPerSecV2 * cfg.coinMult(s);
  return burstsPerSec * burst + trickle;
}
```

**Step 2:** Fold `gardenCoinsPerSec(s, cfg)` into the per-tick cps accumulator (search for where mow income is added to coins; add the garden term next to it).

**Step 3:** Extend the auto-buyer's upgrade list with the 5 new gem upgrades. Cost/Δcps math: for each upgrade, compute Δcps by measuring garden cps before/after a virtual level increase.

**Step 4:** Also cap flower garden purchases at `80 + 20*flowerMastery`.

**Step 5:** Verify:
```bash
node sim/simulate.js --variant proposed
```
Expected: runs without error, `Final coins/sec` increases vs previous PROPOSED, `Garden` upgrades appear among purchases.

**Step 6:** Commit: `sim: model garden income + buy apiary upgrades in auto-player`

---

### Task 19: Re-validate and retune

**Files:**
- Modify: `sim/balance.js` PROPOSED constants/coefficients as needed

**Step 1:** Run:
```bash
node sim/simulate.js --variant all
```
Observe doubling time, R², milestones.

**Step 2:** Tune until all three targets hold for PROPOSED:
- doubling time ∈ [1.5, 2.5] h
- R² ≥ 0.70 (post-30-min)
- no flat envelope span > 2 h

Levers in priority order: `bloomBurstBase`, gem-shop costs of apiary upgrades, `pollenPerVisit`, `clusterCoeff`. Avoid touching `gemMult` — that's the already-converged §3.1 curve.

**Step 3:** For each tuning iteration: small change, re-run, record the row. Stop when targets hold; commit final numbers.

**Step 4:** Commit: `sim: retune apiary costs — doubling X.XXh R² 0.XXX`

---

### Task 20: Update REBALANCE.md §8 with re-validated numbers

**Files:**
- Modify: `REBALANCE.md` §8

**Step 1:** Append a new subsection "Re-validation after Apiary v2":
- Row in the tuning iteration table with the final numbers
- Updated "12-hour auto-played sim (final numbers)" comparison

**Step 2:** Commit: `docs(rebalance): re-validate after Apiary v2 introduction`

---

## Phase 8 — Cleanup

### Task 21: Remove feature flag

**Files:**
- Modify: `js/config.js` — remove `beeFlowerV2`
- Modify: `js/ai.js`, `js/render.js`, `js/save.js` — remove `if (CFG.beeFlowerV2)` branches (keep v2 path only)
- Modify: remove `CFG.flowerCoinPerSec` (v1); rename `flowerCoinPerSecV2` → `flowerCoinPerSec`
- Modify: remove `CFG.beeRewardPerVisit` (unused)

**Step 1:** Grep: `grep -n "beeFlowerV2\|flowerCoinPerSecV2\|beeRewardPerVisit" js/`. Clean each hit.

**Step 2:** `for f in js/*.js sim/*.js; do node --check "$f"; done`

**Step 3:** Browser: full playthrough smoke test — place flowers/hives, see bursts/streaks/clusters working; buy an apiary upgrade via gems; prestige; ascend.

**Step 4:** Commit: `refactor(bees): remove beeFlowerV2 feature flag`

---

### Task 22: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1:** Update the "WHERE TO LOOK" table: add rows for tuning bee/flower synergy. Update any file descriptions mentioning bees/flowers to reflect the new mechanics. Mention the new typed arrays in the `world.js` blurb.

**Step 2:** Commit: `docs: refresh CLAUDE.md for Apiary v2`

---

## Plan complete

Plan saved to `docs/plans/2026-04-18-bee-flower-synergy-plan.md`.

Total: 23 tasks (Task 0 + Tasks 1–22).

Execution options:

1. **Subagent-Driven (this session)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Recommended for this plan since many tasks are ~5 min and benefit from tight feedback loops.
2. **Parallel Session (separate)** — Open a new session with `executing-plans`, batch execution with checkpoints.

Which approach?

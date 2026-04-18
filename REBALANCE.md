# Lawnbot Tycoon — Rebalance Plan

**Status:** Draft / proposal. No code changes yet.
**Author context:** Game feels imbalanced — early grind heavy, mid-game explodes, late-game has nothing meaningful to push against. This document diagnoses the causes and proposes concrete changes, grouped by system.

---

## 1. Goals

1. **Smooth the power curve.** No more "nothing for 30 min, then 10⁹×/tile overnight."
2. **Keep every currency tier relevant.** Coins, gems, and rubies should each gate different decisions instead of all three just stacking multiplicatively onto the same coin output.
3. **Make resets feel like resets.** First prestige and first ascend should feel like milestones, not taxes.
4. **Preserve breadth.** The game's charm is variety (grass species, garden, crew, quests, weather). Don't remove content — retune the knobs.
5. **Save-compat.** Prefer in-place tuning over schema breaks; bump `SAVE_KEY` only if we change upgrade shapes.

---

## 2. Diagnosis

### 2.1 The runaway: `gemMult` is linear in lifetime gems

```js
function gemMult() { return 1 + (state.totalGemsEarned || state.gems) * 0.10; }
```

Every lifetime gem adds **+10% coin income forever, without diminishing returns**. Combined with the prestige formula (`floor((run/2500)^0.55)`), each prestige feeds income that trivially exceeds the previous run. This is the single biggest offender.

| `totalGemsEarned` | `gemMult` |
| --- | --- |
| 10 | 2× |
| 100 | 11× |
| 1 000 | 101× |
| 10 000 | 1 001× |

### 2.2 Coin multipliers stack *multiplicatively*, across 7 independent sources

`coinMult() = (1 + value*0.15) * gemMult() * fountainMult() * rockMult() * crewCoinMult() * gemShopCoinMult() * rubyShopCoinMult()`

Late-game product with moderate investment:

| Source | Typical max value |
| --- | --- |
| `value` upgrade (L120) | 19× |
| `gemMult` (1 000 gems) | 101× |
| Fountain (L10) | 1.8× |
| Rocks (L40) | 1.2× |
| Efficiency crew | 1.10× |
| Gem Midas (L20) | 2× |
| Ruby Market (L30) | 4× |

Product ≈ **36 500×**. Then Void grass adds **×360** on top = **~13 M×** per mow unit on void tiles. There is no natural cap.

### 2.3 Prestige reward curve is flatter than the income curve it enables

- `prestigeFormula: floor((run/2500)^0.55)`
- 10 K run → 2 gems
- 100 K run → 7 gems
- 1 M run → 24 gems
- 1 B run → ~116 gems

Gems grow sub-linearly in coins earned, but `gemMult` grows linearly in gems. Net effect: each prestige takes roughly the same wall-clock time while giving exponentially more income. Classic runaway loop.

### 2.4 First prestige feels bad

Threshold is 10 000 coins; reward is 2 gems = +20% coin bonus. After a 30-minute grind, a 20% buff on a reset world is a letdown.

### 2.5 One-shot crew skills are no-brainers with no progression

Every node is a single unlock. Efficiency Expert gives +20% mow rate **and** +10% global coin for 18 K coins — easily the best-value purchase in the game, and there's no version where you partially-invest.

### 2.6 Grass species coin multipliers are flat ×, not per-run earners

Void Grass is ×360 coin. Once unlocked, it remains ×360 every subsequent run. Unlocking it once trivializes the mid-tier species (Crystal at 9×, Golden at 22×) on every future reset.

### 2.7 Quest rewards don't track the economy

- `mow_tiles`: `goal * 6` coins — irrelevant after first 20 min.
- `earn_coins`: 45% of a rate-scaled goal — feeds income loops that scale with your current income.
- `big_mow`: **flat 2 gems** regardless of goal. Feels undertuned mid-game, overtuned early (one big_mow ≈ first prestige).

### 2.8 Fuel & tools become irrelevant once Electric is bought

Electric fuel (20 K coins) has no drain loop and isn't refuelable → fuel-efficiency upgrades, Mechanic crew, and Auto-Refueler crew become dead systems.

### 2.9 Ascend is the only actual soft cap — and it wipes too much

Ascend wipes gems, coin-tier upgrades, garden, crew, grass unlocks (except gem-shop one-shots), gemUpgrades. A player who just built a satisfying economy is asked to demolish all of it for a single-digit ruby yield. Most players will refuse the first ascend long past the point it would help them.

---

## 3. Proposed changes

### 3.1 Replace linear `gemMult` with diminishing curve **(highest priority)**

Change `gemMult` from linear `1 + g * 0.10` to a sub-linear curve so additional gems matter less.

**Final (sim-tuned after 4 iterations — §8):**
```js
function gemMult() {
  const g = state.totalGemsEarned || state.gems;
  return 1 + 0.35 * Math.pow(g, 0.65);
}
```
| gems | old (1+g×0.1) | new (1+0.35·g^0.65) |
| --- | --- | --- |
| 10 | 2.0× | 2.6× |
| 100 | 11× | 8.8× |
| 1 000 | 101× | 31× |
| 10 000 | 1 001× | 140× |
| 100 000 | 10 001× | 626× |

Keeps early prestiges feeling rewarding, compresses the late-game runaway. Tuned against the 12 h auto-played simulator: doubling time **1.63 h**, R² **0.847** (both in target range), no plateaus >10 min.

**Rejected alternatives:**
- `1 + 0.6·√g` — too flat at gem counts >500, produced an 8 h dead plateau around 10⁵ CPS in sim.
- `1 + 0.5·g^0.7` — too steep, doubling collapsed to 1.11 h.
- Linear `1 + 0.02·g` — doesn't fix the eventual runaway, only delays it.

### 3.2 Retune the multiplier stack

Goal: most stacks additive within a bucket, multiplicative between buckets.

**Proposed buckets:**
- **"Passive economy"** (additive): `value` upgrade + fountains + rocks + crew-coin + gem-Midas + ruby-Market
- **"Per-gem curve"** (multiplicative, standalone): `gemMult`
- **"Species"** (multiplicative per-tile): `coinMult` of grass type

New implementation:
```js
function coinEconomyAdd() {
  return state.upgrades.value * 0.15
       + state.garden.fountain * 0.08
       + state.garden.rock * 0.005
       + (hasCrew('efficiency') ? 0.10 : 0)
       + gemLvl('coinMult') * 0.08    // up from 0.05 — gem-shop upgrade retuned §3.4
       + rubyLvl('coinMult') * 0.10;
}
function coinMult() { return (1 + coinEconomyAdd()) * gemMult(); }
```

Late-game product (same numbers as §2.2) then becomes:
`(1 + 18 + 0.8 + 0.2 + 0.1 + 1.0 + 3.0) ≈ 24.1×` × `gemMult(1000)` ≈ 19.9× = **~480×** (down from 36 500×).

Void grass's ×360 still applies as a per-tile multiplier, yielding a sane ~170 K× on void tiles.

### 3.3 Prestige & ascend formulas

With `gemMult` tamed (§3.1) we can accelerate prestige yields so progression feels brisker.

- **Lower prestige threshold** from 10 000 → **7 000 coins** (sim showed 5 K led to too-frequent prestiges in early game; 7 K lands the first prestige at ~5 min).
- **Raise prestige exponent:** `^0.55` → `^0.60`, and raise divisor so first run still yields ~3 gems.
  ```js
  prestigeThreshold: 7000,
  prestigeFormula: (run) => Math.floor(Math.pow(run / 1500, 0.60)),
  ```
  - 7 K → 3 gems (was 2 at 10 K)
  - 50 K → 9 (was 5)
  - 500 K → 37
  - 50 M → 560
  - 5 B → 8 500
- **Ascend:** leave formula alone, but **raise exponent slightly** since gems will inflate less:
  ```js
  ascendFormula: (g) => Math.floor(Math.pow(g / 40, 0.55)),
  ```
  - 40 gems → 1 ruby (was 50 → 1)
  - 500 → 4 (was 3)
  - 5 000 → 14 (was 10)

### 3.4 Crew skills: levels, not one-shots

Replace flat unlocks with **3-level skills** (except Foreman which remains the gate).

| Skill | L1 | L2 | L3 |
| --- | --- | --- | --- |
| Foreman | +5% speed (unchanged, gate) | — | — |
| Mechanic | –15% drain | –25% drain | –35% drain + 15% refuel disc |
| Keen Eye | +20% gnome freq | +35% freq, +30% skin | +50% freq, +60% skin |
| Quality Control | +2% crit | +4% crit | +6% crit |
| Mole Warden | –25% moles | –50%, +50% evict | –75%, +100% evict |
| Efficiency | +10% mow | +20% mow, +5% coin | +25% mow, +10% coin |

Costs scale ×4 per level. Schema change: `state.crew` goes from `string[]` to `{[id]: level}`. **Needs `SAVE_KEY` bump** or migration (treat existing string-array entries as level 1).

**Gem-shop caps (tuned in §8):**
| Upgrade | Old | New |
| --- | --- | --- |
| coinMult | max 20, +5%/lvl | **max 25, +8%/lvl** |
| growth | max 15, +5%/lvl | **max 20, +5%/lvl** (unchanged coeff, more ceiling) |

Gives late-game gem holders a reason to keep spending without re-introducing the runaway.

### 3.5 Grass species: coin mult tier compression

Current ×360 Void is absurd once all other stacks apply. Compress:

| Species | Old coin | New coin | Old unlock | New unlock |
| --- | --- | --- | --- | --- |
| Clover | 2.2× | 2.0× | 3.5 K | unchanged |
| Thick | 4.0× | 3.5× | 18 K | unchanged |
| Crystal | 9.0× | 7× | 110 K | unchanged |
| Golden | 22× | 16× | 650 K | unchanged |
| Obsidian | 55× | 35× | 15 gems | 10 gems |
| Frost | 140× | 75× | 40 gems | 25 gems |
| Void | 360× | 150× | 100 gems | 60 gems |

Also cap any single species' spawn weight × spawn-level bonus so void can't saturate the field.

**Gem-shop species-unlock costs** lowered in parallel (was 15/40/100): now **10/25/60** gems to pair with the earlier prestige cadence of §3.3.

### 3.6 Quest rewards tied to current income

- `mow_tiles`: `reward = g * (3 + 0.3 * displayedRate)` instead of flat `g*6`. Late game you earn the equivalent of ~1 min of income.
- `earn_coins`: reduce from 45% → **25%** of goal. Still worth doing, not a self-feeding loop.
- `big_mow`: scale reward by goal: `reward = Math.max(2, Math.floor(goal / 250))` gems. 400-tile quest → 2 gems (same as today); 900-tile → 3; matches how hard the marathon actually is.

### 3.7 Fuel & tools relevance

- **Electric no longer infinite.** Give it `drainMult: 0.10` instead of 0 so fuel-efficiency and auto-refuel still matter. Keep `refuelable: false` → it self-regens via `recharge: 1.5`, but if you push robots past a size threshold, regen can't keep up and you throttle.
- **Remove "Industrial Beast" from the 18 K crew tier.** The top tool (×18 mow, 2.0 tile radius) at 200 K coins becomes obsolete within one prestige. Rescale:
  - Pro Mower X1: rate 10 → 8, cost 45 K unchanged
  - Industrial Beast: rate 18 → 14, cost 200 K → 500 K

### 3.8 Garden retune

Move Fountain from multiplicative coin (+8%/each, 10 max = +80%) into the additive bucket per §3.2. That alone removes a massive compounding source. Also consider:

- **Tree growth** +1% is fine.
- **Pond growth** +3% is fine.
- **Shed speed** +5%/each × 15 = +75% robot speed — stack with ruby speed this gets silly. Cap at **+3%/each** and drop max to 10.
- **Gnome crit** +1%/each × 20 = +20%. With gem (+15%), ruby (+30%), crew (+4%), upgrade (+80% at L40) and QC (+4%) the 75% cap is easy. That's fine — the cap exists — but consider lowering the cap to **60%** so crit doesn't become guaranteed.

### 3.9 Starting-coin gem upgrade

`Cushion Bank` gives `250 * (2^L - 1)` coins at L=10 = 255 750 coins. After §3.3 prestige retune, first-prestige cost is trivial (5 K), so 255 K start coins trivializes the first 20 minutes of any subsequent run. Change:

```js
// Linear instead of exponential
startingCoinsFor: (lvl) => lvl * 500,  // max L10 = 5000 coins (= first prestige)
```

Keeps the upgrade meaningful (free first prestige at max) without invalidating 3+ tiers of progression.

### 3.10 Ascend should keep more

Currently wipes: gems, coin upgrades, garden, crew, grass-species unlocks via `grassTypes[x].unlocked`, all `gemUpgrades`.
Currently keeps: rubies, `rubyUpgrades`, `totalRubiesEarned`, skins, patterns.

Proposal: **keep `gemUpgrades` too.** Rationale: gemUpgrades are already permanence-coded (survive prestige). Wiping them on ascend punishes the player for the exact behavior we asked them to do (prestige a lot). Ruby shop gates the ascend-specific perks; gem shop stays as a slow permanence ladder. If gem-upgrade spend feels too powerful to keep, scale down gem-upgrade effects instead of wiping them.

### 3.11 Offline earnings cap

`CFG`-hardcoded 12 h cap + ruby `offlineCap` +4 h / lvl to max 60 h. Given the new flattened curve, 60 h of offline mowing becomes the single biggest income source in the game. Cap total offline credit at **24 h regardless of rubies**, and convert `offlineCap` ruby upgrade into a **`offlineBoost`** that multiplies the accrued offline coins instead (+10% / lvl, max 12 → +120%). Same feel, less exploitable with sleep-cycling.

---

## 4. Testing plan / checkpoints

After changes are live, playtest (or simulate via a scripted harness) these waypoints:

| Waypoint | Target wall-clock | Reason |
| --- | --- | --- |
| First robot purchased (2 robots) | < 60 s | Early hook |
| First shop upgrade past L5 | < 3 min | Friction check |
| First prestige (eligible) | 10–15 min | §3.3 |
| First prestige (actually executed) | 15–20 min | Player hesitation is normal |
| Crystal Grass unlock (110 K coins) | run 3–4 | Mid-tier species feels earned |
| Golden Grass unlock (650 K) | run 5–7 | |
| First ascend (eligible) | 3–5 hrs total | §3.3 with tuned exponent |
| Void grass unlock (140 gems) | post-first-ascend | End-game tier |
| Ruby-shop L5 in anything | ~10 hrs | Actually pushes toward late-game |

Sanity check: `coinMult()` at "full L120 value, 1000 gems earned, 10 fountains, max gem+ruby shops" should land around **500×**, not 36 500×.

---

## 5. Migration / save-compat

Systems that change schema:
- **§3.4** crew from `string[]` → `{id: level}`. Migration: array → `Object.fromEntries(arr.map(id => [id, 1]))`.
- **§3.11** renames `rubyUpgrades.offlineCap` → `offlineBoost`. Migration: copy levels forward, recompute derived getter.
- **§3.5** grass coin multipliers changing: purely runtime, no schema touch. Existing unlocks remain valid.

Everything else is a `const` retune in `config.js` / `state.js` with no persistence impact.

Recommended: **bump `SAVE_KEY` from `lawnbotTycoonSave_v2` to `_v3`** and handle both shapes in `loadGame` for a few releases. Players keep their progress, new shape is canonical going forward.

---

## 6. Rollout order (suggested)

Smallest-risk → largest-risk, so each change can be playtested in isolation:

1. §3.1 — swap `gemMult` to sqrt curve. *(1-line change, massive impact.)*
2. §3.2 — additive coin bucket. *(confined to `coinMult()`.)*
3. §3.9 — linear starting-coins upgrade.
4. §3.3 — prestige threshold + formula.
5. §3.5 — grass species retune.
6. §3.8 — garden coefficients.
7. §3.6 — quest rewards.
8. §3.11 — offline cap.
9. §3.7 — fuel/tools.
10. §3.10 — ascend preserves gem upgrades.
11. §3.4 — leveled crew skills. *(schema change, save bump.)*

---

## 7. Open questions (for player)

- **Prestige pacing target:** 10 min first, 15 min subsequent (aggressive) or 20/30 (chill)?
- **Total playtime to first ascend:** 3 h (idle-game standard) or 8+ h (more of a slow-burn)?
- **Is the `totalGemsEarned` passive bonus (§3.1) too strong even as `sqrt`?** Consider capping at +100× and relying on prestige/ascend resets for further growth.
- **Should we keep single-species gem-shop unlocks, or convert them into levels too** (e.g., each level of Void increases its spawn weight, not just toggles the unlock)?

## 8. Simulator validation

A headless Node.js simulator (`sim/simulate.js`) auto-plays the economy under
each balance variant and records milestones + a `log₁₀(coins/sec)` envelope.
See `sim/README.md` for details.

### Tuning iterations

Four iterations on a CANDIDATE variant converged on the numbers now in §3:

| Iter | gemMult | grass gates (O/F/V) | prestigeThr | gemShop coinMult | doubling | R² | plateaus |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 (initial PROPOSED, §3 draft) | `1 + 0.6√g`            | 18/50/140 | 5 000 | +5%/lvl, max 20 | 2.94 h | 0.739 | **8 h flat at 10⁵ cps** |
| 1 | `1 + 0.3·g^0.65`       | 10/25/60  | 5 000 | +5%/lvl, max 20 | 1.64 h | 0.633 | none |
| 2 | `1 + 0.5·g^0.7`        | 10/25/60  | 5 000 | +8%/lvl, max 25 | 1.11 h | 0.656 | none |
| 3 | `1 + 0.4·g^0.68`       | 10/25/60  | 7 000 | +8%/lvl, max 25 | 1.49 h | 0.795 | none |
| **4 (final, adopted in §3)** | **`1 + 0.35·g^0.65`** | **10/25/60** | **7 000** | **+8%/lvl, max 25** | **1.63 h** | **0.847** | **none** |

Note: R² is computed on the envelope *after t ≥ 30 min* — the opening climb from 0 cps is inherently super-linear and masks mid/late-game linearity.

### 12-hour auto-played sim (final numbers)

| Metric               | current | proposed (final) |
| --- | --- | --- |
| First prestige       | 5.8 m   | 5.0 m    |
| Fifth prestige       | 39 m    | 28 m     |
| Tenth prestige       | 1.15 h  | 1.04 h   |
| First ascend         | 58 m    | 52 m     |
| Crystal Grass unlock | 36 m    | 27 m     |
| Golden Grass unlock  | 46 m    | 42 m     |
| Final coins/sec      | 2.15 B  | 2.14 M   |
| Final total earned   | 579 B   | 2.64 B   |
| Lifetime gems        | 158 K   | 15.4 K   |
| Lifetime rubies      | 898     | 302      |
| Prestiges            | 125     | 96       |
| Ascends              | 12      | 9        |
| log10(cps)~t R² (env, post-30m) | 0.939 | **0.847** ✓ |
| Doubling time        | 0.62 h  | **1.63 h** ✓ |
| Flat envelope spans >10 min | — | **0** ✓ |

### Findings

- **Current balance runs away** (37-min doubling, 158 K lifetime gems in 12 h,
  final CPS 2.15 B). Confirms §2.1 diagnosis — `gemMult` × multiplicative
  stacks overwhelm the game.
- **Initial PROPOSED (√g, §3 draft)** over-corrected: 8 h dead plateau around
  10⁵ CPS until Void grass unlocked. Pure-sqrt gemMult compresses too hard
  once gem count exceeds a few hundred.
- **Final tuned curve `1 + 0.35·g^0.65`** hits every target cleanly: doubling
  1.63 h, R² 0.847, no envelope plateaus >10 min, 9 ascends in 12 h of
  auto-play.

### Simulator limitations (not addressed)

- **Pro Mower X1 / Industrial Beast "never" purchased** in sim. The greedy
  cost/Δcps auto-buyer plus ascend-wipes-tools keeps the heuristic preferring
  cheap upgrades. Not a balance bug — real players buy tools for other
  reasons (feel, tool-specific quests). Accept the limitation.
- Hazards, weather, quests, fuel modeled as ±10% noise on income. If later
  tuning reveals quest income materially changes pacing, extend the sim.
- Auto-buyer is greedy / myopic; a human would save for strategic breakpoints.
  Real pacing is likely **slightly slower** than sim pacing → our 1.63 h
  doubling is a conservative lower bound.


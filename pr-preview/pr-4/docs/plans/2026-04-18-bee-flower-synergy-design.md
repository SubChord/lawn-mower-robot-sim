# Bee & Flower Synergy — Design

**Date:** 2026-04-18
**Status:** Approved, awaiting implementation plan
**Related:** `REBALANCE.md` (balance context), `CLAUDE.md` (code map)

## 1. Problem

Bees and flowers currently exist but have no real synergy:

- **Flowers** generate a flat `0.35 × coinMult` coins/s each. Cap 80.
- **Beehives** (max 12) spawn bees (`CFG.beePerHive = 3` → max 36 bees).
- **Bees** pick a random flower, fly to it, pay `2.2 × coinMult` per visit, repeat.
- Combined maximum: **~79 coins/s** pre-`coinMult`.
- No dedicated upgrades. Scales only through the global `coinMult()` — so they remain a fixed, small fraction of mowing income at all times. Negligible once any exotic grass unlocks.

The player is told "🌸 flowers feed 🐝 bees" but the mechanical coupling is trivial: bees need at least one flower tile to exist to earn anything, and that's it.

## 2. Goal

Turn bees + flowers into a **parallel income engine** with:

- A dedicated, learnable synergy mechanic (not just "more things = more coins").
- A permanent upgrade path via the gem shop (per brainstorming Q3).
- Endgame scaling that reaches ~3–10% of maxed mowing, and **mid-game** scaling that is genuinely competitive with concurrent mowing — so the player actually chooses between "bee run" and "grass run" when deciding where to spend gems.

Out of scope (explicitly rejected during brainstorming):

- No new currency (honey/nectar/pollen as a spendable resource).
- No flower species tiers.
- No per-item leveling.
- No ruby-shop bee/flower perks.
- No new crew skills.

## 3. Mechanics

### 3.1 Pollination cycles (per-flower state)

Each flower tile has a **pollination meter** `[0.0, 1.0]`, stored as `flowerPollen: Float32Array(gridArea)` alongside `flowerColors` in `world.js`. Zeroed on placement.

- A bee's `visit` adds `CFG.pollenPerVisit = 0.20` to the meter of the visited tile (so ~5 visits to fill, before upgrades).
- When the meter reaches `1.0`:
  1. The flower emits a **pollination burst** worth `bloomBurstBase × coinMult() × streakMult(bee) × clusterMult(tile)` coins (see §3.2, §3.3).
  2. Meter resets to `0`.
  3. Flower enters **wilted** state for `CFG.wiltedDuration = 1.5s` — tinted gray, shrunken, cannot be targeted or visited.
- Passive **trickle** (the current `flowerCoinPerSec` behavior) is kept but lowered from `0.35` → `0.15`. Bursts become the dominant garden revenue.

**Baseline estimate (no upgrades, 80 flowers, 36 bees):**
- Visits per second: ~23
- Bursts per second: ~4.6
- Burst income: `4.6 × 4.0 × ~1.4 (avg streak × cluster)` ≈ 26 coins/s pre-`coinMult`
- Trickle: `80 × 0.15` = 12 coins/s pre-`coinMult`
- **Total: ~38 coins/s pre-`coinMult`**, vs current flat 79. Baseline is intentionally lower — upside comes from gem upgrades stacking on bursts, not trickle.

### 3.2 Bee streaks

Each bee has a `streak: int`, reset to `0` on spawn.

- On a visit that **triggers a burst** (meter fills), `streak += 1`.
- On a visit that does **not** trigger a burst (partial fill only): no change.
- Streak **decays by 1** every `CFG.streakDecaySeconds = 6s` of flight during which no burst is triggered.
- Weather-driven "fly home" does **not** reset streak — bees resume where they left off when weather clears. (Otherwise weather feels double-punishing.)
- Prestige / ascend / zen rebuild respawns bees → streaks reset with them (acceptable).

Multiplier applied to the **next** burst the bee triggers:

```
streakMult(s) = 1 + min(s, streakCap) × streakCoeff
```

Defaults: `streakCap = 10`, `streakCoeff = 0.15` → max 2.5×. Average at steady state (mix of fresh + cap bees): ~1.8×.

Visual: bees with `streak >= 3` get a faint yellow halo; `>= 7` a brighter halo. No HUD number — it's a thing the player notices, not tracks.

### 3.3 Flower clusters

On each burst, count flower tiles with Chebyshev distance ≤ 2 from the bursting flower (5×5 neighborhood minus self, max 24).

```
clusterCount = # flower tiles within Chebyshev ≤ 2 (exclude self, cap at 24)
clusterMult  = 1 + 0.08 × min(clusterCount, 12)
```

- Isolated flower → 1.00×
- 3 neighbors → 1.24×
- 8 neighbors (full 3×3) → 1.64×
- 12+ neighbors (dense bed) → 1.96× (capped)

Computed lazily on burst — ~25 tile lookups per burst, baseline ~5 bursts/s → 125 lookups/s. Negligible. No cached adjacency table.

**Why 5×5 (Chebyshev ≤ 2) instead of 4-neighbor:** tight 4-neighbor rule over-punishes placement imperfection once robots path around flowers. 5×5 rewards "roughly clumped" placement without demanding perfect geometry.

**Interaction note:** clustered flowers are physically close, so streaks are naturally easier to maintain in dense patches. Cluster bonus and streak bonus both reward the same placement. Double-dip is intentional.

### 3.4 Final burst formula

```
burst = bloomBurstBase
      × coinMult()               // global mult (unchanged; see §2.2 of REBALANCE.md)
      × streakMult(bee.streak)   // 1.0 – 2.5× baseline, up to 6× fully upgraded
      × clusterMult(tile)        // 1.0 – 1.96×
```

No new multiplicative factor is applied outside the garden-local chain. Within-garden multipliers compose, then get one `coinMult()` at the end — same pattern as a mow.

## 4. Gem-shop upgrades

Five new permanent upgrades under a "🌻 Apiary" header in the existing Gem shop tab (no new tab). Cost `baseCost × growth^level` gems, standard gem-shop pattern.

| Key | Name | Effect | Max | Base | Growth |
|---|---|---|---|---|---|
| `queenBee` | Queen Bee | +1 bee per hive per level → max 12 hives × (3 + 5) = 96 bees | 5 | 4 | 1.40 |
| `pollenYield` | Pollen Yield | `bloomBurstBase × (1 + 0.15·L)` — up to 2.5× | 10 | 3 | 1.35 |
| `nectarRush` | Nectar Rush | +2 streakCap and +0.02 streakCoeff per level. At L5: cap 20, coeff 0.25 → max 6× streak | 5 | 5 | 1.45 |
| `royalJelly` | Royal Jelly | +25%/lvl to `pollenPerVisit` AND −25%/lvl to `wiltedDuration`. At L5: ~2 visits per bloom, 0.4s wilt | 5 | 4 | 1.40 |
| `flowerMastery` | Flower Mastery | +20 to flower garden cap (80 → 180 @ L5) | 5 | 3 | 1.35 |

Each upgrade touches a distinct mechanic — scope (`queenBee`, `flowerMastery`), per-burst value (`pollenYield`), streak ceiling (`nectarRush`), throughput (`royalJelly`). No single upgrade is strictly dominant.

**Fully-maxed garden income** (96 bees, 180 flowers, all upgrades at max):

- Burst value: `4 × 2.5 × ~2.0 (avg streak) × ~1.5 (avg cluster)` ≈ 30 × coinMult
- Bursts/s: ~36 (scaled by more bees + faster pollination)
- Burst income: ~1 080 × coinMult
- Trickle: 180 × 0.15 = 27 × coinMult
- **Total: ~1 100 × coinMult coins/s**

Mid-investment (L2/L4/L2/L2/L2) ≈ 200–400 × coinMult — competitive with mid-run mowing. That's the target parallel-income shape.

## 5. Visuals, HUD, save-compat

### 5.1 Render (`render.js`)

- **Flower pollen meter:** yellow `arc()` around each flower tile, sweep = `flowerPollen[idx] × 2π`. Invisible at 0. ~one arc per flower per frame, max ~180 calls.
- **Wilted flower:** grayscale tint + slight shrink during `wiltedDuration`.
- **Burst effect:** reuse `flashCoin()` / particle system with a yellow "+N" float. Same pattern as mow/crit particles.
- **Bee streak glow:** additive-blend yellow halo on bee sprite. Threshold 3 / 7 / cap (size-pulse at cap).

### 5.2 HUD (`ui.js`)

- Existing "🌸 flowers feed 🐝 bees" text stays.
- Add a readout: `Garden: XX.X coins/s` — EMA of the last ~10s of garden income (bursts + trickle). Parallel to the existing coin/s ticker so the garden's contribution is directly legible.
- Gem-shop upgrades under a "🌻 Apiary" section header in the existing Gem tab. No new tab.

### 5.3 Save format (`save.js`)

- `SAVE_KEY`: `lawnbotTycoonSave_v2` → `lawnbotTycoonSave_v3`.
- Serialize `flowerPollen` as a plain array **only if any non-zero value exists**; otherwise omit. Most saves skip it.
- `bees[]` is already not persisted (rebuilt by `ensureBeesFromHives` on load) — streaks reset on load. Acceptable.
- New `state.gemUpgrades.{queenBee, pollenYield, nectarRush, royalJelly, flowerMastery}` default to `0` for migrated v2 saves.
- One-time migration toast on v2 → v3 load: `"🌻 Apiary unlocked! Bees and flowers overhauled — check the Gem shop."`

### 5.4 Simulator (`sim/`)

- Add to `sim/balance.js` PROPOSED: `bloomBurstBase`, `pollenPerVisit`, `wiltedDuration`, `streakCap`, `streakCoeff`, `streakDecaySeconds`, `clusterRadius`, `clusterCoeff`, `clusterCap`, the 5 new gem upgrades.
- `sim/simulate.js` auto-player: treat garden as a second income source; model burst rate, avg streak, avg cluster analytically (not tile-by-tile) — close enough for a pacing heuristic. Add buy-priority entries for the new gem upgrades.
- **Re-validate balance targets.** The convergence in `REBALANCE.md §8` assumed flowers/bees as a small static income. New garden income shifts CPS; expect to retune `gemMult` exponent or new-upgrade costs. Targets unchanged: doubling 1.5–2.5 h, R² ≥ 0.7, no flat span > 2 h.

## 6. Constants summary

New/changed constants in `config.js`:

| Name | Value | Purpose |
|---|---|---|
| `flowerCoinPerSec` | `0.35` → `0.15` | Passive trickle reduced |
| `bloomBurstBase` | `4.0` | Base coin value of a pollination burst |
| `pollenPerVisit` | `0.20` | Meter fill per bee visit |
| `wiltedDuration` | `1.5` | Seconds after burst during which flower is inactive |
| `streakCap` | `10` | Bee streak ceiling |
| `streakCoeff` | `0.15` | Per-streak multiplier contribution |
| `streakDecaySeconds` | `6` | Flight seconds per streak-decay step |
| `clusterRadius` | `2` | Chebyshev radius for cluster counting |
| `clusterCoeff` | `0.08` | Per-neighbor cluster bonus |
| `clusterCap` | `12` | Neighbor count cap for cluster bonus |
| `beeRewardPerVisit` | `2.2` → **removed** | Replaced by pollen-based bursts |

## 7. Risks

- **Balance drift.** Adding a parallel income engine changes the pacing targets tuned in `REBALANCE.md §8`. Sim must re-validate; likely needs `gemMult` or new-upgrade cost tuning.
- **Performance.** Pollen meter arcs at ~180 tiles/frame is fine. Streak glow on up to 96 bees is fine. Cluster scan at ~36 bursts/s × 25 lookups = 900 lookups/s — negligible.
- **Visual clutter.** Pollen meters on dense flower beds could be noisy. If so, render only when `flowerPollen[idx] > 0.2` to declutter early fill.
- **Save migration.** One-shot v2 → v3. Straightforward; defaults are zero. The migration toast serves as the only UX callout — if players have established v2 saves with lots of flowers, their first bloom will feel different. Acceptable.

## 8. Rollout

1. Implement mechanics in `config.js`, `world.js`, `ai.js`, `render.js` — feature off behind a `CFG.beeFlowerV2 = true` flag for easy revert during iteration.
2. Add gem upgrades in `state.js` + `ui.js` Gem tab render.
3. Bump `SAVE_KEY` and add v2 → v3 migration in `save.js`.
4. Add constants + gem upgrades to `sim/balance.js`; extend `sim/simulate.js` auto-player.
5. Re-run sim, iterate until targets hold.
6. Remove the feature flag.
7. Update `REBALANCE.md §8` with the re-validated numbers; update `CLAUDE.md` with new tile state and file responsibilities if they change.

# Design: The Town

**Date:** 2026-04-17
**Status:** Approved design; implementation plan pending.

## Concept

Unlocking **The Town** (one-time 💎 gem purchase in the existing Gem Shop) opens a new top-down **street view** showing every lot the player owns. Each house is its own self-contained game instance — its own robots, coin-shop upgrades, fuel, tools, crew, quests, grass, and yard layout. Only coins, gems, and gem-shop perks are shared globally. Fancier houses ship with larger, multi-zone yards (fences, gates, patios, ponds, pools, etc.) and intrinsic income multipliers, so owning and progressing them is the new long-horizon goal.

The starter lawn that players have been mowing becomes the first house (`starter`) — no content thrown away.

## Views

- **Street view** (new): horizontal row of house lots with live `🤖 × N` and `+coins/sec` labels. Click a lot to zoom in. Locked lots show their gem price and a Buy button.
- **House view**: today's sim scoped to the active house. A `← Town` button in the HUD returns to the street.

## State boundaries

| Global (survives house switch & prestige) | Global (survives house switch, resets on prestige) | Per-house (resets on prestige) |
|---|---|---|
| Coins, Gems | `totalEarnedThisRun` (sum across all houses this run) | Robots roster + positions |
| Gem-shop perks, skin unlocks | | Coin-shop upgrades (robot count, mow rate/radius, speed, crit, coin mult, …) |
| Town unlock, house ownership | | Fuel, active tool, crew, quests, garden placements |
| Weather & day/night (atmosphere) | | Grass heights, tile layout, grass species, bees |

Buying `+1 robot` in the shop applies to the **currently-viewed house only**. Robots cannot be transferred between houses (explicit design vetoed by user).

## Income model

- **Viewed house:** full sim runs as today.
- **Unviewed owned houses:** ticked every fixed step with a flat idle formula:
  ```
  idle/sec = robotsAtHouse × CFG.idleRatePerBot × house.featureMult × gemShopMults × coinMult()
  ```
  Coins deposit into the global wallet. No grass sim runs for unviewed houses.

`CFG.idleRatePerBot` is calibrated so a robot earns roughly what it would in a viewed house, scaled slightly down to reward returning.

## Prestige

One global button. Resets every per-house column above back to starter values across **all** houses. Preserves: coins→gems conversion, town unlock, house ownership, gem-shop perks, skin unlocks, `state.gems`.

`state.totalEarnedThisRun` aggregates across all houses this run and drives the prestige gem formula as today.

## Grid rework — multi-zone with gates

New tile types added to `T`:

- `FENCE` (obstacle, wall segment)
- `PATH`, `DRIVEWAY`, `PATIO` (walkable non-grass; no growth, no income)
- `HOUSE_BUILDING` (obstacle, the building footprint)
- `POOL` (obstacle, visual pool feature)

Each house in `HOUSE_DEFS` declares `gridW`, `gridH`, and an **ASCII layout string**. On first visit to a house, the layout is painted onto the tile array:

```
FFFFFFGGGGGGFFFFFFF    F = fence (obstacle)
F....GG....F.....F    G = gate (grass tile punched through a fence line)
F..T........F..P..F    T = tree
F...........F.....F    P = pond
FFFFFFGGFFFFFFFFFFF    . = grass
```

**Zones** = grass regions between fence lines, connected by gates. The existing robot AI (velocity-seek + obstacle repulsion) stays. Layouts are hand-designed so walls are short enough and gates wide enough (≥ 2 tiles) that the repulsion-only AI reliably routes through. A cheap flood-fill at house load tags each grass cell with a `zone` id; `pickTarget` prefers same-zone cells for a robot but falls back to any zone after a few misses so robots can still migrate through gates.

**Features** (pond, tree, patio, pool, etc.) are decorative sprites backed by the new tile types, plus a flat passive multiplier per feature that stacks into `house.featureMult`. No interactive minigames.

## Data shape

```js
state.town = {
  unlocked: false,          // set by gem-shop purchase; persists through prestige
  activeHouseKey: 'starter',
  inTownView: false,
  houses: {
    starter: {
      owned: true,
      perHouse: {
        upgrades, fuel, tool, crew, quests,
        robots: [...], bees: [...],
        grass: Float32Array, tiles: Uint8Array,
        flowerColors: Uint8Array, grassSpecies: Uint8Array,
        zones: Uint8Array,       // flood-fill result, rebuilt on layout change
        totalTilesMowed,
      },
    },
    cottage: { owned: false, perHouse: <lazy, built from template on buy> },
  },
};
```

The globals `grass`, `tiles`, `flowerColors`, `grassSpecies`, `zones`, `robots`, `bees` become **references** bound to the active house's `perHouse.*` arrays. `switchHouse(key)` reassigns the references — no copying. `idx(x, y)` remains `y * activeHouse().gridW + x`.

## MVP content (2 houses)

| Key | Name | Size | Features | Multiplier | Cost |
|---|---|---|---|---|---|
| `starter` | 🏠 Starter Lawn | 20 × 14 | — | 1.00× | free (auto) |
| `cottage` | 🏡 Cozy Cottage | 24 × 16 | Pond (+20%), Big Tree (+25%), Patio dividing zone | 1.45× | 20 💎 |

The starter lawn migrates from the existing lawn on save upgrade — the player keeps every tile they've mowed.

## Files touched

- **config.js** — new tile types in `T`, `OBSTACLE` set additions, `CFG.idleRatePerBot`.
- **state.js** — `HOUSE_DEFS`, `state.town`, helpers (`activeHouse`, `switchHouse`, `buyHouse`, `houseIdleCoinsPerSec`, `enterTownView`, `enterHouse`), per-house state templates, prestige reset walks `state.town.houses[*]`.
- **world.js** — per-house world storage; `loadHouseWorld(key)` rebinds globals and paints the ASCII layout on first visit; zone flood-fill.
- **ai.js** — `tickIdleHouses(dt)`; same-zone bias in `pickTarget` with fallback.
- **render.js** — tile sprites for fence / path / driveway / patio / house-building / pool.
- **town.js** (new) — town-view renderer + click hit-testing; loaded between `render.js` and `save.js`.
- **ui.js** — 🏘️ Town tab in shop (visible post-unlock) with house buy buttons; street-view overlay with house stats; `← Town` button in HUD.
- **save.js** — bump `SAVE_KEY` to `v3`; v2 migration wraps existing world arrays as `houses.starter.perHouse`.
- **main.js** — loop branches on `inTownView`; town view skips the sim, ticks idle houses only. House view runs the active house sim plus idle-ticks unviewed owned houses.
- **index.html** — add `<script src="js/town.js">` between render and save.

## Out of scope for MVP

- A* pathfinding (layouts avoid needing it).
- More than 2 houses (trivially extensible via `HOUSE_DEFS`).
- Camera pan in town view.
- Cross-house robot transfer (explicitly vetoed).
- Per-house weather variation (atmosphere stays global).
- Persisted treasures/particles/visitor-gnomes across house switches (reset on enter).
- Migration of fuel & tool tier state from v2 save into the starter house beyond sane defaults — keep current state if present, else defaults.

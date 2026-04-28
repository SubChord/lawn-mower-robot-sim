# Pixel-Art Terrain + Obstacles (v1) — Design

**Date:** 2026-04-18
**Status:** Approved, awaiting implementation plan
**Scope:** v1 visual upgrade — replace procedural grass tiles and static obstacle
drawings with pixel-art sprites loaded from a single atlas. Actors (mowers,
gnomes, bees, moles), particles, themes, and weather are explicitly out of
scope for this iteration.

## Goals

- Replace noisy procedural grass and obstacle rendering with consistent 16×16
  pixel-art sprites.
- Keep the game fully playable at every step: every sprite draw has a vector
  fallback, nothing breaks if an asset fails to load.
- Establish the asset pipeline (atlas + JSON manifest + `drawSprite` helper)
  so future passes (actors, themes, weather) can slot in without redesign.

## Non-Goals (v1)

- Mower / robot sprite sheets and walk cycles.
- Gnome / mole / bee / treasure sprite replacements.
- Per-theme tile variants — single base tileset only.
- Custom commissioned art.
- Emoji particle replacement (`flashCoin`, crown, 🪚).
- Weather / day-night overlay changes.

## Art Direction

- **Style:** crisp 16×16 pixel art, consistent palette.
- **Source:** Kenney.nl CC0 packs (Roguelike / RPG Pack, Tiny Town, Pixel
  Platformer Nature Expansion). Hand-pick ~20 tiles into a single atlas rather
  than vendoring whole packs.
- **Rendering:** `ctx.imageSmoothingEnabled = false` so 16px source blits
  crisply to any runtime `tileSize` via nearest-neighbor.

## Asset Layout

```
assets/
  tiles/
    terrain.png     # single atlas, ~256x256
    terrain.json    # { "grass_cut_0": {"x":0,"y":0,"w":16,"h":16}, ... }
```

Single PNG = one decode, one GPU upload. JSON manifest keyed by logical name
so swapping art means editing the atlas + JSON, never code.

## Grass System

**Data unchanged.** `grass[]` (float 0..1) and `grassSpecies[]` (Uint8) keep
their current meaning. Rendering changes:

- **3 visual tiers** from the float:
  - `0.00–0.25` → `grass_cut`
  - `0.25–0.65` → `grass_mid`
  - `0.65–1.00` → `grass_tall`
- **3–4 base variants per tier**, picked deterministically via a
  coord-hash (`(x*73856093 ^ y*19349663) % N`) so the lawn looks varied but
  stable across frames (no flicker).
- **Autotiled edges:** when a `cut` tile neighbors a `tall` tile, draw an edge
  sprite on top. 4-bit bitmask of N/E/S/W cut-vs-tall neighbors → up to 16
  edge sprites. Produces the satisfying "mown strip" boundary.
- **Species handling:**
  - Common (Clover, Thick Turf, default) → real sprites.
  - Exotic (Crystal, Golden, Obsidian, Frost, Void) → reuse base `grass_mid`
    sprite, overlay species-colored additive glow + existing accent specks.
- **Mow pattern tint:** unchanged — dark/light overlay rect drawn on top of
  sprite, same code path as today.

## Obstacle Sprites

Each non-grass tile type becomes a sprite lookup. Sprites may exceed 16px tall
(e.g. trees 16×24) and are drawn with a small `(dx,dy)` offset so the canopy
overhangs the tile above — standard roguelike trick, no grid-size change.

| Tile type      | Sprite key(s)                              | Notes                                              |
| -------------- | ------------------------------------------ | -------------------------------------------------- |
| `T.TREE`       | `tree_a`, `tree_b`                         | 2 variants via coord hash; optional y-sway sine.   |
| `T.ROCK`       | `rock_small`, `rock_large`                 | 2 variants.                                        |
| `T.POND`       | `water_center` + 4/8-dir autotile edges    | Adjacent ponds merge into a lake.                  |
| `T.FLOWER`     | `flower_red/yellow/pink/blue/purple`       | Index via existing `flowerColors[]`.               |
| `T.BEEHIVE`    | `beehive`                                  | 1 sprite; bee entities stay vector.                |
| `T.FOUNTAIN`   | `fountain_base` + `fountain_water_0..3`    | 4-frame loop driven by `performance.now()`.        |
| `T.SHED`       | `shed`                                     | 1 sprite.                                          |
| `T.GNOME`      | `gnome_statue`                             | Placed garden gnome; distinct from wandering evil. |
| `T.MOLE_HOLE`  | `mole_mound`                               | Mole peek-out keeps existing vector code.          |

Shadows bake into sprites — removes runtime `ctx.ellipse` shadow draws.

## Integration Strategy — Null-Safe Swap

`Assets.drawImage(ctx, key, x, y, w, h)` already returns `false` on missing
assets. Each obstacle draw becomes:

```js
function drawTree(x, y) {
  if (drawSprite('tree_a', x, y)) return; // new path
  // …existing vector code stays as fallback (unchanged)
}
```

Consequences:
- Pipeline can be stood up end-to-end with one tile before expanding.
- Missing-asset case is a soft fallback, never a crash.
- Old saves / offline users still work.

## File & Code Layout

```
assets/tiles/terrain.png           # NEW
assets/tiles/terrain.json          # NEW
js/sprites.js                      # NEW: atlas loader, drawSprite(), autotile helpers
js/render.js                       # MODIFIED: each draw* tries sprite first
index.html                         # MODIFIED: <script> tag for sprites.js
```

`sprites.js` loads the atlas via the existing `Assets` registry during
`init()`; `preloadAll()` awaits it before the game loop starts. Script load
order (must be preserved):

```
config → state → themes → world → canvas → assets → sprites
     → atmosphere → ai → render → save → ui → main
```

### `drawSprite` API (sketch)

```js
// Returns true if drawn, false if asset unavailable (caller falls back).
drawSprite(key, tileX, tileY, opts?)
// opts: { variant?: int, frame?: int, dx?: px, dy?: px, wTiles?: int, hTiles?: int }

// Convenience for grass:
drawGrassTile(tileX, tileY, tier /* 'cut'|'mid'|'tall' */, variantSeed)

// Autotile helper:
autotileEdge(tileX, tileY, tier, neighborMask /* 4-bit */)
```

## Performance Notes

- Single atlas → single decode + upload.
- Deterministic variant hash per tile → no per-frame RNG, no flicker.
- Autotile bitmask computed per tile per frame is cheap at 48×32=1536 tiles;
  cache with dirty flag later if profiling shows it matters.
- `imageSmoothingEnabled = false` makes `drawImage` nearest-neighbor scaling
  essentially free.

## Testing / Verification

No automated test framework in this project. Verification is manual:

1. `python3 -m http.server 8765` and load `http://localhost:8765/`.
2. `for f in js/*.js; do node --check "$f"; done` after each edit.
3. Visual checks:
   - Grass shows 3 clearly distinct height states.
   - Variants break tiling (no obvious repetition).
   - Cut/tall borders show autotile edges.
   - Each obstacle type renders at correct position/scale at tile sizes 12,
     16, 20, 24.
   - Mow pattern tint still visible over sprites.
   - Missing-asset fallback: rename `terrain.png` temporarily and confirm
     game still renders via vector code.

## Out-of-Scope / Follow-ups (v2+)

- Mower / robot sprite sheets with directional walk cycles.
- Gnome, mole, bee, treasure sprite replacements.
- Per-theme tile variants (frost theme = snow grass, autumn = orange trees).
- Emoji → pixel-icon replacement (crown, particles, coin popups).
- Weather overlay improvements (rain drops, snow flakes as sprites).
- Procedural seasonal recolors via palette swap shader.

## Approval

User approved on 2026-04-18. Next step: invoke `writing-plans` to produce a
concrete step-by-step implementation plan.

# Pixel-Art Terrain + Obstacles (v1) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace procedural grass and static-obstacle drawings with pixel-art sprites loaded from a single 16×16 atlas, using the existing `Assets` registry with null-safe vector fallback.

**Architecture:** Add a new `js/sprites.js` module that loads a PNG atlas + JSON manifest and exposes `drawSprite(key, tileX, tileY, opts)`. Each draw function in `js/render.js` attempts a sprite draw first and falls back to its existing vector code if the sprite is missing. Grass gets a 3-tier bucket mapping + deterministic variant hash + autotiled cut/tall edges. Obstacles (tree, rock, pond, flower, beehive, fountain, shed, gnome statue, mole mound) each swap to one sprite lookup.

**Tech Stack:** Vanilla JS (classic script tags, no build), Canvas2D, `Assets.register` / `Assets.preloadAll`. Assets sourced from Kenney.nl CC0 packs. Pixel art rendered with `ctx.imageSmoothingEnabled = false`.

**Design doc:** `docs/plans/2026-04-18-pixel-art-terrain-design.md`

**Verification model:** This project has no automated test framework (see `CLAUDE.md`). Each task ends with:
1. `for f in js/*.js; do node --check "$f"; done` — must print nothing.
2. A manual browser check via `python3 -m http.server 8765` → `http://localhost:8765/`.
3. A git commit once both pass.

---

## Task 0: Preparation — inventory atlas + pick Kenney tiles

**Files:**
- Create: `assets/tiles/README.md` — source attribution + list of which Kenney packs each sprite came from (CC0 has no legal requirement but we document origin for future maintainers).

**Step 1: Create `assets/tiles/` directory**

Run: `mkdir -p assets/tiles`

**Step 2: Download Kenney packs (manual, one-time)**

From https://kenney.nl (CC0):
- **Roguelike / RPG Pack** → grass tiles, trees, rocks, flowers, shed, beehive, fountain, gnome statue
- **Tiny Town** → alternate trees, rocks, flowers (for variants)
- **Pixel Platformer — Nature Expansion** → water/pond tiles

Store raw downloads outside the repo (e.g. `~/Downloads/kenney/`). We only commit the final composed atlas, not the whole packs.

**Step 3: Compose `assets/tiles/terrain.png`**

Using any image editor (Aseprite, Piskel, GIMP, or a quick Python script with Pillow), lay out chosen 16×16 tiles on a single PNG canvas. Suggested grid: 16 columns × 16 rows = 256×256 px PNG.

Required keys for v1 (see §2 of design doc):

| Key                   | Count      | Notes                           |
| --------------------- | ---------- | ------------------------------- |
| `grass_cut_0..2`      | 3 variants | Short, freshly mowed            |
| `grass_mid_0..2`      | 3 variants | Medium height                   |
| `grass_tall_0..2`     | 3 variants | Uncut, wavy                     |
| `grass_edge_N/E/S/W`  | 4 tiles    | Cut→tall transition per side    |
| `grass_edge_NE/SE/SW/NW` | 4 tiles | Outer-corner edges              |
| `clover_0`            | 1          | Clover species override         |
| `turf_0`              | 1          | Thick-turf species override     |
| `tree_a`, `tree_b`    | 2          | 16×24 trees, overhang 8px up    |
| `rock_small`, `rock_large` | 2     |                                 |
| `water_center`        | 1          | Pond core                       |
| `water_edge_N..NW`    | 8          | 8-direction pond autotile       |
| `flower_red/yellow/pink/blue/purple` | 5 | Indexed by `flowerColors[]` |
| `beehive`             | 1          |                                 |
| `fountain_base`       | 1          | 16×24                           |
| `fountain_water_0..3` | 4          | Animated overlay                |
| `shed`                | 1          | 16×24                           |
| `gnome_statue`        | 1          | Placed garden gnome             |
| `mole_mound`          | 1          | Dirt mound only; mole peek stays vector |

**Step 4: Write `assets/tiles/terrain.json`**

Document each key's `{x, y, w, h}` in atlas pixels. Example:

```json
{
  "grass_cut_0":   { "x": 0,  "y": 0,  "w": 16, "h": 16 },
  "grass_cut_1":   { "x": 16, "y": 0,  "w": 16, "h": 16 },
  "grass_cut_2":   { "x": 32, "y": 0,  "w": 16, "h": 16 },
  "grass_mid_0":   { "x": 0,  "y": 16, "w": 16, "h": 16 },
  "tree_a":        { "x": 0,  "y": 48, "w": 16, "h": 24, "dy": -8 },
  "water_center":  { "x": 0,  "y": 96, "w": 16, "h": 16 }
}
```

Optional per-entry `dx`/`dy` offsets (in source px) let oversized sprites overhang their grid cell.

**Step 5: Write `assets/tiles/README.md`**

List every sprite key → source pack + license note ("All assets CC0 from kenney.nl — no attribution required but listed here for provenance").

**Step 6: Commit**

```bash
git add assets/tiles/
git commit -m "Add terrain atlas (Kenney CC0) for pixel-art v1"
```

**Note for the engineer:** if you don't have art tooling handy, a plausible alternative is to start with 1–2 placeholder sprites (one `grass_cut_0`, one `tree_a`) drawn in any 16×16 PNG to prove the pipeline, then fill in the rest. The fallback path keeps the game playable throughout.

---

## Task 1: Wire the atlas into `Assets` and add `sprites.js`

**Files:**
- Create: `js/sprites.js`
- Modify: `index.html` (add `<script>` tag between `assets.js` and `atmosphere.js`)
- Modify: `js/main.js` (`init()` — preload sprites before loop starts)

**Step 1: Create `js/sprites.js` skeleton**

```js
/* ============================================================
   Sprite atlas loader + drawSprite helper
   Loads assets/tiles/terrain.png + terrain.json via Assets.
   Every draw is null-safe: returns false if the atlas isn't
   loaded or the key is unknown so callers can vector-fallback.
   ============================================================ */

Assets.register('terrain_png',  { type: 'image', src: 'assets/tiles/terrain.png' });
Assets.register('terrain_json', { type: 'json',  src: 'assets/tiles/terrain.json' });

const Sprites = (() => {
  let atlas = null;     // HTMLImageElement
  let manifest = null;  // { key: {x,y,w,h,dx?,dy?} }

  function ready() {
    if (atlas && manifest) return true;
    atlas    = atlas    || Assets.image('terrain_png');
    manifest = manifest || Assets.json('terrain_json');
    return !!(atlas && manifest);
  }

  // Draw a sprite at tile coordinates. Returns true on success.
  function draw(key, tileX, tileY, opts) {
    if (!ready()) return false;
    const spec = manifest[key];
    if (!spec) return false;
    const ts  = tileSize;
    const dx  = (spec.dx || 0) * (ts / 16);
    const dy  = (spec.dy || 0) * (ts / 16);
    const dw  = (spec.w  / 16) * ts;
    const dh  = (spec.h  / 16) * ts;
    ctx.drawImage(atlas, spec.x, spec.y, spec.w, spec.h,
                  tileX * ts + dx, tileY * ts + dy, dw, dh);
    return true;
  }

  // Deterministic variant picker — stable across frames for a given tile.
  function variantIndex(x, y, count) {
    if (count <= 1) return 0;
    const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
    return h % count;
  }

  // Resolve a key+variant combo; falls back to base if the specific variant
  // isn't present (e.g. only `grass_cut_0` shipped so far).
  function pickVariant(baseKey, x, y, maxCount) {
    if (!ready()) return baseKey;
    for (let n = maxCount; n >= 1; n--) {
      const idx = variantIndex(x, y, n);
      const k = `${baseKey}_${idx}`;
      if (manifest[k]) return k;
    }
    return baseKey;
  }

  function has(key) { return !!(manifest && manifest[key]); }

  return { ready, draw, variantIndex, pickVariant, has };
})();
```

**Step 2: Modify `index.html` — add `<script>` tag**

Find the `<script src="js/assets.js"></script>` line and insert immediately after:

```html
<script src="js/sprites.js"></script>
```

Preserve existing load order: config → state → themes → world → canvas → assets → **sprites** → atmosphere → ai → render → save → ui → main.

**Step 3: Modify `js/main.js` — preload before first `loop()` tick**

Locate the `init()` function. Wrap the `loop()` start in a preload:

```js
// inside init(), after existing setup but before requestAnimationFrame(loop)
Assets.preloadAll().then(() => {
  if (ctx) ctx.imageSmoothingEnabled = false;
  requestAnimationFrame(loop);
});
```

If `init()` currently calls `loop()` or `requestAnimationFrame(loop)` directly, replace that single call with the `.then()` wrapper. Everything else in `init()` stays synchronous — only the first frame is gated.

**Step 4: Syntax-check**

Run: `for f in js/*.js; do node --check "$f"; done`
Expected: no output (no errors).

**Step 5: Verify in browser**

Run: `python3 -m http.server 8765` (in a separate terminal)
Open: `http://localhost:8765/`

Expected:
- Game loads and runs exactly as before (vector rendering unchanged).
- Browser devtools Network tab shows requests for `assets/tiles/terrain.png` and `assets/tiles/terrain.json`.
- If those 404 (e.g. not committed yet): console shows the `[Assets]` warnings but game still runs.
- If they succeed: still no visual change yet (nothing in `render.js` is calling `Sprites.draw` yet).

**Step 6: Commit**

```bash
git add js/sprites.js index.html js/main.js
git commit -m "Wire sprite atlas loader into Assets pipeline"
```

---

## Task 2: Sprite-ify one obstacle end-to-end (tree) — prove the pattern

**Files:**
- Modify: `js/render.js` (`drawTree`, lines ~160–180)

**Rationale:** Before touching grass (which is the riskiest change), swap a single obstacle to validate atlas layout, coord offsets, scaling at different `tileSize` values, and the fallback path.

**Step 1: Edit `drawTree` to try sprite first**

Replace the body of `drawTree(x, y)` with:

```js
function drawTree(x, y) {
  const key = Sprites.pickVariant('tree', x, y, 2); // tree_0, tree_1, …
  if (Sprites.draw(key, x, y)) return;
  // --- existing vector fallback below, unchanged ---
  const ts = tileSize;
  // …rest of original drawTree body…
}
```

Note: the design doc uses `tree_a`/`tree_b`; align atlas keys to `tree_0`/`tree_1` to match `pickVariant`'s `${base}_${idx}` convention. Update `terrain.json` accordingly if needed.

**Step 2: Syntax-check**

Run: `for f in js/*.js; do node --check "$f"; done`
Expected: no output.

**Step 3: Verify in browser — happy path**

With a real atlas containing `tree_0` in `terrain.json`:
- Load game, mow until trees appear on the lawn (or use dev shortcut / save scrub if available).
- Trees render as pixel-art sprites, not vector. Two distinct variants visible across the map.
- Resize window: tree sprites scale crisply (no blur).

**Step 4: Verify in browser — fallback path**

Temporarily rename `assets/tiles/terrain.png` → `terrain.png.bak`, reload.
- Trees render with original vector code.
- Console shows `[Assets] image failed: terrain_png` warning.
- Restore: `mv terrain.png.bak terrain.png`.

**Step 5: Commit**

```bash
git add js/render.js
git commit -m "Draw trees from sprite atlas with vector fallback"
```

---

## Task 3: Sprite-ify remaining static obstacles

**Files:**
- Modify: `js/render.js` — `drawRock`, `drawPond`, `drawFlower`, `drawBeehive`, `drawFountain`, `drawShed`, `drawGnome`, `drawMoleHole`

**Step 1: `drawRock`**

Prepend:
```js
function drawRock(x, y) {
  const key = Sprites.pickVariant('rock', x, y, 2);
  if (Sprites.draw(key, x, y)) return;
  // existing vector body unchanged
  ...
}
```

**Step 2: `drawFlower`**

```js
function drawFlower(x, y) {
  const colorIdx = flowerColors[idx(x, y)] || 0;
  const keyByIdx = ['flower_red','flower_yellow','flower_pink','flower_blue','flower_purple'];
  const key = keyByIdx[colorIdx] || 'flower_red';
  if (Sprites.draw(key, x, y)) return;
  // existing vector body unchanged
  ...
}
```

(Confirm `FLOWER_PALETTE` order in `config.js` matches this mapping — adjust `keyByIdx` to match.)

**Step 3: `drawBeehive`, `drawShed`, `drawGnome`**

Each gets the same one-liner prepend with its static key (`beehive`, `shed`, `gnome_statue`).

**Step 4: `drawFountain` — animated**

```js
function drawFountain(x, y) {
  if (Sprites.ready() && Sprites.has('fountain_base')) {
    Sprites.draw('fountain_base', x, y);
    const frame = Math.floor(performance.now() / 140) & 3; // 4 frames ~7fps
    Sprites.draw(`fountain_water_${frame}`, x, y);
    return;
  }
  // existing vector body unchanged
  ...
}
```

**Step 5: `drawPond` — autotile**

Ponds need edge sprites since they can form clusters. Add a helper at top of `render.js` (or in `sprites.js`):

```js
function pondNeighborMask(x, y) {
  let mask = 0;
  const isPond = (xx, yy) => {
    if (xx < 0 || yy < 0 || xx >= CFG.gridW || yy >= CFG.gridH) return true; // treat out-of-bounds as pond so edges don't draw at map border
    return tiles[idx(xx, yy)] === T.POND;
  };
  if (!isPond(x,   y-1)) mask |= 1; // N
  if (!isPond(x+1, y))   mask |= 2; // E
  if (!isPond(x,   y+1)) mask |= 4; // S
  if (!isPond(x-1, y))   mask |= 8; // W
  return mask;
}
```

Then:

```js
function drawPond(x, y) {
  if (Sprites.ready() && Sprites.has('water_center')) {
    Sprites.draw('water_center', x, y);
    const m = pondNeighborMask(x, y);
    if (m & 1) Sprites.draw('water_edge_N', x, y);
    if (m & 2) Sprites.draw('water_edge_E', x, y);
    if (m & 4) Sprites.draw('water_edge_S', x, y);
    if (m & 8) Sprites.draw('water_edge_W', x, y);
    // corners (optional for v1 — skip if only 4-dir edges shipped)
    return;
  }
  // existing vector body unchanged
  ...
}
```

**Step 6: `drawMoleHole` — mound only, keep peek animation**

Replace only the "dirt mound" section (top half of the function) with a sprite call. Keep the mole-peek / expiration-ring vector code as-is since it reads `moles[]` state.

```js
function drawMoleHole(x, y) {
  const drewMound = Sprites.draw('mole_mound', x, y);
  if (!drewMound) {
    // existing mound-drawing vector code
    ...
  }
  // Mole peek-out + expiration ring — UNCHANGED (always vector, runs after mound)
  const m = moles ? moles.find(mm => mm.tileX === x && mm.tileY === y) : null;
  if (m) { ...existing peek code... }
}
```

**Step 7: Syntax-check**

Run: `for f in js/*.js; do node --check "$f"; done`
Expected: no output.

**Step 8: Verify in browser**

- Each obstacle type renders from the atlas (or falls back cleanly if a specific key is missing — a missing `beehive` sprite should still draw the vector beehive).
- Pond clusters: place multiple adjacent ponds, edges only appear on non-pond sides.
- Fountain: water cycles through 4 frames.
- Mole hole: mound is sprite, mole still pops up as vector.

**Step 9: Commit**

```bash
git add js/render.js
git commit -m "Draw rock/pond/flower/beehive/fountain/shed/gnome/mole from atlas"
```

---

## Task 4: Sprite-ify grass base tiers

**Files:**
- Modify: `js/render.js` — `drawGrass`, helper `getTileImage` becomes fallback-only

**Step 1: Add a tier helper**

At the top of `render.js` (or in `sprites.js`), add:

```js
function grassTier(heightFloat) {
  if (heightFloat < 0.25) return 'cut';
  if (heightFloat < 0.65) return 'mid';
  return 'tall';
}
```

**Step 2: Rewrite inner loop of `drawGrass`**

Current shape (simplified):

```js
for each tile:
  if GRASS: drawImage(getTileImage(bucket, species), ...)
  else:     drawImage(getTileImage(2), ...)     // "cut" placeholder under obstacles
  apply mow pattern tint
```

New shape:

```js
function drawGrass() {
  const ts = tileSize;
  for (let y = 0; y < CFG.gridH; y++) {
    for (let x = 0; x < CFG.gridW; x++) {
      const k = idx(x, y);
      const isGrass = tiles[k] === T.GRASS;
      const h = isGrass ? grass[k] : 0.15; // non-grass tiles use "cut" base underneath
      const tier = grassTier(h);
      const spec = isGrass && grassSpecies ? grassSpecies[k] : 0;

      // Species override for common species
      let baseKey = `grass_${tier}`;
      if (spec === 1 && Sprites.has('clover_0')) baseKey = 'clover';
      else if (spec === 2 && Sprites.has('turf_0')) baseKey = 'turf';

      const key = Sprites.pickVariant(baseKey, x, y, 3);
      const drew = Sprites.draw(key, x, y);
      if (!drew) {
        // fallback to existing procedural path
        const bucket = Math.min(10, Math.max(0, Math.round(h * 10)));
        ctx.drawImage(getTileImage(bucket, spec), x * ts, y * ts);
      }

      // Mow pattern tint — unchanged
      if (isGrass) {
        const tint = mowPatternTint(x, y, h);
        if (tint) {
          ctx.fillStyle = tint.dark
            ? `rgba(0,0,0,${tint.alpha.toFixed(3)})`
            : `rgba(255,255,255,${(tint.alpha * 0.65).toFixed(3)})`;
          ctx.fillRect(x * ts, y * ts, ts, ts);
        }
      }
    }
  }
}
```

**Step 3: Exotic species overlay**

Add at the end of the per-tile block, before the pattern tint:

```js
if (isGrass && spec >= 3 && typeof GRASS_TYPES !== 'undefined' && GRASS_TYPES[spec]) {
  const accent = GRASS_TYPES[spec].accent;
  if (accent) {
    // additive glow — cheap, preserves readability
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(${accent[0]},${accent[1]},${accent[2]},0.22)`;
    ctx.fillRect(x * ts, y * ts, ts, ts);
    ctx.globalCompositeOperation = 'source-over';
  }
}
```

**Step 4: Syntax-check**

Run: `for f in js/*.js; do node --check "$f"; done`
Expected: no output.

**Step 5: Verify in browser**

- Lawn renders with pixel-art grass in 3 visibly distinct height states.
- Freshly-mowed tiles are clearly shorter than uncut tiles.
- Variants visible: no obvious 1-tile repetition pattern.
- Mow pattern (equip Stripes) still tints visibly.
- Clover and Thick Turf species show their own sprites; exotic species (Crystal, Golden, Obsidian, Frost, Void) show a colored glow over `grass_mid`.
- Rename `terrain.png` → verify vector fallback still works.

**Step 6: Commit**

```bash
git add js/render.js
git commit -m "Draw grass tiles from sprite atlas with 3 height tiers"
```

---

## Task 5: Autotiled cut↔tall grass edges

**Files:**
- Modify: `js/render.js` — `drawGrass`

**Step 1: Add neighbor helper**

```js
function grassTierAt(x, y) {
  if (x < 0 || y < 0 || x >= CFG.gridW || y >= CFG.gridH) return 'cut';
  const k = idx(x, y);
  if (tiles[k] !== T.GRASS) return 'cut';
  return grassTier(grass[k]);
}
```

**Step 2: Draw edges after base grass**

Inside `drawGrass`'s per-tile block, after the base sprite draw (and after the exotic overlay, before the pattern tint), append:

```js
// Edge overlay only on CUT tiles adjacent to a TALL tile — gives the classic
// "just-mowed strip" boundary. MID is considered neutral for edges.
if (tier === 'cut') {
  const n = grassTierAt(x, y - 1) === 'tall';
  const e = grassTierAt(x + 1, y) === 'tall';
  const s = grassTierAt(x, y + 1) === 'tall';
  const w = grassTierAt(x - 1, y) === 'tall';
  if (n) Sprites.draw('grass_edge_N', x, y);
  if (e) Sprites.draw('grass_edge_E', x, y);
  if (s) Sprites.draw('grass_edge_S', x, y);
  if (w) Sprites.draw('grass_edge_W', x, y);
  // Corner edges (outer): only when BOTH adjacent sides are tall
  if (n && e) Sprites.draw('grass_edge_NE', x, y);
  if (s && e) Sprites.draw('grass_edge_SE', x, y);
  if (s && w) Sprites.draw('grass_edge_SW', x, y);
  if (n && w) Sprites.draw('grass_edge_NW', x, y);
}
```

Missing edge sprites are a no-op (returns false) — safe if the atlas only ships 4-dir edges.

**Step 3: Syntax-check**

Run: `for f in js/*.js; do node --check "$f"; done`
Expected: no output.

**Step 4: Verify in browser**

- Start a fresh game so grass is mostly uncut.
- Watch a robot mow a strip — the edge between cut strip and uncut lawn shows the transition sprite, not a hard color seam.
- Mowed patches with tall grass on multiple sides show corner edges where both cardinal edges are tall.

**Step 5: Commit**

```bash
git add js/render.js
git commit -m "Add autotiled edges between cut and tall grass"
```

---

## Task 6: Canvas pixel-perfect rendering setup

**Files:**
- Modify: `js/canvas.js` (resize handler — ensure `imageSmoothingEnabled = false` survives context resets)
- Modify: `styles.css` (canvas CSS)

**Step 1: Pin nearest-neighbor scaling on the canvas**

In `styles.css`, find the `#stage canvas` (or equivalent) selector and add:

```css
#stage canvas {
  image-rendering: pixelated;        /* Chrome, Firefox */
  image-rendering: crisp-edges;      /* Safari fallback */
}
```

**Step 2: Pin it on the 2D context**

In `js/canvas.js`, find the resize handler (the function that recreates or resizes the canvas). After the context is obtained or the canvas dimensions change, set:

```js
ctx.imageSmoothingEnabled = false;
```

Some browsers reset this flag on canvas resize — setting it in the resize handler guarantees it persists.

Also set it once in `main.js` inside `Assets.preloadAll().then(...)` (already done in Task 1) as a belt-and-braces.

**Step 3: Syntax-check**

Run: `for f in js/*.js; do node --check "$f"; done`
Expected: no output.

**Step 4: Verify in browser**

- Resize the window through several sizes. Sprites always remain crisp, never blurry.
- Test on Chrome, Firefox, Safari if available.

**Step 5: Commit**

```bash
git add js/canvas.js styles.css
git commit -m "Force nearest-neighbor scaling for pixel-art sprites"
```

---

## Task 7: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `js/sprites.js` (header comment — confirm complete)

**Step 1: Update `CLAUDE.md`**

Add to the `STRUCTURE` section under `js/`:

```
├── sprites.js   # Atlas loader + drawSprite(key, tileX, tileY, opts). Null-safe.
```

Add to `WHERE TO LOOK`:

| Task | Location |
|------|----------|
| Add or replace a tile sprite | Update `assets/tiles/terrain.png` + `terrain.json`; key is auto-picked up by `Sprites.draw` |
| Adjust grass tier thresholds | `grassTier()` in `render.js` |
| Change autotile edge logic | `drawGrass()` edge block in `render.js` |

Add to `CONVENTIONS`:

- **Pixel art.** Sprites source-authored at 16×16 in `assets/tiles/terrain.png`. Scaled via `ctx.imageSmoothingEnabled = false` + `image-rendering: pixelated`. Every draw call is null-safe — missing atlas ⇒ vector fallback.

**Step 2: Verify no broken references**

Run: `for f in js/*.js; do node --check "$f"; done`
Expected: no output.

**Step 3: Commit**

```bash
git add CLAUDE.md js/sprites.js
git commit -m "Document pixel-art sprite pipeline in knowledge base"
```

---

## Task 8: Final verification checklist

No code changes — this is a manual pass before declaring v1 done.

**Run:**

```bash
for f in js/*.js; do node --check "$f"; done
python3 -m http.server 8765
```

Open `http://localhost:8765/` and confirm:

- [ ] Fresh game loads without console errors.
- [ ] `assets/tiles/terrain.png` and `terrain.json` load (Network tab 200s).
- [ ] Grass: 3 visibly distinct height tiers.
- [ ] Grass: variant diversity — no 1-tile repetition.
- [ ] Grass: cut↔tall autotile edges are visible where a robot has mown a strip.
- [ ] Grass species: Clover / Thick Turf show dedicated sprites; Crystal/Golden/etc show colored glow.
- [ ] Mow pattern (Stripes, Checker, Diamonds) still tints grass correctly.
- [ ] Trees, rocks, flowers, beehives, fountains, sheds, gnome statues all render from atlas.
- [ ] Ponds: isolated ponds show water edges on all 4 sides; adjacent ponds merge.
- [ ] Fountain water animates.
- [ ] Mole hole: mound is sprite, mole peek-out + expiration ring still animate.
- [ ] Window resize preserves crisp pixel-art (no blur).
- [ ] Different `tileSize` values (zoom in/out if supported, or resize window at different aspect ratios) — all sprites stay aligned.
- [ ] **Fallback path:** rename `terrain.png` → reload → game renders entirely via vector code, no crash, console shows `[Assets]` warning.

**If any fail:**
- Compare against the design doc (`2026-04-18-pixel-art-terrain-design.md`) to decide whether it's a bug or a v2 follow-up.
- Fix in place with a focused commit, or open a TODO for v2.

**Final commit (if any patch-ups needed):**

```bash
git commit -am "Polish pixel-art v1 based on final verification"
```

---

## Rollback

If v1 needs to be reverted for any reason:

```bash
git revert <commit-range>
```

Or simply: delete `assets/tiles/terrain.png` — every draw falls back to vector cleanly. Safe rollback-in-place.

---

## What's next (v2+ — not in this plan)

Deferred per design doc §Out-of-Scope:
- Mower / robot sprite sheets with directional walk cycles.
- Gnome, mole, bee, treasure sprite replacements.
- Per-theme tile variants (frost theme = snow grass, autumn = orange trees).
- Emoji → pixel-icon replacement (crown on champion robot, coin popup particles).
- Weather sprites (rain drops, snowflakes).

Each is a separate design+plan cycle.

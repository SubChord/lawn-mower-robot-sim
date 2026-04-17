# LAWNBOT TYCOON — KNOWLEDGE BASE

**Generated:** 2026-04-17
**Commit:** 68cad27
**Branch:** main

## OVERVIEW
Browser-based idle game. Robots mow a grid-based lawn for coins, player buys upgrades. Two prestige layers: **Prestige** (spend coins → gems, +10% coin each) and **Ascend** (spend total gems earned → rubies, persistent across gem resets). Vanilla JS + Canvas2D, no framework, no build step — serve static files.

## STRUCTURE
```
.
├── index.html        # shell + script load order
├── styles.css        # all CSS
└── js/               # classic <script> tags, shared global scope
    ├── config.js     # CFG constants, tile type enum T, OBSTACLE set, FLOWER_PALETTE, ascendFormula/Threshold
    ├── state.js     # `state` singleton, COST/MAX tables, GARDEN_DEFS, RUBY_SHOP, derived math (coinMult, rubyShop*Mult), formatShort
    ├── themes.js    # THEMES palette list, activeTheme(), applyThemeDom() (lawn+stage recolor)
    ├── world.js     # grass/tiles/flowerColors typed arrays, robots[], bees[], gnomes[], moles[], spawn helpers
    ├── canvas.js    # canvas + ctx, tileSize, resize handler, particles[], beep() synth, flashCoin()
    ├── assets.js    # optional image/json/audio registry (Assets.register/preloadAll/image)
    ├── atmosphere.js# day/night cycle, weather (rain/snow/storm/fog), robot rivalry, takeZenPhoto
    ├── ai.js        # updateRobot, updateBee, updateGrass, updateFlowerIncome, gnome/mole hazards (tick logic)
    ├── render.js    # drawGrass, tile sprites (tree/rock/pond/flower/beehive/fountain/shed/gnome/mole-mound), drawRobot, drawBee, render()
    ├── save.js      # localStorage save/load (SAVE_KEY = lawnbotTycoonSave_v2), offline earnings modal, resetGame
    ├── ui.js        # HUD, shop rendering (bots/tools/grass/garden/crew/skins/quests/gems/rubies/prestige tabs), buy/doAscend/doPrestige handlers, toast, achievements, wireUIEvents
    └── main.js      # loop (fixed-step 1/60), init — called once at end of main.js
```

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Add a new upgrade | `UPGRADE_DEFS` in `ui.js`, `COST`/`MAX` in `state.js`, derived formula in `state.js` |
| Add a placeable garden item | `GARDEN_DEFS` in `state.js`, tile type in `config.js` `T`, sprite in `render.js`, case in `drawFeatures()` |
| Tweak economy | `CFG` in `config.js` (base rates), derived multipliers in `state.js` |
| Change robot behavior | `pickTarget` / `updateRobot` in `ai.js` |
| New tile sprite | `render.js` (add `drawX`, wire into `drawFeatures` switch) |
| Save format bump | `SAVE_KEY` constant in `save.js`, then guard `loadGame` for old shape |
| Add a theme | append to `THEMES` in `themes.js`; `applyThemeDom()` recolors stage + grass cache |
| Tweak Ascend / ruby perks | `RUBY_SHOP` in `state.js`, `rubyShop*Mult()` derived getters, `doAscend()` in `ui.js` |
| Add a shop tab | `<button data-tab="X">` in `index.html`, matching render branch in `ui.js` shop rendering, gate in `revealAscend`-style hide logic if premature |
| Tune hazards | `CFG.gnomeSpawn*` / `CFG.moleSpawn*` in `config.js`, logic in `ai.js` (evil gnomes steal treasures, moles dig mounds) |

## CONVENTIONS
- **No module system.** Classic `<script>` tags load in order defined in `index.html`. All top-level `let`/`const` live in shared global lexical scope across scripts.
- **Load order matters for cross-file references at *call* time**, not parse time. Functions defined in a file may reference symbols declared in a later-loaded file — safe only because calls happen after `init()` in `main.js`.
- **State is a single mutable `state` object.** Do not shadow it. Mutate in place.
- **Typed arrays** (`Float32Array` for `grass`, `Uint8Array` for `tiles`/`flowerColors`) indexed via `idx(x, y) = y * CFG.gridW + x`.
- **Fixed-step tick = 1/60s.** `loop()` accumulates dt, drains in TICK-sized steps. Render after each frame.
- **Coins are floats.** UI formats via `formatShort` (K/M/B/... suffixes). Only `totalTilesMowed` is integer.
- **No build, no test framework.** Verify by serving + loading in browser.

## ANTI-PATTERNS (THIS PROJECT)
- **Don't `import`/`export`.** Breaks the classic-script global-sharing pattern. If you need a module system, convert all 12 files together.
- **Don't move `init()` out of `main.js`** without also moving it after every `<script>` tag. It relies on every prior script having executed and registered its globals.
- **Don't reorder `<script>` tags casually.** `canvas.js` must come before any code using `tileSize`/`ctx` at call time (currently it's 4th). Order: config → state → themes → world → canvas → assets → atmosphere → ai → render → save → ui → main.
- **Don't add obstacle tile types without updating `OBSTACLE` set** in `config.js` — robots will path through them.
- **Don't use `amend` on save-format changes.** Bump `SAVE_KEY` version instead or handle both shapes in `loadGame`.

## COMMANDS
```bash
# Serve (no build needed)
python3 -m http.server 8765
# then open http://localhost:8765/

# Syntax-check JS after edits
for f in js/*.js; do node --check "$f"; done
```

## NOTES
- **Offline earnings** in `loadGame` are approximate — mow rate estimated via `tilesPerSec ≈ robots × mowRate × π × (mowRadius/ts)² × 0.25`, capped at 12h, scaled 0.5× for mowing income.
- **Prestige formula:** `floor((totalThisRun / 2500) ^ 0.55)`. Threshold: 10 000 coins/run. Each gem = +10% coin income forever.
- **Ascend** (ruby tier) wipes gems + coin-tier upgrades/garden but keeps rubies and ruby-shop perks. Gain = `CFG.ascendFormula(totalGemsEarned) × rubyShopAscendMult()`. UI tab hidden until player can first Ascend (or already has rubies) — see `revealAscend` in `ui.js`. Reset also wipes rubies (see `resetGame` in `save.js`).
- **Bees** only exist when beehives placed; `ensureBeesFromHives()` reconciles `bees[]` to `garden.beehive × CFG.beePerHive`.
- **Gnomes & moles** are hazard actors in `world.js` (`gnomes[]`, `moles[]`), driven by `ai.js` spawn timers. Evil gnomes steal dropped treasure; moles leave mounds that block tiles until Pest Control / Mole Warden crew handles them.
- **Resize handler rescales robot/bee positions** when tile size changes — avoids teleporting after window resize.
- **Crit chance capped at 75%** (`critChance()` in `state.js`). Sums gnome/crew/gem/ruby bonuses. Crit multiplier is fixed at 5×.

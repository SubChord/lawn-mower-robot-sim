# LawnBot Tycoon — Idea Backlog

A grab-bag of feature ideas we can pull from when the next branch starts. Not
a roadmap — sort in-flight ideas into the "Short list" at the top when they
earn a priority.

## Short list (near-term)
- **Pattern blueprints from treasures.** Extend gnome treasures to sometimes
  drop mowing-pattern blueprints instead of skins/coins. Uses the existing
  treasure pipeline (`rollTreasurePayload`, `collectTreasureIndex`). Rare
  patterns become unlocks rather than coin purchases.
- **Seasonal theme rotation.** Auto-swap the theme based on real-world month
  (Autumn in Oct/Nov, Moonlit at night, Zen Sand mid-summer). Add an opt-out
  toggle in settings next to the theme picker.
- **Weather layer.** Light rain/snow particles with a soft audio loop. Rain
  +20% grass regrowth; snow slows robots, pauses flower income. Wire via a
  `state.weather` field and a new `updateWeather` tick in `ai.js`.
- **Photo mode.** In Zen Mode, hide the exit button and press `P` to copy the
  canvas to clipboard / download a PNG. Nice for sharing screensavers.
- **Crew portraits.** Replace the crew icon emoji with hand-drawn (or
  AI-generated) portraits loaded through the Assets registry. Fall back to
  emoji until assets load.

## Gameplay
- **Robot personalities.** Each bot gets a trait (lazy, greedy, perfectionist)
  that subtly alters targeting weights in `pickTarget`. Swap via the skin
  menu alongside patterns.
- **Daily goals.** Lightweight objectives ("mow 500 tiles today", "collect 2
  treasures") granting a gem or temporary multiplier. Reset at local
  midnight; store last-reset timestamp.
- **Robot rivalry.** Tag the top-mowing bot each minute with a 🥇 crown and a
  small speed bonus — encourages watching the fleet.
- **Permanent prestige tracks.** After fertilizing, let the player spend a gem
  to unlock one of three tracks (economy / mechanical / mystical) that each
  grant passive bonuses.
- **Wandering rival.** A rival company's single red mower occasionally rolls
  through and mows ~5 tiles before leaving — pay a tiny "license fee" in
  coins to keep it docile.

## World
- **More biomes.** Meadow, desert cactus patch, swamp with reeds. Each biome
  swaps obstacle palettes and adds one unique feature tile.
- **Day/night cycle.** Smooth 3-minute cycle tint over the canvas, stars at
  night. Pairs with the Moonlit theme.
- **Wildlife.** Ambient butterflies, ladybugs, the occasional frog near ponds
  — purely cosmetic.
- **Pathed bot routes.** Let the player draw a path on the grid for an
  individual robot to patrol. Needs a new drag-to-draw interaction and a
  `route` field on the robot.
- **Grass variants on hover.** Tooltip when hovering a tile explains its
  species, coin multiplier, toughness.

## Progression / economy
- **Seed shop.** Rare grass species become purchasable instead of random
  spawn-rate-only. Slotted near the Grass tab.
- **Robot workshops.** Per-bot upgrades: attach a sprinkler trailer for +3%
  growth on the tiles it just mowed, or a vacuum for dust coins.
- **Fuel logistics minigame.** Hold the refuel button to fill gradually;
  releasing early costs less. Adds tactile depth to the new proportional
  price.
- **Treasure map run.** Prestige gift: a one-time grid of buried treasures
  the player unearths over the next run.

## Polish
- **Sound design overhaul.** Layered soundscape: grass rustle, bee hum bed,
  wind. Currently we only have beep synth. Keep it optional via mute.
- **Accessibility toggles in settings.** Reduced motion, high-contrast mode,
  bigger fonts.
- **Achievement tray.** A small pill in the footer showing progress toward
  the next achievement instead of only firing on unlock.
- **Save-slot manager.** Two named save slots (e.g. "Main" / "Chill") with an
  export/import button using the existing JSON blob.

## Asset / texture pack sources
When we move from procedural to image-based textures, these CC0 / permissive
packs are worth grabbing:

- [OpenGameArt — Top down grass, beach and water tileset (CC0)](https://opengameart.org/content/top-down-grass-beach-and-water-tileset)
  Covers grass, sand, water with transition edges. Good match for our pond
  borders.
- [OpenGameArt — Free CC0 Top Down Tileset Template (Pixel Art)](https://opengameart.org/content/free-cc0-top-down-tileset-template-pixel-art)
  Minimal 16×16 starter; useful to prototype the pixel theme.
- [OpenGameArt — Grass Tileset 16×16](https://opengameart.org/content/grass-tileset-16x16)
  Compact grass-only set. Matches our tile size directly.
- [OpenGameArt — Grassland Tileset](https://opengameart.org/content/grassland-tileset)
  Includes grass, worn stone paths, cliff walls, rocky streams — feeds the
  Garden/Pond sprites.
- [OpenGameArt — Brown Rock Tileset (Top Down RPG Pixel Art)](https://opengameart.org/content/brown-rock-tileset-top-down-rpg-pixel-art)
  Rock variations for a richer "rock" feature.
- [OpenGameArt — AK TopDown Asset Packs](https://opengameart.org/content/ak-topdown-asset-packs)
  Larger bundle; scan for grass/pond/tree tiles that match our palette.
- [OpenGameArt — Topdown Assets](https://opengameart.org/content/topdown-assets)
  Miscellaneous top-down art; useful for the gnome chest or tree variants.
- [CraftPix — Grassland Top Down Tileset (paid)](https://craftpix.net/product/grassland-top-down-tileset-pixel-art/)
  Consider only if we'd want a polished commercial pack down the line.
- [itch.io — free grass game assets](https://itch.io/game-assets/free/tag-grass)
  Browsable index; many CC0 options.

**Wiring plan.** Each theme pack would register its image assets via
`Assets.register(key, { type: 'image', src: '...' })`, then `Assets.preloadAll()`
is awaited before the main loop starts. Render code already prefers image
assets via `Assets.image(key)` when present and falls back to vector drawing
— no renderer rewrite needed, just register and drop the files into
`assets/<theme>/`.

## Speculative / stretch
- **Multiplayer shared lawn.** Two browsers synced via WebRTC, each player
  controls their own mower. Huge scope; mentioned for completeness.
- **Procedural music.** Tiny Web Audio sequencer that drifts based on coin
  rate / bee count. Zen Mode could turn this up.
- **Mobile layout.** Tabs as a bottom nav, canvas fills the remaining space,
  long-press to buy upgrades to avoid accidental taps.
- **Steam / desktop wrap.** Tauri or Electron shell so Zen Mode can run as a
  true screensaver on TV/monitor.

/* ============================================================
   Main loop + init
   ============================================================ */

let lastFrame = performance.now();
let accumulator = 0;
const TICK = 1 / 60;

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  accumulator += dt;
  while (accumulator >= TICK) {
    // Global updates — run in both town and house views.
    updateDayNight(TICK);
    updateWeather(TICK);
    updateFuel(TICK);
    if (state.town.inTownView) {
      // Town view: only idle houses tick (no active-house skip).
      tickIdleHouses(TICK);
    } else {
      // House view: full house-local sim.
      updateGrass(TICK);
      updateGrassSpawn(TICK);
      updateFlowerIncome(TICK);
      updatePlayer(TICK);
      for (const r of robots) updateRobot(r, TICK);
      for (const b of bees) updateBee(b, TICK);
      updateRivalry(TICK);
      updateQuestTimer(TICK);
      updateGnomeSpawnTimer(TICK);
      updateVisitorGnomes(TICK);
      updateTreasures(TICK);
      updateCrew(TICK);
      tickIdleHouses(TICK, state.town.activeHouseKey);
    }
    accumulator -= TICK;
  }
  if (state.town.inTownView) drawTown();
  else render();
  updateHUD();
}

function init() {
  const loaded = loadGame();
  // Bind world-buffer globals to the active house BEFORE any world setup.
  // Task 4 will rewire loadGame() to rehydrate per-house buffers; until then
  // we call this unconditionally so the game stays bootable on both paths.
  ensureStarterHouse();
  resizeCanvas();
  if (!loaded) {
    initWorld();
    // Fresh run: apply starting bonuses from permanent gem upgrades.
    state.coins = startingCoinsFor(gemLvl('startCoins'));
    state.upgrades.robots = 1 + gemLvl('startRobot');
    state.upgrades.tool = Math.min(gemLvl('startTool'), TOOL_TYPES.length - 1);
    applyGemGrassUnlocks();
  }
  ensureRobotCount();
  ensureBeesFromHives();
  applyThemeDom();
  const muteBtn = document.getElementById('muteBtn');
  muteBtn.textContent = state.muted ? '🔇 Muted' : '🔊 Sound';
  wireUIEvents();
  renderShop();
  setInterval(() => { renderShop(); checkAchievements(); }, 500);
  setInterval(saveGame, 5000);
  window.addEventListener('beforeunload', saveGame);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });
  if (!localStorage.getItem(SAVE_KEY)) {
    setTimeout(() => toast('🤖 Welcome, CEO! Let the mowing begin.', '#8ff09e'), 300);
  }
  requestAnimationFrame(loop);
}

init();

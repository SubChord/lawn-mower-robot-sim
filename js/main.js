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
    updateGrass(TICK);
    updateFlowerIncome(TICK);
    updateFuel(TICK);
    for (const r of robots) updateRobot(r, TICK);
    for (const b of bees) updateBee(b, TICK);
    updateGnomeSpawnTimer(TICK);
    updateVisitorGnomes(TICK);
    updateTreasures(TICK);
    updateCrew(TICK);
    accumulator -= TICK;
  }
  render();
  updateHUD();
}

function init() {
  const loaded = loadGame();
  resizeCanvas();
  if (!loaded) initWorld();
  ensureRobotCount();
  ensureBeesFromHives();
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

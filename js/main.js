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
    updateGrassSpawn(TICK);
    updateFlowerIncome(TICK);
    updateFuel(TICK);
    updatePlayer(TICK);
    for (const r of robots) updateRobot(r, TICK);
    for (const b of bees) updateBee(b, TICK);
    updateQuestTimer(TICK);
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
  if (state._savedRobots) {
    const sr = state._savedRobots;
    for (let i = 0; i < Math.min(robots.length, sr.length); i++) {
      robots[i].x = sr[i][0]; robots[i].y = sr[i][1]; robots[i].angle = sr[i][2];
    if (sr[i][3]) robots[i].name = sr[i][3];
    }
    delete state._savedRobots;
  }
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

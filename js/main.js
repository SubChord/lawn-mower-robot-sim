// ===== AUTO-IMPORTS =====
import { SAVE_KEY, loadGame, saveGame } from './save.js';
import { TOOL_TYPES, applyMapDimensions, gemLvl, startingCoinsFor, state } from './state.js';
import { applyThemeDom } from './themes.js';
import { bees, ensureBeesFromHives, ensureRobotCount, initWorld, robots } from './world.js';
import { checkAchievements, renderShop, toast, updateHUD, wireUIEvents } from './ui.js';
import { render } from './render.js';
import { resizeCanvas } from './canvas.js';
import { updateAutoBuy, updateBee, updateBuffs, updateCrew, updateFlowerIncome, updateFuel, updateGnomeSpawnTimer, updateGoldenGnomes, updateGrass, updateMoles, updatePlayer, updateQuestTimer, updateRobot, updateTreasures, updateVisitorGnomes } from './ai.js';
import { updateDayNight, updateRivalry, updateWeather } from './atmosphere.js';
// ===== END AUTO-IMPORTS =====

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
    updateDayNight(TICK);
    updateWeather(TICK);
    updateGrass(TICK);
    updateFlowerIncome(TICK);
    updateFuel(TICK);
    updatePlayer(TICK);
    for (const r of robots) updateRobot(r, TICK);
    for (const b of bees) updateBee(b, TICK);
    updateRivalry(TICK);
    updateQuestTimer(TICK);
    updateGnomeSpawnTimer(TICK);
    updateVisitorGnomes(TICK);
    updateTreasures(TICK);
    updateMoles(TICK);
    updateGoldenGnomes(TICK);
    updateBuffs(TICK);
    updateCrew(TICK);
    updateAutoBuy(TICK);
    accumulator -= TICK;
  }
  render();
  updateHUD();
}

function init() {
  const loaded = loadGame();
  resizeCanvas();
  if (!loaded) {
    applyMapDimensions();
    initWorld();
    // Fresh run: apply starting bonuses from permanent gem upgrades.
    state.coins = startingCoinsFor(gemLvl('startCoins'));
    state.upgrades.robots = 1 + gemLvl('startRobot');
    state.upgrades.tool = Math.min(gemLvl('startTool'), TOOL_TYPES.length - 1);
  }
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
/* ============================================================
   Canvas, particles, coin flash, sound
   ============================================================ */

const canvas = document.getElementById('lawn');
const ctx = canvas.getContext('2d');
let tileSize = 16;

function getTileSize() { return tileSize; }

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const wPx = rect.width * dpr;
  const hPx = rect.height * dpr;
  const tileW = wPx / CFG.gridW;
  const tileH = hPx / CFG.gridH;
  tileSize = Math.floor(Math.min(tileW, tileH));
  canvas.width = CFG.gridW * tileSize;
  canvas.height = CFG.gridH * tileSize;
}

window.addEventListener('resize', () => {
  const oldTile = tileSize;
  resizeCanvas();
  if (oldTile && oldTile !== tileSize) {
    const scale = tileSize / oldTile;
    robots.forEach(r => { r.x *= scale; r.y *= scale; });
    bees.forEach(b => { b.x *= scale; b.y *= scale; if (b.target) { b.target.x *= scale; b.target.y *= scale; } });
  }
});

// ---------- Particles ----------
const particles = [];
function addParticle(x, y, opts = {}) {
  if (particles.length > CFG.maxParticles) particles.shift();
  particles.push({
    x, y,
    vx: (Math.random() - 0.5) * 40,
    vy: -Math.random() * 60 - 20,
    life: 1.0,
    text: opts.text || '',
    color: opts.color || '#ffd34e',
    size: opts.size || 12,
    gravity: opts.gravity ?? 120,
  });
}

// ---------- Coin floaters (UI pop) ----------
let lastCoinFlash = 0;
function flashCoin() {
  const box = document.getElementById('coinBox');
  const now = performance.now();
  if (now - lastCoinFlash > 120) {
    box.classList.remove('pulse'); void box.offsetWidth; box.classList.add('pulse');
    lastCoinFlash = now;
  }
}

// ---------- Sound (tiny synth) ----------
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) { audioCtx = null; }
  }
  return audioCtx;
}
function beep(freq = 440, dur = 0.06, type = 'square', vol = 0.05) {
  if (state.muted) return;
  const ac = ensureAudio(); if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type; osc.frequency.value = freq;
  gain.gain.value = vol;
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(); osc.stop(ac.currentTime + dur);
}

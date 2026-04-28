// ===== AUTO-IMPORTS =====
import { state, recomputeFromTree, formatShort } from './state.js';
import {
  SKILL_NODES, NODE_BY_ID, ADJ,
  canAllocate, allocate, refund, refundAll, undoLast,
  getAvailableSP, getSpentSP, getTotalSP,
} from './skilltree.js';
import { saveGame } from './save.js';

// Module-scoped state for the modal (pan/zoom/hover/dom).
let backdropEl = null;
let canvasEl = null;
let ctxRef = null;
let tooltipEl = null;
let toolbarEl = null;
let pan = { x: 0, y: 0 };
let zoom = 1;
let dragging = false;
let dragMoved = false;
let dragLast = { x: 0, y: 0 };
let hoverNodeId = null;
let rafScheduled = false;

const NODE_R = 18;
const KEYSTONE_R = 26;

function isAllocated(id) {
  return state.skillTree && state.skillTree.allocated && state.skillTree.allocated.includes(id);
}

function isReachable(id) {
  if (id === 'start') return true;
  if (isAllocated(id)) return true;
  const adj = ADJ[id];
  if (!adj) return false;
  for (const n of adj) {
    if (n === 'start' || isAllocated(n)) return true;
  }
  return false;
}

function nodeRadius(node) {
  return node.kind === 'keystone' ? KEYSTONE_R : (node.kind === 'notable' ? NODE_R + 4 : NODE_R);
}

function nodeColor(node) {
  if (node.id === 'start') return '#ffd34e';
  return node.branchColor || '#7df09e';
}

function worldToScreen(x, y) {
  const rect = canvasEl.getBoundingClientRect();
  return {
    x: rect.width / 2 + x * zoom + pan.x,
    y: rect.height / 2 + y * zoom + pan.y,
  };
}

function screenToWorld(sx, sy) {
  const rect = canvasEl.getBoundingClientRect();
  return {
    x: (sx - rect.width / 2 - pan.x) / zoom,
    y: (sy - rect.height / 2 - pan.y) / zoom,
  };
}

function findNodeAt(sx, sy) {
  for (let i = SKILL_NODES.length - 1; i >= 0; i--) {
    const n = SKILL_NODES[i];
    const p = worldToScreen(n.x, n.y);
    const r = nodeRadius(n) * zoom;
    const dx = sx - p.x, dy = sy - p.y;
    if (dx * dx + dy * dy <= r * r) return n;
  }
  return null;
}

function scheduleDraw() {
  if (rafScheduled) return;
  rafScheduled = true;
  requestAnimationFrame(() => {
    rafScheduled = false;
    drawTree();
  });
}

function drawTree() {
  if (!canvasEl || !ctxRef) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvasEl.getBoundingClientRect();
  const w = Math.max(100, Math.floor(rect.width));
  const h = Math.max(100, Math.floor(rect.height));
  if (canvasEl.width !== w * dpr || canvasEl.height !== h * dpr) {
    canvasEl.width = w * dpr;
    canvasEl.height = h * dpr;
  }
  const ctx = ctxRef;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = '#0d1f12';
  ctx.fillRect(0, 0, w, h);

  // Edges — drawn as quadratic-bezier curves with a midpoint pulled slightly
  // toward the average of the two nodes' radial tangents. The result is gentle
  // arcs rather than straight segments.
  const drawnEdges = new Set();
  for (const n of SKILL_NODES) {
    for (const cId of n.conn) {
      const a = n.id, b = cId;
      const key = a < b ? a + '|' + b : b + '|' + a;
      if (drawnEdges.has(key)) continue;
      drawnEdges.add(key);
      const other = NODE_BY_ID[cId];
      if (!other) continue;
      const p1 = worldToScreen(n.x, n.y);
      const p2 = worldToScreen(other.x, other.y);
      // Control point: midpoint nudged perpendicular to the segment, with the
      // direction chosen so curves bow outward from the tree centre. Magnitude
      // scales with segment length so cross-links arc more than spine links.
      const mx = (p1.x + p2.x) * 0.5;
      const my = (p1.y + p2.y) * 0.5;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy) || 1;
      // Perpendicular to segment.
      let nx = -dy / len;
      let ny = dx / len;
      // Centre of the canvas (where Start sits) — bow control point AWAY from it.
      const cx = worldToScreen(0, 0).x;
      const cy = worldToScreen(0, 0).y;
      if ((mx - cx) * nx + (my - cy) * ny < 0) { nx = -nx; ny = -ny; }
      const bow = Math.min(20, len * 0.10);
      const ctrlX = mx + nx * bow;
      const ctrlY = my + ny * bow;

      const bothAlloc = (n.id === 'start' || isAllocated(n.id)) && (other.id === 'start' || isAllocated(other.id));
      const oneSide = (n.id === 'start' || isAllocated(n.id)) || (other.id === 'start' || isAllocated(other.id));
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.quadraticCurveTo(ctrlX, ctrlY, p2.x, p2.y);
      if (bothAlloc) {
        ctx.strokeStyle = '#ffd34e';
        ctx.lineWidth = 3 * zoom;
        ctx.shadowColor = '#ffd34e';
        ctx.shadowBlur = 6;
      } else if (oneSide) {
        ctx.strokeStyle = 'rgba(143,240,158,0.55)';
        ctx.lineWidth = 2 * zoom;
        ctx.shadowBlur = 0;
      } else {
        ctx.strokeStyle = 'rgba(143,240,158,0.18)';
        ctx.lineWidth = 1.5 * zoom;
        ctx.shadowBlur = 0;
      }
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }
  ctx.shadowBlur = 0;

  // Nodes
  for (const n of SKILL_NODES) {
    const p = worldToScreen(n.x, n.y);
    const r = nodeRadius(n) * zoom;
    const allocated = n.id === 'start' || isAllocated(n.id);
    const reachable = isReachable(n.id);
    const isHover = n.id === hoverNodeId;
    const color = nodeColor(n);

    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    if (allocated) {
      ctx.fillStyle = color;
    } else if (reachable) {
      ctx.fillStyle = 'rgba(20, 50, 30, 0.95)';
    } else {
      ctx.fillStyle = 'rgba(20, 30, 22, 0.85)';
    }
    ctx.fill();

    ctx.lineWidth = isHover ? 3 : (n.kind === 'keystone' ? 3 : 2);
    ctx.strokeStyle = isHover ? '#fff' : (allocated ? '#fff8b0' : (reachable ? color : 'rgba(143,240,158,0.25)'));
    ctx.stroke();

    // Icon
    const fontSize = Math.max(10, Math.floor(r * 0.95));
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = allocated ? '#0d1f12' : (reachable ? '#cde7d2' : 'rgba(205,231,210,0.35)');
    ctx.fillText(n.icon || '•', p.x, p.y + 1);
  }
}

// Human-readable labels for raw stat keys used in node effects. Falls back
// to a camelCase → "lower case words" conversion for anything not listed.
const STAT_LABELS = {
  mowSpeed:     'robot speed',
  mowRate:      'mow rate',
  mowRadius:    'robot cut radius',
  robots:       'robots',
  coinValue:    'coin value',
  critChance:   'crit chance',
  playerRate:   'player mow rate',
  playerRadius: 'player mow radius',
  fuelEff:      'fuel efficiency',
  fuelDrain:    'fuel drain',
  refillDisc:   'refill discount',
  moleInterval: 'time between moles',
  moleLifetime: 'mole hole lifetime',
  growthRate:   'grass growth',
  flowerYield:  'flower coin/sec',
  beeYield:     'bee yield',
};

function humanizeStat(stat) {
  if (STAT_LABELS[stat]) return STAT_LABELS[stat];
  // Generic camelCase → "camel case" fallback for anything new.
  return stat.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

function effectsToText(node) {
  const out = [];
  for (const e of (node.effects || [])) {
    const label = humanizeStat(e.stat);
    if (e.op === 'mult') {
      const pct = Math.round(e.value * 100);
      out.push(`${pct >= 0 ? '+' : ''}${pct}% ${label}`);
    } else if (e.op === 'add') {
      // Crit chance values are stored as fractions (0.01 = +1%); show as %.
      if (e.stat === 'critChance') {
        const pct = +(e.value * 100).toFixed(1);
        out.push(`${pct >= 0 ? '+' : ''}${pct}% ${label}`);
      } else {
        out.push(`${e.value >= 0 ? '+' : ''}${e.value} ${label}`);
      }
    }
  }
  return out;
}

function showTooltip(node, sx, sy) {
  if (!tooltipEl) return;
  if (!node) { tooltipEl.style.display = 'none'; return; }
  const allocated = node.id === 'start' || isAllocated(node.id);
  const reachable = isReachable(node.id);
  const can = canAllocate(node.id);
  const lines = [];
  lines.push(`<div class="st-tip-title">${node.icon || '•'} ${node.name}</div>`);
  if (node.branchName) lines.push(`<div class="st-tip-branch" style="color:${node.branchColor}">${node.branchName} · ${node.kind}</div>`);
  if (node.desc) lines.push(`<div class="st-tip-desc">${node.desc}</div>`);
  const eff = effectsToText(node);
  if (eff.length) lines.push(`<div class="st-tip-eff">${eff.join('<br>')}</div>`);
  if (node.drawback) lines.push(`<div class="st-tip-drawback">⚠ ${node.drawback}</div>`);
  if (node.flagId) lines.push(`<div class="st-tip-flag">unlocks: ${node.flagId}</div>`);
  if (node.id !== 'start') {
    if (allocated) lines.push(`<div class="st-tip-status owned">✓ Allocated — right-click to refund</div>`);
    else if (can) lines.push(`<div class="st-tip-status buy">Click to allocate (1 SP)</div>`);
    else if (reachable) lines.push(`<div class="st-tip-status no">Need 1 SP available</div>`);
    else lines.push(`<div class="st-tip-status no">🔒 Allocate a connected node first</div>`);
  }
  tooltipEl.innerHTML = lines.join('');
  tooltipEl.style.display = 'block';
  // Position relative to backdrop
  const rect = backdropEl.getBoundingClientRect();
  let left = sx - rect.left + 16;
  let top = sy - rect.top + 16;
  // Clamp into viewport (rough)
  const tw = tooltipEl.offsetWidth || 240;
  const th = tooltipEl.offsetHeight || 100;
  if (left + tw > rect.width - 8) left = sx - rect.left - tw - 16;
  if (top + th > rect.height - 8) top = sy - rect.top - th - 16;
  tooltipEl.style.left = left + 'px';
  tooltipEl.style.top = top + 'px';
}

function refreshToolbar() {
  if (!toolbarEl) return;
  const avail = getAvailableSP();
  const spent = getSpentSP();
  const total = getTotalSP();
  const sp = toolbarEl.querySelector('.st-sp-counter');
  if (sp) sp.innerHTML = `<b>${avail}</b> SP available <span class="st-sp-sub">(${spent}/${total} spent)</span>`;
}

function afterChange() {
  recomputeFromTree();
  refreshToolbar();
  scheduleDraw();
  saveGame();
  // Let the rest of the UI know multipliers changed.
  try {
    window.dispatchEvent(new CustomEvent('skilltree:changed'));
  } catch (e) {}
}

function onMouseDown(ev) {
  if (ev.button !== 0 && ev.button !== 2) return;
  dragging = true;
  dragMoved = false;
  dragLast.x = ev.clientX;
  dragLast.y = ev.clientY;
}

function onMouseMove(ev) {
  if (dragging) {
    const dx = ev.clientX - dragLast.x;
    const dy = ev.clientY - dragLast.y;
    if (dx * dx + dy * dy > 9) dragMoved = true;
    if (dragMoved) {
      pan.x += dx;
      pan.y += dy;
      dragLast.x = ev.clientX;
      dragLast.y = ev.clientY;
      hoverNodeId = null;
      showTooltip(null);
      scheduleDraw();
      return;
    }
  }
  // Hover lookup
  const rect = canvasEl.getBoundingClientRect();
  const sx = ev.clientX - rect.left;
  const sy = ev.clientY - rect.top;
  const n = findNodeAt(sx, sy);
  const newId = n ? n.id : null;
  if (newId !== hoverNodeId) {
    hoverNodeId = newId;
    scheduleDraw();
  }
  showTooltip(n, ev.clientX, ev.clientY);
}

function onMouseUp(ev) {
  if (!dragging) return;
  const wasDrag = dragMoved;
  dragging = false;
  dragMoved = false;
  if (wasDrag) return;
  // Treat as click
  const rect = canvasEl.getBoundingClientRect();
  const sx = ev.clientX - rect.left;
  const sy = ev.clientY - rect.top;
  const n = findNodeAt(sx, sy);
  if (!n || n.id === 'start') return;
  if (ev.button === 2) {
    if (isAllocated(n.id)) {
      refund(n.id);
      afterChange();
    }
    return;
  }
  if (ev.button === 0) {
    if (canAllocate(n.id)) {
      allocate(n.id);
      afterChange();
    }
  }
}

function onWheel(ev) {
  ev.preventDefault();
  const rect = canvasEl.getBoundingClientRect();
  const sx = ev.clientX - rect.left;
  const sy = ev.clientY - rect.top;
  const before = screenToWorld(sx, sy);
  const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
  zoom = Math.max(0.3, Math.min(3, zoom * factor));
  const after = screenToWorld(sx, sy);
  pan.x += (after.x - before.x) * zoom;
  pan.y += (after.y - before.y) * zoom;
  scheduleDraw();
}

function onContextMenu(ev) {
  ev.preventDefault();
}

function onKeyDown(ev) {
  if (ev.key === 'Escape') closeSkillTreeModal();
  else if ((ev.ctrlKey || ev.metaKey) && ev.key === 'z') {
    if (undoLast()) afterChange();
  }
}

function buildModal() {
  backdropEl = document.createElement('div');
  backdropEl.className = 'modal-backdrop skill-tree-backdrop';

  const modal = document.createElement('div');
  modal.className = 'modal skill-tree-modal';

  toolbarEl = document.createElement('div');
  toolbarEl.className = 'skill-tree-toolbar';
  toolbarEl.innerHTML = `
    <div class="st-title">🌳 Skill Tree</div>
    <div class="st-sp-counter"></div>
    <div class="st-actions">
      <button class="st-btn" data-action="undo">↶ Undo</button>
      <button class="st-btn" data-action="refund">⟲ Refund All</button>
      <button class="st-btn st-btn-close" data-action="close">✕ Close</button>
    </div>
    <div class="st-hint">Drag = pan · Wheel = zoom · Click = allocate · Right-click = refund</div>
  `;
  modal.appendChild(toolbarEl);

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'skill-tree-canvas-wrap';
  canvasEl = document.createElement('canvas');
  canvasEl.className = 'skill-tree-canvas';
  canvasWrap.appendChild(canvasEl);

  tooltipEl = document.createElement('div');
  tooltipEl.className = 'skill-tooltip';
  tooltipEl.style.display = 'none';
  canvasWrap.appendChild(tooltipEl);

  modal.appendChild(canvasWrap);
  backdropEl.appendChild(modal);
  document.body.appendChild(backdropEl);

  ctxRef = canvasEl.getContext('2d');

  // Wire events
  canvasEl.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  canvasEl.addEventListener('wheel', onWheel, { passive: false });
  canvasEl.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', scheduleDraw);

  toolbarEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const a = btn.dataset.action;
    if (a === 'close') closeSkillTreeModal();
    else if (a === 'refund') {
      if (confirm('Refund all allocated skill points? (free)')) {
        refundAll();
        afterChange();
      }
    } else if (a === 'undo') {
      if (undoLast()) afterChange();
    }
  });

  backdropEl.addEventListener('mousedown', (ev) => {
    if (ev.target === backdropEl) closeSkillTreeModal();
  });
}

function closeSkillTreeModal() {
  if (!backdropEl) return;
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('resize', scheduleDraw);
  backdropEl.remove();
  backdropEl = null;
  canvasEl = null;
  ctxRef = null;
  tooltipEl = null;
  toolbarEl = null;
  hoverNodeId = null;
  dragging = false;
  // Make sure the rest of the UI re-renders so it picks up tree changes.
  try { window.dispatchEvent(new CustomEvent('skilltree:closed')); } catch (e) {}
}

function openSkillTreeModal() {
  if (backdropEl) return;
  buildModal();
  // Center on Start the first time we open.
  pan.x = 0;
  pan.y = 0;
  // Auto-fit zoom: with the fan layout the tree spans roughly ±900 units;
  // fit the whole graph into the viewport with a small margin.
  setTimeout(() => {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const fit = Math.min(rect.width, rect.height) / 1700;
    zoom = Math.max(0.3, Math.min(1.5, fit));
    refreshToolbar();
    scheduleDraw();
  }, 0);
  // formatShort kept imported for potential future cost displays.
  void formatShort;
}

// ===== AUTO-EXPORTS =====
export { openSkillTreeModal, closeSkillTreeModal };

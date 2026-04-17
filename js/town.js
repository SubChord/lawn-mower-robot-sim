/* =========================================================
   Town (street) view — drawn when state.town.inTownView.
   Lots are simple cards laid out horizontally across the canvas.
   ========================================================= */

// Returns [{ key, def, rect:{x,y,w,h} }] for each visible lot.
function townLotLayout() {
  const keys = HOUSE_DEFS.map(d => d.key);
  const pad = 40;
  const cardW = Math.floor((canvas.width - pad * (keys.length + 1)) / keys.length);
  const cardH = Math.floor(canvas.height * 0.6);
  const y = Math.floor((canvas.height - cardH) / 2);
  return keys.map((k, i) => ({
    key: k,
    def: HOUSE_BY_KEY[k],
    rect: { x: pad + i * (cardW + pad), y, w: cardW, h: cardH },
  }));
}

function drawTown() {
  // Background street + sidewalk
  ctx.fillStyle = '#7aa06a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#555';
  ctx.fillRect(0, canvas.height * 0.78, canvas.width, canvas.height * 0.12);
  ctx.fillStyle = '#888';
  ctx.fillRect(0, canvas.height * 0.74, canvas.width, canvas.height * 0.04);

  for (const lot of townLotLayout()) {
    const { x, y, w, h } = lot.rect;
    const h0 = state.town.houses[lot.key];
    const owned = !!h0?.owned;

    // Lot background
    ctx.fillStyle = owned ? '#5b8f4f' : 'rgba(0,0,0,0.25)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = owned ? '#3a6a30' : '#222';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    // Icon + name
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 42px Inter,sans-serif';
    ctx.fillText(lot.def.icon, x + w / 2, y + 64);
    ctx.font = 'bold 18px Inter,sans-serif';
    ctx.fillText(lot.def.name, x + w / 2, y + 100);

    if (owned) {
      ctx.font = '14px Inter,sans-serif';
      ctx.fillText(`🤖 × ${h0.robots.length}`, x + w / 2, y + 130);
      const rate = houseIdleCoinsPerSec(lot.key);
      ctx.fillStyle = '#ffd34e';
      ctx.fillText(`+${formatShort(rate)}/s`, x + w / 2, y + 152);
    } else {
      ctx.fillStyle = '#bbb';
      ctx.font = '14px Inter,sans-serif';
      ctx.fillText('Locked', x + w / 2, y + 130);
      ctx.fillStyle = '#7cd';
      ctx.fillText(`${lot.def.unlockCost} 💎`, x + w / 2, y + 154);
    }
  }
}

function townClickAt(x, y) {
  for (const lot of townLotLayout()) {
    const { rect } = lot;
    if (x < rect.x || x > rect.x + rect.w) continue;
    if (y < rect.y || y > rect.y + rect.h) continue;
    if (state.town.houses[lot.key]?.owned) {
      enterHouse(lot.key);
    } else {
      buyHouse(lot.key);
    }
    return true;
  }
  return false;
}

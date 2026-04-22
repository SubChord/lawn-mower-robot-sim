/* ============================================================
   Asset registry — preload and retrieve complex assets
   ============================================================
   Usage:
     Assets.register('mower_x1', { type: 'image', src: 'assets/mower_x1.png' });
     Assets.register('sprites',  { type: 'json',  src: 'assets/sprites.json' });
     Assets.preloadAll().then(startGame);
     const img = Assets.image('mower_x1');   // HTMLImageElement or null
     const data = Assets.json('sprites');    // parsed object or null

   Everything is optional: if a file is missing or fails to load we log a
   warning and serve null so render code can fall back to vector drawing.
   A loaded image is ready as soon as Assets.image(key) is non-null — render
   code should null-check before using it.
*/

const Assets = (() => {
  const entries = new Map();   // key -> { type, src, data, loaded, error }
  let loadingPromise = null;

  function register(key, { type, src }) {
    if (entries.has(key)) return;
    entries.set(key, { type, src, data: null, loaded: false, error: null });
  }

  function loadOne(key) {
    const e = entries.get(key);
    if (!e || e.loaded) return Promise.resolve(e && e.data);
    if (e.type === 'image') {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload  = () => { e.data = img; e.loaded = true; resolve(img); };
        img.onerror = () => { e.error = 'load failed'; e.loaded = true; console.warn('[Assets] image failed:', key, e.src); resolve(null); };
        img.src = e.src;
      });
    }
    if (e.type === 'json') {
      return fetch(e.src)
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(j => { e.data = j; e.loaded = true; return j; })
        .catch(err => { e.error = String(err); e.loaded = true; console.warn('[Assets] json failed:', key, e.src, err); return null; });
    }
    if (e.type === 'audio') {
      return new Promise((resolve) => {
        const a = new Audio();
        a.oncanplaythrough = () => { e.data = a; e.loaded = true; resolve(a); };
        a.onerror = () => { e.error = 'load failed'; e.loaded = true; console.warn('[Assets] audio failed:', key, e.src); resolve(null); };
        a.src = e.src;
      });
    }
    console.warn('[Assets] unknown type for', key, e.type);
    e.loaded = true;
    return Promise.resolve(null);
  }

  function preloadAll() {
    if (loadingPromise) return loadingPromise;
    const jobs = [];
    for (const key of entries.keys()) jobs.push(loadOne(key));
    loadingPromise = Promise.all(jobs).then(() => undefined);
    return loadingPromise;
  }

  function get(key) {
    const e = entries.get(key);
    return e && e.loaded ? e.data : null;
  }

  // Draw an image with fallback — returns true if drawn, false if the asset
  // wasn't available and caller should render its vector fallback.
  function drawImage(ctx, key, x, y, w, h) {
    const img = get(key);
    if (!img || !(img instanceof HTMLImageElement)) return false;
    ctx.drawImage(img, x, y, w, h);
    return true;
  }

  return {
    register,
    preloadAll,
    image: (k) => { const v = get(k); return v instanceof HTMLImageElement ? v : null; },
    json:  (k) => { const v = get(k); return v && !(v instanceof HTMLImageElement || v instanceof HTMLAudioElement) ? v : null; },
    audio: (k) => { const v = get(k); return v instanceof HTMLAudioElement ? v : null; },
    drawImage,
    has: (k) => entries.has(k),
    keys: () => [...entries.keys()],
  };
})();

// Register known assets here. All are optional — drop files into /assets and
// uncomment or add entries. Render code must null-check before using.
// Example:
//   Assets.register('mower_pro', { type: 'image', src: 'assets/mower_pro.png' });
//   Assets.register('gnome_giggle', { type: 'audio', src: 'assets/gnome_giggle.mp3' });

// ===== AUTO-EXPORTS =====
export { Assets };

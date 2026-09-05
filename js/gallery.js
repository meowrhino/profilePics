// gallery.js — Core gallery logic
// Exposes window.Gallery for plugins

(function () {
  const imgWidth = 512;
  const gallery = document.querySelector(".gallery");
  const currentNumberEl = document.getElementById("current-number");
  const progressEl = document.getElementById("progress");

  // ── Smart loading config ───────────────────────────────
  // HOT:  se cargan ya, con máxima prioridad
  // WARM: se encolan para precargar (desde el centro hacia ambos lados)
  // KEEP: fuera de este radio se descarga el src y se libera memoria
  const HOT = 3;
  const WARM = 14;
  const KEEP = 50;
  const MAX_PARALLEL = 6;
  // Por encima de esta velocidad de scroll no se precarga: las estás sobrevolando.
  const FAST_TILES_PER_SEC = 25;
  const SETTLE_MS = 180;

  let allTiles = [];
  let media = [];          // { i, type, file, tile, el, state }
  let offsets = [];        // centro horizontal de cada tile (coords de scroll)
  let queue = [];          // media pendientes, ya ordenadas por prioridad
  const inFlight = new Set();
  const active = new Set(); // media con src puesto (loading o loaded)
  let focusIdx = 0;
  let scheduleRaf = null;
  let settleTimer = null;
  let lastFocus = -1;
  let lastFocusT = 0;

  let targetIdx = -1;
  let scrollAnim = null;
  let isAnimating = false;
  let hashUpdateTimer = null;
  let userInput = '';
  let inputTimer = null;
  let shuffleAnim = null;

  // ── Easing ──────────────────────────────────────────────

  function easeOutExpo(t) {
    return t === 1 ? 1 : 1 - Math.pow(2, -12 * t);
  }

  // ── Scroll animation ───────────────────────────────────

  function animateScrollTo(targetLeft) {
    if (scrollAnim) cancelAnimationFrame(scrollAnim);
    isAnimating = true;
    const start = gallery.scrollLeft;
    const diff = targetLeft - start;
    if (Math.abs(diff) < 1) { isAnimating = false; return; }
    const duration = Math.min(1200, Math.max(400, Math.log2(Math.abs(diff) + 1) * 70));
    const startTime = performance.now();
    function step(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      gallery.scrollLeft = start + diff * easeOutExpo(progress);
      if (progress < 1) {
        scrollAnim = requestAnimationFrame(step);
      } else {
        isAnimating = false;
        scrollAnim = null;
      }
    }
    scrollAnim = requestAnimationFrame(step);
  }

  function centerTile(tile, instant) {
    if (!tile) return;
    const left = tile.offsetLeft - (gallery.clientWidth - tile.clientWidth) / 2;
    if (instant) {
      if (scrollAnim) cancelAnimationFrame(scrollAnim);
      isAnimating = false;
      scrollAnim = null;
      gallery.scrollLeft = left;
    } else {
      animateScrollTo(left);
    }
    // Prioriza el destino, no los mil tiles por los que pasamos de camino.
    scheduleAround(allTiles.indexOf(tile));
  }

  // ── Layout ─────────────────────────────────────────────

  const marginPx = () => (document.documentElement.clientWidth - imgWidth) / 2;

  function addScrollMargin() {
    const m = document.createElement("div");
    m.className = "galleryMargin";
    m.style.width = `${marginPx()}px`;
    gallery.appendChild(m);
  }

  function measure() {
    offsets = allTiles.map(t => t.offsetLeft + t.offsetWidth / 2);
  }

  // ── Media loading queue ────────────────────────────────

  function startLoad(m) {
    if (m.state !== 'idle') return;
    m.state = 'loading';
    inFlight.add(m);
    active.add(m);
    const el = m.el;
    const done = () => { release(m, 'loaded'); };
    const fail = () => { release(m, 'error'); };
    // Lo que está justo delante de tus ojos se pide antes que el anillo de precarga.
    const hot = Math.abs(m.i - focusIdx) <= HOT;
    if (m.type === 'video') {
      el.addEventListener('loadeddata', done, { once: true });
      el.addEventListener('error', fail, { once: true });
      el.preload = 'auto';
      el.src = `img/${m.file}`;
      el.load();
      el.play().catch(() => { });
    } else {
      el.onload = done;
      el.onerror = fail;
      el.fetchPriority = hot ? 'high' : 'low';
      el.src = `img/${m.file}`;
    }
  }

  function release(m, state) {
    m.state = state;
    inFlight.delete(m);
    if (state === 'loaded') m.tile.classList.add('loaded');
    pump();
  }

  // Suelta el src: aborta la descarga si iba a medias, libera memoria si ya estaba.
  function unload(m) {
    if (m.state === 'idle') return;
    const el = m.el;
    if (m.type === 'video') {
      el.pause();
      el.removeAttribute('src');
      el.load();
    } else {
      el.onload = el.onerror = null;
      el.removeAttribute('src');
    }
    m.tile.classList.remove('loaded');
    m.state = 'idle';
    inFlight.delete(m);
    active.delete(m);
  }

  function pump() {
    while (inFlight.size < MAX_PARALLEL && queue.length) {
      const m = queue.shift();
      if (m.state === 'idle') startLoad(m);
    }
  }

  // Reconstruye la cola desde `center` hacia fuera, alternando ambos lados.
  function scheduleAround(center, warm = WARM) {
    if (!media.length) return;
    if (center < 0 || center >= media.length) return;
    focusIdx = center;

    // 1. Cancela lo que sigue descargando pero ya no interesa.
    for (const m of [...inFlight]) {
      if (Math.abs(m.i - center) > WARM) unload(m);
    }
    // 2. Libera memoria fuera del radio de retención.
    for (const m of [...active]) {
      if (Math.abs(m.i - center) > KEEP) unload(m);
    }
    // 3. Cola nueva: centro primero, luego 1 a cada lado, luego 2, etc.
    queue = [];
    const push = (i) => {
      if (i < 0 || i >= media.length) return;
      if (media[i].state === 'idle') queue.push(media[i]);
    };
    push(center);
    for (let d = 1; d <= warm; d++) { push(center + d); push(center - d); }
    pump();
  }

  function scheduleSoon() {
    if (scheduleRaf) return;
    scheduleRaf = requestAnimationFrame(() => {
      scheduleRaf = null;
      // Durante una animación de scroll manda el destino; si no, el centro real.
      const animating = isAnimating && targetIdx >= 0;
      const center = animating ? targetIdx : findClosestIdx();
      const now = performance.now();
      const speed = (animating || lastFocus < 0)
        ? 0
        : Math.abs(center - lastFocus) / Math.max(1, now - lastFocusT) * 1000;
      lastFocus = center;
      lastFocusT = now;

      clearTimeout(settleTimer);
      if (speed > FAST_TILES_PER_SEC) {
        // Vas lanzado: solo el centro, y el anillo cuando frenes.
        scheduleAround(center, 0);
        settleTimer = setTimeout(() => {
          lastFocus = -1;
          scheduleAround(findClosestIdx());
        }, SETTLE_MS);
      } else {
        scheduleAround(center);
      }
    });
  }

  // ── Navigation ─────────────────────────────────────────

  // Búsqueda binaria sobre offsets cacheados (antes: 1091 getBoundingClientRect por scroll).
  function findClosestIdx() {
    if (!offsets.length) return 0;
    const target = gallery.scrollLeft + gallery.clientWidth / 2;
    let lo = 0, hi = offsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (offsets[mid] < target) lo = mid + 1; else hi = mid;
    }
    if (lo > 0 && Math.abs(offsets[lo - 1] - target) < Math.abs(offsets[lo] - target)) lo--;
    return lo;
  }

  function updateCurrent() {
    if (!allTiles.length) return;
    const ci = findClosestIdx();
    if (!isAnimating) targetIdx = ci;
    const idx = allTiles[ci].getAttribute('data-idx') ?? '';
    if (!userInput) currentNumberEl.textContent = idx;
    clearTimeout(hashUpdateTimer);
    hashUpdateTimer = setTimeout(() => {
      history.replaceState(null, '', `#${idx}`);
    }, 300);
    const maxScroll = gallery.scrollWidth - gallery.clientWidth;
    if (maxScroll > 0) {
      progressEl.style.width = `${(gallery.scrollLeft / maxScroll) * 100}%`;
    }
    scheduleSoon();
  }

  function goToIndex(idx, instant) {
    const tile = document.querySelector(`.tile[data-idx="${idx}"]`);
    if (tile) {
      targetIdx = allTiles.indexOf(tile);
      centerTile(tile, instant);
      updateCurrent();
    }
  }

  function jumpToLast() {
    if (!allTiles.length) return;
    targetIdx = allTiles.length - 1;
    centerTile(allTiles[targetIdx], true);
    updateCurrent();
  }

  function navigateTile(direction) {
    if (!allTiles.length) return;
    if (targetIdx < 0) targetIdx = findClosestIdx();
    targetIdx = Math.max(0, Math.min(allTiles.length - 1, targetIdx + direction));
    centerTile(allTiles[targetIdx]);
  }

  // ── Shuffle animation ──────────────────────────────────

  function stopShuffle() {
    if (shuffleAnim) { clearTimeout(shuffleAnim); cancelAnimationFrame(shuffleAnim); }
    shuffleAnim = null;
    currentNumberEl.classList.remove('error');
  }

  function shuffleThenGo(finalIdx) {
    const maxIdx = allTiles.length - 1;
    if (finalIdx == null) finalIdx = Math.floor(Math.random() * allTiles.length);
    const totalMs = 1200;
    const startTime = performance.now();
    currentNumberEl.classList.add('error');
    // Ve pidiendo el destino mientras rueda el contador.
    scheduleAround(finalIdx);

    function tick(now) {
      const elapsed = now - startTime;
      if (elapsed < totalMs) {
        const speed = 30 + 120 * (elapsed / totalMs);
        currentNumberEl.textContent = Math.floor(Math.random() * (maxIdx + 1));
        shuffleAnim = setTimeout(() => {
          shuffleAnim = requestAnimationFrame(tick);
        }, speed);
      } else {
        currentNumberEl.classList.remove('error');
        currentNumberEl.textContent = finalIdx;
        shuffleAnim = null;
        goToIndex(String(finalIdx));
      }
    }
    shuffleAnim = requestAnimationFrame(tick);
  }

  // ── Input handling ─────────────────────────────────────

  function handleInput(ch) {
    stopShuffle();
    userInput += ch;
    currentNumberEl.textContent = userInput;
    clearTimeout(inputTimer);
    inputTimer = setTimeout(() => {
      const val = userInput;
      userInput = '';
      const isNumeric = /^\d+$/.test(val);
      if (isNumeric && document.querySelector(`.tile[data-idx="${val}"]`)) {
        goToIndex(val);
      } else if (!isNumeric && window.Gallery.textToNumber) {
        const idx = window.Gallery.textToNumber(val, allTiles.length);
        shuffleThenGo(idx);
      } else {
        shuffleThenGo();
      }
    }, 1500);
  }

  function cancelInput() {
    userInput = '';
    clearTimeout(inputTimer);
    stopShuffle();
    updateCurrent();
  }

  // ── Init ───────────────────────────────────────────────

  async function init() {
    try {
      const res = await fetch('img/manifest.json', { cache: 'no-cache' });
      const manifest = await res.json();
      addScrollMargin();
      manifest.items.forEach((item, i) => {
        const tile = document.createElement('div');
        tile.className = 'tile';
        tile.setAttribute('data-idx', item.i);
        tile.addEventListener('click', () => {
          targetIdx = allTiles.indexOf(tile);
          centerTile(tile);
        });
        // Sin src: nadie descarga nada hasta que el planificador lo pide.
        let el;
        if (item.type === 'video') {
          el = document.createElement('video');
          el.preload = 'none';
          el.loop = true; el.muted = true; el.playsInline = true;
        } else {
          el = document.createElement('img');
          el.decoding = 'async';
          el.alt = '';
        }
        tile.appendChild(el);
        gallery.appendChild(tile);
        media.push({ i, type: item.type, file: item.file, tile, el, state: 'idle' });
      });
      allTiles = [...document.querySelectorAll('.tile')];
      addScrollMargin();
      measure();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          measure();
          const hash = location.hash.slice(1);
          if (hash && document.querySelector(`.tile[data-idx="${hash}"]`)) {
            goToIndex(hash, true);
          } else {
            // Sin hash arrancamos por la última: la carga va de la última hacia atrás.
            jumpToLast();
          }
        });
      });
      gallery.addEventListener('scroll', updateCurrent, { passive: true });
      window.addEventListener('resize', () => {
        document.querySelectorAll('.galleryMargin')
          .forEach(m => m.style.width = `${marginPx()}px`);
        measure();
        updateCurrent();
      });
      window.addEventListener('hashchange', () => {
        const idx = location.hash.slice(1);
        if (idx) goToIndex(idx);
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Dead') return;
        if (e.key === 'Escape') { cancelInput(); return; }
        if (e.key === 'Backspace' && userInput) { userInput = userInput.slice(0, -1); currentNumberEl.textContent = userInput || ''; return; }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          if (e.key === ' ' && userInput) { e.preventDefault(); handleInput(' '); return; }
          if (e.key !== ' ') { handleInput(e.key); return; }
        }
        if (e.key === 'ArrowRight') navigateTile(1);
        else if (e.key === 'ArrowLeft') navigateTile(-1);
        else if (e.key === 'Home') { e.preventDefault(); targetIdx = 0; centerTile(allTiles[0]); }
        else if (e.key === 'End') { e.preventDefault(); targetIdx = allTiles.length - 1; centerTile(allTiles[targetIdx]); }
      });
    } catch (e) {
      document.getElementById('loader').textContent = 'No se encontró img/manifest.json. Ejecuta el script primero.';
      return;
    } finally {
      document.getElementById('loader').style.display = 'none';
      document.querySelectorAll('.gallery, #current-number, #arrow, #progress')
        .forEach(el => el.style.visibility = 'visible');
    }
  }

  // ── Public API (for plugins) ───────────────────────────

  // Object.assign copiaría el valor del getter, no el getter: hay que definirlos.
  window.Gallery = window.Gallery || {};
  window.Gallery.goToIndex = goToIndex;
  window.Gallery.shuffleThenGo = shuffleThenGo;
  Object.defineProperties(window.Gallery, {
    tileCount: { get: () => allTiles.length, configurable: true },
    focusIndex: { get: () => focusIdx, configurable: true },
    pending: { get: () => queue.length, configurable: true },
  });

  window.addEventListener('load', init);
})();

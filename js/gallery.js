// gallery.js — Core gallery logic
// Exposes window.Gallery for plugins

(function () {
  const imgWidth = 512;
  const gallery = document.querySelector(".gallery");
  const currentNumberEl = document.getElementById("current-number");
  const progressEl = document.getElementById("progress");

  let allTiles = [];
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
  }

  // ── Layout ─────────────────────────────────────────────

  const marginPx = () => (document.documentElement.clientWidth - imgWidth) / 2;

  function addScrollMargin() {
    const m = document.createElement("div");
    m.className = "galleryMargin";
    m.style.width = `${marginPx()}px`;
    gallery.appendChild(m);
  }

  // ── Navigation ─────────────────────────────────────────

  function findClosestIdx() {
    const rect = gallery.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    let best = 0, minD = Infinity;
    allTiles.forEach((t, i) => {
      const r = t.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - cx);
      if (d < minD) { minD = d; best = i; }
    });
    return best;
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
    for (let off = -2; off <= 2; off++) {
      const pi = targetIdx + off;
      if (pi >= 0 && pi < allTiles.length) {
        const img = allTiles[pi].querySelector('img[loading="lazy"]');
        if (img) img.loading = 'eager';
      }
    }
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
      for (const item of manifest.items) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        tile.setAttribute('data-idx', item.i);
        tile.addEventListener('click', () => {
          targetIdx = allTiles.indexOf(tile);
          centerTile(tile);
        });
        if (item.type === 'video') {
          const v = document.createElement('video');
          v.src = `img/${item.file}`;
          v.autoplay = true; v.loop = true; v.muted = true; v.playsInline = true;
          tile.appendChild(v);
        } else {
          const img = new Image();
          img.src = `img/${item.file}`;
          img.loading = 'lazy';
          tile.appendChild(img);
        }
        gallery.appendChild(tile);
      }
      allTiles = [...document.querySelectorAll('.tile')];
      addScrollMargin();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const hash = location.hash.slice(1);
          if (hash && document.querySelector(`.tile[data-idx="${hash}"]`)) {
            goToIndex(hash, true);
          } else {
            jumpToLast();
          }
        });
      });
      gallery.addEventListener('scroll', updateCurrent);
      window.addEventListener('resize', () => {
        document.querySelectorAll('.galleryMargin')
          .forEach(m => m.style.width = `${marginPx()}px`);
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

  window.Gallery = window.Gallery || {};
  Object.assign(window.Gallery, {
    goToIndex,
    shuffleThenGo,
    get tileCount() { return allTiles.length; },
  });

  window.addEventListener('load', init);
})();

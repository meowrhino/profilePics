// gallery.js — Core gallery logic
// Exposes window.Gallery for plugins

(function () {
  const gallery = document.querySelector(".gallery");
  const currentNumberEl = document.getElementById("current-number");
  const progressEl = document.getElementById("progress");
  const hintEl = document.getElementById("hint");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let allTiles = [];
  let margins = [];
  let currentTile = null;
  let targetIdx = -1;
  let scrollAnim = null;
  let isAnimating = false;
  let hashUpdateTimer = null;
  let userInput = '';
  let inputTimer = null;
  let shuffleTimer = null;
  let shuffleRaf = null;

  // ── Easing ──────────────────────────────────────────────

  function easeOutExpo(t) {
    return t === 1 ? 1 : 1 - Math.pow(2, -12 * t);
  }

  // ── Scroll animation ───────────────────────────────────

  function animateScrollTo(targetLeft) {
    if (scrollAnim) cancelAnimationFrame(scrollAnim);
    if (reduceMotion.matches) {
      isAnimating = false;
      scrollAnim = null;
      gallery.scrollLeft = targetLeft;
      return;
    }
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
        loadNearby();
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
  // Los márgenes laterales dejan que el primer y el último tile lleguen
  // al centro. Se miden del tile real: el ancho vive en el CSS (40vh) y
  // hardcodearlo aquí lo desincroniza en cuanto cambia el viewport.

  function addScrollMargin() {
    const m = document.createElement("div");
    m.className = "galleryMargin";
    gallery.appendChild(m);
    margins.push(m);
  }

  function updateMargins() {
    if (!allTiles.length) return;
    const tileW = allTiles[0].getBoundingClientRect().width;
    const gap = parseFloat(getComputedStyle(gallery).columnGap) || 0;
    const w = Math.max(0, (gallery.clientWidth - tileW) / 2 - gap);
    margins.forEach(m => { m.style.width = `${w}px`; });
  }

  // ── Fotos y vídeos bajo demanda ────────────────────────
  // Nada lleva src hasta estar cerca del centro. Con loading="lazy" el
  // navegador pedía primero las fotos 0, 1, 2… (están al principio del
  // scroll antes de saltar a la última) y con poca red la última tardaba
  // muchísimo. Los vídeos, además, se bajaban enteros (15 MB).
  // Durante un salto animado no se pide nada: pasaría por cientos de fotos.

  const nearby = new Set();

  function loadMedia(el) {
    if (!el.src && el.dataset.src) {
      if (el.parentElement === currentTile) el.fetchPriority = 'high';
      el.src = el.dataset.src;
    }
    if (el.tagName === 'VIDEO' && el.paused) {
      const p = el.play();
      if (p) p.catch(() => { /* autoplay bloqueado: se queda en el primer frame */ });
    }
  }

  function loadNearby() {
    nearby.forEach(loadMedia);
  }

  const mediaObserver = new IntersectionObserver((entries) => {
    for (const { target: el, isIntersecting } of entries) {
      if (isIntersecting) {
        nearby.add(el);
        if (!isAnimating) loadMedia(el);
      } else {
        nearby.delete(el);
        if (el.tagName === 'VIDEO' && !el.paused) el.pause();
      }
    }
  }, { root: gallery, rootMargin: '0px 50%' });

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

    if (currentTile !== allTiles[ci]) {
      if (currentTile) currentTile.classList.remove('is-current');
      currentTile = allTiles[ci];
      currentTile.classList.add('is-current');
    }

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
  }

  // ── Shuffle animation ──────────────────────────────────

  function stopShuffle() {
    if (shuffleTimer) { clearTimeout(shuffleTimer); shuffleTimer = null; }
    if (shuffleRaf) { cancelAnimationFrame(shuffleRaf); shuffleRaf = null; }
    currentNumberEl.classList.remove('error');
  }

  function shuffleThenGo(finalIdx) {
    const maxIdx = allTiles.length - 1;
    if (finalIdx == null) finalIdx = Math.floor(Math.random() * allTiles.length);

    // El parpadeo del número es justo lo que molesta con reduced-motion.
    if (reduceMotion.matches) {
      currentNumberEl.textContent = finalIdx;
      goToIndex(String(finalIdx));
      return;
    }

    const totalMs = 1200;
    const startTime = performance.now();
    currentNumberEl.classList.add('error');

    function tick(now) {
      const elapsed = now - startTime;
      if (elapsed < totalMs) {
        const speed = 30 + 120 * (elapsed / totalMs);
        currentNumberEl.textContent = Math.floor(Math.random() * (maxIdx + 1));
        shuffleTimer = setTimeout(() => {
          shuffleRaf = requestAnimationFrame(tick);
        }, speed);
      } else {
        currentNumberEl.classList.remove('error');
        currentNumberEl.textContent = finalIdx;
        shuffleRaf = null;
        goToIndex(String(finalIdx));
      }
    }
    shuffleRaf = requestAnimationFrame(tick);
  }

  // ── Input handling ─────────────────────────────────────

  function commitInput() {
    clearTimeout(inputTimer);
    const val = userInput;
    userInput = '';
    if (!val) return;
    const isNumeric = /^\d+$/.test(val);
    if (isNumeric && document.querySelector(`.tile[data-idx="${val}"]`)) {
      goToIndex(val);
    } else if (!isNumeric && window.Gallery.textToNumber) {
      const idx = window.Gallery.textToNumber(val, allTiles.length);
      shuffleThenGo(idx);
    } else {
      shuffleThenGo();
    }
  }

  function handleInput(ch) {
    stopShuffle();
    hideHint();
    userInput += ch;
    currentNumberEl.textContent = userInput;
    clearTimeout(inputTimer);
    inputTimer = setTimeout(commitInput, 1500);
  }

  function cancelInput() {
    userInput = '';
    clearTimeout(inputTimer);
    stopShuffle();
    updateCurrent();
  }

  // ── Hint ───────────────────────────────────────────────

  let hintTimer = null;

  function showHint() {
    if (!hintEl) return;
    hintEl.classList.add('show');
    hintTimer = setTimeout(hideHint, 6000);
  }

  function hideHint() {
    if (!hintEl) return;
    clearTimeout(hintTimer);
    hintEl.classList.remove('show');
  }

  // ── Init ───────────────────────────────────────────────

  async function init() {
    const loader = document.getElementById('loader');
    try {
      // El ?v= no es decorativo: _headers marca /img/* como immutable durante
      // un año y no se puede excluir el manifest por patrón. Ver _headers.
      const res = await fetch(`img/manifest.json?v=${Date.now()}`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
        let media;
        if (item.type === 'video') {
          media = document.createElement('video');
          media.preload = 'none';
          media.autoplay = true; media.loop = true; media.muted = true; media.playsInline = true;
          media.setAttribute('aria-label', `Vídeo de perfil nº ${item.i}`);
        } else {
          media = document.createElement('img');
          media.decoding = 'async';
          media.alt = `Foto de perfil nº ${item.i}`;
        }
        media.dataset.src = `img/${item.file}`;   // src real al acercarse (ver mediaObserver)
        tile.appendChild(media);
        gallery.appendChild(tile);
      }
      allTiles = [...document.querySelectorAll('.tile')];
      addScrollMargin();
      requestAnimationFrame(() => {
        updateMargins();
        requestAnimationFrame(() => {
          const hash = location.hash.slice(1);
          if (hash && document.querySelector(`.tile[data-idx="${hash}"]`)) {
            goToIndex(hash, true);
          } else {
            jumpToLast();
          }
          // Se observa ya colocados: antes, las primeras fotos contarían como visibles.
          allTiles.forEach(t => mediaObserver.observe(t.firstChild));
          showHint();
        });
      });
      gallery.addEventListener('scroll', updateCurrent);
      window.addEventListener('resize', () => {
        updateMargins();
        updateCurrent();
      });
      window.addEventListener('hashchange', () => {
        const idx = location.hash.slice(1);
        if (idx) goToIndex(idx);
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Dead') return;
        if (e.key === 'Escape') { cancelInput(); return; }
        if (e.key === 'Enter') { if (userInput) commitInput(); return; }
        if (e.key === 'Backspace' && userInput) {
          userInput = userInput.slice(0, -1);
          if (userInput) currentNumberEl.textContent = userInput;
          else cancelInput();
          return;
        }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          if (e.key === ' ' && userInput) { e.preventDefault(); handleInput(' '); return; }
          if (e.key !== ' ') { handleInput(e.key); return; }
        }
        if (e.key === 'ArrowRight') navigateTile(1);
        else if (e.key === 'ArrowLeft') navigateTile(-1);
        else if (e.key === 'Home') { e.preventDefault(); targetIdx = 0; centerTile(allTiles[0]); }
        else if (e.key === 'End') { e.preventDefault(); targetIdx = allTiles.length - 1; centerTile(allTiles[targetIdx]); }
      });

      loader.style.display = 'none';
      document.querySelectorAll('.gallery, #current-number, #arrow, #progress')
        .forEach(el => el.style.visibility = 'visible');
    } catch (e) {
      // Ojo: esto tiene que quedar visible. Antes se ocultaba el loader en un
      // finally y el error no se veía nunca.
      loader.textContent = 'No se pudo cargar img/manifest.json. Ejecuta el script primero.';
      loader.style.color = '#ff3333';
      loader.style.fontSize = '1.1rem';
      loader.style.padding = '0 2rem';
      loader.style.textAlign = 'center';
      console.error('[gallery]', e);
    }
  }

  // ── Public API (for plugins) ───────────────────────────

  window.Gallery = window.Gallery || {};
  Object.assign(window.Gallery, {
    goToIndex,
    shuffleThenGo,
    get tileCount() { return allTiles.length; },
  });

  init();   // el <script> va al final del body: el DOM ya está
})();

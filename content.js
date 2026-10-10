// Content script na netflix.com. Netflix to SPA, więc skrypt działa na całej domenie
// i sam śledzi zmiany URL oraz podmiany elementu <video>.
(() => {
  const PLACEHOLDER_PREFIX = 'Netflix #';
  // Ekran końcowy Netflixa (następny odcinek / rekomendacje). Selektory mogą się zmienić,
  // dlatego to tylko dodatkowy sygnał obok 'ended' i zmiany URL.
  const POSTPLAY_SELECTOR = [
    '[data-uia="next-episode-seamless-button"]',
    '[data-uia="next-episode-seamless-button-draining"]',
    '[data-uia="watch-credits-seamless-button"]',
    '[data-uia^="postplay"]',
  ].join(',');
  const MIN_WATCHED_SECONDS = 5;
  // Watchdog ładowania: Netflix czasem zawiesza się na czarnym ekranie lub kółku ładowania.
  const PLAY_NUDGE_MS = 12000; // po tym czasie próbujemy wywołać play()
  const RELOAD_MS = 25000; // po tym czasie przeładowujemy stronę
  const MAX_RELOADS = 3; // potem pomijamy pozycję
  // „Czy nadal oglądasz?”: selektor może się zmienić, wtedy watchdog i tak przeładuje stronę.
  const CONTINUE_SELECTOR = '[data-uia="interrupt-autoplay-continue"]';

  let playlist = [];
  let settings = { loopMode: 'all', shuffle: false, creditsOffset: 0 };
  let state = { active: false, currentId: null, tabId: null };
  let myTabId = null;

  let lastId = null;
  let video = null;
  let maxRatio = 0;
  let watchedSeconds = 0;
  let lastTime = null;
  let endedSentFor = null;
  let loadStartedAt = Date.now();
  let started = false;
  let nudged = false;
  const titleCache = {};

  chrome.storage.local.get(['playlist', 'settings', 'state']).then((d) => {
    if (Array.isArray(d.playlist)) playlist = d.playlist;
    if (d.settings) settings = { ...settings, ...d.settings };
    if (d.state) state = { ...state, ...d.state };
    updateUi();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.playlist) playlist = changes.playlist.newValue || [];
    if (changes.settings) settings = { ...settings, ...changes.settings.newValue };
    if (changes.state) state = { ...state, ...changes.state.newValue };
    updateUi();
  });
  chrome.runtime.sendMessage({ type: 'WHO_AM_I' }).then((r) => {
    myTabId = r?.tabId ?? null;
    updateUi();
  });

  function currentId() {
    const m = location.pathname.match(/^\/watch\/(\d+)/);
    return m ? m[1] : null;
  }

  function isLoopTabFor(id) {
    return state.active && myTabId != null && myTabId === state.tabId && id != null && id === state.currentId;
  }

  function readTitle() {
    const el = document.querySelector('[data-uia="video-title"]');
    if (el) {
      const parts = [...el.children].map((c) => c.textContent.trim()).filter(Boolean);
      const t = parts.length ? parts.join(' · ') : el.textContent.trim();
      if (t) return t;
    }
    const dt = document.title.replace(/\s*[-|–]\s*Netflix\s*$/i, '').trim();
    if (dt && dt.toLowerCase() !== 'netflix') return dt;
    return null;
  }

  function sendEnded(id) {
    if (endedSentFor === id || !isLoopTabFor(id)) return;
    endedSentFor = id;
    chrome.runtime.sendMessage({ type: 'VIDEO_ENDED', id }).catch(() => {});
  }

  function onIdChange(prev, next) {
    // Netflix sam przeszedł dalej (autoodtwarzanie następnego odcinka albo powrót do /browse)
    // po obejrzeniu prawie całości: traktujemy to jako koniec pozycji z playlisty.
    if (prev && next !== prev && maxRatio > 0.85 && endedSentFor !== prev) sendEnded(prev);
    maxRatio = 0;
    watchedSeconds = 0;
    lastTime = null;
    endedSentFor = null;
    loadStartedAt = Date.now();
    started = false;
    nudged = false;
  }

  function retryKey(id) {
    return `nlp-reloads-${id}`;
  }

  // Na karcie pętli pilnuje, żeby film faktycznie ruszył: najpierw próbuje play(),
  // potem przeładowuje stronę, a po MAX_RELOADS nieudanych próbach przechodzi dalej.
  // Licznik prób trzyma w sessionStorage, bo przeżywa on przeładowanie karty.
  function watchdog(id) {
    const cont = document.querySelector(CONTINUE_SELECTOR);
    if (cont && isLoopTabFor(id)) cont.click();

    if (started) return;
    if (watchedSeconds > 0.5) {
      started = true;
      sessionStorage.removeItem(retryKey(id));
      return;
    }
    if (!isLoopTabFor(id)) {
      loadStartedAt = Date.now(); // nie liczymy czasu, zanim wiadomo, że to karta pętli
      return;
    }

    const waited = Date.now() - loadStartedAt;
    if (!nudged && waited > PLAY_NUDGE_MS && video?.paused) {
      nudged = true;
      video.play().catch(() => {});
    }
    if (waited < RELOAD_MS) return;

    const tries = Number(sessionStorage.getItem(retryKey(id)) || 0);
    if (tries < MAX_RELOADS) {
      sessionStorage.setItem(retryKey(id), String(tries + 1));
      location.reload();
    } else {
      started = true;
      sessionStorage.removeItem(retryKey(id));
      chrome.runtime.sendMessage({ type: 'LOAD_FAILED', id }).catch(() => {});
    }
  }

  function check() {
    const id = currentId();
    if (!id || !video) return;
    const v = video;
    if (!Number.isFinite(v.duration) || v.duration <= 0) return;

    if (lastTime != null && !v.paused) {
      const delta = v.currentTime - lastTime;
      if (delta > 0 && delta < 2) watchedSeconds += delta; // pomijamy przewijanie
    }
    lastTime = v.currentTime;
    maxRatio = Math.max(maxRatio, v.currentTime / v.duration);

    const remaining = v.duration - v.currentTime;
    const threshold = Math.max(Number(settings.creditsOffset) || 0, 0.75);
    const enoughWatched = watchedSeconds >= MIN_WATCHED_SECONDS;

    if (enoughWatched && remaining <= threshold) sendEnded(id);
    else if (enoughWatched && maxRatio > 0.8 && document.querySelector(POSTPLAY_SELECTOR)) sendEnded(id);
    else if (remaining > threshold + 5 && endedSentFor === id) endedSentFor = null; // ktoś przewinął wstecz
  }

  function attach(v) {
    video = v;
    lastTime = null;
    if (!v) return;
    v.addEventListener('timeupdate', check);
    v.addEventListener('ended', () => {
      const id = currentId();
      if (watchedSeconds >= MIN_WATCHED_SECONDS) sendEnded(id);
    });
  }

  async function maybeFixTitle(id) {
    const title = readTitle();
    if (!title) return;
    titleCache[id] = title;
    const item = playlist.find((p) => p.id === id);
    if (!item || !item.title.startsWith(PLACEHOLDER_PREFIX)) return;
    const d = await chrome.storage.local.get('playlist');
    const fresh = Array.isArray(d.playlist) ? d.playlist : [];
    const target = fresh.find((p) => p.id === id);
    if (target && target.title.startsWith(PLACEHOLDER_PREFIX)) {
      target.title = title;
      await chrome.storage.local.set({ playlist: fresh });
    }
  }

  function tick() {
    const id = currentId();
    if (id !== lastId) {
      onIdChange(lastId, id);
      lastId = id;
    }
    const v = document.querySelector('video');
    if (v !== video) attach(v);
    if (id) {
      check();
      watchdog(id);
      maybeFixTitle(id);
    }
    updateUi();
  }

  // ---------- Pływający panel na stronie odtwarzacza ----------
  const root = document.createElement('div');
  root.id = 'nlp-root';
  root.innerHTML =
    '<span class="nlp-badge"></span>' +
    '<button type="button" class="nlp-exit-fs" title="Wyłącz pełny ekran (Esc)">✕ Pełny ekran</button>' +
    '<button type="button" class="nlp-add"></button>';
  const badge = root.querySelector('.nlp-badge');
  const exitFsBtn = root.querySelector('.nlp-exit-fs');
  const addBtn = root.querySelector('.nlp-add');
  let hideTimer = null;

  addBtn.addEventListener('click', async () => {
    const id = currentId();
    if (!id) return;
    await chrome.runtime.sendMessage({ type: 'ADD', id, title: readTitle() || titleCache[id] });
  });

  exitFsBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'EXIT_FULLSCREEN' }).catch(() => {});
  });

  function mountRoot() {
    const fs = document.fullscreenElement;
    const host = fs && fs.tagName !== 'VIDEO' ? fs : document.body;
    if (host && root.parentNode !== host) host.appendChild(root);
  }

  function showUi() {
    root.classList.add('nlp-visible');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => root.classList.remove('nlp-visible'), 3000);
  }

  function updateUi() {
    const id = currentId();
    if (!id) {
      root.remove();
      return;
    }
    mountRoot();
    const index = playlist.findIndex((p) => p.id === id);
    const inList = index !== -1;
    addBtn.disabled = inList;
    addBtn.textContent = inList ? '✓ W pętli' : '+ Dodaj do pętli';
    const loop = isLoopTabFor(id);
    if (loop) {
      badge.textContent = `⟳ Pętla ${index + 1}/${playlist.length}`;
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
    // Tylko gdy to wtyczka przełączyła okno w pełny ekran (tylko taki potrafi wyłączyć).
    exitFsBtn.hidden = !(loop && state.fullscreenWindowId != null);
  }

  // W pełnym ekranie okna (chrome.windows) Esc nie działa domyślnie, więc obsługujemy go sami.
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && !document.fullscreenElement && isLoopTabFor(currentId())) {
        chrome.runtime.sendMessage({ type: 'EXIT_FULLSCREEN' }).catch(() => {});
      }
    },
    true,
  );
  document.addEventListener('mousemove', showUi, { passive: true });
  document.addEventListener('fullscreenchange', mountRoot);

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'GET_CURRENT') {
      const id = currentId();
      sendResponse({ id, title: id ? readTitle() || titleCache[id] || null : null });
    }
  });

  new MutationObserver(() => {
    const v = document.querySelector('video');
    if (v !== video) attach(v);
  }).observe(document.documentElement, { childList: true, subtree: true });

  setInterval(tick, 1000);
  tick();
})();

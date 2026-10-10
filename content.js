// Runs on all of netflix.com (an SPA), tracking URL changes and <video> swaps itself.
(() => {
  const PLACEHOLDER_PREFIX = 'Netflix #';
  const t = (key, ...subs) => chrome.i18n.getMessage(key, subs.map(String)) || key; // copy of shared/i18n.js
  // Netflix post-play screen. Selectors may change, so it's only an extra end signal.
  const POSTPLAY_SELECTOR = [
    '[data-uia="next-episode-seamless-button"]',
    '[data-uia="next-episode-seamless-button-draining"]',
    '[data-uia="watch-credits-seamless-button"]',
    '[data-uia^="postplay"]',
  ].join(',');
  const MIN_WATCHED_SECONDS = 5;
  // Loading watchdog: Netflix sometimes hangs on a black screen or a spinner.
  const PLAY_NUDGE_MS = 12000; // then try play()
  const RELOAD_MS = 25000; // then reload
  const MAX_RELOADS = 3; // then skip the item
  // "Are you still watching?" (if this breaks, the watchdog reloads anyway).
  const CONTINUE_SELECTOR = '[data-uia="interrupt-autoplay-continue"]';

  let playlist = [];
  let settings = { loopMode: 'all', shuffle: false, creditsOffset: 0 };
  let state = { active: false, currentId: null, tabId: null };
  let myTabId = null;
  let notice = null; // latest notice: {text, icon, tabId, at}
  let settingsLoaded = false; // autostart waits for the profile name

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
  let timer = null;
  let observer = null;
  let dead = false;

  // After an extension reload this script is orphaned and sendMessage throws synchronously
  // ("Extension context invalidated"), so it shuts itself down.
  function alive() {
    return !dead && !!chrome.runtime?.id;
  }

  function teardown() {
    if (dead) return;
    dead = true;
    clearInterval(timer);
    observer?.disconnect();
    root.remove();
    toast.remove();
  }

  function send(msg) {
    if (!alive()) {
      teardown();
      return Promise.resolve(null);
    }
    try {
      return chrome.runtime.sendMessage(msg).catch(() => null);
    } catch {
      teardown();
      return Promise.resolve(null);
    }
  }

  chrome.storage.local.get(['playlist', 'settings', 'state', 'notice']).then((d) => {
    if (Array.isArray(d.playlist)) playlist = d.playlist;
    if (d.settings) settings = { ...settings, ...d.settings };
    if (d.state) state = { ...state, ...d.state };
    notice = d.notice || null;
    settingsLoaded = true;
    updateUi();
    maybeShowNotice();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.playlist) playlist = changes.playlist.newValue || [];
    if (changes.settings) settings = { ...settings, ...changes.settings.newValue };
    if (changes.state) state = { ...state, ...changes.state.newValue };
    if (changes.notice) notice = changes.notice.newValue || null;
    updateUi();
    if (changes.notice) maybeShowNotice();
  });
  send({ type: 'WHO_AM_I' }).then((r) => {
    myTabId = r?.tabId ?? null;
    updateUi();
    maybeShowNotice();
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
    send({ type: 'VIDEO_ENDED', id });
  }

  function onIdChange(prev, next) {
    // Netflix moved on by itself (autoplay or back to /browse) near the end: treat as ended.
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

  // On the loop tab: nudge play(), then reload, then skip after MAX_RELOADS.
  // The reload counter lives in sessionStorage to survive reloads.
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
      loadStartedAt = Date.now(); // not the loop tab (yet): don't count
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
      send({ type: 'LOAD_FAILED', id });
    }
  }

  function check() {
    const id = currentId();
    if (!id || !video) return;
    const v = video;
    if (!Number.isFinite(v.duration) || v.duration <= 0) return;

    if (lastTime != null && !v.paused) {
      const delta = v.currentTime - lastTime;
      if (delta > 0 && delta < 2) watchedSeconds += delta; // ignore seeks
    }
    lastTime = v.currentTime;
    maxRatio = Math.max(maxRatio, v.currentTime / v.duration);

    const remaining = v.duration - v.currentTime;
    const threshold = Math.max(Number(settings.creditsOffset) || 0, 0.75);
    const enoughWatched = watchedSeconds >= MIN_WATCHED_SECONDS;

    if (enoughWatched && remaining <= threshold) sendEnded(id);
    else if (enoughWatched && maxRatio > 0.8 && document.querySelector(POSTPLAY_SELECTOR)) sendEnded(id);
    else if (remaining > threshold + 5 && endedSentFor === id) endedSentFor = null; // seeked back
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
    try {
      const d = await chrome.storage.local.get('playlist');
      const fresh = Array.isArray(d.playlist) ? d.playlist : [];
      const target = fresh.find((p) => p.id === id);
      if (target && target.title.startsWith(PLACEHOLDER_PREFIX)) {
        target.title = title;
        await chrome.storage.local.set({ playlist: fresh });
      }
    } catch {
      teardown(); // context invalidated mid-write
    }
  }

  // ---------- Autostart (#autostart) ----------
  // Marker set by autostart.js; 'clicked' means the profile was already picked
  // (Netflix may have reloaded). Cleared only when the loop starts.
  const AUTOSTART_KEY = 'nlp-autostart';
  const PROFILE_WAIT_MS = 6000; // wait for "Who's watching?"
  const AFTER_PROFILE_MS = 2500; // let Netflix switch profiles
  const autostartAt = Date.now();
  let profileClickedAt = 0;

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  }

  // Match visible elements by name rather than Netflix CSS classes (they change often);
  // isVisible() skips the hidden account menu.
  function findProfile(name) {
    const target = name.toLocaleLowerCase();
    for (const el of document.querySelectorAll('a, button, [role="link"], [role="button"], span, p')) {
      if (el.children.length > 2 || el.textContent.trim().toLocaleLowerCase() !== target || !isVisible(el)) continue;
      return el.closest('a, button, [role="link"], [role="button"], [tabindex]') || el;
    }
    return null;
  }

  function handleAutostart() {
    const flag = sessionStorage.getItem(AUTOSTART_KEY);
    if (!flag || !settingsLoaded) return;
    const name = String(settings.autoProfile || '').trim();
    if (name && flag !== 'clicked') {
      const el = findProfile(name);
      if (el) {
        el.click();
        sessionStorage.setItem(AUTOSTART_KEY, 'clicked');
        profileClickedAt = Date.now();
        return;
      }
      if (Date.now() - autostartAt < PROFILE_WAIT_MS) return;
    }
    if (profileClickedAt && Date.now() - profileClickedAt < AFTER_PROFILE_MS) return;
    sessionStorage.removeItem(AUTOSTART_KEY);
    send({ type: 'START', here: true });
  }

  function tick() {
    if (!alive()) {
      teardown();
      return;
    }
    handleAutostart();
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

  // ---------- On-page controls ----------
  const root = document.createElement('div');
  root.id = 'nlp-root';
  const ICON = '<span class="nlp-icon" aria-hidden="true"></span><span class="nlp-label"></span>';
  root.innerHTML =
    `<span class="nlp-badge">${ICON}</span>` +
    `<button type="button" class="nlp-fs">${ICON}</button>` +
    `<button type="button" class="nlp-add">${ICON}</button>`;
  const badge = root.querySelector('.nlp-badge');
  const fsBtn = root.querySelector('.nlp-fs');
  const addBtn = root.querySelector('.nlp-add');
  let hideTimer = null;

  // Copy of shared/icons.js; icon files are web-accessible for netflix.com.
  function setIcon(el, name) {
    el.style.setProperty('--nlp-icon', `url("${chrome.runtime.getURL(`icons/fa/${name}.svg`)}")`);
  }

  // Sets icon and label; the icon is swapped only when it changes.
  function setContent(el, iconName, text) {
    const icon = el.querySelector('.nlp-icon');
    if (icon.dataset.icon !== iconName) {
      icon.dataset.icon = iconName;
      setIcon(icon, iconName);
    }
    el.querySelector('.nlp-label').textContent = text;
  }

  addBtn.addEventListener('click', async () => {
    const id = currentId();
    if (!id) return;
    await send({ type: 'ADD', id, title: readTitle() || titleCache[id] });
  });

  // Page fullscreen (Netflix button) or window fullscreen (F11 / extension).
  function isFullscreen() {
    return !!document.fullscreenElement || matchMedia('(display-mode: fullscreen)').matches;
  }

  function updateFsBtn() {
    const fs = isFullscreen();
    setContent(fsBtn, fs ? 'compress' : 'expand', t(fs ? 'fsOff' : 'fsOn'));
    fsBtn.title = t(fs ? 'fsOffTitle' : 'fsOnTitle');
  }

  fsBtn.addEventListener('click', () => {
    // Page fullscreen exits locally; window fullscreen goes through the service worker
    // so it survives navigation to the next item.
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else send({ type: 'TOGGLE_FULLSCREEN' });
  });

  // Must live inside the fullscreen element to stay visible.
  function mountInPlayer(el) {
    const fs = document.fullscreenElement;
    const host = fs && fs.tagName !== 'VIDEO' ? fs : document.body;
    if (host && el.parentNode !== host) host.appendChild(el);
  }

  function mountRoot() {
    mountInPlayer(root);
    if (toast.isConnected) mountInPlayer(toast);
  }

  // ---------- On-page notices ----------
  const NOTICE_MAX_AGE_MS = 15000; // ignore stale notices
  const TOAST_MS = 6000;
  const toast = document.createElement('div');
  toast.id = 'nlp-toast';
  toast.setAttribute('role', 'status');
  toast.innerHTML = ICON;
  let toastTimer = null;

  function showToast(text, iconName) {
    setContent(toast, iconName, text);
    mountInPlayer(toast);
    void toast.offsetWidth; // restart the transition
    toast.classList.add('nlp-toast-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('nlp-toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, TOAST_MS);
  }

  // Show each notice once, on its target tab only; sessionStorage survives watchdog reloads.
  function maybeShowNotice() {
    if (!notice || myTabId == null || notice.tabId !== myTabId) return;
    if (Date.now() - notice.at > NOTICE_MAX_AGE_MS) return;
    const key = 'nlp-notice-shown';
    if (sessionStorage.getItem(key) === String(notice.at)) return;
    sessionStorage.setItem(key, String(notice.at));
    showToast(notice.text, notice.icon || 'triangle-exclamation');
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
    setContent(addBtn, inList ? 'check' : 'plus', t(inList ? 'pageInLoop' : 'pageAdd'));
    const loop = isLoopTabFor(id);
    if (loop) {
      setContent(badge, 'repeat', t('pageBadge', index + 1, playlist.length));
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
    updateFsBtn();
  }

  // Esc doesn't exit window fullscreen (chrome.windows) by default.
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && !document.fullscreenElement && state.fullscreenWindowId != null) {
        send({ type: 'EXIT_FULLSCREEN' });
      }
    },
    true,
  );
  document.addEventListener('mousemove', showUi, { passive: true });
  document.addEventListener('fullscreenchange', () => {
    mountRoot();
    updateFsBtn();
  });
  window.addEventListener('resize', updateFsBtn, { passive: true });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'GET_CURRENT') {
      const id = currentId();
      sendResponse({ id, title: id ? readTitle() || titleCache[id] || null : null });
    }
  });

  observer = new MutationObserver(() => {
    const v = document.querySelector('video');
    if (v !== video) attach(v);
  }).observe(document.documentElement, { childList: true, subtree: true });

  timer = setInterval(tick, 1000);
  tick();
})();

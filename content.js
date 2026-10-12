// Runs on all of disneyplus.com (an SPA), tracking URL changes and <video> swaps itself.
// Content scripts can't use static imports, so shared modules load via import() (web-accessible).
(async () => {
  const load = (file) => import(chrome.runtime.getURL(file));
  const [{ t }, { setIcon }, { PLACEHOLDER_PREFIX, DEFAULT_SETTINGS, DEFAULT_STATE, parseDisneyId }] = await Promise.all([
    load('shared/i18n.js'),
    load('shared/icons.js'),
    load('shared/storage.js'),
  ]);

  // Disney+ "Up next" overlay. Selectors may change, so it's only an extra end signal.
  const POSTPLAY_SELECTOR = [
    '[data-testid*="up-next" i]',
    '[data-testid*="upnext" i]',
    '[class*="up-next" i]',
    '[class*="upnext" i]',
  ].join(',');
  const MIN_WATCHED_SECONDS = 5;
  // Loading watchdog: Disney+ sometimes hangs on a black screen or a spinner.
  const PLAY_NUDGE_MS = 12000; // then try play()
  const RELOAD_MS = 25000; // then reload
  const MAX_RELOADS = 3; // then skip the item
  // "Are you still watching?" (if this breaks, the watchdog reloads anyway).
  const CONTINUE_SELECTOR = '[data-testid*="continue-watching" i], [data-testid*="still-watching" i] button';
  // Disney+ timeline slider: aria-valuemax is the title's length in seconds, aria-valuenow
  // the position, but only refreshed while the controls are on screen.
  const SEEK_SLIDER_SELECTOR = '.progress-bar__seekable-range[role="slider"]';
  // Disney+ resumes where you left off; with startOver the loop tab seeks back to 0.
  // Decided once, on the first position read after the item loads: any later jump is the
  // user's own seek (e.g. to the end) and must not restart the item. Setting
  // video.currentTime stalls the Disney+ player, so the seek goes through the slider.
  const RESUME_MIN_SECONDS = 10;
  const RESUME_WINDOW_MS = 30000; // since the item started loading
  const RESTART_RETRY_MS = 1500;
  const MAX_RESTARTS = 4;

  let playlist = [];
  let settings = { ...DEFAULT_SETTINGS };
  let state = { ...DEFAULT_STATE };
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
  let resumeChecked = false;
  let needsRestart = false;
  let restarts = 0;
  let lastRestartAt = 0;
  let slider = null;
  let sliderSeen = null; // last aria-valuenow read
  let timeOffset = null; // timeline position minus video.currentTime
  let timelineTotal = null; // title length from aria-valuemax
  let sliderScanAt = 0;
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

  // Decisions only (not per tick), so a bug report can show why the loop did something.
  // Also kept in the tab's sessionStorage (survives reloads):
  // copy(sessionStorage.getItem('dlp-log')) in the console copies it.
  const LOG_KEY = 'dlp-log';
  const LOG_LINES = 200;
  function log(...args) {
    console.info('[Playlist Looper]', ...args);
    try {
      const text = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      const lines = (sessionStorage.getItem(LOG_KEY) || '').split('\n').filter(Boolean).slice(1 - LOG_LINES);
      lines.push(`${new Date().toISOString().slice(11, 19)} ${text}`);
      sessionStorage.setItem(LOG_KEY, lines.join('\n'));
    } catch {
      // storage full or blocked: console only
    }
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
    return parseDisneyId(location.pathname);
  }

  // The player renders UI and media inside open shadow roots.
  function deepQueryAll(node, selector, out = []) {
    out.push(...node.querySelectorAll(selector));
    for (const el of node.querySelectorAll('*')) if (el.shadowRoot) deepQueryAll(el.shadowRoot, selector, out);
    return out;
  }

  function deepQuery(node, selector) {
    const hit = node.querySelector(selector);
    if (hit) return hit;
    for (const el of node.querySelectorAll('*')) {
      const found = el.shadowRoot && deepQuery(el.shadowRoot, selector);
      if (found) return found;
    }
    return null;
  }

  // Only on player pages: elsewhere a <video> is just a preview, and the deep scan isn't free.
  // The light DOM holds an empty placeholder <video> (readyState 0); prefer one that has media.
  function findVideo() {
    if (!currentId()) return null;
    const all = deepQueryAll(document, 'video');
    const loaded = all.filter((v) => v.readyState > 0);
    const videos = loaded.length ? loaded : all;
    if (videos.length <= 1) return videos[0] || null;
    const area = (v) => v.offsetWidth * v.offsetHeight;
    return videos.reduce((a, b) => (area(b) > area(a) ? b : a));
  }

  function sliderValue(slider, attr) {
    const n = Number(slider?.getAttribute(attr));
    return slider?.hasAttribute(attr) && Number.isFinite(n) ? n : null;
  }

  // The slider is removed from the DOM while the controls are hidden; the deep scan
  // for it runs at most once a second.
  function getSlider() {
    if (slider?.isConnected) return slider;
    if (Date.now() - sliderScanAt < 1000) return null;
    sliderScanAt = Date.now();
    slider = deepQuery(document, SEEK_SLIDER_SELECTOR);
    return slider;
  }

  // The stream's video.duration is NaN/Infinity (MSE) and video.currentTime is offset from
  // the title's timeline. Whenever the slider shows a fresh value, the offset is
  // recalibrated; in between (also while the slider is gone), the position follows
  // video.currentTime and the remembered length.
  function timeline(v) {
    if (Number.isFinite(v.duration) && v.duration > 0) return { now: v.currentTime, total: v.duration };
    const s = getSlider();
    const now = sliderValue(s, 'aria-valuenow');
    if (now != null && now !== sliderSeen) {
      sliderSeen = now;
      timeOffset = now - v.currentTime;
    }
    const total = sliderValue(s, 'aria-valuemax');
    if (total > 0) timelineTotal = total;
    return timeOffset != null && timelineTotal ? { now: v.currentTime + timeOffset, total: timelineTotal } : null;
  }

  // Click the very start of the timeline, like a user would; every other attempt uses
  // the Home key instead, in case the player ignores synthetic pointer events.
  function seekToStart(slider, attempt) {
    if (attempt % 2 === 0) {
      const r = slider.getBoundingClientRect();
      if (!r.width) return false;
      const at = { bubbles: true, composed: true, cancelable: true, clientX: r.left + 1, clientY: r.top + r.height / 2 };
      const ptr = { ...at, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0 };
      slider.dispatchEvent(new PointerEvent('pointerdown', { ...ptr, buttons: 1 }));
      slider.dispatchEvent(new MouseEvent('mousedown', { ...at, button: 0, buttons: 1 }));
      slider.dispatchEvent(new PointerEvent('pointerup', { ...ptr, buttons: 0 }));
      slider.dispatchEvent(new MouseEvent('mouseup', { ...at, button: 0, buttons: 0 }));
      slider.dispatchEvent(new MouseEvent('click', { ...at, button: 0, buttons: 0 }));
    } else {
      slider.focus?.();
      const key = { key: 'Home', code: 'Home', keyCode: 36, bubbles: true, composed: true, cancelable: true };
      slider.dispatchEvent(new KeyboardEvent('keydown', key));
      slider.dispatchEvent(new KeyboardEvent('keyup', key));
    }
    return true;
  }

  function isLoopTabFor(id) {
    return state.active && myTabId != null && myTabId === state.tabId && id != null && id === state.currentId;
  }

  function readTitle() {
    const title = document.querySelector('.title-field, [data-testid="title-field"]')?.textContent.trim();
    if (title) {
      const sub = document.querySelector('.subtitle-field, [data-testid="subtitle-field"]')?.textContent.trim();
      return sub ? `${title} · ${sub}` : title;
    }
    const dt = document.title
      .replace(/\s*[-|–]\s*Disney\+?\s*$/i, '')
      .replace(/^(watch|oglądaj)\s+/i, '')
      .trim();
    if (dt && !/^disney\+?$/i.test(dt)) return dt;
    return null;
  }

  function sendEnded(id, reason) {
    if (endedSentFor === id || !isLoopTabFor(id)) return;
    endedSentFor = id;
    log('ended:', reason, { watchedSeconds: Math.round(watchedSeconds), maxRatio: maxRatio.toFixed(2) });
    send({ type: 'VIDEO_ENDED', id });
  }

  function onIdChange(prev, next) {
    if (prev || next) log('item changed', { from: prev, to: next, loopTab: isLoopTabFor(next) });
    // Disney+ moved on by itself (autoplay or back to /browse) near the end: treat as ended.
    if (prev && next !== prev && maxRatio > 0.85 && endedSentFor !== prev) sendEnded(prev, 'navigated away');
    maxRatio = 0;
    watchedSeconds = 0;
    lastTime = null;
    endedSentFor = null;
    loadStartedAt = Date.now();
    started = false;
    nudged = false;
    resumeChecked = false;
    needsRestart = false;
    restarts = 0;
    lastRestartAt = 0;
    sliderSeen = null;
    timeOffset = null;
    timelineTotal = null;
  }

  function retryKey(id) {
    return `dlp-reloads-${id}`;
  }

  // On the loop tab: nudge play(), then reload, then skip after MAX_RELOADS.
  // The reload counter lives in sessionStorage to survive reloads.
  function watchdog(id) {
    const cont = document.querySelector(CONTINUE_SELECTOR);
    if (cont && isLoopTabFor(id)) cont.click();

    if (started) return;
    if (watchedSeconds > 0.5) {
      log('playback detected', { readyState: video?.readyState, duration: video?.duration, currentTime: video?.currentTime });
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
    const why = { video: !!video, readyState: video?.readyState, paused: video?.paused, watchedSeconds };
    if (tries < MAX_RELOADS) {
      log(`not playing after ${Math.round(waited / 1000)} s, reload ${tries + 1}/${MAX_RELOADS}`, why);
      sessionStorage.setItem(retryKey(id), String(tries + 1));
      location.reload();
    } else {
      log('still not playing, skipping the item', why);
      started = true;
      sessionStorage.removeItem(retryKey(id));
      send({ type: 'LOAD_FAILED', id });
    }
  }

  function check() {
    const id = currentId();
    if (!id || !video) return;
    const v = video;

    // Counted from the video itself, so it works even without a known duration.
    if (lastTime != null && !v.paused) {
      const delta = v.currentTime - lastTime;
      if (delta > 0 && delta < 2) watchedSeconds += delta; // ignore seeks
    }
    lastTime = v.currentTime;

    const tl = timeline(v);
    if (!tl) return;

    // A resumed item restarts from 0.
    if (!resumeChecked && settings.startOver && isLoopTabFor(id) && Date.now() - loadStartedAt < RESUME_WINDOW_MS) {
      resumeChecked = true;
      needsRestart = tl.now > RESUME_MIN_SECONDS;
      log('start position', { at: Math.round(tl.now), restart: needsRestart });
    }
    if (needsRestart && tl.now <= RESUME_MIN_SECONDS) {
      needsRestart = false;
      log('restarted from the beginning');
    }
    if (needsRestart && restarts < MAX_RESTARTS && Date.now() - lastRestartAt > RESTART_RETRY_MS) {
      if (getSlider() && seekToStart(slider, restarts)) {
        log(`seeking to the start (attempt ${restarts + 1}/${MAX_RESTARTS})`);
        restarts++;
        lastRestartAt = Date.now();
        maxRatio = 0; // the resume point must not count towards the 85% rule
        return;
      }
    }

    maxRatio = Math.max(maxRatio, tl.now / tl.total);

    const remaining = tl.total - tl.now;
    const threshold = Math.max(Number(settings.creditsOffset) || 0, 0.75);
    const enoughWatched = watchedSeconds >= MIN_WATCHED_SECONDS;

    if (enoughWatched && remaining <= threshold) sendEnded(id, `${remaining.toFixed(1)} s left`);
    else if (enoughWatched && maxRatio > 0.8 && document.querySelector(POSTPLAY_SELECTOR)) sendEnded(id, 'up next overlay');
    else if (remaining > threshold + 5 && endedSentFor === id) endedSentFor = null; // seeked back
  }

  function attach(v) {
    video = v;
    lastTime = null;
    sliderSeen = null;
    timeOffset = null;
    timelineTotal = null;
    if (!v) return;
    const count = deepQueryAll(document, 'video').length;
    log('watching video', { videosOnPage: count, inShadowDom: v.getRootNode() !== document, readyState: v.readyState, duration: v.duration });
    v.addEventListener('timeupdate', check);
    v.addEventListener('ended', () => {
      const id = currentId();
      if (watchedSeconds >= MIN_WATCHED_SECONDS) sendEnded(id, 'ended event');
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
  // (Disney+ may have reloaded). Cleared only when the loop starts.
  const AUTOSTART_KEY = 'dlp-autostart';
  const PROFILE_WAIT_MS = 8000; // wait for "Who's watching?"
  const AFTER_PROFILE_MS = 3000; // let Disney+ switch profiles
  const autostartAt = Date.now();
  let profileClickedAt = 0;

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  }

  // Match visible elements by name rather than Disney+ CSS classes (they change often);
  // isVisible() skips the hidden account menu.
  function findProfile(name) {
    const target = name.toLocaleLowerCase();
    for (const el of document.querySelectorAll('a, button, [role="link"], [role="button"], span, p, h3, div')) {
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

  const STATUS_EVERY_MS = 10000;
  let lastStatusAt = 0;

  function logStatus(id) {
    if (Date.now() - lastStatusAt < STATUS_EVERY_MS) return;
    lastStatusAt = Date.now();
    const s = getSlider();
    const tl = video && timeline(video);
    log('status', {
      loopTab: isLoopTabFor(id),
      videos: deepQueryAll(document, 'video').length,
      readyState: video?.readyState,
      paused: video?.paused,
      currentTime: video && Math.round(video.currentTime),
      duration: video?.duration,
      slider: s ? `${sliderValue(s, 'aria-valuenow')}/${sliderValue(s, 'aria-valuemax')}` : null,
      position: tl ? `${Math.round(tl.now)}/${Math.round(tl.total)}` : null,
      watched: Math.round(watchedSeconds),
      started,
    });
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
    if (!video?.isConnected || video.readyState === 0 || !id) {
      const v = findVideo();
      if (v !== video) attach(v);
    }
    if (id) {
      check();
      watchdog(id);
      logStatus(id);
      maybeFixTitle(id);
    }
    updateUi();
  }

  // ---------- On-page controls ----------
  const root = document.createElement('div');
  root.id = 'dlp-root';
  const ICON = '<span class="dlp-icon" aria-hidden="true"></span><span class="dlp-label"></span>';
  root.innerHTML =
    `<span class="dlp-badge">${ICON}</span>` +
    `<button type="button" class="dlp-fs">${ICON}</button>` +
    `<button type="button" class="dlp-add">${ICON}</button>`;
  const badge = root.querySelector('.dlp-badge');
  const fsBtn = root.querySelector('.dlp-fs');
  const addBtn = root.querySelector('.dlp-add');
  let hideTimer = null;

  // Sets icon and label; the icon is swapped only when it changes.
  function setContent(el, iconName, text) {
    const icon = el.querySelector('.dlp-icon');
    if (icon.dataset.icon !== iconName) {
      icon.dataset.icon = iconName;
      setIcon(icon, iconName);
    }
    el.querySelector('.dlp-label').textContent = text;
  }

  addBtn.addEventListener('click', async () => {
    const id = currentId();
    if (!id) return;
    await send({ type: 'ADD', id, title: readTitle() || titleCache[id] });
  });

  // Page fullscreen (Disney+ button) or window fullscreen (F11 / extension).
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
  toast.id = 'dlp-toast';
  toast.setAttribute('role', 'status');
  toast.innerHTML = ICON;
  let toastTimer = null;

  function showToast(text, iconName) {
    setContent(toast, iconName, text);
    mountInPlayer(toast);
    void toast.offsetWidth; // restart the transition
    toast.classList.add('dlp-toast-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('dlp-toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, TOAST_MS);
  }

  // Show each notice once, on its target tab only; sessionStorage survives watchdog reloads.
  function maybeShowNotice() {
    if (!notice || myTabId == null || notice.tabId !== myTabId) return;
    if (Date.now() - notice.at > NOTICE_MAX_AGE_MS) return;
    const key = 'dlp-notice-shown';
    if (sessionStorage.getItem(key) === String(notice.at)) return;
    sessionStorage.setItem(key, String(notice.at));
    showToast(notice.text, notice.icon || 'triangle-exclamation');
  }

  function showUi() {
    root.classList.add('dlp-visible');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => root.classList.remove('dlp-visible'), 3000);
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
    if (video?.isConnected) return;
    const v = findVideo();
    if (v !== video) attach(v);
  }).observe(document.documentElement, { childList: true, subtree: true });

  log('page loaded', location.pathname);
  timer = setInterval(tick, 1000);
  tick();
})();

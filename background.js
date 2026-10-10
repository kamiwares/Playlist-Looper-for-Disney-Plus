import { load, savePlaylist, updateState, watchUrl, placeholderTitle } from './shared/storage.js';

// Zabezpieczenie przed podwójnym przejściem (np. 'ended' + timeupdate w tej samej chwili).
let lastAdvanceAt = 0;

function indexOfCurrent(playlist, state) {
  const i = playlist.findIndex((p) => p.id === state.currentId);
  if (i !== -1) return i;
  return Math.max(0, Math.min(state.index, playlist.length - 1));
}

// direction: 'auto' (koniec filmu), 'next', 'prev'. Zwraca -1, gdy należy się zatrzymać.
function pickIndex(playlist, settings, cur, direction) {
  const n = playlist.length;
  if (n === 0) return -1;
  if (direction === 'auto' && settings.loopMode === 'one') return cur;
  if (settings.shuffle && n > 1 && direction !== 'prev') {
    let r;
    do r = Math.floor(Math.random() * n);
    while (r === cur);
    return r;
  }
  const next = cur + (direction === 'prev' ? -1 : 1);
  if (next >= 0 && next < n) return next;
  if (direction === 'auto' && settings.loopMode === 'off') return -1;
  return (next + n) % n;
}

async function tabExists(tabId) {
  if (tabId == null) return false;
  try {
    await chrome.tabs.get(tabId);
    return true;
  } catch {
    return false;
  }
}

// Pełny ekran całego okna (jak F11), bo requestFullscreen() na stronie wymaga kliknięcia
// i znika przy każdej nawigacji do kolejnego filmu.
async function enterFullscreen() {
  const { settings, state } = await load();
  if (!settings.fullscreen || state.fullscreenPaused || state.tabId == null) return;
  const { windowId } = await chrome.tabs.get(state.tabId);
  const win = await chrome.windows.get(windowId);
  if (state.fullscreenWindowId === windowId && win.state !== 'fullscreen') {
    // Użytkownik sam wyszedł z pełnego ekranu (F11 lub Esc): nie wymuszamy go ponownie.
    await updateState({ fullscreenPaused: true, fullscreenWindowId: null, prevWindowState: null });
    return;
  }
  if (win.state === 'fullscreen') return;
  await updateState({ fullscreenWindowId: windowId, prevWindowState: win.state });
  await chrome.windows.update(windowId, { state: 'fullscreen' });
}

async function exitFullscreen() {
  const { state } = await load();
  if (state.fullscreenWindowId == null) return;
  try {
    await chrome.windows.update(state.fullscreenWindowId, { state: state.prevWindowState || 'normal' });
  } catch {
    // okno mogło zostać zamknięte
  }
  await updateState({ fullscreenWindowId: null, prevWindowState: null });
}

async function playAt(index, preferredTabId) {
  const { playlist, state } = await load();
  const item = playlist[index];
  if (!item) throw new Error('Brak pozycji o tym numerze.');

  const url = watchUrl(item.id);
  let tabId = null;
  for (const candidate of [preferredTabId, state.tabId]) {
    if (await tabExists(candidate)) {
      tabId = candidate;
      break;
    }
  }
  if (tabId != null) {
    await chrome.tabs.update(tabId, { url, active: true });
  } else {
    tabId = (await chrome.tabs.create({ url })).id;
  }

  lastAdvanceAt = Date.now();
  await updateState({ active: true, currentId: item.id, index, tabId });
  await enterFullscreen();
}

async function stopLoop() {
  await updateState({ active: false });
  await exitFullscreen();
}

async function step(direction) {
  const { playlist, settings, state } = await load();
  const cur = indexOfCurrent(playlist, state);
  const next = pickIndex(playlist, settings, cur, direction);
  if (next === -1) {
    await stopLoop();
    return { ok: true, stopped: true };
  }
  await playAt(next);
  return { ok: true, index: next };
}

async function addItem(id, title) {
  const { playlist } = await load();
  if (playlist.some((p) => p.id === id)) return { ok: false, error: 'Ta pozycja jest już na liście.' };
  playlist.push({ id, title: title || placeholderTitle(id), addedAt: Date.now() });
  await savePlaylist(playlist);
  return { ok: true };
}

async function handle(msg, sender) {
  switch (msg?.type) {
    case 'WHO_AM_I':
      return { tabId: sender.tab?.id ?? null };

    case 'ADD':
      return addItem(String(msg.id), msg.title);

    case 'START': {
      const { playlist, state } = await load();
      if (playlist.length === 0) return { ok: false, error: 'Playlista jest pusta.' };
      const index = Number.isInteger(msg.index) ? msg.index : indexOfCurrent(playlist, state);
      await updateState({ fullscreenPaused: false });
      await playAt(index, msg.tabId);
      return { ok: true };
    }

    case 'STOP':
      await stopLoop();
      return { ok: true };

    case 'EXIT_FULLSCREEN': {
      const { state } = await load();
      if (sender.tab?.id !== state.tabId || state.fullscreenWindowId == null) return { ok: false };
      await updateState({ fullscreenPaused: true });
      await exitFullscreen();
      return { ok: true };
    }

    case 'NEXT':
      return step('next');

    case 'PREV':
      return step('prev');

    case 'VIDEO_ENDED': {
      const { state } = await load();
      if (!state.active || sender.tab?.id !== state.tabId || msg.id !== state.currentId) return { ok: false };
      if (Date.now() - lastAdvanceAt < 3000) return { ok: false };
      return step('auto');
    }

    case 'LOAD_FAILED': {
      // Pozycja nie załadowała się mimo kilku przeładowań: pomijamy ją, także w trybie „jedna pozycja”.
      const { state } = await load();
      if (!state.active || sender.tab?.id !== state.tabId || msg.id !== state.currentId) return { ok: false };
      return step('next');
    }

    default:
      return { ok: false, error: `Nieznany komunikat: ${msg?.type}` };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender).then(sendResponse, (err) => sendResponse({ ok: false, error: String(err?.message || err) }));
  return true;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { state } = await load();
  if (state.tabId === tabId) {
    await updateState({ active: false, tabId: null });
    await exitFullscreen();
  }
});

async function refreshBadge() {
  const { playlist, state } = await load();
  const i = playlist.findIndex((p) => p.id === state.currentId);
  const text = state.active && i !== -1 ? `${i + 1}/${playlist.length}` : '';
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: '#e50914' });
}

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;
  refreshBadge();
  // Przełączenie opcji pełnego ekranu w trakcie trwającej pętli działa od razu.
  const before = changes.settings?.oldValue?.fullscreen;
  const after = changes.settings?.newValue?.fullscreen;
  if (changes.settings && before !== after) {
    const { state } = await load();
    if (!state.active) return;
    if (after) {
      await updateState({ fullscreenPaused: false });
      await enterFullscreen();
    } else {
      await exitFullscreen();
    }
  }
});
chrome.runtime.onStartup.addListener(() =>
  updateState({ active: false, tabId: null, fullscreenWindowId: null, prevWindowState: null, fullscreenPaused: false }),
);
chrome.runtime.onInstalled.addListener(refreshBadge);

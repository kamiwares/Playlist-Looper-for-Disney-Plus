// Shared by the service worker, the popup and content.js (via import()).

export const DEFAULT_SETTINGS = {
  loopMode: 'all', // 'all' | 'one' | 'off'
  shuffle: false,
  creditsOffset: 0, // seconds before the end to move on
  fullscreen: false,
  autoProfile: '', // profile picked on #autostart
};

export const DEFAULT_STATE = {
  active: false,
  currentId: null,
  index: 0,
  tabId: null,
  fullscreenWindowId: null, // window the extension made fullscreen
  prevWindowState: null, // restored on exit
  fullscreenPaused: false, // user left fullscreen: don't re-enter until the next Start
};

export const PLACEHOLDER_PREFIX = 'Netflix #';

export async function load() {
  const d = await chrome.storage.local.get(['playlist', 'settings', 'state']);
  return {
    playlist: Array.isArray(d.playlist) ? d.playlist : [],
    settings: { ...DEFAULT_SETTINGS, ...d.settings },
    state: { ...DEFAULT_STATE, ...d.state },
  };
}

export function savePlaylist(playlist) {
  return chrome.storage.local.set({ playlist });
}

export async function updateSettings(patch) {
  const { settings } = await load();
  const next = { ...settings, ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

export async function updateState(patch) {
  const { state } = await load();
  const next = { ...state, ...patch };
  await chrome.storage.local.set({ state: next });
  return next;
}

// Accepts /watch/<id>, /title/<id>, ?jbv=<id> or a bare ID.
export function parseNetflixId(input) {
  const s = String(input ?? '').trim();
  const m = s.match(/\/watch\/(\d+)/) || s.match(/\/title\/(\d+)/) || s.match(/[?&]jbv=(\d+)/) || s.match(/^(\d+)$/);
  return m ? m[1] : null;
}

// t=0 starts from the beginning instead of resuming.
export function watchUrl(id) {
  return `https://www.netflix.com/watch/${id}?t=0`;
}

export function placeholderTitle(id) {
  return `${PLACEHOLDER_PREFIX}${id}`;
}

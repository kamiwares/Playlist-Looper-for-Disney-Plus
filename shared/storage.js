// Shared by the service worker, the popup and content.js (via import()).

export const DEFAULT_SETTINGS = {
  loopMode: 'all', // 'all' | 'one' | 'off'
  shuffle: false,
  creditsOffset: 0, // seconds before the end to move on
  fullscreen: false,
  autoProfile: '', // profile picked on #autostart
  startOver: true, // play each item from the beginning instead of resuming
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

export const PLACEHOLDER_PREFIX = 'Disney+ #';

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

// Accepts /play/<id>, /video/<id> (with an optional /<locale>/ prefix) or a bare ID.
// Disney+ IDs are UUIDs, older links used shorter alphanumeric IDs.
const ID = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[A-Za-z0-9]{6,})';
const LINK_RE = new RegExp(`/(?:play|video)/${ID}(?:[/?#]|$)`, 'i');
const BARE_RE = new RegExp(`^${ID}$`, 'i');

export function parseDisneyId(input) {
  const s = String(input ?? '').trim();
  const m = s.match(LINK_RE) || s.match(BARE_RE);
  return m ? m[1] : null;
}

export function watchUrl(id) {
  return `https://www.disneyplus.com/play/${id}`;
}

// Titles come from the Disney+ page or user input; keep stored ones short.
const MAX_TITLE_LENGTH = 200;

export function cleanTitle(title) {
  return String(title ?? '').trim().slice(0, MAX_TITLE_LENGTH);
}

export function placeholderTitle(id) {
  return `${PLACEHOLDER_PREFIX}${id.slice(0, 8)}`;
}

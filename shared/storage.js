// Wspólne helpery dla service workera i popupu (ES module).
// Content script nie może importować modułów, więc ma własną, minimalną kopię odczytu.

export const DEFAULT_SETTINGS = {
  loopMode: 'all', // 'all' | 'one' | 'off'
  shuffle: false,
  creditsOffset: 0, // sekundy przed końcem, po których przechodzimy dalej
  fullscreen: false, // okno Chrome w trybie pełnoekranowym podczas pętli
  autoProfile: '', // nazwa profilu Netflix wybierana automatycznie przy starcie z #autostart
};

export const DEFAULT_STATE = {
  active: false,
  currentId: null,
  index: 0,
  tabId: null,
  fullscreenWindowId: null, // okno, które wtyczka przełączyła na pełny ekran
  prevWindowState: null, // stan okna do przywrócenia po wyjściu
  fullscreenPaused: false, // użytkownik wyszedł z pełnego ekranu: nie wracamy do niego aż do kolejnego Startu
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

// Akceptuje pełny URL (/watch/<id> lub /title/<id>) albo samo numeryczne ID.
export function parseNetflixId(input) {
  const s = String(input ?? '').trim();
  const m = s.match(/\/watch\/(\d+)/) || s.match(/\/title\/(\d+)/) || s.match(/[?&]jbv=(\d+)/) || s.match(/^(\d+)$/);
  return m ? m[1] : null;
}

// t=0 wymusza start od początku zamiast wznawiania od ostatniej pozycji.
export function watchUrl(id) {
  return `https://www.netflix.com/watch/${id}?t=0`;
}

export function placeholderTitle(id) {
  return `${PLACEHOLDER_PREFIX}${id}`;
}

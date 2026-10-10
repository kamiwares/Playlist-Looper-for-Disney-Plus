import { load, savePlaylist, updateSettings, parseNetflixId, placeholderTitle, PLACEHOLDER_PREFIX } from './shared/storage.js';
import { t, localize } from './shared/i18n.js';

const $ = (sel) => document.querySelector(sel);
const listEl = $('#list');
const tpl = $('#item-tpl');
const statusEl = $('#status');

let data = { playlist: [], settings: {}, state: {} };
let activeTab = null; // aktywna karta, jeśli to odtwarzacz Netflixa
let editing = false;
let dragFrom = null;
let statusTimer = null;

// Komunikat znika sam: zwykły po 4 s, błąd po 6 s, żeby zdążyć go przeczytać.
function setStatus(text, isError = false) {
  statusEl.textContent = text || '';
  statusEl.classList.toggle('error', isError);
  clearTimeout(statusTimer);
  if (text) statusTimer = setTimeout(() => setStatus(''), isError ? 6000 : 4000);
}

async function send(msg) {
  const res = await chrome.runtime.sendMessage(msg);
  if (res && res.ok === false && res.error) setStatus(res.error, true);
  return res;
}

function move(from, to) {
  // `to` to indeks wstawienia w tablicy przed usunięciem elementu.
  const pl = [...data.playlist];
  const [item] = pl.splice(from, 1);
  if (to > from) to--;
  pl.splice(to, 0, item);
  return savePlaylist(pl);
}

function startEdit(li, i) {
  editing = true;
  const titleEl = li.querySelector('.title');
  const input = document.createElement('input');
  input.value = data.playlist[i].title;
  titleEl.replaceChildren(input);
  li.draggable = false;
  input.focus();
  input.select();

  let done = false;
  const finish = async (save) => {
    if (done) return;
    done = true;
    editing = false;
    const title = input.value.trim();
    if (save && title && title !== data.playlist[i].title) {
      const pl = [...data.playlist];
      pl[i] = { ...pl[i], title };
      await savePlaylist(pl);
    } else {
      render();
    }
  };
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

function clearDropMarks() {
  listEl.querySelectorAll('.drop-before, .drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
}

function renderList() {
  const { playlist, state } = data;
  $('#empty').hidden = playlist.length > 0;
  listEl.replaceChildren(
    ...playlist.map((item, i) => {
      const li = tpl.content.firstElementChild.cloneNode(true);
      li.querySelector('.num').textContent = `${i + 1}.`;
      const titleEl = li.querySelector('.title');
      const placeholder = item.title.startsWith(PLACEHOLDER_PREFIX);
      titleEl.textContent = item.title;
      titleEl.title = placeholder
        ? t('placeholderTooltip', item.id)
        : `${item.title}\nID: ${item.id}`;
      titleEl.classList.toggle('placeholder', placeholder);
      if (placeholder) {
        const hint = document.createElement('small');
        hint.className = 'hint';
        hint.textContent = t('placeholderHint');
        titleEl.append(hint);
      }
      li.classList.toggle('current', state.active && state.currentId === item.id);
      li.querySelector('.up').disabled = i === 0;
      li.querySelector('.down').disabled = i === playlist.length - 1;

      li.addEventListener('click', () => send({ type: 'START', index: i, tabId: activeTab?.id }));
      li.querySelector('.up').addEventListener('click', (e) => { e.stopPropagation(); move(i, i - 1); });
      li.querySelector('.down').addEventListener('click', (e) => { e.stopPropagation(); move(i, i + 2); });
      li.querySelector('.edit').addEventListener('click', (e) => { e.stopPropagation(); startEdit(li, i); });
      li.querySelector('.del').addEventListener('click', (e) => {
        e.stopPropagation();
        savePlaylist(playlist.filter((_, j) => j !== i));
      });

      li.addEventListener('dragstart', (e) => {
        dragFrom = i;
        li.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(i));
      });
      li.addEventListener('dragend', () => {
        dragFrom = null;
        li.classList.remove('dragging');
        clearDropMarks();
      });
      li.addEventListener('dragover', (e) => {
        if (dragFrom === null) return;
        e.preventDefault();
        const after = e.offsetY > li.offsetHeight / 2;
        clearDropMarks();
        li.classList.add(after ? 'drop-after' : 'drop-before');
      });
      li.addEventListener('drop', (e) => {
        if (dragFrom === null) return;
        e.preventDefault();
        const after = li.classList.contains('drop-after');
        const from = dragFrom;
        clearDropMarks();
        move(from, after ? i + 1 : i);
      });
      return li;
    }),
  );
}

function render() {
  if (editing) return; // nie niszczymy pola edycji przy zmianach z innych źródeł
  const { playlist, settings, state } = data;
  renderList();

  const toggle = $('#toggle');
  toggle.textContent = t(state.active ? 'stop' : 'start');
  toggle.disabled = playlist.length === 0;
  $('#prev').disabled = $('#next').disabled = playlist.length === 0;

  $('#loopMode').value = settings.loopMode;
  $('#shuffle').checked = settings.shuffle;
  $('#fullscreen').checked = settings.fullscreen;
  if (document.activeElement !== $('#creditsOffset')) $('#creditsOffset').value = settings.creditsOffset;

  const addCurrent = $('#add-current');
  const currentId = activeTab ? parseNetflixId(activeTab.url) : null;
  const already = currentId && playlist.some((p) => p.id === currentId);
  addCurrent.disabled = !currentId || already;
  addCurrent.textContent = t(already ? 'addCurrentDone' : 'addCurrent');
}

async function refresh() {
  data = await load();
  render();
}

async function addById(id, title) {
  const res = await send({ type: 'ADD', id, title: title || placeholderTitle(id) });
  if (res?.ok) setStatus(t('statusAdded'));
  return res;
}

// ---------- Zdarzenia ----------
$('#toggle').addEventListener('click', () => {
  setStatus('');
  send(data.state.active ? { type: 'STOP' } : { type: 'START', tabId: activeTab?.id });
});
$('#next').addEventListener('click', () => send({ type: 'NEXT' }));
$('#prev').addEventListener('click', () => send({ type: 'PREV' }));

$('#add-current').addEventListener('click', async () => {
  const id = parseNetflixId(activeTab?.url);
  if (!id) return;
  let title = null;
  try {
    const res = await chrome.tabs.sendMessage(activeTab.id, { type: 'GET_CURRENT' });
    title = res?.title;
  } catch {
    // karta mogła zostać otwarta przed instalacją wtyczki: tytuł uzupełni się później
  }
  addById(id, title);
});

$('#add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#add-input');
  const id = parseNetflixId(input.value);
  if (!id) {
    setStatus(t('statusBadLink'), true);
    return;
  }
  const res = await addById(id);
  if (res?.ok) input.value = '';
});

$('#loopMode').addEventListener('change', (e) => updateSettings({ loopMode: e.target.value }));
$('#shuffle').addEventListener('change', (e) => updateSettings({ shuffle: e.target.checked }));
$('#fullscreen').addEventListener('change', (e) => updateSettings({ fullscreen: e.target.checked }));
$('#creditsOffset').addEventListener('change', (e) => {
  const v = Math.max(0, Math.min(900, Math.round(Number(e.target.value) || 0)));
  e.target.value = v;
  updateSettings({ creditsOffset: v });
});

$('#export').addEventListener('click', async () => {
  const json = JSON.stringify(data.playlist.map(({ id, title }) => ({ id, title })), null, 2);
  $('#io').value = json;
  try {
    await navigator.clipboard.writeText(json);
    setStatus(t('statusCopied'));
  } catch {
    setStatus(t('statusInTextarea'));
  }
});

$('#import').addEventListener('click', async () => {
  let parsed;
  try {
    parsed = JSON.parse($('#io').value);
    if (!Array.isArray(parsed)) throw new Error();
  } catch {
    setStatus(t('statusBadJson'), true);
    return;
  }
  const seen = new Set();
  const pl = [];
  for (const entry of parsed) {
    const id = parseNetflixId(typeof entry === 'object' && entry ? entry.id : entry);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const title = typeof entry?.title === 'string' && entry.title.trim() ? entry.title.trim() : placeholderTitle(id);
    pl.push({ id, title, addedAt: Date.now() });
  }
  await savePlaylist(pl);
  setStatus(t('statusImported', pl.length));
});

let clearArmed = false;
$('#clear').addEventListener('click', async (e) => {
  if (!clearArmed) {
    clearArmed = true;
    e.target.textContent = t('clearConfirm');
    setTimeout(() => { clearArmed = false; e.target.textContent = t('clear'); }, 3000);
    return;
  }
  clearArmed = false;
  e.target.textContent = t('clear');
  await send({ type: 'STOP' });
  await savePlaylist([]);
  setStatus(t('statusCleared'));
});

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'local') refresh();
});

document.documentElement.lang = chrome.i18n.getUILanguage();
localize();
localize(tpl.content); // szablon pozycji listy, zanim zostanie sklonowany

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url && /^https:\/\/www\.netflix\.com\/watch\/\d+/.test(tab.url)) activeTab = tab;
  await refresh();
})();

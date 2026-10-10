// Ikony SVG z Font Awesome Free (icons/fa/*.svg, licencja CC BY 4.0).
// Element .icon jest maską w kolorze tekstu (currentColor), więc ikona dziedziczy kolor przycisku.
// Content script ma własną kopię setIcon(), bo nie może importować modułów.

export function setIcon(el, name) {
  el.style.setProperty('--icon', `url("${chrome.runtime.getURL(`icons/fa/${name}.svg`)}")`);
}

export function applyIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => setIcon(el, el.dataset.icon));
}

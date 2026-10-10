// Used by the service worker, the popup and content.js (via import()).

export function t(key, ...subs) {
  return chrome.i18n.getMessage(key, subs.map(String)) || key;
}

// Fills elements marked with data-i18n / data-i18n-<attr>.
export function localize(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  for (const attr of ['title', 'placeholder', 'aria-label']) {
    root.querySelectorAll(`[data-i18n-${attr}]`).forEach((el) => {
      el.setAttribute(attr, t(el.getAttribute(`data-i18n-${attr}`)));
    });
  }
}

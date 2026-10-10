// Tłumaczenia z _locales/<język>/messages.json (ES module dla service workera i popupu).
// Content script ma własną jednolinijkową kopię t(), bo nie może importować modułów.

export function t(key, ...subs) {
  return chrome.i18n.getMessage(key, subs.map(String)) || key;
}

// Podmienia teksty elementów oznaczonych data-i18n / data-i18n-<atrybut>.
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

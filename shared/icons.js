// Font Awesome Free icons (CC BY 4.0) rendered as CSS masks in currentColor.
// content.js keeps its own copy of setIcon().

export function setIcon(el, name) {
  el.style.setProperty('--icon', `url("${chrome.runtime.getURL(`icons/fa/${name}.svg`)}")`);
}

export function applyIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => setIcon(el, el.dataset.icon));
}

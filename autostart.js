// Działa od początku ładowania strony (document_start), zanim Netflix (SPA) zdąży przepisać adres
// i zgubić znacznik. Zapamiętuje #autostart w sessionStorage; content.js uruchamia potem pętlę.
if (location.hash === '#autostart') {
  sessionStorage.setItem('nlp-autostart', '1');
  history.replaceState(null, '', location.pathname + location.search); // odświeżenie nie uruchomi pętli ponownie
}

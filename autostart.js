// Runs at document_start: Netflix's redirect and routing can drop the hash before content.js loads.
if (location.hash === '#autostart') {
  sessionStorage.setItem('nlp-autostart', '1');
  history.replaceState(null, '', location.pathname + location.search); // a reload won't restart the loop
}

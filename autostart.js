// Runs at document_start: Disney+'s redirect and routing can drop the hash before content.js loads.
if (location.hash === '#autostart') {
  sessionStorage.setItem('dlp-autostart', '1');
  history.replaceState(null, '', location.pathname + location.search); // a reload won't restart the loop
}

// Registers the service worker so the app can be installed and opened offline.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* not available (e.g. file://) */ });
  });
}

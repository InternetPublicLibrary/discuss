// Records the widget's DOM events for the tests (no inline script: the host page runs under a strict CSP).
window.discussEvents = [];
for (const type of ['discuss:ready', 'discuss:error', 'discuss:metadata']) {
  document.addEventListener(type, (event) => window.discussEvents.push({ type, detail: event.detail }));
}

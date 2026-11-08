/* Independent Performance look; global appearance remains managed by app.js. */
(function () {
  'use strict';
  const root = document.documentElement;
  const pick = document.getElementById('performance-look');
  const appearance = document.getElementById('theme');
  if (!pick || !appearance) return;
  const KEY = 'jdxi-performance-look-v1';
  const allowed = new Set(['auto', 'light', 'dark']);
  function update() {
    const selected = allowed.has(pick.value) ? pick.value : 'auto';
    const appTheme = root.dataset.theme;
    const dark = selected === 'dark' || (selected === 'auto' && (appTheme === 'ko-dark' || appTheme === 'dark'));
    root.dataset.performanceLook = dark ? 'dark' : 'light';
  }
  let saved = 'auto';
  try { saved = localStorage.getItem(KEY) || 'auto'; } catch (_) {}
  pick.value = allowed.has(saved) ? saved : 'auto';
  pick.addEventListener('change', function () {
    update();
    try { localStorage.setItem(KEY, pick.value); } catch (_) {}
  });
  appearance.addEventListener('change', update);
  // Future appearance updates can also come from application state changes.
  new MutationObserver(update).observe(root, {attributes: true, attributeFilter: ['data-theme']});
  update();
})();

/* UI size control: independent of MIDI and the main app boot sequence. */
(function () {
  'use strict';
  const KEY = 'jdxi-ui-scale-v1';
  const select = document.getElementById('ui-scale');
  if (!select) return;
  function isValid(value) {
    if (value === 'auto') return true;
    const n = Number(value);
    return Number.isInteger(n) && n >= 50 && n <= 150 && n % 10 === 0 && String(n) === value;
  }
  function apply(value) {
    const safe = isValid(value) ? value : 'auto';
    select.value = safe;
    // CSS zoom participates in layout, unlike transform: scale(), which
    // would leave empty space and misalign touch/pointer coordinates.
    document.body.style.zoom = safe === 'auto' ? '1' : String(Number(safe) / 100);
    document.documentElement.dataset.uiScale = safe;
    window.dispatchEvent(new Event('jdxi-layout'));
  }
  let saved = 'auto';
  try { saved = localStorage.getItem(KEY) || 'auto'; } catch (_) {}
  apply(saved);
  select.addEventListener('change', function () {
    apply(select.value);
    try { localStorage.setItem(KEY, select.value); } catch (_) {}
  });
})();

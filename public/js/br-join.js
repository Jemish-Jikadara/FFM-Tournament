(function () {
  const checkboxes = document.querySelectorAll('.player-cb:not([disabled])');
  const counter = document.getElementById('selection-count');
  const submitBtn = document.getElementById('submit-btn');
  if (!counter || !submitBtn) return;

  const REQUIRED = parseInt(document.querySelector('form').getAttribute('data-required') || '3', 10);

  function updateCount() {
    const checked = document.querySelectorAll('.player-cb:not([disabled]):checked').length;
    counter.textContent = checked + ' / ' + REQUIRED + ' selected';
    if (checked === REQUIRED) {
      counter.classList.remove('text-amber-400');
      counter.classList.add('text-emerald-400');
      submitBtn.disabled = false;
      submitBtn.classList.remove('opacity-50');
    } else {
      counter.classList.remove('text-emerald-400');
      counter.classList.add('text-amber-400');
      submitBtn.disabled = true;
      submitBtn.classList.add('opacity-50');
    }
  }

  checkboxes.forEach(cb => cb.addEventListener('change', function () {
    const checked = document.querySelectorAll('.player-cb:not([disabled]):checked').length;
    if (this.checked && checked > REQUIRED) this.checked = false;
    updateCount();
  }));

  updateCount();
})();
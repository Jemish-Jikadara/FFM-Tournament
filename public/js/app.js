/* ClashIQ client-side helpers (no inline scripts, CSP-safe) */
(function () {
  'use strict';
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var pad = function (n) { return String(n).padStart(2, '0'); };

  // ---- countdowns: <span data-countdown="ISO_DATE" data-reload> ----
  var timers = $$('[data-countdown]');
  if (timers.length) {
    var tick = function () {
      var now = Date.now();
      timers.forEach(function (el) {
        var diff = new Date(el.getAttribute('data-countdown')).getTime() - now;
        if (isNaN(diff)) return;
        if (diff <= 0) {
          if (!el.dataset.ended) {
            el.dataset.ended = '1';
            el.textContent = 'Time reached';
            el.className = 'font-semibold text-rose-400 uppercase tracking-wider';
            // If the timer hit zero while the page was open, refresh so status / room details update.
            if (el.hasAttribute('data-reload') && el.dataset.started) setTimeout(function () { location.reload(); }, 1500);
          }
          return;
        }
        el.dataset.started = '1';
        var h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
        el.textContent = pad(h) + ':' + pad(m) + ':' + pad(s);
      });
    };
    tick();
    setInterval(tick, 1000);
  }

  // ---- copy to clipboard: <button data-copy="text"> ----
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-copy]');
    if (!btn) return;
    var text = btn.getAttribute('data-copy');
    var done = function () {
      var old = btn.innerHTML;
      btn.textContent = 'Copied';
      setTimeout(function () { btn.innerHTML = old; }, 1800);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () {});
    } else {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (err) { /* ignore */ }
      document.body.removeChild(ta);
    }
  });

  // ---- wallet modal ----
  var modal = document.getElementById('wallet-modal');
  if (modal) {
    var setTab = function (name) {
      $$('[data-panel]', modal).forEach(function (p) { p.classList.toggle('hidden', p.getAttribute('data-panel') !== name); });
      $$('[data-tab]', modal).forEach(function (t) {
        var on = t.getAttribute('data-tab') === name;
        t.className = 'rounded-lg py-2 text-xs font-bold uppercase tracking-wider cursor-pointer ' +
          (on ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700');
      });
    };
    var open = function (tab) { setTab(tab || 'deposit'); modal.classList.remove('hidden'); };
    var close = function () { modal.classList.add('hidden'); };
    document.addEventListener('click', function (e) {
      var o = e.target.closest('[data-open-wallet]');
      if (o) { open(o.getAttribute('data-open-wallet')); return; }
      if (e.target.closest('[data-close-modal]') || e.target === modal) { close(); return; }
      var t = e.target.closest('[data-tab]');
      if (t && modal.contains(t)) setTab(t.getAttribute('data-tab'));
      var a = e.target.closest('[data-amount]');
      if (a) { var inp = document.getElementById('dep-amount'); if (inp) inp.value = a.getAttribute('data-amount'); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    setTab('deposit');
  }

  // ---- confirm dialogs: <form data-confirm="Are you sure?"> ----
  document.addEventListener('submit', function (e) {
    var msg = e.target.getAttribute && e.target.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) e.preventDefault();
  });

  // ---- disable submit buttons after click (prevents double payments / joins) ----
  document.addEventListener('submit', function (e) {
    if (e.defaultPrevented) return;
    $$('button[type="submit"]', e.target).forEach(function (b) {
      setTimeout(function () { b.disabled = true; b.classList.add('opacity-60'); }, 0);
    });
  });

  // re-enable buttons if the page is restored from the back/forward cache
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) $$('button[type="submit"]').forEach(function (b) { b.disabled = false; b.classList.remove('opacity-60'); });
  });

  // ---- auto-submit filters: <select data-autosubmit> ----
  $$('[data-autosubmit]').forEach(function (el) {
    el.addEventListener('change', function () { el.form.submit(); });
  });

  // ---- match form: picking a mode fills max players ----
  var modeSel = document.querySelector('[data-mode-select]');
  if (modeSel) {
    modeSel.addEventListener('change', function () {
      var opt = modeSel.options[modeSel.selectedIndex];
      var max = document.querySelector('[name="max_players"]');
      if (max && opt) max.value = opt.getAttribute('data-max');
    });
  }

  // ---- fade out flash messages ----
  $$('[data-flash]').forEach(function (el) {
    setTimeout(function () { el.style.transition = 'opacity .5s'; el.style.opacity = '0'; setTimeout(function () { el.remove(); }, 600); }, 7000);
  });
})();

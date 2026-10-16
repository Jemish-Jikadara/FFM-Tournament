/* FFM client-side helpers (no inline scripts, CSP-safe) */
(function () {
  'use strict';

  var $$ = function (s, r) {
    return Array.prototype.slice.call((r || document).querySelectorAll(s));
  };
  var pad = function (n) {
    return String(n).padStart(2, '0');
  };

  // ============================================================
  // COUNTDOWNS
  // ============================================================
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
            if (el.hasAttribute('data-reload') && el.dataset.started) {
              setTimeout(function () {
                location.reload();
              }, 1500);
            }
          }
          return;
        }
        el.dataset.started = '1';
        var h = Math.floor(diff / 3600000);
        var m = Math.floor((diff % 3600000) / 60000);
        var s = Math.floor((diff % 60000) / 1000);
        el.textContent = pad(h) + ':' + pad(m) + ':' + pad(s);
      });
    };
    tick();
    setInterval(tick, 1000);
  }

  // ============================================================
  // COPY TO CLIPBOARD — <button data-copy="text">
  // ============================================================
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-copy]');
    if (!btn) return;
    var text = btn.getAttribute('data-copy');
    var done = function () {
      var old = btn.innerHTML;
      btn.textContent = 'Copied';
      setTimeout(function () {
        btn.innerHTML = old;
      }, 1800);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () {});
    } else {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        done();
      } catch (err) {
        /* ignore */
      }
      document.body.removeChild(ta);
    }
  });

  // ============================================================
  // WALLET MODAL
  // ============================================================
  var modal = document.getElementById('wallet-modal');
  if (modal) {
    var setTab = function (name) {
      $$('[data-panel]', modal).forEach(function (p) {
        p.classList.toggle('hidden', p.getAttribute('data-panel') !== name);
      });
      $$('[data-tab]', modal).forEach(function (t) {
        var on = t.getAttribute('data-tab') === name;
        t.className =
          'rounded-lg py-2 text-xs font-bold uppercase tracking-wider cursor-pointer ' +
          (on
            ? 'bg-emerald-600 text-white'
            : 'bg-slate-800 text-slate-300 hover:bg-slate-700');
      });
    };
    var open = function (tab) {
      setTab(tab || 'deposit');
      modal.classList.remove('hidden');
    };
    var close = function () {
      modal.classList.add('hidden');
    };
    document.addEventListener('click', function (e) {
      var o = e.target.closest('[data-open-wallet]');
      if (o) {
        open(o.getAttribute('data-open-wallet'));
        return;
      }
      if (e.target.closest('[data-close-modal]') || e.target === modal) {
        close();
        return;
      }
      var t = e.target.closest('[data-tab]');
      if (t && modal.contains(t)) setTab(t.getAttribute('data-tab'));
      var a = e.target.closest('[data-amount]');
      if (a) {
        var inp = document.getElementById('dep-amount');
        if (inp) inp.value = a.getAttribute('data-amount');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
    setTab('deposit');
  }

  // ============================================================
  // CONFIRM DIALOGS — <form data-confirm="msg">
  // ============================================================
  document.addEventListener('submit', function (e) {
    var msg =
      e.target.getAttribute && e.target.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) e.preventDefault();
  });

  // ============================================================
  // DISABLE SUBMIT BUTTONS (prevent double payments)
  // ============================================================
  document.addEventListener('submit', function (e) {
    if (e.defaultPrevented) return;
    $$('button[type="submit"]', e.target).forEach(function (b) {
      setTimeout(function () {
        b.disabled = true;
        b.classList.add('opacity-60');
      }, 0);
    });
  });

  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      $$('button[type="submit"]').forEach(function (b) {
        b.disabled = false;
        b.classList.remove('opacity-60');
      });
    }
  });

  // ============================================================
  // AUTO-SUBMIT FILTERS — <select data-autosubmit>
  // ============================================================
  $$('[data-autosubmit]').forEach(function (el) {
    el.addEventListener('change', function () {
      if (el.form) el.form.submit();
    });
  });

  // ============================================================
  // AUTO-SUBMIT FILE INPUTS — <input type="file" data-auto-submit>
  // CSP-safe replacement for inline onchange
  // ============================================================
  document.addEventListener('change', function (e) {
    if (e.target.matches('[data-auto-submit]')) {
      var form = e.target.closest('form');
      if (form) form.submit();
    }
  });

  // ============================================================
  // MATCH FORM: Mode selection fills max players / toggles tournament
  // ============================================================
  var modeSel = document.querySelector('[data-mode-select]');
  if (modeSel) {
    var TOURNAMENT_MODES = ['br-squad-tournament'];

    var maxPlayersWrap = document.getElementById('max-players-wrap');
    var maxTeamsWrap = document.getElementById('max-teams-wrap');
    var tournamentExtra = document.getElementById('tournament-extra');
    var maxPlayersInput = document.getElementById('max_players');

    var toggleTournamentFields = function () {
      var isTournament = TOURNAMENT_MODES.indexOf(modeSel.value) !== -1;

      if (isTournament) {
        if (maxPlayersWrap) maxPlayersWrap.classList.add('hidden');
        if (maxTeamsWrap) maxTeamsWrap.classList.remove('hidden');
        if (tournamentExtra) tournamentExtra.classList.remove('hidden');
        if (maxPlayersInput) maxPlayersInput.removeAttribute('required');
      } else {
        if (maxPlayersWrap) maxPlayersWrap.classList.remove('hidden');
        if (maxTeamsWrap) maxTeamsWrap.classList.add('hidden');
        if (tournamentExtra) tournamentExtra.classList.add('hidden');
        if (maxPlayersInput) maxPlayersInput.setAttribute('required', 'required');
      }
    };

    // Auto-fill max players on mode change (regular modes only)
    modeSel.addEventListener('change', function () {
      var opt = modeSel.options[modeSel.selectedIndex];
      var max = document.querySelector('[name="max_players"]');
      if (max && opt) max.value = opt.getAttribute('data-max');
      toggleTournamentFields();
    });

    // Initial state
    toggleTournamentFields();
  }

  // ============================================================
  // FADE OUT FLASH MESSAGES
  // ============================================================
  $$('[data-flash]').forEach(function (el) {
    setTimeout(function () {
      el.style.transition = 'opacity .5s';
      el.style.opacity = '0';
      setTimeout(function () {
        el.remove();
      }, 600);
    }, 7000);
  });

  // ============================================================
  // POINT TABLES MODAL
  // ============================================================
  document.addEventListener('click', function (e) {
    // Open modal
    if (e.target.closest('[data-open-point-tables]')) {
      var ptModal = document.getElementById('point-tables-modal');
      if (ptModal) {
        ptModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
      }
      return;
    }

    // Close modal — button
    if (e.target.closest('[data-close-point-tables]')) {
      var m1 = document.getElementById('point-tables-modal');
      if (m1) {
        m1.classList.add('hidden');
        document.body.style.overflow = '';
      }
      return;
    }

    // Close modal — backdrop click
    if (e.target.id === 'point-tables-modal') {
      e.target.classList.add('hidden');
      document.body.style.overflow = '';
    }
  });

  // ESC key closes point-tables modal
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var m2 = document.getElementById('point-tables-modal');
      if (m2 && !m2.classList.contains('hidden')) {
        m2.classList.add('hidden');
        document.body.style.overflow = '';
      }
    }
  });
})();
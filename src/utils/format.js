const env = require('../config/env');

function paise(amount) {
  const n = Number(amount) || 0;
  return '₹' + (n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function date(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  return dt.toLocaleString('en-IN', {
    timeZone: env.timezone, month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

// "YYYY-MM-DDTHH:mm" in the app timezone, for <input type="datetime-local">
function toInput(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: env.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(dt).reduce((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// datetime-local string (no tz) -> Date, interpreted in APP_TZ_OFFSET
function fromInput(str) {
  if (!str) return null;
  const s = String(str).length === 16 ? `${str}:00` : String(str);
  const dt = new Date(`${s}${env.tzOffset}`);
  return isNaN(dt) ? null : dt;
}

function rupeesToPaise(v) {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  if (!isFinite(n) || n < 0) return NaN;
  return Math.round(n * 100);
}

function statusLabel(s) {
  return String(s || '').replace(/_/g, ' ');
}

module.exports = { paise, date, toInput, fromInput, rupeesToPaise, statusLabel };

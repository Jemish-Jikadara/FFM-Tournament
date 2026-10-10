// Tailwind class helpers. (Kept under src/ so Tailwind's content scan sees the class names.)
const PILL = {
  LIVE: 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse',
  DONE: 'bg-slate-800 text-slate-400',
  FULL: 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
  OPEN: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  BAD: 'bg-rose-500/10 text-rose-400 border border-rose-500/30',
};

function statusPill(status) {
  if (['IN_PROGRESS', 'ROOM_READY'].includes(status)) return PILL.LIVE;
  if (status === 'COMPLETED') return PILL.DONE;
  if (status === 'CANCELLED') return PILL.BAD;
  if (['FULL', 'REGISTRATION_CLOSED', 'RESULT_SUBMITTED'].includes(status)) return PILL.FULL;
  return PILL.OPEN;
}

function roleBadge(role) {
  if (role === 'SUPER_ADMIN') return 'bg-rose-500/10 text-rose-400 border border-rose-500/30';
  if (role === 'ADMIN') return 'bg-amber-500/10 text-amber-400 border border-amber-500/30';
  if (role === 'MATCH_HOST' || role === 'SUPPORT') return 'bg-blue-500/10 text-blue-400 border border-blue-500/30';
  return 'bg-slate-800 text-slate-300 border border-slate-700';
}

function stateBadge(state) {
  if (['ACTIVE', 'VERIFIED', 'RESOLVED', 'COMPLETED'].includes(state)) return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
  if (['PENDING', 'OPEN'].includes(state)) return 'bg-amber-500/10 text-amber-400 border border-amber-500/30';
  return 'bg-rose-500/10 text-rose-400 border border-rose-500/30';
}

module.exports = { statusPill, roleBadge, stateBadge };

// Match form — Tournament mode toggle
(function () {
  const modeSelect = document.querySelector('[data-mode-select]');
  if (!modeSelect) return;

  const TOURNAMENT_MODES = ['br-squad-tournament'];

  const maxPlayersWrap = document.getElementById('max-players-wrap');
  const maxTeamsWrap = document.getElementById('max-teams-wrap');
  const tournamentExtra = document.getElementById('tournament-extra');
  const maxPlayersInput = document.getElementById('max_players');

  function toggleTournament() {
    const isTournament = TOURNAMENT_MODES.includes(modeSelect.value);

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
  }

  modeSelect.addEventListener('change', toggleTournament);
  toggleTournament();
})();
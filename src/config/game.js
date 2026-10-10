// Game modes, maps and enums shared by seed, forms, filters and validation.
const MODES = [
  { slug: 'solo', name: 'Solo Battle Royale', format: 'SOLO', teamSize: 1, maxPlayers: 48 },
  { slug: 'lone-wolf-1v1', name: 'Lone Wolf 1v1', format: '1v1', teamSize: 1, maxPlayers: 2 },
  { slug: 'lone-wolf-2v2', name: 'Lone Wolf 2v2', format: '2v2', teamSize: 2, maxPlayers: 4 },
  { slug: 'clash-squad-1v1', name: 'Clash Squad 1v1', format: '1v1', teamSize: 1, maxPlayers: 2 },
  { slug: 'clash-squad-2v2', name: 'Clash Squad 2v2', format: '2v2', teamSize: 2, maxPlayers: 4 },
  { slug: 'clash-squad-4v4', name: 'Clash Squad 4v4', format: '4v4', teamSize: 4, maxPlayers: 8 },
];

const MAPS = ['Bermuda', 'Purgatory', 'Kalahari', 'Alpine', 'Nexterra', 'Iron Cage'];
const FORMATS = ['1v1', '2v2', '4v4', 'SOLO'];

const ROLES = ['PLAYER', 'MATCH_HOST', 'SUPPORT', 'ADMIN', 'SUPER_ADMIN'];
const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN', 'MATCH_HOST'];
const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'BANNED'];

const STATUS_FILTERS = [
  { label: 'All Statuses', value: 'ALL' },
  { label: 'Registering', value: 'REGISTRATION_OPEN' },
  { label: 'Scheduled', value: 'SCHEDULED' },
  { label: 'Full', value: 'FULL' },
  { label: 'Room Ready / Live', value: 'ROOM_READY' },
  { label: 'In Progress', value: 'IN_PROGRESS' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

const modeBySlug = (slug) => MODES.find((m) => m.slug === slug);

module.exports = { MODES, MAPS, FORMATS, ROLES, ADMIN_ROLES, USER_STATUSES, STATUS_FILTERS, modeBySlug };

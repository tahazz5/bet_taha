const path = require('path');

const DATA_FILE = path.join(__dirname, 'server-state.json');
const DIST_PATH = path.join(__dirname, '..', 'dist');
const AUTH_SECRET = process.env.AUTH_SECRET || 'bet-taha-secret';

const DEFAULT_STATE = {
  players: [
    { id: 1, name: 'Taha', balance: 500, role: 'Host', pin: '1234', createdAt: new Date().toISOString() },
    { id: 2, name: 'Mina', balance: 500, role: 'Invitee', pin: '1234', createdAt: new Date().toISOString() },
    { id: 3, name: 'Yassine', balance: 500, role: 'Invitee', pin: '1234', createdAt: new Date().toISOString() },
  ],
  bets: [],
  combines: [],
  matches: [],
  selectedPlayerId: 1,
};

const ALLOWED_SPORTS = new Set([
  'soccer_epl',
  'soccer_france_ligue_one',
  'soccer_spain_la_liga',
  'soccer_italy_serie_a',
  'soccer_germany_bundesliga',
  'soccer_uefa_champs_league',
  'soccer_fifa_world_cup',
]);

const ALLOWED_REGIONS = new Set(['us', 'us2', 'uk', 'eu', 'au']);
const PORT = Number(process.env.PORT || 8001);

module.exports = {
  DATA_FILE,
  DIST_PATH,
  AUTH_SECRET,
  DEFAULT_STATE,
  ALLOWED_SPORTS,
  ALLOWED_REGIONS,
  PORT,
};

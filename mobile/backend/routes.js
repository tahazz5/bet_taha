const express = require('express');
const { getState, setState } = require('./state');
const { createToken, authMiddleware } = require('./auth');
const { fetchOdds } = require('./odds');
const { DEFAULT_STATE } = require('./config');

const router = express.Router();

router.post('/auth/login', (req, res) => {
  const { name, pin } = req.body;
  if (!name || !pin) {
    return res.status(400).json({ error: 'Name and PIN are required' });
  }
  const user = getState().players.find((player) => player.name.toLowerCase() === String(name).toLowerCase());
  if (!user || user.pin !== String(pin)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = createToken(user.id);
  return res.json({ token, player: user, state: getState() });
});

router.get('/auth/me', authMiddleware, (req, res) => {
  const user = getState().players.find((player) => player.id === req.auth.playerId);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({ player: user });
});

router.get('/odds', async (req, res) => {
  try {
    const apiKey = process.env.EXPO_PUBLIC_ODDS_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'Missing EXPO_PUBLIC_ODDS_API_KEY' });
    }
    const data = await fetchOdds(req.query.sport, req.query.region, apiKey);
    res.set('Cache-Control', 'no-store');
    res.json(data);
  } catch (error) {
    const status = error.response?.status ?? 500;
    res.status(status).json({ error: error.response?.data?.message || error.message, source: 'the-odds-api' });
  }
});

router.get('/health', (req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

router.get('/state', authMiddleware, (req, res) => {
  res.json(getState());
});

router.post('/state', authMiddleware, (req, res) => {
  const { players, bets, combines, matches, selectedPlayerId } = req.body;
  if (!Array.isArray(players) || !Array.isArray(bets) || !Array.isArray(combines) || !Array.isArray(matches)) {
    return res.status(400).json({ error: 'Invalid state payload' });
  }
  setState({
    players,
    bets,
    combines,
    matches,
    selectedPlayerId: Number(selectedPlayerId) || getState().selectedPlayerId,
  });
  res.json(getState());
});

router.post('/state/reset', authMiddleware, (req, res) => {
  setState(DEFAULT_STATE);
  res.json(getState());
});

module.exports = router;

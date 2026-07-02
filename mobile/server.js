const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const distPath = path.join(__dirname, 'dist');
const ALLOWED_SPORTS = new Set([
  'soccer_epl',
  'soccer_france_ligue_one',
  'soccer_spain_la_liga',
  'soccer_italy_serie_a',
  'soccer_germany_bundesliga',
  'soccer_uefa_champs_league',
]);
const ALLOWED_REGIONS = new Set(['us', 'us2', 'uk', 'eu', 'au']);

app.use(cors({ origin: true, credentials: true }));
app.use(express.static(distPath, { index: false }));

app.get('/api/odds', async (req, res) => {
  try {
    const apiKey = process.env.EXPO_PUBLIC_ODDS_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'Missing EXPO_PUBLIC_ODDS_API_KEY' });
    }

    const sport = ALLOWED_SPORTS.has(String(req.query.sport)) ? String(req.query.sport) : 'soccer_epl';
    const region = ALLOWED_REGIONS.has(String(req.query.region)) ? String(req.query.region) : 'eu';
    const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds`;
    const response = await axios.get(url, {
      timeout: 20000,
      params: {
        apiKey,
        regions: region,
        markets: 'h2h',
        oddsFormat: 'decimal',
      },
    });

    res.set('Cache-Control', 'no-store');
    res.json({
      source: 'the-odds-api',
      sport,
      region,
      fetchedAt: new Date().toISOString(),
      requestsRemaining: response.headers['x-requests-remaining'],
      requestsUsed: response.headers['x-requests-used'],
      events: response.data,
    });
  } catch (error) {
    const status = error.response?.status ?? 500;
    res.status(status).json({
      error: error.response?.data?.message || error.message,
      source: 'the-odds-api',
    });
  }
});

app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const port = Number(process.env.PORT || 8001);
app.listen(port, '0.0.0.0', () => {
  console.log(`Web app and proxy listening on port ${port}`);
});

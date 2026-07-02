const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const distPath = path.join(__dirname, 'dist');

app.use(cors({ origin: true, credentials: true }));
app.use(express.static(distPath, { index: false }));

app.get('/api/odds', async (req, res) => {
  try {
    const apiKey = process.env.EXPO_PUBLIC_ODDS_API_KEY || '9d1bc3c0e52bb162b442145b1fd80990';
    const url = `https://api.the-odds-api.com/v4/sports/soccer_epl/odds?regions=uk&markets=h2h&oddsFormat=decimal&apiKey=${apiKey}`;
    const response = await axios.get(url, { timeout: 20000 });
    res.set('Cache-Control', 'no-store');
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const port = Number(process.env.PORT || 8001);
app.listen(port, '0.0.0.0', () => {
  console.log(`Web app and proxy listening on port ${port}`);
});

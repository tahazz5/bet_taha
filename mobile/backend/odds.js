const axios = require('axios');
const { ALLOWED_SPORTS, ALLOWED_REGIONS } = require('./config');

const fetchOdds = async (sport, region, apiKey) => {
  const selectedSport = ALLOWED_SPORTS.has(String(sport)) ? String(sport) : 'soccer_epl';
  const selectedRegion = ALLOWED_REGIONS.has(String(region)) ? String(region) : 'eu';
  const url = `https://api.the-odds-api.com/v4/sports/${selectedSport}/odds`;
  const response = await axios.get(url, {
    timeout: 20000,
    params: {
      apiKey,
      regions: selectedRegion,
      markets: 'h2h',
      oddsFormat: 'decimal',
    },
  });
  return {
    source: 'the-odds-api',
    sport: selectedSport,
    region: selectedRegion,
    fetchedAt: new Date().toISOString(),
    requestsRemaining: response.headers['x-requests-remaining'],
    requestsUsed: response.headers['x-requests-used'],
    events: response.data,
  };
};

module.exports = {
  fetchOdds,
};

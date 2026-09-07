process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.FOOTBALL_API_KEY = '';
process.env.PORT = '4317';
const { matches } = await import('../server/src/routes/footballRoutes.js');
const { attachDemoMarkets } = await import('../server/src/services/demoFootballMarkets.js');
const games = [
  ['Real Madrid', 'Inter', 2, 'UEFA Champions League'],
  ['Arsenal', 'Chelsea', 39, 'Premier League'],
  ['Paris Saint-Germain', 'Marseille', 61, 'Ligue 1']
].map(([home, away, competitionId, competition], index) => attachDemoMarkets({
  id: `api-football-e2e-${index}`, competitionId, competition, status: 'scheduled',
  startsAt: new Date(Date.now() + 3600000).toISOString(), venue: 'Stade de test',
  home: { id: `home-${index}`, name: home, code: home.slice(0,3) }, away: { id: `away-${index}`, name: away, code: away.slice(0,3) }
}));
matches.splice(0, matches.length, ...games);
const { server } = await import('../server/src/app.js');
server.listen(4317, '127.0.0.1');

import { authRequired } from '../middleware/auth.js';
import { IS_PRODUCTION } from '../config.js';
import { getDemoFixture } from '../services/demoFootballMarkets.js';
import { footballCompetitions } from '../../../shared/footballCompetitions.mjs';
import { calendarDates, parisDate } from '../services/footballCalendar.js';
import { FOOTBALL_API_KEY } from '../config.js';
/**
 * Football catalogue adapter (MVP).
 *
 * This is intentionally a read-only demo provider. In production, replace the
 * in-memory catalogue with a licensed sports-data integration and persist
 * odds/version history in PostgreSQL before accepting any monetary wager.
 */
import { getLicensedFixturesByDate, getLicensedLiveFixtures } from '../services/footballDataProvider.js';
export const matches = [
  {
    id: 'real-madrid-barcelona', competition: 'UEFA Champions League', competitionCode: 'UCL',
    startsAt: '2026-09-07T21:00:00+02:00', venue: 'Santiago Bernabéu', status: 'scheduled',
    home: { id: 'real-madrid', name: 'Real Madrid', code: 'RM', logo: 'https://media.api-sports.io/football/teams/541.png' }, away: { id: 'barcelona', name: 'Barcelona', code: 'FCB', logo: 'https://media.api-sports.io/football/teams/529.png' },
    markets: [
      market('match-result', 'Résultat du match', [['home', 'Real Madrid', 1.82], ['draw', 'Match nul', 3.70], ['away', 'Barcelona', 4.20]]),
      market('total-goals-25', 'Total de buts 2.5', [['over', 'Plus de 2.5', 1.76], ['under', 'Moins de 2.5', 2.04]]),
      market('btts', 'Les deux équipes marquent', [['yes', 'Oui', 1.64], ['no', 'Non', 2.16]])
    ]
  },
  {
    id: 'manchester-city-arsenal', competition: 'Premier League', competitionCode: 'EPL',
    startsAt: '2026-09-07T18:30:00+02:00', venue: 'Etihad Stadium', status: 'live', minute: 72, score: { home: 2, away: 1 },
    home: { id: 'manchester-city', name: 'Manchester City', code: 'MC', logo: 'https://media.api-sports.io/football/teams/50.png' }, away: { id: 'arsenal', name: 'Arsenal', code: 'A', logo: 'https://media.api-sports.io/football/teams/42.png' },
    statistics: { possession: [58, 42], shotsOnTarget: [7, 3], corners: [6, 2], xg: [1.82, 0.94] },
    markets: [market('match-result', 'Résultat du match', [['home', 'Manchester City', 1.34], ['draw', 'Match nul', 5.20], ['away', 'Arsenal', 8.40]])]
  },
  {
    id: 'psg-marseille', competition: 'Ligue 1', competitionCode: 'L1',
    startsAt: '2026-09-08T20:45:00+02:00', venue: 'Parc des Princes', status: 'scheduled',
    home: { id: 'psg', name: 'Paris Saint-Germain', code: 'PSG', logo: 'https://media.api-sports.io/football/teams/85.png' }, away: { id: 'marseille', name: 'Marseille', code: 'OM', logo: 'https://media.api-sports.io/football/teams/81.png' },
    markets: [market('match-result', 'Résultat du match', [['home', 'Paris Saint-Germain', 1.45], ['draw', 'Match nul', 4.60], ['away', 'Marseille', 6.10]])]
  }
];

function market(id, name, selections) {
  return { id, name, status: 'open', selections: selections.map(([id, name, odd]) => ({ id, name, odd, updatedAt: new Date().toISOString(), version: 1 })) };
}

export function registerFootballRoutes(app, io) {
  app.get('/api/competitions', (_req, res) => res.json({ data: footballCompetitions.map(item => item.name) }));
  app.get('/api/matches', async (req, res) => {
    let dates;
    try { dates = calendarDates(String(req.query.date || parisDate()), Number(req.query.days || 1)); }
    catch (error) { return res.status(400).json({ message: error.message }); }
    const { status, competition } = req.query;
    let data;
    let unavailableDates = [];
    let provider = 'demo';
    if (FOOTBALL_API_KEY) {
      try {
        const results = await Promise.allSettled(dates.map(date => getLicensedFixturesByDate(date)));
        if (results.every(result => result.status === 'rejected')) {
          const quotaFailure = results.find(result => result.reason.code === 'QUOTA_LIMIT');
          if (quotaFailure) throw quotaFailure.reason;
        }
        unavailableDates = results.flatMap((result, index) => result.status === 'rejected' ? [{ date: dates[index], reason: result.reason.code === 'PLAN_LIMIT' ? 'plan' : 'unavailable' }] : []);
        if (results.every(result => result.status === 'rejected') && unavailableDates.some(item => item.reason !== 'plan')) throw new Error('Provider unavailable');
        data = results.flatMap(result => result.status === 'fulfilled' ? result.value.data : []);
        provider = 'api-football';
      } catch (_error) {
        if (_error.code === 'QUOTA_LIMIT') return res.status(503).json({ message: _error.message, code: _error.code, data: [] });
        return res.status(503).json({ message: 'Calendrier temporairement indisponible. Réessayez dans quelques instants.', data: [] });
      }
    } else data = matches.filter(match => dates.includes(parisDate(new Date(match.startsAt))));
    data = data.filter(match => (!status || match.status === status) && (!competition || match.competition === competition)).sort((a,b) => new Date(a.startsAt) - new Date(b.startsAt));
    res.json({ data, meta: { total: data.length, provider, date: dates[0], dates, unavailableDates, timezone: 'Europe/Paris' } });
  });
  app.get('/api/live', async (_req, res) => {
    try {
      const live = await getLicensedLiveFixtures();
      return res.json({ data: live.source !== 'demo' ? live.data : matches.filter(match => match.status === 'live'), meta: { source: live.source, odds: 'demo' } });
    } catch (error) {
      if (error.code === 'QUOTA_LIMIT') return res.status(503).json({ message: error.message, code: error.code, data: [] });
      return res.status(503).json({ message: 'Flux live temporairement indisponible.', data: matches.filter(match => match.status === 'live') });
    }
  });
  app.get('/api/matches/:id', (req, res) => {
    const match = matches.find(item => item.id === req.params.id) || getDemoFixture(req.params.id);
    if (!match) return res.status(404).json({ message: 'Match introuvable.' });
    return res.json({ data: match });
  });
  app.get('/api/matches/:id/markets', (req, res) => {
    const match = matches.find(item => item.id === req.params.id) || getDemoFixture(req.params.id);
    if (!match) return res.status(404).json({ message: 'Match introuvable.' });
    return res.json({ data: match.markets });
  });

  // Demo-only event to validate the front-end WebSocket contract.
  app.post('/api/demo/odds-tick', authRequired, (req, res) => {
    if (IS_PRODUCTION || process.env.ENABLE_DEMO_TOOLS !== 'true') return res.status(404).json({ message: 'Route introuvable.' });
    const match = matches.find(item => item.id === req.body?.matchId);
    if (!match) return res.status(404).json({ message: 'Match introuvable.' });
    const selection = match.markets.flatMap(item => item.selections).find(item => item.id === req.body?.selectionId);
    if (!selection || !Number.isFinite(Number(req.body?.odd)) || Number(req.body?.odd) <= 1 || Number(req.body?.odd) > 1000) return res.status(400).json({ message: 'Cote invalide.' });
    selection.odd = Number(req.body.odd); selection.version += 1; selection.updatedAt = new Date().toISOString();
    io.emit('odds:update', { matchId: match.id, selection });
    return res.json({ data: selection });
  });
}

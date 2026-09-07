import { competitionById } from '../../../shared/footballCompetitions.mjs';

const fixtures = new Map();
const TTL = 10 * 60 * 1000;
export function attachDemoMarkets(match, now = Date.now()) {
  const eligible = competitionById(match.competitionId) && match.status === 'scheduled' && new Date(match.startsAt).getTime() > now;
  const market = (id, name, selections) => ({ id, name, status: 'open', source: 'simulation', selections: selections.map(([id, name, odd]) => ({ id, name, odd, version: 1 })) });
  const enriched = { ...match, oddsSource: 'simulation', markets: eligible ? [
    market('match-result', 'Résultat du match', [['home', match.home.name, 2.10], ['draw', 'Match nul', 3.30], ['away', match.away.name, 3.10]]),
    market('total-goals-25', 'Total de buts 2.5', [['over', 'Plus de 2.5', 1.85], ['under', 'Moins de 2.5', 1.95]]),
    market('btts', 'Les deux équipes marquent', [['yes', 'Oui', 1.80], ['no', 'Non', 2.00]])
  ] : [] };
  for (const [id, entry] of fixtures) if (entry.expiresAt <= now) fixtures.delete(id);
  fixtures.set(match.id, { match: enriched, expiresAt: now + TTL });
  return enriched;
}
export function getDemoFixture(id, now = Date.now()) {
  const entry = fixtures.get(id);
  if (!entry || entry.expiresAt <= now) return null;
  return entry.match;
}
export function canBetOnDemoFixture(match, now = Date.now()) {
  return Boolean(match && match.status === 'scheduled' && new Date(match.startsAt).getTime() > now && match.markets.length);
}

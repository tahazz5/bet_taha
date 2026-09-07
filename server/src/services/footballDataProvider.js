import { attachDemoMarkets } from './demoFootballMarkets.js';
import { competitionById, isSupportedFixture } from '../../../shared/footballCompetitions.mjs';
import { FOOTBALL_API_BASE_URL, FOOTBALL_API_KEY } from '../config.js';

let cache = { expiresAt: 0, data: [] };
const dateCache = new Map();
let quotaBlockedUntil = 0;
const quotaError = () => Object.assign(new Error('Quota du fournisseur de matchs atteint. Réessayez après le renouvellement du quota.'), { code: 'QUOTA_LIMIT' });
function checkQuota() {
  if (quotaBlockedUntil > Date.now()) throw quotaError();
}
function checkProviderErrors(payload) {
  if (!payload.errors || !Object.keys(payload.errors).length) return;
  if (payload.errors.requests) {
    quotaBlockedUntil = Date.now() + 300_000;
    throw quotaError();
  }
  throw Object.assign(new Error('Sports data provider returned an error'), { code: payload.errors.plan ? 'PLAN_LIMIT' : 'PROVIDER_ERROR' });
}

export function normalizeFixture(item) {
  const { fixture, league, teams, goals } = item;
  const status = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE'].includes(fixture.status.short) ? 'live' : ['FT', 'AET', 'PEN'].includes(fixture.status.short) ? 'finished' : ['PST', 'CANC', 'ABD', 'SUSP', 'INT', 'AWD', 'WO'].includes(fixture.status.short) ? 'unavailable' : 'scheduled';
  return {
    id: `api-football-${fixture.id}`,
    providerId: fixture.id,
    competitionId: league.id,
    competition: competitionById(league.id)?.name || league.name,
    competitionLogo: league.logo,
    competitionCode: league.country || 'Football',
    startsAt: fixture.date,
    venue: fixture.venue?.name || '—',
    status,
    minute: fixture.status.elapsed ?? null,
    home: { id: `team-${teams.home.id}`, name: teams.home.name, logo: teams.home.logo, code: teams.home.name.slice(0, 3).toUpperCase() },
    away: { id: `team-${teams.away.id}`, name: teams.away.name, logo: teams.away.logo, code: teams.away.name.slice(0, 3).toUpperCase() },
    score: { home: goals.home ?? 0, away: goals.away ?? 0 },
    markets: []
  };
}

export async function getLicensedLiveFixtures() {
  if (!FOOTBALL_API_KEY) return { source: 'demo', data: [] };
  if (cache.expiresAt > Date.now()) return { source: 'api-football', data: cache.data };
  checkQuota();

  const response = await fetch(`${FOOTBALL_API_BASE_URL}/fixtures?live=all`, {
    signal: AbortSignal.timeout(12000),
    headers: { 'x-apisports-key': FOOTBALL_API_KEY, Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Sports data provider returned ${response.status}`);
  const payload = await response.json();
  checkProviderErrors(payload);
  const data = (payload.response || []).filter(isSupportedFixture).map(item => attachDemoMarkets(normalizeFixture(item)));
  cache = { data, expiresAt: Date.now() + 15_000 };
  return { source: 'api-football', data };
}

export async function getLicensedFixturesByDate(date) {
  if (!FOOTBALL_API_KEY) return { source: 'demo', data: [] };
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
  const cached = dateCache.get(safeDate);
  if (cached && cached.expiresAt > Date.now()) return { source: 'api-football', data: cached.data };
  checkQuota();
  const response = await fetch(`${FOOTBALL_API_BASE_URL}/fixtures?date=${safeDate}&timezone=Europe%2FParis`, {
    signal: AbortSignal.timeout(12000),
    headers: { 'x-apisports-key': FOOTBALL_API_KEY, Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Sports data provider returned ${response.status}`);
  const payload = await response.json();
  checkProviderErrors(payload);
  const data = (payload.response || []).filter(isSupportedFixture).map(item => attachDemoMarkets(normalizeFixture(item)));
  dateCache.set(safeDate, { data, expiresAt: Date.now() + 300_000 });
  return { source: 'api-football', data };
}

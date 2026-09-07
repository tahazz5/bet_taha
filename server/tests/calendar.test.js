import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDates, parisDate } from '../src/services/footballCalendar.js';
import { normalizeFixture } from '../src/services/footballDataProvider.js';

test('calendar uses Paris dates and rolls across months and years', () => {
  assert.equal(parisDate(new Date('2026-09-07T22:30:00Z')), '2026-09-08');
  const days = calendarDates('2026-12-29', 7);
  assert.equal(days.length, 7);
  assert.equal(days[6], '2027-01-04');
  assert.throws(() => calendarDates('2026-02-30', 7));
  assert.throws(() => calendarDates('2026-09-07', 100));
});
test('provider preserves logos, scores and terminal match status', () => {
  const fixture = { fixture: { id: 1, date: '2026-09-07T20:00:00Z', status: { short: 'FT', elapsed: 90 } }, league: { name: 'League', logo: 'https://example.com/league.png' }, teams: { home: { id: 1, name: 'Home', logo: 'https://example.com/home.png' }, away: { id: 2, name: 'Away', logo: 'https://example.com/away.png' } }, goals: { home: 2, away: 1 } };
  const game = normalizeFixture(fixture);
  assert.equal(game.home.logo, fixture.teams.home.logo);
  assert.equal(game.away.logo, fixture.teams.away.logo);
  assert.equal(game.competitionLogo, fixture.league.logo);
  assert.equal(game.status, 'finished');
  assert.deepEqual(game.score, { home: 2, away: 1 });
  fixture.fixture.status.short = 'PST';
  assert.equal(normalizeFixture(fixture).status, 'unavailable');
});

test('only the five major leagues and three European competitions are accepted', async () => {
  const { footballCompetitions, isSupportedFixture } = await import('../../shared/footballCompetitions.mjs');
  assert.equal(footballCompetitions.length, 8);
  for (const competition of footballCompetitions) {
    assert.equal(isSupportedFixture({ league: { id: competition.id } }), true);
  }
  for (const id of [40, 45, 66, 94, 203, 1, 4, 9, 99999]) {
    assert.equal(isSupportedFixture({ league: { id, name: 'Premier League' } }), false);
  }
  assert.equal(isSupportedFixture({ league: { name: 'Ligue 1' } }), false);
  assert.equal(isSupportedFixture({}), false);
});

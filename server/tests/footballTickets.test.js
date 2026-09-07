import test from 'node:test';
import assert from 'node:assert/strict';
import { attachDemoMarkets, getDemoFixture, canBetOnDemoFixture } from '../src/services/demoFootballMarkets.js';

const fixture = (id = 'api-football-test') => ({ id, competitionId: 2, status: 'scheduled', startsAt: new Date(Date.now() + 3600000).toISOString(), home: { name: 'Home' }, away: { name: 'Away' } });
test('simulation markets close at kickoff and cached fixtures expire', () => {
  const now = Date.now();
  const match = attachDemoMarkets(fixture(), now);
  assert.equal(match.markets.length, 3);
  assert.equal(match.oddsSource, 'simulation');
  assert.equal(canBetOnDemoFixture(match, now), true);
  assert.equal(canBetOnDemoFixture(match, now + 3600001), false);
  assert.equal(getDemoFixture(match.id, now + 600001), null);
  assert.equal(attachDemoMarkets({ ...fixture(), status: 'live' }).markets.length, 0);
  assert.equal(attachDemoMarkets({ ...fixture(), competitionId: 99999 }).markets.length, 0);
});

test('provider fixtures accept demo tickets, reject changed odds and debit only once', async () => {
  process.env.DB_PATH = ':memory:';
  const { server } = await import('../src/app.js');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let token;
  const post = async (url, body) => {
    const response = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  try {
    const registered = await post('/api/register', { username: 'fixturebettor', password: 'secret123' });
    token = registered.data.token;
    const match = attachDemoMarkets(fixture('api-football-ticket-test'));
    const body = { requestId: 'fixture-ticket-001', stake: 20, selections: [{ matchId: match.id, marketId: 'btts', selectionId: 'yes', odd: 1.80 }] };
    const invalid = await post('/api/tickets', { ...body, selections: [{ ...body.selections[0], odd: 15 }] });
    assert.equal(invalid.status, 409);
    const placed = await post('/api/tickets', body);
    assert.equal(placed.status, 201);
    assert.equal(placed.data.user.credits, 980);
    assert.equal(placed.data.tickets[0].selections[0].oddsSource, 'simulation');
    const repeat = await post('/api/tickets', body);
    assert.equal(repeat.data.user.credits, 980);
    const second = attachDemoMarkets(fixture('api-football-second-match'));
    const combined = { ...body, requestId: 'combined-ticket-001', betType: 'combined', selections: [...body.selections, { ...body.selections[0], matchId: second.id }] };
    assert.equal((await post('/api/tickets', { ...body, betType: 'combined', requestId: 'invalid-combined' })).status, 400);
    assert.equal((await post('/api/tickets', { ...combined, betType: 'simple' })).status, 400);
    assert.equal((await post('/api/tickets', { ...combined, selections: [body.selections[0], body.selections[0]] })).status, 400);
    const placedCombined = await post('/api/tickets', combined);
    assert.equal(placedCombined.status, 201);
    assert.equal(placedCombined.data.user.credits, 960);
    assert.equal(placedCombined.data.tickets[0].selections.length, 2);
    assert.equal(placedCombined.data.tickets[0].odds, 1.8 * 1.8);
    assert.equal((await post('/api/tickets', combined)).data.user.credits, 960);
    attachDemoMarkets({ ...fixture(match.id), status: 'finished' });
    assert.equal((await post('/api/tickets', { ...body, requestId: 'fixture-ticket-002' })).status, 409);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

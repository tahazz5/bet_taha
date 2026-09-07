import test from 'node:test';
import assert from 'node:assert/strict';

process.env.FOOTBALL_API_KEY = 'test-provider-key';
const { getLicensedFixturesByDate, getLicensedLiveFixtures } = await import('../src/services/footballDataProvider.js');

test('provider quota errors pause calendar and live calls for five minutes then allow retry', async t => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    errors: { requests: 'Daily limit reached' }, response: []
  }), { status: 200 }));
  await assert.rejects(getLicensedFixturesByDate('2026-09-08'), { code: 'QUOTA_LIMIT' });
  await assert.rejects(getLicensedFixturesByDate('2026-09-09'), { code: 'QUOTA_LIMIT' });
  await assert.rejects(getLicensedLiveFixtures(), { code: 'QUOTA_LIMIT' });
  assert.equal(fetchMock.mock.callCount(), 1);
  now += 300_001;
  fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify({ errors: [], response: [] }), { status: 200 }));
  assert.deepEqual((await getLicensedFixturesByDate('2026-09-08')).data, []);
  assert.equal(fetchMock.mock.callCount(), 2);
});

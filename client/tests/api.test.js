import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/api.js';

let expired;
beforeEach(t => {
  const storage = new Map([
    ['northstar-token', 'old-access'],
    ['northstar-refresh-token', 'old-refresh'],
    ['northstar-user', JSON.stringify({ id: 1 })]
  ]);
  t.mock.method(globalThis, 'fetch');
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  };
  globalThis.window = new EventTarget();
  expired = 0;
  window.addEventListener('session-expired', () => expired++);
});
afterEach(() => {
  delete globalThis.localStorage;
  delete globalThis.window;
});
const response = (status, body) => new Response(JSON.stringify(body), { status });
const renewed = { token: 'new-access', refreshToken: 'new-refresh', user: { id: 1 } };

test('a rejected retried request clears the session and preserves the API error', async () => {
  const calls = [];
  fetch.mock.mockImplementation(async (url, options) => {
    calls.push([url, options.headers.Authorization]);
    return url === '/api/refresh'
      ? response(200, renewed)
      : response(401, { message: 'Session révoquée.' });
  });
  await assert.rejects(api('/api/account'), { status: 401, message: 'Session révoquée.' });
  assert.deepEqual(calls, [
    ['/api/account', 'Bearer old-access'],
    ['/api/refresh', 'Bearer old-access'],
    ['/api/account', 'Bearer new-access']
  ]);
  for (const key of ['northstar-token', 'northstar-refresh-token', 'northstar-user']) {
    assert.equal(localStorage.getItem(key), null);
  }
  assert.equal(expired, 1);
});

test('concurrent expired requests share a refresh and replay the original body', async () => {
  let refreshes = 0;
  const body = { requestId: 'same-request', stake: 10 };
  fetch.mock.mockImplementation(async (url, options) => {
    if (url === '/api/refresh') {
      refreshes++;
      await new Promise(resolve => setTimeout(resolve, 10));
      return response(200, renewed);
    }
    if (options.headers.Authorization === 'Bearer old-access') return response(401, {});
    if (url === '/api/tickets') {
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(options.body), body);
    }
    return response(200, { ok: true });
  });
  assert.deepEqual(await Promise.all([api('/api/account'), api('/api/tickets', body)]), [{ ok: true }, { ok: true }]);
  assert.equal(refreshes, 1);
  assert.equal(expired, 0);
  assert.equal(localStorage.getItem('northstar-refresh-token'), 'new-refresh');
});

test('a network failure after refresh keeps the renewed session available for retry', async () => {
  fetch.mock.mockImplementation(async (url, options) => {
    if (url === '/api/refresh') return response(200, renewed);
    if (options.headers.Authorization === 'Bearer old-access') return response(401, {});
    throw new TypeError('Network unavailable');
  });
  await assert.rejects(api('/api/account'), /Connexion interrompue/);
  assert.equal(localStorage.getItem('northstar-token'), 'new-access');
  assert.equal(expired, 0);
});

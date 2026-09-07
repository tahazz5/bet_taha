import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['src/index.js'], {
      cwd: projectRoot,
      env: { ...process.env, PORT: '4100', DB_PATH: ':memory:', FOOTBALL_API_KEY: '' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.includes('BetFriends API listening')) {
        resolve(child);
      }
    });

    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });

    child.on('exit', (code) => {
      if (code !== null && code !== 0) {
        reject(new Error(`Server exited with code ${code}: ${output}`));
      }
    });

    setTimeout(() => {
      if (!child.killed) {
        resolve(child);
      }
    }, 3000);
  });
}

async function request(pathname, options = {}) {
  const response = await fetch(`http://localhost:4100${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  return { status: response.status, payload };
}

test('API health check works', { concurrency: false }, async () => {
  const child = await startServer();
  try {
    const result = await request('/api/health');
    assert.equal(result.status, 200);
    assert.equal(result.payload.ok, true);
  } finally {
    child.kill('SIGTERM');
  }
});

test('register + login flow works', { concurrency: false }, async () => {
  const child = await startServer();
  try {
    const username = `apitestuser_${Date.now()}`;

    const registerResult = await request('/api/register', {
      method: 'POST',
      body: JSON.stringify({ username, password: 'secret123' })
    });

    assert.equal(registerResult.status, 201);
    assert.ok(registerResult.payload.token);
    assert.ok(registerResult.payload.refreshToken);
    assert.equal(registerResult.payload.user.username, username);

    const loginResult = await request('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password: 'secret123' })
    });

    assert.equal(loginResult.status, 200);
    assert.equal(loginResult.payload.user.username, username);
    assert.ok(loginResult.payload.refreshToken);
  } finally {
    child.kill('SIGTERM');
  }
});

test('refresh token flow rotates credentials', { concurrency: false }, async () => {
  const child = await startServer();
  try {
    const username = `apitestrefresh_${Date.now()}`;

    const registerResult = await request('/api/register', {
      method: 'POST',
      body: JSON.stringify({ username, password: 'secret123' })
    });

    assert.equal(registerResult.status, 201);

    const refreshResult = await request('/api/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: registerResult.payload.refreshToken })
    });

    assert.equal(refreshResult.status, 200);
    assert.ok(refreshResult.payload.token);
    assert.ok(refreshResult.payload.refreshToken);
    assert.equal(refreshResult.payload.user.username, username);
  } finally {
    child.kill('SIGTERM');
  }
});

test('logout invalidates the refresh token', { concurrency: false }, async () => {
  const child = await startServer();
  try {
    const username = `apitestlogout_${Date.now()}`;

    const registerResult = await request('/api/register', {
      method: 'POST',
      body: JSON.stringify({ username, password: 'secret123' })
    });

    assert.equal(registerResult.status, 201);
    assert.ok(registerResult.payload.refreshToken);

    const logoutResult = await request('/api/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: registerResult.payload.refreshToken })
    });

    assert.equal(logoutResult.status, 200);
    assert.equal(logoutResult.payload.ok, true);

    const refreshResult = await request('/api/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: registerResult.payload.refreshToken })
    });

    assert.equal(refreshResult.status, 401);
    assert.equal(refreshResult.payload.message, 'Refresh token invalide.');
  } finally {
    child.kill('SIGTERM');
  }
});


test('tickets validate selections, debit once and remain private', { concurrency: false }, async () => {
  const child = await startServer();
  try {
    const registered = await request('/api/register', { method: 'POST', body: JSON.stringify({ username: 'ticketuser', password: 'secret123' }) });
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${registered.payload.token}` };
    const body = { requestId: 'test-ticket-001', stake: 10, selections: [{ matchId: 'real-madrid-barcelona', marketId: 'match-result', selectionId: 'home', odd: 1.82 }] };
    assert.equal((await request('/api/tickets', { method: 'POST', body: JSON.stringify(body) })).status, 401);
    for (const invalid of [{ ...body, stake: -10 }, { ...body, stake: 1001 }, { ...body, selections: [...body.selections, ...body.selections] }, { ...body, selections: [{ ...body.selections[0], odd: 99 }] }]) {
      assert.ok((await request('/api/tickets', { method: 'POST', headers, body: JSON.stringify(invalid) })).status >= 400);
    }
    const placed = await request('/api/tickets', { method: 'POST', headers, body: JSON.stringify(body) });
    assert.equal(placed.status, 201);
    assert.equal(placed.payload.user.credits, 990);
    assert.equal(placed.payload.tickets.length, 1);
    const repeated = await request('/api/tickets', { method: 'POST', headers, body: JSON.stringify(body) });
    assert.equal(repeated.payload.user.credits, 990);
    assert.equal(repeated.payload.tickets.length, 1);
    const account = await request('/api/account', { headers });
    assert.equal(account.payload.tickets[0].stake, 10);
    const other = await request('/api/register', { method: 'POST', body: JSON.stringify({ username: 'otheruser', password: 'secret123' }) });
    const otherAccount = await request('/api/account', { headers: { Authorization: `Bearer ${other.payload.token}` } });
    assert.equal(otherAccount.payload.tickets.length, 0);
    assert.equal(otherAccount.payload.user.credits, 1000);
    assert.equal((await request('/api/register', { method: 'POST', body: '{}' })).status, 400);
  } finally { child.kill('SIGTERM'); }
});

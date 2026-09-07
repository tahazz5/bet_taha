let refreshRequest;
export function clearSession() {
  for (const key of ['northstar-token', 'northstar-refresh-token', 'northstar-user']) localStorage.removeItem(key);
  window.dispatchEvent(new Event('session-expired'));
}
export async function api(url, body, retry = true) {
  let response;
  try {
    response = await fetch(url, { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('northstar-token') || ''}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
  } catch { throw new Error('Connexion interrompue. Vérifiez votre réseau et réessayez.'); }
  if (response.status === 401 && retry && !['/api/login', '/api/register', '/api/refresh', '/api/logout'].includes(url)) {
    const refreshToken = localStorage.getItem('northstar-refresh-token');
    if (refreshToken) {
      if (!refreshRequest) refreshRequest = api('/api/refresh', { refreshToken }, false).then(data => {
        localStorage.setItem('northstar-token', data.token);
        localStorage.setItem('northstar-refresh-token', data.refreshToken);
        localStorage.setItem('northstar-user', JSON.stringify(data.user));
      }).finally(() => { refreshRequest = null; });
      try { await refreshRequest; return await api(url, body, false); }
      catch (error) { if (error.status === 401) clearSession(); throw error; }
    }
    clearSession();
  }
  const payload = await response.json().catch(() => ({ message: 'Le service est temporairement indisponible.' }));
  if (!response.ok) throw Object.assign(new Error(payload.message || 'Service indisponible.'), { status: response.status });
  return payload;
}

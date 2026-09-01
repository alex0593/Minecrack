let csrfToken = sessionStorage.getItem('minecrack.csrf') || '';

export function hasSession() {
  return Boolean(csrfToken);
}

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...options, headers, credentials: 'include' });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (response.status === 401) {
      csrfToken = '';
      sessionStorage.removeItem('minecrack.csrf');
    }
    throw new Error(body?.detail || `HTTP ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

export async function login(username, password) {
  const result = await api('/api/v1/admin/login', {
    method: 'POST', body: JSON.stringify({ username, password }),
  });
  csrfToken = result.csrfToken;
  sessionStorage.setItem('minecrack.csrf', csrfToken);
  return result;
}

export async function logout() {
  await api('/api/v1/admin/logout', { method: 'POST' }).catch(() => {});
  csrfToken = '';
  sessionStorage.removeItem('minecrack.csrf');
}


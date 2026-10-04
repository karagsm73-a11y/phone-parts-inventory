export class ApiError extends Error {
  constructor(status, code, message, details) { super(message || code); this.status = status; this.code = code; this.details = details || {}; }
}
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));

const listeners = new Set();
export const onNetwork = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (ok) => listeners.forEach(fn => fn(ok));

export const TOKEN_KEY = 'pp_token';
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };

export async function api(method, path, body, opts = {}) {
  const init = { method, headers: {}, credentials: 'same-origin' };
  const tok = getToken(); if (tok) init.headers['Authorization'] = 'Bearer ' + tok;
  if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  let res;
  try { res = await fetch('/api' + path, init); }
  catch (e) { emit(false); throw new ApiError(0, 'NETWORK', 'Server unreachable'); }
  emit(true);
  if (res.status === 401 && !opts.allow401) { setToken(null); window.dispatchEvent(new CustomEvent('pp:unauth')); }
  if (res.status === 503) { const j = await res.json().catch(() => ({})); if (j.error === 'SETUP_REQUIRED') window.dispatchEvent(new CustomEvent('pp:setup')); throw new ApiError(503, j.error || 'UNAVAILABLE', j.message, j.details); }
  const text = await res.text();
  let json = {}; try { json = text ? JSON.parse(text) : {}; } catch { json = { error: 'BAD_RESPONSE', message: text.slice(0, 200) }; }
  if (!res.ok) throw new ApiError(res.status, json.error || 'ERROR', json.message, json.details);
  return json;
}
export const get = (path) => api('GET', path);
export const post = (path, body) => api('POST', path, { ...(body || {}), opId: uuid() });
export const put = (path, body) => api('PUT', path, { ...(body || {}), opId: uuid() });
export const del = (path) => api('DELETE', path);
// Build a write function bound to a single opId so retries after failure reuse the same id.
export const withOp = (method, path, body) => { const opId = uuid(); return () => api(method, path, { ...(body || {}), opId }); };
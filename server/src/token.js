const crypto = require('crypto');
const db = require('./db');

const b64u = (b) => Buffer.from(b).toString('base64url');
const sig = (payload) => crypto.createHmac('sha256', db.getConfig().sessionSecret).update(payload).digest('base64url');

function issue(uid) {
  const payload = b64u(JSON.stringify({ uid, at: Date.now() }));
  return `${payload}.${sig(payload)}`;
}

function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const i = token.lastIndexOf('.');
  if (i < 1) return null;
  const payload = token.slice(0, i), s = token.slice(i + 1);
  const expected = sig(payload);
  if (s.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected))) return null;
  try { const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); return p && p.uid ? p : null; } catch { return null; }
}

// Populates req.user from an Authorization: Bearer token (works inside iframes / without cookies) or the cookie session.
function identify(req, res, next) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  const p = m ? verify(m[1].trim()) : null;
  const uid = p ? p.uid : (req.session && req.session.uid) || null;
  req.user = uid ? { uid } : null;
  next();
}

module.exports = { issue, verify, identify };
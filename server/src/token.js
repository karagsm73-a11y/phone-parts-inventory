const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const SESS_FILE = path.join(__dirname, '..', 'config', 'sessions.json');
let visitors = {};
try { visitors = JSON.parse(fs.readFileSync(SESS_FILE, 'utf8')) || {}; } catch { visitors = {}; }
const saveVisitors = () => {
  try { fs.mkdirSync(path.dirname(SESS_FILE), { recursive: true }); fs.writeFileSync(SESS_FILE, JSON.stringify(visitors), { mode: 0o600 }); }
  catch (e) { console.error('[sessions]', e.message); }
};

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

// When running as a PromptQL app artifact, every proxied request carries X-PromptQL-Visitor-Token
// (a JWT injected by PromptQL — trusted by origin, only needs decoding). Its `sub` is the stable visitor id.
function visitorSub(req) {
  const t = req.headers['x-promptql-visitor-token'];
  if (!t) return null;
  try {
    const parts = String(t).split('.');
    if (parts.length < 2) return null;
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return p && p.sub ? String(p.sub) : null;
  } catch { return null; }
}

// Populates req.user from (in order): X-Auth-Token / Authorization: Bearer token, the cookie session,
// or a server-side session keyed on the PromptQL visitor id (works even if the browser blocks cookies & storage).
function identify(req, res, next) {
  const raw = req.headers['x-auth-token'] || (/^Bearer\s+(.+)$/i.exec(req.headers.authorization || '') || [])[1];
  const p = raw ? verify(String(raw).trim()) : null;
  let uid = p ? p.uid : null, via = uid ? 'token' : null;
  if (!uid && req.session && req.session.uid) { uid = req.session.uid; via = 'cookie'; }
  const sub = visitorSub(req);
  if (!uid && sub && visitors[sub]) { uid = visitors[sub].uid; via = 'visitor'; }
  req.visitorSub = sub;
  req.authVia = via;
  req.user = uid ? { uid } : null;
  next();
}

function rememberVisitor(req, uid) { if (req.visitorSub) { visitors[req.visitorSub] = { uid, at: Date.now() }; saveVisitors(); } }
function forgetVisitor(req) { if (req.visitorSub && visitors[req.visitorSub]) { delete visitors[req.visitorSub]; saveVisitors(); } }

module.exports = { issue, verify, identify, rememberVisitor, forgetVisitor };
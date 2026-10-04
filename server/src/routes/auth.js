const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const token = require('../token');
const { asyncH, str } = require('../util');
const router = express.Router();

router.post('/login', asyncH(async (req, res) => {
  const username = str(req.body && req.body.username, 100); const password = String((req.body && req.body.password) || '');
  const rows = await db.q('SELECT id, username, password_hash FROM admin_user WHERE username=? LIMIT 1', [username]);
  const u = rows[0];
  const ok = u && await bcrypt.compare(password, u.password_hash);
  if (!ok) { await new Promise(r => setTimeout(r, 400)); throw db.err(401, 'BAD_CREDENTIALS', 'Invalid username or password'); }
  req.session.uid = u.id; req.session.at = Date.now();
  token.rememberVisitor(req, u.id);
  res.json({ ok: true, token: token.issue(u.id), user: { id: u.id, username: u.username } });
}));

router.post('/logout', (req, res) => { token.forgetVisitor(req); req.session = null; res.json({ ok: true }); });

router.post('/password', asyncH(async (req, res) => {
  if (!req.user || !req.user.uid) throw db.err(401, 'UNAUTHENTICATED');
  const current = String(req.body.current || ''); const next = String(req.body.next || '');
  if (next.length < 6) throw db.err(400, 'VALIDATION', 'Password too short', { password: 'min6' });
  const [u] = await db.q('SELECT id, password_hash FROM admin_user WHERE id=?', [req.user.uid]);
  if (!u || !(await bcrypt.compare(current, u.password_hash))) throw db.err(400, 'BAD_CREDENTIALS');
  await db.q('UPDATE admin_user SET password_hash=? WHERE id=?', [await bcrypt.hash(next, 11), u.id]);
  res.json({ ok: true });
}));

module.exports = router;
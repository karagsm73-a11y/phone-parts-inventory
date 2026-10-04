const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieSession = require('cookie-session');
const db = require('./db');
const token = require('./token');

const PORT = Number(process.env.PORT) || 8080;
const cfg = db.loadConfig();
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

let ready = false;
app.get('/readyz', (req, res) => res.status(ready ? 204 : 503).end());

app.use(express.json({ limit: '2mb' }));
const sessOpts = { name: 'pp_sess', keys: [cfg.sessionSecret], maxAge: 365 * 24 * 3600 * 1000, httpOnly: true, signed: true };
const laxSess = cookieSession({ ...sessOpts, sameSite: 'lax' });
const noneSess = cookieSession({ ...sessOpts, sameSite: 'none', secure: true }); // iframe-safe when served over HTTPS (behind proxy)
app.use((req, res, next) => (req.secure ? noneSess : laxSess)(req, res, next));
app.use(token.identify);
app.use('/api', (req, res, next) => {
  res.on('finish', () => console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} auth=${req.authVia || '-'} hdr=${req.headers['x-auth-token'] ? 'x-auth' : req.headers.authorization ? 'bearer' : '-'} visitor=${req.visitorSub ? 'yes' : 'no'}`));
  next();
});
app.use((req, res, next) => { if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store'); next(); });

app.get('/api/status', (req, res) => {
  const c = db.getConfig();
  res.json({ setupComplete: !!c.setupComplete, hasSavedConnection: !!c.db, authenticated: !!(c.setupComplete && req.user && req.user.uid), via: req.authVia || null });
});
app.use('/api/setup', require('./routes/setup'));

const requireSetup = (req, res, next) => db.getConfig().setupComplete ? next() : next(db.err(503, 'SETUP_REQUIRED', 'Setup is not complete'));
const requireAuth = (req, res, next) => (req.user && req.user.uid) ? next() : next(db.err(401, 'UNAUTHENTICATED', 'Login required'));

app.use('/api/auth', requireSetup, require('./routes/auth'));
app.use('/api', requireSetup, requireAuth, require('./routes/inventory'));
app.use('/api', requireSetup, requireAuth, require('./routes/sales'));
app.use('/api', requireSetup, requireAuth, require('./routes/caisse').router);
app.use('/api', requireSetup, requireAuth, require('./routes/suppliers'));
app.use('/api', requireSetup, requireAuth, require('./routes/misc'));
app.use('/api', (req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

// Frontend
const dist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(dist, { index: false, maxAge: '1y', immutable: true, setHeaders: (res, p) => { if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-store'); } }));
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const idx = path.join(dist, 'index.html');
  if (fs.existsSync(idx)) res.sendFile(idx); else res.status(503).send('Frontend not built');
});

// Error handler
app.use((e, req, res, next) => {
  if (e instanceof db.HttpError) return res.status(e.status).json({ error: e.code, message: e.message, details: e.details });
  if (e.type === 'entity.parse.failed') return res.status(400).json({ error: 'BAD_JSON' });
  if (e.code && String(e.code).startsWith('ER_')) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'DUPLICATE', message: 'Duplicate value' });
    console.error('[db]', e.code, e.sqlMessage || e.message);
    return res.status(500).json({ error: 'DB_ERROR', message: e.sqlMessage || e.message });
  }
  if (e.code === 'ECONNREFUSED' || e.code === 'PROTOCOL_CONNECTION_LOST' || e.code === 'ETIMEDOUT') return res.status(503).json({ error: 'DB_UNAVAILABLE', message: e.message });
  console.error(e);
  res.status(500).json({ error: 'SERVER_ERROR', message: e.message });
});

app.listen(PORT, '0.0.0.0', () => { ready = true; console.log(`Phone parts server on :${PORT} (setup ${cfg.setupComplete ? 'complete' : 'pending'})`); });
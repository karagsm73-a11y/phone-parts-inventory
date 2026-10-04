const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const { asyncH, str, num } = require('../util');
const router = express.Router();

function dbInput(body) {
  const d = body || {};
  return { host: str(d.host, 255), port: Number(d.port) || 3306, user: str(d.user, 100), password: String(d.password || ''), database: str(d.database, 64) };
}

router.post('/test-connection', asyncH(async (req, res) => {
  const cfg = db.getConfig();
  if (cfg.setupComplete) throw db.err(403, 'ALREADY_SETUP');
  let c;
  if (req.body && req.body.useSaved && cfg.db) c = cfg.db; else c = dbInput(req.body);
  if (!c.host || !c.user || !c.database) throw db.err(400, 'VALIDATION', 'Host, user and database are required');
  try {
    const r = await db.testConnection(c);
    res.json({ ok: true, version: r.version, tables: r.tables, empty: r.tables === 0 });
  } catch (e) {
    throw db.err(400, 'DB_CONNECT_FAILED', e.message);
  }
}));

async function createRestrictedUser(adminConn, c) {
  // Create an application user that cannot UPDATE/DELETE the audit log.
  const hostPart = ['localhost', '127.0.0.1', '::1'].includes(c.host) ? 'localhost' : '%';
  const user = 'pp_app_' + crypto.randomBytes(3).toString('hex');
  const password = crypto.randomBytes(18).toString('base64url');
  const dbName = adminConn.escapeId(c.database);
  await adminConn.query(`CREATE USER ?@? IDENTIFIED BY ?`, [user, hostPart, password]);
  await adminConn.query(`GRANT SELECT, LOCK TABLES, SHOW VIEW, TRIGGER, EVENT ON ${dbName}.* TO ?@?`, [user, hostPart]);
  for (const t of db.TABLES) {
    if (t === 'audit_log') await adminConn.query(`GRANT SELECT, INSERT ON ${dbName}.${adminConn.escapeId(t)} TO ?@?`, [user, hostPart]);
    else await adminConn.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${dbName}.${adminConn.escapeId(t)} TO ?@?`, [user, hostPart]);
  }
  await adminConn.query('FLUSH PRIVILEGES');
  return { ...c, user, password };
}

router.post('/finish', asyncH(async (req, res) => {
  const cfg = db.getConfig();
  if (cfg.setupComplete) throw db.err(403, 'ALREADY_SETUP');
  const body = req.body || {};
  const c = body.db && body.db.useSaved && cfg.db ? cfg.db : dbInput(body.db);
  const storeName = str(body.storeName); const capital = num(body.capital, { min: 0 });
  const username = str(body.username, 100); const password = String(body.password || '');
  const errors = {};
  if (!c.host || !c.user || !c.database) errors.db = 'required';
  if (!storeName) errors.storeName = 'required';
  if (Number.isNaN(capital)) errors.capital = 'invalid';
  if (username.length < 3) errors.username = 'min3';
  if (password.length < 6) errors.password = 'min6';
  if (Object.keys(errors).length) throw db.err(400, 'VALIDATION', 'Invalid setup data', errors);

  let conn;
  try { conn = await db.mysql.createConnection(db.connOpts(c)); }
  catch (e) { throw db.err(400, 'DB_CONNECT_FAILED', e.message); }
  const created = [];
  try {
    const [existing] = await conn.query('SHOW TABLES');
    if (existing.length > 0) throw db.err(400, 'DB_NOT_EMPTY', 'Database already has tables');
    for (let i = 0; i < db.MIGRATIONS.length; i++) { await conn.query(db.MIGRATIONS[i]); created.push(db.TABLES[i]); }
    await conn.beginTransaction();
    const hash = await bcrypt.hash(password, 11);
    await conn.query('INSERT INTO admin_user (username, password_hash) VALUES (?,?)', [username, hash]);
    await conn.query('INSERT INTO settings (id, store_name, capital, setup_complete) VALUES (1,?,?,1)', [storeName, capital]);
    await conn.query('INSERT INTO capital_changes (old_value, new_value) VALUES (0,?)', [capital]);
    await conn.query('INSERT INTO audit_log (action, entity, entity_id, details) VALUES (?,?,?,?)', ['setup_complete', 'settings', 1, JSON.stringify({ storeName, capital })]);
    await conn.commit();
    let appDb = null; let auditRestricted = false;
    try { appDb = await createRestrictedUser(conn, c); auditRestricted = true; }
    catch (e) { appDb = null; auditRestricted = false; }
    await db.resetPool();
    db.saveConfig({ ...cfg, db: c, appDb, auditRestricted, setupComplete: true });
    res.json({ ok: true, auditRestricted });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    for (const t of created.slice().reverse()) { try { await conn.query(`DROP TABLE IF EXISTS ${conn.escapeId(t)}`); } catch {} }
    throw e;
  } finally { await conn.end().catch(() => {}); }
}));

module.exports = router;
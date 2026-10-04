const express = require('express');
const { spawn } = require('child_process');
const db = require('../db');
const { summary } = require('./caisse');
const { asyncH, pag, num, int, str, opIdOf, sendTx } = require('../util');
const router = express.Router();

// Dashboard
router.get('/dashboard', asyncH(async (req, res) => {
  const [[tot], low, out] = await Promise.all([
    db.q('SELECT COUNT(*) AS products, COALESCE(SUM(quantity),0) AS units, COALESCE(SUM(quantity*cost_price),0) AS stockValue, SUM(quantity=1) AS lowCount, SUM(quantity=0) AS outCount FROM products WHERE deleted_at IS NULL'),
    db.q('SELECT id, name, model, barcode, quantity FROM products WHERE deleted_at IS NULL AND quantity=1 ORDER BY name LIMIT 200'),
    db.q('SELECT id, name, model, barcode, quantity FROM products WHERE deleted_at IS NULL AND quantity=0 ORDER BY name LIMIT 200'),
  ]);
  res.json({ ...tot, low, out });
}));

// Global search
router.get('/search', asyncH(async (req, res) => {
  const qn = db.normalize(req.query.q || '');
  if (!qn) return res.json({ items: [] });
  const l = `%${qn}%`;
  const items = await db.q(`SELECT p.id, p.name, p.model, p.barcode, p.quantity, p.selling_price AS sellingPrice, c.name AS categoryName FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.deleted_at IS NULL AND (p.name_norm LIKE ? OR p.model_norm LIKE ? OR LOWER(p.barcode) LIKE ? OR LOWER(c.name) LIKE ?) ORDER BY p.quantity DESC, p.name LIMIT 20`, [l, l, l, l]);
  res.json({ items });
}));

// Stock count (read-only)
router.get('/stockcount', asyncH(async (req, res) => {
  const items = await db.q('SELECT p.id, p.name, p.model, p.barcode, p.quantity, c.name AS categoryName FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.deleted_at IS NULL ORDER BY c.name, p.name LIMIT 5000');
  res.json({ items });
}));

// Notes
router.get('/notes', asyncH(async (req, res) => res.json({ items: await db.q('SELECT id, text, done, created_at AS createdAt FROM notes ORDER BY done, id DESC LIMIT 500') })));
router.post('/notes', asyncH(async (req, res) => {
  const text = str(req.body.text, 500); if (!text) throw db.err(400, 'VALIDATION', 'Text required', { text: 'required' });
  const out = await db.withTx(opIdOf(req), async (conn) => { const [r] = await conn.query('INSERT INTO notes (text) VALUES (?)', [text]); return { id: r.insertId }; });
  sendTx(res, out, 201);
}));
router.put('/notes/:id', asyncH(async (req, res) => {
  const id = int(req.params.id); const fields = []; const params = [];
  if (req.body.text !== undefined) { const t = str(req.body.text, 500); if (!t) throw db.err(400, 'VALIDATION', 'Text required', { text: 'required' }); fields.push('text=?'); params.push(t); }
  if (req.body.done !== undefined) { fields.push('done=?'); params.push(req.body.done ? 1 : 0); }
  if (!fields.length) return res.json({ ok: true });
  await db.q(`UPDATE notes SET ${fields.join(',')} WHERE id=?`, [...params, id]); res.json({ ok: true });
}));
router.delete('/notes/:id', asyncH(async (req, res) => { await db.q('DELETE FROM notes WHERE id=?', [int(req.params.id)]); res.json({ ok: true }); }));

// Reports
router.get('/reports', asyncH(async (req, res) => {
  const from = str(req.query.from, 10); const to = str(req.query.to, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw db.err(400, 'VALIDATION', 'Bad date range');
  const fromTs = from + ' 00:00:00'; const toTs = to + ' 23:59:59';
  // Client sends local dates; interpret with an offset so the range matches the user's day.
  const offMin = int(req.query.tzOffset) || 0;
  const shift = (ts) => new Date(new Date(ts + 'Z').getTime() + offMin * 60000);
  const f = shift(fromTs), t = shift(toTs);
  const [[sales], [cash], [top], [debt], daily] = await Promise.all([
    db.q(`SELECT COUNT(*) AS partsUsed, COALESCE(SUM(price),0) AS revenue, COALESCE(SUM(CASE WHEN paid=1 THEN price END),0) AS revenuePaid, COALESCE(SUM(CASE WHEN paid=0 THEN price END),0) AS revenueUnpaid, COALESCE(SUM(cost_snapshot),0) AS cost FROM sales WHERE type='sale' AND status='active' AND created_at BETWEEN ? AND ?`, [f, t]),
    db.q(`SELECT COALESCE(SUM(CASE WHEN type='expense' THEN amount END),0) AS expenses, COALESCE(SUM(CASE WHEN type='withdrawal' THEN amount END),0) AS withdrawals, COALESCE(SUM(CASE WHEN type='refund' THEN amount END),0) AS refunds FROM cash_entries WHERE status='active' AND entry_at BETWEEN ? AND ?`, [f, t]),
    db.q(`SELECT product_name AS name, product_model AS model, COUNT(*) AS count, SUM(price) AS revenue FROM sales WHERE type='sale' AND status='active' AND created_at BETWEEN ? AND ? GROUP BY product_id, product_name, product_model ORDER BY count DESC, revenue DESC LIMIT 10`, [f, t]),
    db.q(`SELECT COALESCE(SUM(amount-paid_amount),0) AS outstandingDebt FROM supplier_debts WHERE status='open'`),
    db.q(`SELECT DATE(DATE_ADD(created_at, INTERVAL ? MINUTE)) AS day, COUNT(*) AS parts, SUM(price) AS revenue, SUM(cost_snapshot) AS cost FROM sales WHERE type='sale' AND status='active' AND created_at BETWEEN ? AND ? GROUP BY day ORDER BY day`, [-offMin, f, t]),
  ]);
  const topParts = await db.q(`SELECT product_name AS name, product_model AS model, COUNT(*) AS count, SUM(price) AS revenue FROM sales WHERE type='sale' AND status='active' AND created_at BETWEEN ? AND ? GROUP BY product_id, product_name, product_model ORDER BY count DESC, revenue DESC LIMIT 10`, [f, t]);
  const revenue = Number(sales.revenue), cost = Number(sales.cost), expenses = Number(cash.expenses);
  res.json({ from, to, partsUsed: sales.partsUsed, revenue, revenuePaid: Number(sales.revenuePaid), revenueUnpaid: Number(sales.revenueUnpaid), cost, expenses, withdrawals: Number(cash.withdrawals), refunds: Number(cash.refunds), profit: revenue - cost - expenses, topPart: top || null, topParts, outstandingDebt: Number(debt.outstandingDebt), daily });
}));

// Settings
router.get('/settings', asyncH(async (req, res) => {
  const [s] = await db.q('SELECT store_name AS storeName, capital FROM settings WHERE id=1');
  const cfg = db.getConfig();
  const [u] = await db.q('SELECT username FROM admin_user LIMIT 1');
  res.json({ ...s, username: u && u.username, auditRestricted: !!cfg.auditRestricted });
}));
router.put('/settings', asyncH(async (req, res) => {
  const opId = opIdOf(req);
  const storeName = req.body.storeName !== undefined ? str(req.body.storeName) : undefined;
  const capital = req.body.capital !== undefined ? num(req.body.capital, { min: 0 }) : undefined;
  if (storeName === '') throw db.err(400, 'VALIDATION', 'Store name required', { storeName: 'required' });
  if (Number.isNaN(capital)) throw db.err(400, 'VALIDATION', 'Invalid capital', { capital: 'invalid' });
  const out = await db.withTx(opId, async (conn) => {
    const [[cur]] = await conn.query('SELECT * FROM settings WHERE id=1 FOR UPDATE');
    if (storeName !== undefined && storeName !== cur.store_name) { await conn.query('UPDATE settings SET store_name=? WHERE id=1', [storeName]); await db.audit(conn, 'store_name_change', 'settings', 1, { from: cur.store_name, to: storeName }); }
    if (capital !== undefined && capital !== Number(cur.capital)) { await conn.query('UPDATE settings SET capital=? WHERE id=1', [capital]); await conn.query('INSERT INTO capital_changes (old_value, new_value) VALUES (?,?)', [cur.capital, capital]); await db.audit(conn, 'capital_change', 'settings', 1, { from: cur.capital, to: capital }); }
    return { ok: true };
  });
  sendTx(res, out);
}));
router.get('/settings/capital-history', asyncH(async (req, res) => res.json({ items: await db.q('SELECT id, old_value AS oldValue, new_value AS newValue, created_at AS createdAt FROM capital_changes ORDER BY id DESC LIMIT 100') })));

// Categories & suppliers (soft delete)
function simpleCrud(table, entity, extraCols) {
  const cols = ['name', ...(extraCols || [])];
  router.get(`/${table}`, asyncH(async (req, res) => {
    const showDeleted = req.query.deleted === '1'; const all = req.query.all === '1';
    const w = all ? '' : showDeleted ? 'WHERE deleted_at IS NOT NULL' : 'WHERE deleted_at IS NULL';
    const extra = table === 'suppliers' ? `, (SELECT COALESCE(SUM(amount-paid_amount),0) FROM supplier_debts d WHERE d.supplier_id=t.id AND d.status='open') AS openDebt` : `, (SELECT COUNT(*) FROM products p WHERE p.category_id=t.id AND p.deleted_at IS NULL) AS productCount`;
    res.json({ items: await db.q(`SELECT t.id, ${cols.map(c => 't.' + c).join(',')}, t.deleted_at AS deletedAt${extra} FROM ${table} t ${w} ORDER BY t.name LIMIT 1000`) });
  }));
  router.post(`/${table}`, asyncH(async (req, res) => {
    const vals = cols.map(c => str(req.body[c], c === 'address' ? 255 : 190) || null);
    if (!vals[0]) throw db.err(400, 'VALIDATION', 'Name required', { name: 'required' });
    const out = await db.withTx(opIdOf(req), async (conn) => {
      const [dup] = await conn.query(`SELECT id FROM ${table} WHERE name=? AND deleted_at IS NULL`, [vals[0]]);
      if (dup.length) throw db.err(409, 'NAME_TAKEN', 'Name exists', { name: 'taken' });
      const [r] = await conn.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, vals);
      await db.audit(conn, `${entity}_create`, entity, r.insertId, Object.fromEntries(cols.map((c, i) => [c, vals[i]])));
      return { id: r.insertId };
    });
    sendTx(res, out, 201);
  }));
  router.put(`/${table}/:id`, asyncH(async (req, res) => {
    const id = int(req.params.id); const vals = cols.map(c => str(req.body[c], c === 'address' ? 255 : 190) || null);
    if (!vals[0]) throw db.err(400, 'VALIDATION', 'Name required', { name: 'required' });
    const out = await db.withTx(opIdOf(req), async (conn) => {
      const [[cur]] = await conn.query(`SELECT * FROM ${table} WHERE id=? FOR UPDATE`, [id]); if (!cur) throw db.err(404, 'NOT_FOUND');
      const [dup] = await conn.query(`SELECT id FROM ${table} WHERE name=? AND deleted_at IS NULL AND id<>?`, [vals[0], id]);
      if (dup.length) throw db.err(409, 'NAME_TAKEN', 'Name exists', { name: 'taken' });
      await conn.query(`UPDATE ${table} SET ${cols.map(c => c + '=?').join(',')} WHERE id=?`, [...vals, id]);
      await db.audit(conn, `${entity}_edit`, entity, id, { before: Object.fromEntries(cols.map(c => [c, cur[c]])), after: Object.fromEntries(cols.map((c, i) => [c, vals[i]])) });
      return { ok: true };
    });
    sendTx(res, out);
  }));
  router.post(`/${table}/:id/delete`, asyncH(async (req, res) => {
    const id = int(req.params.id);
    const out = await db.withTx(opIdOf(req), async (conn) => {
      const [[cur]] = await conn.query(`SELECT * FROM ${table} WHERE id=? FOR UPDATE`, [id]); if (!cur) throw db.err(404, 'NOT_FOUND');
      if (table === 'suppliers') { const [[{ d }]] = await conn.query(`SELECT COALESCE(SUM(amount-paid_amount),0) AS d FROM supplier_debts WHERE supplier_id=? AND status='open'`, [id]); if (Number(d) > 0) throw db.err(409, 'SUPPLIER_HAS_DEBT', 'Supplier has open debt'); }
      await conn.query(`UPDATE ${table} SET deleted_at=NOW() WHERE id=?`, [id]);
      await db.audit(conn, `${entity}_delete`, entity, id, { name: cur.name });
      return { ok: true };
    });
    sendTx(res, out);
  }));
  router.post(`/${table}/:id/restore`, asyncH(async (req, res) => {
    const id = int(req.params.id);
    const out = await db.withTx(opIdOf(req), async (conn) => {
      const [[cur]] = await conn.query(`SELECT * FROM ${table} WHERE id=? FOR UPDATE`, [id]); if (!cur) throw db.err(404, 'NOT_FOUND');
      await conn.query(`UPDATE ${table} SET deleted_at=NULL WHERE id=?`, [id]);
      await db.audit(conn, `${entity}_restore`, entity, id, { name: cur.name });
      return { ok: true };
    });
    sendTx(res, out);
  }));
}
simpleCrud('categories', 'category');
simpleCrud('suppliers', 'supplier', ['phone', 'address']);

// Audit log (read-only)
router.get('/audit', asyncH(async (req, res) => {
  const { page, pageSize, offset } = pag(req);
  const where = []; const params = [];
  if (req.query.entity) { where.push('entity=?'); params.push(str(req.query.entity, 40)); }
  if (req.query.q) { where.push('(action LIKE ? OR entity LIKE ?)'); const l = `%${str(req.query.q)}%`; params.push(l, l); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const [{ total }] = await db.q(`SELECT COUNT(*) AS total FROM audit_log ${w}`, params);
  const items = await db.q(`SELECT id, action, entity, entity_id AS entityId, details, created_at AS createdAt FROM audit_log ${w} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
  res.json({ items, total, page, pageSize });
}));

// Backup via mysqldump
router.get('/db/backup', asyncH(async (req, res) => {
  const cfg = db.getConfig(); const c = cfg.db;
  const name = `backup-${c.database}-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
  res.setHeader('Content-Type', 'application/sql; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  const args = ['-h', c.host, '-P', String(c.port), '-u', c.user, '--single-transaction', '--routines', '--default-character-set=utf8mb4', c.database];
  const child = spawn('mysqldump', args, { env: { ...process.env, MYSQL_PWD: c.password } });
  let stderr = '';
  child.stderr.on('data', d => { stderr += d.toString(); });
  child.on('error', (e) => { if (!res.headersSent) res.status(500).json({ error: 'BACKUP_FAILED', message: e.message }); else res.end(); });
  child.on('close', (code) => { if (code !== 0 && !res.headersSent) res.status(500).json({ error: 'BACKUP_FAILED', message: stderr.slice(0, 500) }); else res.end(); });
  child.stdout.pipe(res);
  db.q('INSERT INTO audit_log (action, entity, details) VALUES (?,?,?)', ['backup', 'database', JSON.stringify({ file: name })]).catch(() => {});
}));

// Clean: drop all app tables and return to setup (keeps saved connection)
router.post('/db/clean', asyncH(async (req, res) => {
  if (req.body.confirm !== 'I understand this is permanent') throw db.err(400, 'VALIDATION', 'Confirmation required');
  const cfg = db.getConfig(); const c = cfg.db;
  const conn = await db.mysql.createConnection(db.connOpts(c));
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS=0');
    for (const t of db.TABLES.slice().reverse()) await conn.query(`DROP TABLE IF EXISTS ${conn.escapeId(t)}`);
    await conn.query('SET FOREIGN_KEY_CHECKS=1');
    if (cfg.appDb) { try { await conn.query('DROP USER IF EXISTS ?@?', [cfg.appDb.user, ['localhost', '127.0.0.1', '::1'].includes(c.host) ? 'localhost' : '%']); } catch {} }
  } finally { await conn.end().catch(() => {}); }
  await db.resetPool();
  db.saveConfig({ ...cfg, appDb: null, auditRestricted: false, setupComplete: false });
  req.session = null;
  res.json({ ok: true });
}));

module.exports = router;
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { asyncH, pag, num, int, str, opIdOf, sendTx } = require('../util');
const router = express.Router();

const roundDinar = (x) => Math.round(x);
const autoSku = () => 'SKU-' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase();

function validateRow(r, { isNew }) {
  const e = {};
  const out = {};
  out.name = str(r.name); if (!out.name) e.name = 'required';
  out.model = str(r.model); if (!out.model) e.model = 'required';
  out.categoryId = r.categoryId ? int(r.categoryId, { min: 1 }) : null; if (Number.isNaN(out.categoryId)) e.categoryId = 'invalid';
  out.sellingPrice = num(r.sellingPrice, { min: 0 }); if (Number.isNaN(out.sellingPrice)) e.sellingPrice = 'invalid';
  out.barcode = str(r.barcode, 100);
  if (isNew) {
    out.cost = num(r.cost, { min: 0 }); if (Number.isNaN(out.cost)) e.cost = 'invalid';
    out.quantity = int(r.quantity, { min: 0 }); if (Number.isNaN(out.quantity)) e.quantity = 'invalid';
  }
  return { values: out, errors: e };
}

const PRODUCT_COLS = 'p.id, p.name, p.model, p.category_id AS categoryId, c.name AS categoryName, p.cost_price AS cost, p.selling_price AS sellingPrice, p.quantity, p.barcode, p.deleted_at AS deletedAt, p.created_at AS createdAt, p.updated_at AS updatedAt';

router.get('/products', asyncH(async (req, res) => {
  const { page, pageSize, offset } = pag(req);
  const showDeleted = req.query.deleted === '1';
  const qn = db.normalize(req.query.q || '');
  const where = [showDeleted ? 'p.deleted_at IS NOT NULL' : 'p.deleted_at IS NULL'];
  const params = [];
  if (qn) { where.push('(p.name_norm LIKE ? OR p.model_norm LIKE ? OR LOWER(p.barcode) LIKE ? OR LOWER(c.name) LIKE ?)'); const l = `%${qn}%`; params.push(l, l, l, l); }
  if (req.query.category) { where.push('p.category_id=?'); params.push(int(req.query.category)); }
  if (req.query.stock === 'low') where.push('p.quantity=1');
  if (req.query.stock === 'out') where.push('p.quantity=0');
  const w = 'WHERE ' + where.join(' AND ');
  const [[{ total }]] = [await db.q(`SELECT COUNT(*) AS total FROM products p LEFT JOIN categories c ON c.id=p.category_id ${w}`, params)];
  const rows = await db.q(`SELECT ${PRODUCT_COLS} FROM products p LEFT JOIN categories c ON c.id=p.category_id ${w} ORDER BY p.updated_at DESC, p.id DESC LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
  res.json({ items: rows, total, page, pageSize });
}));

router.get('/products/:id', asyncH(async (req, res) => {
  const id = int(req.params.id);
  const [p] = await db.q(`SELECT ${PRODUCT_COLS} FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?`, [id]);
  if (!p) throw db.err(404, 'NOT_FOUND');
  const restocks = await db.q(`SELECT r.id, r.qty, r.unit_cost AS unitCost, r.prev_qty AS prevQty, r.prev_cost AS prevCost, r.new_selling AS newSelling, r.status, r.created_at AS createdAt, s.name AS supplierName, d.id AS debtId, d.paid_amount AS debtPaid, d.amount AS debtAmount, d.status AS debtStatus,
      (SELECT COUNT(*) FROM sales sa WHERE sa.product_id=r.product_id AND sa.id>0 AND sa.created_at>r.created_at) + (SELECT COUNT(*) FROM restocks r2 WHERE r2.product_id=r.product_id AND r2.id>r.id AND r2.status='active') AS laterEvents
     FROM restocks r JOIN suppliers s ON s.id=r.supplier_id LEFT JOIN supplier_debts d ON d.restock_id=r.id WHERE r.product_id=? ORDER BY r.id DESC LIMIT 100`, [id]);
  const sales = await db.q(`SELECT id, type, price, cost_snapshot AS costSnapshot, client_name AS clientName, paid, status, linked_sale_id AS linkedSaleId, created_at AS createdAt FROM sales WHERE product_id=? ORDER BY id DESC LIMIT 100`, [id]);
  for (const r of restocks) r.cancellable = r.status === 'active' && r.debtId && Number(r.debtPaid) === 0 && r.laterEvents === 0;
  res.json({ product: p, restocks, sales });
}));

async function ensureBarcodeFree(conn, barcode, exceptId) {
  const [rows] = await conn.query('SELECT id FROM products WHERE barcode=? AND id<>? LIMIT 1', [barcode, exceptId || 0]);
  if (rows.length) return false; return true;
}
async function ensureCategory(conn, id) {
  if (!id) return;
  const [rows] = await conn.query('SELECT id FROM categories WHERE id=? AND deleted_at IS NULL', [id]);
  if (!rows.length) throw db.err(400, 'VALIDATION', 'Category not found', { categoryId: 'invalid' });
}
async function ensureSupplier(conn, id) {
  const [rows] = await conn.query('SELECT id FROM suppliers WHERE id=? AND deleted_at IS NULL', [id]);
  if (!rows.length) throw db.err(400, 'VALIDATION', 'Supplier not found', { supplierId: 'invalid' });
}

async function insertProduct(conn, v, supplierId) {
  const barcode = v.barcode || autoSku();
  if (!(await ensureBarcodeFree(conn, barcode))) throw db.err(409, 'BARCODE_TAKEN', 'Barcode already exists', { barcode: 'taken' });
  const [r] = await conn.query('INSERT INTO products (name, name_norm, category_id, model, model_norm, cost_price, selling_price, quantity, barcode) VALUES (?,?,?,?,?,?,?,?,?)',
    [v.name, db.normalize(v.name), v.categoryId, v.model, db.normalize(v.model), v.cost, v.sellingPrice, v.quantity, barcode]);
  const id = r.insertId;
  await db.audit(conn, 'product_create', 'product', id, { ...v, barcode, supplierId });
  if (v.quantity > 0) {
    const [rs] = await conn.query('INSERT INTO restocks (product_id, supplier_id, qty, unit_cost, prev_qty, prev_cost, prev_selling, new_selling) VALUES (?,?,?,?,0,0,?,NULL)',
      [id, supplierId, v.quantity, v.cost, v.sellingPrice]);
    const amount = Math.round(v.quantity * v.cost * 100) / 100;
    await conn.query('INSERT INTO supplier_debts (supplier_id, restock_id, amount) VALUES (?,?,?)', [supplierId, rs.insertId, amount]);
    await db.audit(conn, 'restock', 'product', id, { restockId: rs.insertId, supplierId, qty: v.quantity, unitCost: v.cost, debt: amount, initial: true });
  }
  return { id, barcode };
}

router.post('/products', asyncH(async (req, res) => {
  const opId = opIdOf(req);
  const { values, errors } = validateRow(req.body, { isNew: true });
  const supplierId = req.body.supplierId ? int(req.body.supplierId, { min: 1 }) : null;
  if (values.quantity > 0 && !supplierId) errors.supplierId = 'required';
  if (Object.keys(errors).length) throw db.err(400, 'VALIDATION', 'Invalid product', errors);
  const out = await db.withTx(opId, async (conn) => {
    await ensureCategory(conn, values.categoryId);
    if (values.quantity > 0) await ensureSupplier(conn, supplierId);
    return insertProduct(conn, values, supplierId);
  });
  sendTx(res, out, 201);
}));

router.post('/products/bulk', asyncH(async (req, res) => {
  const opId = opIdOf(req);
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!rows.length || rows.length > 50) throw db.err(400, 'VALIDATION', 'Between 1 and 50 rows', { rows: 'count' });
  const supplierId = req.body.supplierId ? int(req.body.supplierId, { min: 1 }) : null;
  const rowErrors = {}; const vals = [];
  const seenBarcodes = new Set();
  rows.forEach((r, i) => {
    const { values, errors } = validateRow(r, { isNew: true });
    if (values.barcode) { if (seenBarcodes.has(values.barcode)) errors.barcode = 'duplicate'; seenBarcodes.add(values.barcode); }
    if (values.quantity > 0 && !supplierId) errors.supplierId = 'required';
    if (Object.keys(errors).length) rowErrors[i] = errors;
    vals.push(values);
  });
  if (Object.keys(rowErrors).length) throw db.err(400, 'VALIDATION', 'Row errors', { rows: rowErrors });
  const out = await db.withTx(opId, async (conn) => {
    if (vals.some(v => v.quantity > 0)) await ensureSupplier(conn, supplierId);
    const ids = [];
    for (let i = 0; i < vals.length; i++) {
      await ensureCategory(conn, vals[i].categoryId);
      try { ids.push((await insertProduct(conn, vals[i], supplierId)).id); }
      catch (e) { if (e.code === 'BARCODE_TAKEN') throw db.err(409, 'VALIDATION', 'Barcode taken', { rows: { [i]: { barcode: 'taken' } } }); throw e; }
    }
    return { ids, count: ids.length };
  });
  sendTx(res, out, 201);
}));

router.put('/products/:id', asyncH(async (req, res) => {
  const opId = opIdOf(req); const id = int(req.params.id);
  const { values, errors } = validateRow(req.body, { isNew: false });
  if (!values.barcode) errors.barcode = 'required';
  if (Object.keys(errors).length) throw db.err(400, 'VALIDATION', 'Invalid product', errors);
  const out = await db.withTx(opId, async (conn) => {
    const [[p]] = await conn.query('SELECT * FROM products WHERE id=? FOR UPDATE', [id]);
    if (!p) throw db.err(404, 'NOT_FOUND');
    if (p.deleted_at) throw db.err(409, 'PRODUCT_DELETED');
    await ensureCategory(conn, values.categoryId);
    if (!(await ensureBarcodeFree(conn, values.barcode, id))) throw db.err(409, 'BARCODE_TAKEN', 'Barcode already exists', { barcode: 'taken' });
    await conn.query('UPDATE products SET name=?, name_norm=?, category_id=?, model=?, model_norm=?, selling_price=?, barcode=? WHERE id=?',
      [values.name, db.normalize(values.name), values.categoryId, values.model, db.normalize(values.model), values.sellingPrice, values.barcode, id]);
    await db.audit(conn, 'product_edit', 'product', id, { before: { name: p.name, categoryId: p.category_id, model: p.model, sellingPrice: p.selling_price, barcode: p.barcode }, after: values });
    return { id };
  });
  sendTx(res, out);
}));

router.post('/products/:id/restock', asyncH(async (req, res) => {
  const opId = opIdOf(req); const id = int(req.params.id);
  const supplierId = int(req.body.supplierId, { min: 1 }); const qty = int(req.body.qty, { min: 1 }); const unitCost = num(req.body.unitCost, { min: 0 });
  const newSelling = req.body.newSellingPrice === '' || req.body.newSellingPrice == null ? null : num(req.body.newSellingPrice, { min: 0 });
  const errors = {};
  if (Number.isNaN(supplierId)) errors.supplierId = 'required';
  if (Number.isNaN(qty)) errors.qty = 'invalid';
  if (Number.isNaN(unitCost)) errors.unitCost = 'invalid';
  if (Number.isNaN(newSelling)) errors.newSellingPrice = 'invalid';
  if (Object.keys(errors).length) throw db.err(400, 'VALIDATION', 'Invalid restock', errors);
  const out = await db.withTx(opId, async (conn) => {
    const [[p]] = await conn.query('SELECT * FROM products WHERE id=? FOR UPDATE', [id]);
    if (!p) throw db.err(404, 'NOT_FOUND');
    if (p.deleted_at) throw db.err(409, 'PRODUCT_DELETED');
    await ensureSupplier(conn, supplierId);
    const total = p.quantity + qty;
    const newCost = roundDinar((p.quantity * Number(p.cost_price) + qty * unitCost) / total);
    const [rs] = await conn.query('INSERT INTO restocks (product_id, supplier_id, qty, unit_cost, prev_qty, prev_cost, prev_selling, new_selling) VALUES (?,?,?,?,?,?,?,?)',
      [id, supplierId, qty, unitCost, p.quantity, p.cost_price, p.selling_price, newSelling]);
    const amount = Math.round(qty * unitCost * 100) / 100;
    const [d] = await conn.query('INSERT INTO supplier_debts (supplier_id, restock_id, amount) VALUES (?,?,?)', [supplierId, rs.insertId, amount]);
    await conn.query('UPDATE products SET quantity=?, cost_price=?, selling_price=? WHERE id=?', [total, newCost, newSelling ?? p.selling_price, id]);
    await db.audit(conn, 'restock', 'product', id, { restockId: rs.insertId, debtId: d.insertId, supplierId, qty, unitCost, debt: amount, newCost, newSelling, prevQty: p.quantity, prevCost: p.cost_price });
    return { restockId: rs.insertId, quantity: total, cost: newCost };
  });
  sendTx(res, out, 201);
}));

router.post('/restocks/:id/cancel', asyncH(async (req, res) => {
  const opId = opIdOf(req); const rid = int(req.params.id);
  const out = await db.withTx(opId, async (conn) => {
    const [[r]] = await conn.query('SELECT * FROM restocks WHERE id=? FOR UPDATE', [rid]);
    if (!r) throw db.err(404, 'NOT_FOUND');
    if (r.status !== 'active') throw db.err(409, 'RESTOCK_ALREADY_CANCELLED');
    const [[p]] = await conn.query('SELECT * FROM products WHERE id=? FOR UPDATE', [r.product_id]);
    const [[d]] = await conn.query('SELECT * FROM supplier_debts WHERE restock_id=? FOR UPDATE', [rid]);
    if (!d || Number(d.paid_amount) > 0) throw db.err(409, 'RESTOCK_HAS_PAYMENT', 'Debt already has a payment');
    const [[{ n }]] = await conn.query(`SELECT (SELECT COUNT(*) FROM sales WHERE product_id=? AND created_at>?) + (SELECT COUNT(*) FROM restocks WHERE product_id=? AND id>? AND status='active') AS n`, [r.product_id, r.created_at, r.product_id, rid]);
    if (n > 0) throw db.err(409, 'RESTOCK_HAS_LATER_EVENTS', 'Later sale/return/restock exists');
    if (p.quantity - r.qty < 0) throw db.err(409, 'RESTOCK_HAS_LATER_EVENTS');
    await conn.query('UPDATE products SET quantity=?, cost_price=?, selling_price=? WHERE id=?', [r.prev_qty, r.prev_cost, r.prev_selling, p.id]);
    await conn.query(`UPDATE restocks SET status='cancelled', cancelled_at=NOW() WHERE id=?`, [rid]);
    await conn.query(`UPDATE supplier_debts SET status='cancelled' WHERE id=?`, [d.id]);
    await db.audit(conn, 'restock_cancel', 'product', p.id, { restockId: rid, debtId: d.id, restored: { qty: r.prev_qty, cost: r.prev_cost, selling: r.prev_selling } });
    return { ok: true };
  });
  sendTx(res, out);
}));

router.post('/products/:id/delete', asyncH(async (req, res) => {
  const opId = opIdOf(req); const id = int(req.params.id);
  const out = await db.withTx(opId, async (conn) => {
    const [[p]] = await conn.query('SELECT * FROM products WHERE id=? FOR UPDATE', [id]);
    if (!p) throw db.err(404, 'NOT_FOUND');
    if (p.deleted_at) return { ok: true };
    if (p.quantity !== 0) throw db.err(409, 'PRODUCT_HAS_STOCK', 'Quantity must be 0');
    await conn.query('UPDATE products SET deleted_at=NOW() WHERE id=?', [id]);
    await db.audit(conn, 'product_delete', 'product', id, { name: p.name });
    return { ok: true };
  });
  sendTx(res, out);
}));

router.post('/products/:id/restore', asyncH(async (req, res) => {
  const opId = opIdOf(req); const id = int(req.params.id);
  const out = await db.withTx(opId, async (conn) => {
    const [[p]] = await conn.query('SELECT * FROM products WHERE id=? FOR UPDATE', [id]);
    if (!p) throw db.err(404, 'NOT_FOUND');
    if (!p.deleted_at) return { ok: true };
    if (!(await ensureBarcodeFree(conn, p.barcode, id))) throw db.err(409, 'BARCODE_TAKEN', 'Barcode now used by another product', { barcode: 'taken' });
    await conn.query('UPDATE products SET deleted_at=NULL WHERE id=?', [id]);
    await db.audit(conn, 'product_restore', 'product', id, { name: p.name });
    return { ok: true };
  });
  sendTx(res, out);
}));

module.exports = router;
const express = require('express');
const db = require('../db');
const { asyncH, pag, num, int, str, opIdOf, sendTx } = require('../util');
const router = express.Router();

const SALE_COLS = 's.id, s.type, s.product_id AS productId, s.product_name AS productName, s.product_model AS productModel, s.price, s.cost_snapshot AS costSnapshot, s.client_name AS clientName, s.paid, s.paid_at AS paidAt, s.status, s.linked_sale_id AS linkedSaleId, s.created_at AS createdAt, p.deleted_at AS productDeleted';

router.post('/sales/use', asyncH(async (req, res) => {
  const opId = opIdOf(req);
  const productId = int(req.body.productId, { min: 1 }); const price = num(req.body.price, { min: 0 });
  const clientName = str(req.body.clientName) || 'passenger'; const paid = !!req.body.paid;
  const errors = {}; if (Number.isNaN(productId)) errors.productId = 'required'; if (Number.isNaN(price)) errors.price = 'invalid';
  if (Object.keys(errors).length) throw db.err(400, 'VALIDATION', 'Invalid sale', errors);
  const out = await db.withTx(opId, async (conn) => {
    const [[p]] = await conn.query('SELECT * FROM products WHERE id=? FOR UPDATE', [productId]);
    if (!p) throw db.err(404, 'NOT_FOUND');
    if (p.deleted_at) throw db.err(409, 'PRODUCT_DELETED');
    if (p.quantity < 1) throw db.err(409, 'OUT_OF_STOCK', 'No stock left', { quantity: p.quantity });
    await conn.query('UPDATE products SET quantity=quantity-1 WHERE id=?', [productId]);
    const [r] = await conn.query('INSERT INTO sales (type, product_id, product_name, product_model, price, cost_snapshot, client_name, paid, paid_at) VALUES (\'sale\',?,?,?,?,?,?,?,?)',
      [productId, p.name, p.model, price, p.cost_price, clientName, paid ? 1 : 0, paid ? new Date() : null]);
    await db.audit(conn, 'sale', 'sale', r.insertId, { productId, price, costSnapshot: p.cost_price, clientName, paid, remaining: p.quantity - 1 });
    return { saleId: r.insertId, remaining: p.quantity - 1, product: { name: p.name, model: p.model }, price, clientName, paid };
  });
  sendTx(res, out, 201);
}));

router.get('/sales', asyncH(async (req, res) => {
  const { page, pageSize, offset } = pag(req);
  const where = ["s.type='sale'"]; const params = [];
  if (req.query.paid === '0') { where.push("s.paid=0 AND s.status='active'"); }
  else if (req.query.paid === '1') where.push('s.paid=1');
  if (req.query.client) { where.push('s.client_name=?'); params.push(str(req.query.client)); }
  if (req.query.q) { where.push('(s.product_name LIKE ? OR s.client_name LIKE ?)'); const l = `%${str(req.query.q)}%`; params.push(l, l); }
  const w = 'WHERE ' + where.join(' AND ');
  const [{ total }] = await db.q(`SELECT COUNT(*) AS total FROM sales s ${w}`, params);
  const items = await db.q(`SELECT ${SALE_COLS} FROM sales s JOIN products p ON p.id=s.product_id ${w} ORDER BY s.id DESC LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
  res.json({ items, total, page, pageSize });
}));

router.get('/clients/:name', asyncH(async (req, res) => {
  const name = str(req.params.name);
  const items = await db.q(`SELECT ${SALE_COLS} FROM sales s JOIN products p ON p.id=s.product_id WHERE s.type='sale' AND s.client_name=? ORDER BY s.id DESC LIMIT 500`, [name]);
  const [t] = await db.q(`SELECT COALESCE(SUM(price),0) AS totalSpent, COUNT(*) AS purchases, COALESCE(SUM(CASE WHEN paid=0 THEN price ELSE 0 END),0) AS unpaid FROM sales WHERE type='sale' AND status='active' AND client_name=?`, [name]);
  res.json({ client: name, items, ...t });
}));

router.get('/clients', asyncH(async (req, res) => {
  const { page, pageSize, offset } = pag(req);
  const items = await db.q(`SELECT client_name AS clientName, COUNT(*) AS purchases, COALESCE(SUM(CASE WHEN status='active' THEN price ELSE 0 END),0) AS totalSpent, COALESCE(SUM(CASE WHEN status='active' AND paid=0 THEN price ELSE 0 END),0) AS unpaid, MAX(created_at) AS lastPurchase FROM sales WHERE type='sale' GROUP BY client_name ORDER BY lastPurchase DESC LIMIT ? OFFSET ?`, [pageSize, offset]);
  const [{ total }] = await db.q(`SELECT COUNT(DISTINCT client_name) AS total FROM sales WHERE type='sale'`);
  res.json({ items, total, page, pageSize });
}));

router.post('/sales/:id/pay', asyncH(async (req, res) => {
  const opId = opIdOf(req); const id = int(req.params.id);
  const out = await db.withTx(opId, async (conn) => {
    const [[s]] = await conn.query('SELECT * FROM sales WHERE id=? FOR UPDATE', [id]);
    if (!s || s.type !== 'sale') throw db.err(404, 'NOT_FOUND');
    if (s.status === 'returned') throw db.err(409, 'SALE_RETURNED', 'Sale was returned');
    if (s.paid) throw db.err(409, 'ALREADY_PAID');
    await conn.query('UPDATE sales SET paid=1, paid_at=NOW() WHERE id=?', [id]);
    await db.audit(conn, 'sale_paid', 'sale', id, { price: s.price, clientName: s.client_name });
    return { ok: true };
  });
  sendTx(res, out);
}));

router.put('/sales/:id/price', asyncH(async (req, res) => {
  const opId = opIdOf(req); const id = int(req.params.id); const price = num(req.body.price, { min: 0 });
  if (Number.isNaN(price)) throw db.err(400, 'VALIDATION', 'Invalid price', { price: 'invalid' });
  const out = await db.withTx(opId, async (conn) => {
    const [[s]] = await conn.query('SELECT * FROM sales WHERE id=? FOR UPDATE', [id]);
    if (!s || s.type !== 'sale') throw db.err(404, 'NOT_FOUND');
    if (s.paid) throw db.err(409, 'PRICE_LOCKED', 'Paid sales are locked');
    if (s.status === 'returned') throw db.err(409, 'SALE_RETURNED');
    await conn.query('UPDATE sales SET price=? WHERE id=?', [price, id]);
    await db.audit(conn, 'sale_price_edit', 'sale', id, { from: s.price, to: price });
    return { ok: true };
  });
  sendTx(res, out);
}));

router.post('/sales/:id/return', asyncH(async (req, res) => {
  const opId = opIdOf(req); const id = int(req.params.id);
  const out = await db.withTx(opId, async (conn) => {
    const [[s]] = await conn.query('SELECT * FROM sales WHERE id=? FOR UPDATE', [id]);
    if (!s || s.type !== 'sale') throw db.err(404, 'NOT_FOUND');
    if (s.status === 'returned') throw db.err(409, 'ALREADY_RETURNED');
    const [[p]] = await conn.query('SELECT * FROM products WHERE id=? FOR UPDATE', [s.product_id]);
    if (p.deleted_at) throw db.err(409, 'PRODUCT_DELETED', 'Restore the product first');
    const newQty = p.quantity + 1;
    const newCost = Math.round((p.quantity * Number(p.cost_price) + Number(s.cost_snapshot)) / newQty);
    await conn.query('UPDATE products SET quantity=?, cost_price=? WHERE id=?', [newQty, newCost, p.id]);
    const [r] = await conn.query('INSERT INTO sales (type, product_id, product_name, product_model, price, cost_snapshot, client_name, paid, paid_at, status, linked_sale_id) VALUES (\'return\',?,?,?,?,?,?,?,?,\'active\',?)',
      [s.product_id, s.product_name, s.product_model, s.price, s.cost_snapshot, s.client_name, s.paid, s.paid_at, id]);
    await conn.query(`UPDATE sales SET status='returned', linked_sale_id=? WHERE id=?`, [r.insertId, id]);
    let refund = 0;
    if (s.paid) {
      refund = Number(s.price);
      await conn.query(`INSERT INTO cash_entries (type, amount, description, linked_id) VALUES ('refund', ?, ?, ?)`, [refund, `Refund: ${s.product_name} (${s.client_name})`, id]);
    }
    await db.audit(conn, 'sale_return', 'sale', id, { returnId: r.insertId, refund, newQty, newCost });
    return { returnId: r.insertId, refund };
  });
  sendTx(res, out, 201);
}));

module.exports = router;
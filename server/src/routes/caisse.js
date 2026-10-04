const express = require('express');
const db = require('../db');
const { asyncH, pag, num, int, str, opIdOf, sendTx } = require('../util');
const router = express.Router();

async function summary() {
  const [[st], [c], [u], [cash], [sp], [stock], [debt]] = await Promise.all([
    db.q('SELECT capital, store_name AS storeName FROM settings WHERE id=1'),
    db.q(`SELECT COALESCE(SUM(price),0) AS collected FROM sales WHERE type='sale' AND paid=1`),
    db.q(`SELECT COALESCE(SUM(price),0) AS unpaid, COUNT(*) AS unpaidCount FROM sales WHERE type='sale' AND paid=0 AND status='active'`),
    db.q(`SELECT COALESCE(SUM(CASE WHEN type='refund' THEN amount END),0) AS refunds, COALESCE(SUM(CASE WHEN type='expense' THEN amount END),0) AS expenses, COALESCE(SUM(CASE WHEN type='withdrawal' THEN amount END),0) AS withdrawals FROM cash_entries WHERE status='active'`),
    db.q('SELECT COALESCE(SUM(amount),0) AS paidToSuppliers FROM supplier_payments'),
    db.q('SELECT COALESCE(SUM(quantity*cost_price),0) AS stockValue FROM products WHERE deleted_at IS NULL'),
    db.q(`SELECT COALESCE(SUM(amount-paid_amount),0) AS outstandingDebt FROM supplier_debts WHERE status='open'`),
  ]);
  const capital = Number(st.capital);
  const balance = capital + Number(c.collected) - Number(cash.refunds) - Number(cash.expenses) - Number(cash.withdrawals) - Number(sp.paidToSuppliers);
  return { storeName: st.storeName, capital, collected: Number(c.collected), refunds: Number(cash.refunds), expenses: Number(cash.expenses), withdrawals: Number(cash.withdrawals),
    paidToSuppliers: Number(sp.paidToSuppliers), unpaid: Number(u.unpaid), unpaidCount: u.unpaidCount, stockValue: Number(stock.stockValue), outstandingDebt: Number(debt.outstandingDebt),
    balance, totalAssets: balance + Number(stock.stockValue) };
}

router.get('/caisse/summary', asyncH(async (req, res) => res.json(await summary())));

router.get('/cash', asyncH(async (req, res) => {
  const { page, pageSize, offset } = pag(req);
  const type = req.query.type === 'withdrawal' ? 'withdrawal' : req.query.type === 'refund' ? 'refund' : 'expense';
  const [{ total }] = await db.q('SELECT COUNT(*) AS total FROM cash_entries WHERE type=?', [type]);
  const items = await db.q(`SELECT e.id, e.type, e.amount, e.description, e.status, e.entry_at AS entryAt, e.created_at AS createdAt, e.linked_id AS linkedId, (SELECT id FROM cash_entries r WHERE r.type='reversal' AND r.linked_id=e.id LIMIT 1) AS reversalId FROM cash_entries e WHERE e.type=? ORDER BY e.entry_at DESC, e.id DESC LIMIT ? OFFSET ?`, [type, pageSize, offset]);
  res.json({ items, total, page, pageSize });
}));

router.post('/cash', asyncH(async (req, res) => {
  const opId = opIdOf(req);
  const type = req.body.type === 'withdrawal' ? 'withdrawal' : req.body.type === 'expense' ? 'expense' : null;
  const amount = num(req.body.amount, { min: 0.01 }); const description = str(req.body.description, 255);
  let entryAt = req.body.entryAt ? new Date(req.body.entryAt) : new Date();
  const errors = {}; if (!type) errors.type = 'invalid'; if (Number.isNaN(amount)) errors.amount = 'invalid'; if (!description) errors.description = 'required'; if (isNaN(entryAt.getTime())) errors.entryAt = 'invalid';
  if (Object.keys(errors).length) throw db.err(400, 'VALIDATION', 'Invalid entry', errors);
  const out = await db.withTx(opId, async (conn) => {
    const s = await summary();
    const [r] = await conn.query('INSERT INTO cash_entries (type, amount, description, entry_at) VALUES (?,?,?,?)', [type, amount, description, entryAt]);
    await db.audit(conn, type, 'cash', r.insertId, { amount, description, entryAt, balanceAfter: s.balance - amount });
    return { id: r.insertId, balanceAfter: s.balance - amount };
  });
  sendTx(res, out, 201);
}));

router.post('/cash/:id/cancel', asyncH(async (req, res) => {
  const opId = opIdOf(req); const id = int(req.params.id);
  const out = await db.withTx(opId, async (conn) => {
    const [[e]] = await conn.query('SELECT * FROM cash_entries WHERE id=? FOR UPDATE', [id]);
    if (!e) throw db.err(404, 'NOT_FOUND');
    if (!['expense', 'withdrawal'].includes(e.type)) throw db.err(409, 'NOT_CANCELLABLE');
    if (e.status === 'cancelled') throw db.err(409, 'ALREADY_CANCELLED');
    const [r] = await conn.query(`INSERT INTO cash_entries (type, amount, description, linked_id, status) VALUES ('reversal', ?, ?, ?, 'cancelled')`, [e.amount, `Reversal of #${id}: ${e.description || ''}`.slice(0, 255), id]);
    await conn.query(`UPDATE cash_entries SET status='cancelled' WHERE id=?`, [id]);
    await db.audit(conn, e.type + '_cancel', 'cash', id, { reversalId: r.insertId, amount: e.amount });
    return { reversalId: r.insertId };
  });
  sendTx(res, out);
}));

module.exports = { router, summary };
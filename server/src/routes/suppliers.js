const express = require('express');
const db = require('../db');
const { asyncH, pag, num, int, str, opIdOf, sendTx } = require('../util');
const router = express.Router();

router.get('/debts', asyncH(async (req, res) => {
  const items = await db.q(`SELECT s.id AS supplierId, s.name, s.phone, s.deleted_at AS deletedAt,
      COALESCE(SUM(CASE WHEN d.status<>'cancelled' THEN d.amount END),0) AS totalDebt,
      COALESCE(SUM(CASE WHEN d.status<>'cancelled' THEN d.paid_amount END),0) AS paid,
      COALESCE(SUM(CASE WHEN d.status='open' THEN d.amount-d.paid_amount END),0) AS remaining,
      SUM(CASE WHEN d.status='open' THEN 1 ELSE 0 END) AS openCount
    FROM suppliers s LEFT JOIN supplier_debts d ON d.supplier_id=s.id
    GROUP BY s.id HAVING totalDebt>0 OR s.deleted_at IS NULL ORDER BY remaining DESC, s.name`);
  res.json({ items });
}));

router.get('/debts/:supplierId', asyncH(async (req, res) => {
  const sid = int(req.params.supplierId);
  const [supplier] = await db.q('SELECT id, name, phone, address FROM suppliers WHERE id=?', [sid]);
  if (!supplier) throw db.err(404, 'NOT_FOUND');
  const debts = await db.q(`SELECT d.id, d.amount, d.paid_amount AS paidAmount, d.status, d.created_at AS createdAt, r.qty, r.unit_cost AS unitCost, p.name AS productName, p.model AS productModel
    FROM supplier_debts d LEFT JOIN restocks r ON r.id=d.restock_id LEFT JOIN products p ON p.id=r.product_id WHERE d.supplier_id=? ORDER BY d.id DESC LIMIT 200`, [sid]);
  const payments = await db.q('SELECT id, amount, note, created_at AS createdAt FROM supplier_payments WHERE supplier_id=? ORDER BY id DESC LIMIT 200', [sid]);
  res.json({ supplier, debts, payments });
}));

router.post('/debts/:supplierId/pay', asyncH(async (req, res) => {
  const opId = opIdOf(req); const sid = int(req.params.supplierId); const amount = num(req.body.amount, { min: 0.01 }); const note = str(req.body.note, 255);
  if (Number.isNaN(amount)) throw db.err(400, 'VALIDATION', 'Invalid amount', { amount: 'invalid' });
  const out = await db.withTx(opId, async (conn) => {
    const [debts] = await conn.query(`SELECT * FROM supplier_debts WHERE supplier_id=? AND status='open' ORDER BY created_at, id FOR UPDATE`, [sid]);
    const remaining = debts.reduce((a, d) => a + Number(d.amount) - Number(d.paid_amount), 0);
    if (amount > remaining + 0.005) throw db.err(409, 'PAYMENT_EXCEEDS_DEBT', 'Payment exceeds remaining debt', { remaining });
    const [pay] = await conn.query('INSERT INTO supplier_payments (supplier_id, amount, note) VALUES (?,?,?)', [sid, amount, note || null]);
    let left = amount; const allocations = [];
    for (const d of debts) {
      if (left <= 0) break;
      const due = Number(d.amount) - Number(d.paid_amount);
      const take = Math.min(due, left); left = Math.round((left - take) * 100) / 100;
      const newPaid = Math.round((Number(d.paid_amount) + take) * 100) / 100;
      await conn.query('UPDATE supplier_debts SET paid_amount=?, status=? WHERE id=?', [newPaid, newPaid >= Number(d.amount) - 0.005 ? 'paid' : 'open', d.id]);
      await conn.query('INSERT INTO payment_allocations (payment_id, debt_id, amount) VALUES (?,?,?)', [pay.insertId, d.id, take]);
      allocations.push({ debtId: d.id, amount: take });
    }
    await db.audit(conn, 'supplier_payment', 'supplier', sid, { paymentId: pay.insertId, amount, allocations });
    return { paymentId: pay.insertId, remaining: Math.round((remaining - amount) * 100) / 100 };
  });
  sendTx(res, out, 201);
}));

module.exports = router;
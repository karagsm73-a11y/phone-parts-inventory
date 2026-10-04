const { err } = require('./db');

const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function pag(req) {
  const allowed = [10, 25, 50, 100];
  let pageSize = parseInt(req.query.pageSize, 10); if (!allowed.includes(pageSize)) pageSize = 10;
  let page = parseInt(req.query.page, 10); if (!page || page < 1) page = 1;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function num(v, { min, allowNull } = {}) {
  if (v === '' || v === null || v === undefined) { if (allowNull) return null; return NaN; }
  const n = Number(v);
  if (!Number.isFinite(n)) return NaN;
  if (min !== undefined && n < min) return NaN;
  return Math.round(n * 100) / 100;
}
function int(v, { min } = {}) {
  if (v === '' || v === null || v === undefined) return NaN;
  const n = Number(v);
  if (!Number.isInteger(n)) return NaN;
  if (min !== undefined && n < min) return NaN;
  return n;
}
function str(v, max = 190) { if (v === null || v === undefined) return ''; return String(v).trim().slice(0, max); }
function opIdOf(req) {
  const id = req.body && req.body.opId;
  if (!id || typeof id !== 'string' || id.length > 36) throw err(400, 'MISSING_OP_ID', 'Operation ID is required');
  return id;
}
function sendTx(res, out, status = 200) { res.status(out.duplicate ? 200 : status).json({ ...(out.result || {}), duplicate: out.duplicate }); }

module.exports = { asyncH, pag, num, int, str, opIdOf, sendTx };
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'db.json');

let config = null;
let pool = null;

function loadConfig() {
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    config = { sessionSecret: crypto.randomBytes(32).toString('hex'), db: null, appDb: null, setupComplete: false, auditRestricted: false };
    saveConfig(config);
  }
  return config;
}
function saveConfig(c) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2), { mode: 0o600 });
  try { fs.chmodSync(CONFIG_FILE, 0o600); } catch {}
  config = c;
}
function getConfig() { return config || loadConfig(); }

function connOpts(c) {
  return { host: c.host, port: Number(c.port) || 3306, user: c.user, password: c.password, database: c.database,
    charset: 'utf8mb4', timezone: 'Z', dateStrings: true, decimalNumbers: true, connectTimeout: 8000, multipleStatements: false };
}
function getPool() {
  const cfg = getConfig();
  if (!pool && cfg.setupComplete && cfg.db) {
    pool = mysql.createPool({ ...connOpts(cfg.appDb || cfg.db), waitForConnections: true, connectionLimit: 10 });
  }
  return pool;
}
async function resetPool() { if (pool) { const p = pool; pool = null; await p.end().catch(() => {}); } }

async function testConnection(c) {
  const conn = await mysql.createConnection(connOpts(c));
  try {
    const [rows] = await conn.query('SHOW TABLES');
    const [[ver]] = await conn.query('SELECT VERSION() AS v');
    return { tables: rows.length, version: ver.v };
  } finally { await conn.end(); }
}

// Arabic-aware normalization: strip diacritics, unify letter variants, lowercase.
function normalize(s) {
  if (!s) return '';
  return String(s).normalize('NFKC')
    .replace(/[\u064B-\u0652\u0670\u0640\u06D6-\u06ED]/g, '')
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    .replace(/\u0649/g, '\u064A').replace(/\u0629/g, '\u0647')
    .replace(/\u0624/g, '\u0648').replace(/\u0626/g, '\u064A')
    .replace(/[\u06A9]/g, '\u0643').replace(/[\u06CC]/g, '\u064A')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

class HttpError extends Error {
  constructor(status, code, message, details) { super(message || code); this.status = status; this.code = code; this.details = details; }
}
const err = (status, code, message, details) => new HttpError(status, code, message, details);

async function audit(conn, action, entity, entityId, details) {
  await conn.query('INSERT INTO audit_log (action, entity, entity_id, details) VALUES (?,?,?,?)',
    [action, entity, entityId ?? null, details ? JSON.stringify(details) : null]);
}

// Run fn inside one InnoDB transaction. opId guarantees idempotency (UNIQUE key).
async function withTx(opId, fn) {
  const p = getPool();
  if (!p) throw err(503, 'NO_DATABASE', 'Database not configured');
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    if (opId) {
      try { await conn.query('INSERT INTO operations (op_id) VALUES (?)', [opId]); }
      catch (e) {
        if (e.code === 'ER_DUP_ENTRY') {
          await conn.rollback();
          const [rows] = await p.query('SELECT result FROM operations WHERE op_id=?', [opId]);
          return { duplicate: true, result: rows[0] ? rows[0].result : null };
        }
        throw e;
      }
    }
    const result = await fn(conn);
    if (opId) await conn.query('UPDATE operations SET result=? WHERE op_id=?', [JSON.stringify(result ?? null), opId]);
    await conn.commit();
    return { duplicate: false, result };
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally { conn.release(); }
}

async function q(sql, params) { const p = getPool(); if (!p) throw err(503, 'NO_DATABASE', 'Database not configured'); const [rows] = await p.query(sql, params); return rows; }

const TABLES = ['settings','admin_user','categories','suppliers','products','restocks','supplier_debts','supplier_payments','payment_allocations','sales','cash_entries','capital_changes','notes','audit_log','operations'];

const MIGRATIONS = [
`CREATE TABLE settings (id TINYINT PRIMARY KEY, store_name VARCHAR(190) NOT NULL, capital DECIMAL(14,2) NOT NULL DEFAULT 0, setup_complete TINYINT(1) NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
`CREATE TABLE admin_user (id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(100) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
`CREATE TABLE categories (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(190) NOT NULL, deleted_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
`CREATE TABLE suppliers (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(190) NOT NULL, phone VARCHAR(60) NULL, address VARCHAR(255) NULL, deleted_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
`CREATE TABLE products (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(190) NOT NULL, name_norm VARCHAR(190) NOT NULL, category_id INT NULL, model VARCHAR(190) NOT NULL, model_norm VARCHAR(190) NOT NULL, cost_price DECIMAL(12,2) NOT NULL DEFAULT 0, selling_price DECIMAL(12,2) NOT NULL DEFAULT 0, quantity INT NOT NULL DEFAULT 0, barcode VARCHAR(100) NOT NULL, deleted_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uq_barcode (barcode), KEY ix_name (name_norm), KEY ix_model (model_norm), KEY ix_qty (quantity), CONSTRAINT fk_prod_cat FOREIGN KEY (category_id) REFERENCES categories(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
`CREATE TABLE restocks (id INT AUTO_INCREMENT PRIMARY KEY, product_id INT NOT NULL, supplier_id INT NOT NULL, qty INT NOT NULL, unit_cost DECIMAL(12,2) NOT NULL, prev_qty INT NOT NULL, prev_cost DECIMAL(12,2) NOT NULL, prev_selling DECIMAL(12,2) NOT NULL, new_selling DECIMAL(12,2) NULL, status ENUM('active','cancelled') NOT NULL DEFAULT 'active', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, cancelled_at DATETIME NULL, KEY ix_prod (product_id, created_at), CONSTRAINT fk_rs_prod FOREIGN KEY (product_id) REFERENCES products(id), CONSTRAINT fk_rs_sup FOREIGN KEY (supplier_id) REFERENCES suppliers(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
`CREATE TABLE supplier_debts (id INT AUTO_INCREMENT PRIMARY KEY, supplier_id INT NOT NULL, restock_id INT NULL, amount DECIMAL(14,2) NOT NULL, paid_amount DECIMAL(14,2) NOT NULL DEFAULT 0, status ENUM('open','paid','cancelled') NOT NULL DEFAULT 'open', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY ix_sup (supplier_id, status, created_at), CONSTRAINT fk_sd_sup FOREIGN KEY (supplier_id) REFERENCES suppliers(id), CONSTRAINT fk_sd_rs FOREIGN KEY (restock_id) REFERENCES restocks(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
`CREATE TABLE supplier_payments (id INT AUTO_INCREMENT PRIMARY KEY, supplier_id INT NOT NULL, amount DECIMAL(14,2) NOT NULL, note VARCHAR(255) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY ix_sup (supplier_id, created_at), CONSTRAINT fk_sp_sup FOREIGN KEY (supplier_id) REFERENCES suppliers(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
`CREATE TABLE payment_allocations (id INT AUTO_INCREMENT PRIMARY KEY, payment_id INT NOT NULL, debt_id INT NOT NULL, amount DECIMAL(14,2) NOT NULL, CONSTRAINT fk_pa_pay FOREIGN KEY (payment_id) REFERENCES supplier_payments(id), CONSTRAINT fk_pa_debt FOREIGN KEY (debt_id) REFERENCES supplier_debts(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
`CREATE TABLE sales (id INT AUTO_INCREMENT PRIMARY KEY, type ENUM('sale','return') NOT NULL DEFAULT 'sale', product_id INT NOT NULL, product_name VARCHAR(190) NOT NULL, product_model VARCHAR(190) NOT NULL, price DECIMAL(12,2) NOT NULL, cost_snapshot DECIMAL(12,2) NOT NULL, client_name VARCHAR(190) NOT NULL DEFAULT 'passenger', paid TINYINT(1) NOT NULL DEFAULT 0, paid_at DATETIME NULL, status ENUM('active','returned') NOT NULL DEFAULT 'active', linked_sale_id INT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY ix_created (created_at), KEY ix_client (client_name), KEY ix_prod (product_id, created_at), KEY ix_paid (type, status, paid), CONSTRAINT fk_sale_prod FOREIGN KEY (product_id) REFERENCES products(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
`CREATE TABLE cash_entries (id INT AUTO_INCREMENT PRIMARY KEY, type ENUM('expense','withdrawal','refund','reversal') NOT NULL, amount DECIMAL(14,2) NOT NULL, description VARCHAR(255) NULL, linked_id INT NULL, status ENUM('active','cancelled') NOT NULL DEFAULT 'active', entry_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY ix_type (type, status, entry_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
`CREATE TABLE capital_changes (id INT AUTO_INCREMENT PRIMARY KEY, old_value DECIMAL(14,2) NOT NULL, new_value DECIMAL(14,2) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
`CREATE TABLE notes (id INT AUTO_INCREMENT PRIMARY KEY, text VARCHAR(500) NOT NULL, done TINYINT(1) NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
`CREATE TABLE audit_log (id BIGINT AUTO_INCREMENT PRIMARY KEY, action VARCHAR(60) NOT NULL, entity VARCHAR(40) NOT NULL, entity_id INT NULL, details JSON NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY ix_created (created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
`CREATE TABLE operations (op_id CHAR(36) PRIMARY KEY, result JSON NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

module.exports = { loadConfig, saveConfig, getConfig, getPool, resetPool, testConnection, connOpts, normalize, HttpError, err, audit, withTx, q, TABLES, MIGRATIONS, mysql };
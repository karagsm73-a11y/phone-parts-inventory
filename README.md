# Phone Parts Inventory

Single-shop phone parts inventory (Spec v8.1): React SPA + Node/Express + MySQL (InnoDB). Currency TND. English / Arabic (RTL) / French.

## Run
```bash
cd client && npm install && npm run build
cd ../server && npm install && PORT=8080 node src/index.js
```
Open http://localhost:8080 — the Setup Wizard asks for an **empty** MySQL database, store name/capital and the admin account. Connection settings are stored server-side in `server/config/db.json` (0600). Setup also creates a restricted DB user that has no UPDATE/DELETE on `audit_log` (requires the setup DB user to have GRANT privileges; falls back to app-level protection otherwise).

`phone-parts.service` is a sample systemd unit. `smoke.sh` is an end-to-end API test against a fresh DB.

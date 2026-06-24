/**
 * SurakshaSetu Backend Server
 * Node.js + Express + SQLite + WebSocket
 * Real-time senior citizen safety platform
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const JWT_SECRET = process.env.JWT_SECRET || 'suraksha-setu-secret-2024';
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'suraksha.db');
let db;

// ─── DATABASE SETUP ───────────────────────────────────────────────────────────
initSqlJs().then((SQL) => {
  const fileData = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
  const rawDb = fileData ? new SQL.Database(new Uint8Array(fileData)) : new SQL.Database();

  function persist() {
    fs.writeFileSync(DB_PATH, Buffer.from(rawDb.export()));
  }

  db = {
    exec(sql) {
      return rawDb.exec(sql);
    },
    prepare(sql) {
      return {
        run(...params) {
          const stmt = rawDb.prepare(sql);
          stmt.bind(params);
          stmt.step();
          stmt.free();
          persist();
          const result = rawDb.exec("SELECT last_insert_rowid() AS id");
          return { lastInsertRowid: result[0]?.values?.[0]?.[0] || 0 };
        },
        get(...params) {
          const stmt = rawDb.prepare(sql);
          stmt.bind(params);
          const found = stmt.step();
          const row = found ? stmt.getAsObject() : undefined;
          stmt.free();
          return row;
        },
        all(...params) {
          const stmt = rawDb.prepare(sql);
          stmt.bind(params);
          const rows = [];
          while (stmt.step()) rows.push(stmt.getAsObject());
          stmt.free();
          return rows;
        }
      };
    }
  };


db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'senior', -- senior | family | police
    age INTEGER,
    address TEXT,
    area TEXT,
    medical_conditions TEXT,
    emergency_contacts TEXT DEFAULT '[]',
    citizen_id TEXT UNIQUE,
    badge_number TEXT,
    rank TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sos_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT DEFAULT 'sos',          -- sos | medical | fall
    latitude REAL,
    longitude REAL,
    address TEXT,
    status TEXT DEFAULT 'active',     -- active | responded | resolved
    officer_id INTEGER REFERENCES users(id),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS fraud_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    case_number TEXT UNIQUE,
    fraud_type TEXT NOT NULL,         -- otp | phishing | investment | identity | other
    description TEXT NOT NULL,
    suspect_phone TEXT,
    suspect_link TEXT,
    amount_lost REAL DEFAULT 0,
    evidence_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',    -- pending | investigating | resolved | closed
    assigned_officer INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS check_ins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT DEFAULT 'morning',      -- morning | evening | manual
    status TEXT DEFAULT 'ok',        -- ok | missed | alert
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS scam_database (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    value TEXT UNIQUE NOT NULL,       -- phone number or URL pattern
    type TEXT NOT NULL,               -- phone | url | keyword
    risk_level TEXT DEFAULT 'high',   -- high | medium | low
    report_count INTEGER DEFAULT 1,
    description TEXT,
    added_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    details TEXT,
    ip TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS welfare_visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    citizen_id INTEGER NOT NULL REFERENCES users(id),
    officer_id INTEGER REFERENCES users(id),
    scheduled_date DATE NOT NULL,
    status TEXT DEFAULT 'scheduled',  -- scheduled | completed | missed
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Seed scam database
  INSERT OR IGNORE INTO scam_database (value, type, risk_level, report_count, description) VALUES
    ('9988776655', 'phone', 'high', 47, 'Known OTP scam number - Ahmedabad reports'),
    ('7766554433', 'phone', 'high', 23, 'Fake investment scheme caller'),
    ('8855443322', 'phone', 'medium', 12, 'Fake KYC update scam'),
    ('secure-sbi-verify.com', 'url', 'high', 89, 'Phishing site impersonating SBI'),
    ('hdfc-update-kyc.net', 'url', 'high', 34, 'HDFC phishing site'),
    ('pm-yojana-reward.in', 'url', 'high', 67, 'Fake government scheme'),
    ('OTP', 'keyword', 'medium', 0, 'Never share OTP with anyone'),
    ('KYC', 'keyword', 'medium', 0, 'Banks never ask KYC via phone');

  -- Seed demo police officer
  INSERT OR IGNORE INTO users (name, phone, password_hash, role, rank, badge_number, citizen_id)
  VALUES (
    'ACP Vikram Shah',
    '9000000001',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- password
    'police',
    'ACP',
    'CCB-001',
    NULL
  );

  -- Seed demo senior citizen
  INSERT OR IGNORE INTO users (name, phone, password_hash, role, age, address, area, citizen_id, medical_conditions)
  VALUES (
    'Rameshbhai Patel',
    '9000000002',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- password
    'senior',
    72,
    'B-12, Shanti Nagar, Maninagar',
    'Maninagar',
    'AHM-SR-001',
    'Diabetes, Hypertension'
  );

  -- Seed demo family member
  INSERT OR IGNORE INTO users (name, phone, password_hash, role, citizen_id)
  VALUES (
    'Rahul Patel',
    '9000000003',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- password
    'family',
    NULL
  );
`);
  persist();

  // ─── START SERVER ─────────────────────────────────────────────────────────────
  server.listen(PORT, () => {
    console.log(`\n🛡️  SurakshaSetu Backend Running`);
    console.log(`   URL: http://localhost:${PORT}`);
    console.log(`   WebSocket: ws://localhost:${PORT}`);
    console.log(`\n   Demo Accounts (password: "password")`);
    console.log(`   📱 Senior: 9000000002`);
    console.log(`   👮 Police: 9000000001`);
    console.log(`   👨‍👩‍👦 Family: 9000000003\n`);
  });
}).catch((err) => {
  console.error('Failed to initialize database', err);
  process.exit(1);
});

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function policeOnly(req, res, next) {
  if (req.user.role !== 'police') return res.status(403).json({ error: 'Police only' });
  next();
}

function log(userId, action, details, ip) {
  db.prepare('INSERT INTO activity_log (user_id, action, details, ip) VALUES (?,?,?,?)').run(userId, action, details, ip);
}

// ─── WEBSOCKET BROADCAST ──────────────────────────────────────────────────────
const wsClients = new Map(); // userId -> ws

wss.on('connection', (ws, req) => {
  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'auth') {
        const payload = jwt.verify(data.token, JWT_SECRET);
        wsClients.set(payload.id, ws);
        ws.userId = payload.id;
        ws.userRole = payload.role;
        ws.send(JSON.stringify({ type: 'connected', message: 'Real-time connected' }));
      }
    } catch {}
  });
  ws.on('close', () => {
    if (ws.userId) wsClients.delete(ws.userId);
  });
});

function broadcast(role, data) {
  const msg = JSON.stringify(data);
  wsClients.forEach((ws, userId) => {
    if (ws.readyState === WebSocket.OPEN && (!role || ws.userRole === role)) {
      ws.send(msg);
    }
  });
}

function sendTo(userId, data) {
  const ws = wsClients.get(userId);
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { name, phone, password, role, age, address, area, medical_conditions } = req.body;
  if (!name || !phone || !password) return res.status(400).json({ error: 'Missing fields' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const citizenId = role === 'senior' ? `AHM-SR-${Date.now().toString().slice(-4)}` : null;
    const stmt = db.prepare(`
      INSERT INTO users (name, phone, password_hash, role, age, address, area, medical_conditions, citizen_id)
      VALUES (?,?,?,?,?,?,?,?,?)
    `);
    const result = stmt.run(name, phone, hash, role || 'senior', age, address, area, medical_conditions, citizenId);
    const user = db.prepare('SELECT id, name, phone, role, citizen_id FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Phone already registered' });
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { phone, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE phone = ? AND is_active = 1').get(phone);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  db.prepare('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
  const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
  log(user.id, 'login', `Role: ${user.role}`, req.ip);

  const { password_hash, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, name, phone, role, age, address, area, citizen_id, medical_conditions, badge_number, rank, last_seen FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// ─── SOS ROUTES ──────────────────────────────────────────────────────────────
app.post('/api/sos', authMiddleware, (req, res) => {
  const { type, latitude, longitude, address } = req.body;
  const stmt = db.prepare('INSERT INTO sos_alerts (user_id, type, latitude, longitude, address) VALUES (?,?,?,?,?)');
  const result = stmt.run(req.user.id, type || 'sos', latitude, longitude, address);
  const alert = db.prepare(`
    SELECT s.*, u.name, u.phone, u.area, u.age, u.medical_conditions, u.address as home_address
    FROM sos_alerts s JOIN users u ON u.id = s.user_id
    WHERE s.id = ?
  `).get(result.lastInsertRowid);

  // Real-time broadcast to all police
  broadcast('police', { type: 'SOS_ALERT', data: alert });
  log(req.user.id, 'sos_triggered', `Type: ${type}`, req.ip);

  res.json({ success: true, alert_id: result.lastInsertRowid, message: 'SOS sent to police & family' });
});

app.get('/api/sos/active', authMiddleware, policeOnly, (req, res) => {
  const alerts = db.prepare(`
    SELECT s.*, u.name, u.phone, u.area, u.age, u.medical_conditions, u.address as home_address,
           o.name as officer_name
    FROM sos_alerts s 
    JOIN users u ON u.id = s.user_id
    LEFT JOIN users o ON o.id = s.officer_id
    WHERE s.status = 'active'
    ORDER BY s.created_at DESC
  `).all();
  res.json(alerts);
});

app.patch('/api/sos/:id/respond', authMiddleware, policeOnly, (req, res) => {
  db.prepare('UPDATE sos_alerts SET status = ?, officer_id = ? WHERE id = ?').run('responded', req.user.id, req.params.id);
  const alert = db.prepare('SELECT * FROM sos_alerts WHERE id = ?').get(req.params.id);
  sendTo(alert.user_id, { type: 'SOS_RESPONDED', message: `Police officer ${req.user.name} is on the way!` });
  res.json({ success: true });
});

app.patch('/api/sos/:id/resolve', authMiddleware, policeOnly, (req, res) => {
  db.prepare('UPDATE sos_alerts SET status = ?, resolved_at = CURRENT_TIMESTAMP, notes = ? WHERE id = ?')
    .run('resolved', req.body.notes, req.params.id);
  res.json({ success: true });
});

// ─── FRAUD REPORT ROUTES ──────────────────────────────────────────────────────
app.post('/api/fraud-reports', authMiddleware, (req, res) => {
  const { fraud_type, description, suspect_phone, suspect_link, amount_lost } = req.body;
  if (!fraud_type || !description) return res.status(400).json({ error: 'Missing required fields' });

  const caseNum = `ACCB-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
  const stmt = db.prepare(`
    INSERT INTO fraud_reports (user_id, case_number, fraud_type, description, suspect_phone, suspect_link, amount_lost)
    VALUES (?,?,?,?,?,?,?)
  `);
  const result = stmt.run(req.user.id, caseNum, fraud_type, description, suspect_phone, suspect_link, amount_lost || 0);
  
  // Add to scam database if phone/link provided
  if (suspect_phone) {
    db.prepare('INSERT OR IGNORE INTO scam_database (value, type, report_count, description, added_by) VALUES (?,?,1,?,?)').run(suspect_phone, 'phone', `Reported in case ${caseNum}`, req.user.id);
    db.prepare('UPDATE scam_database SET report_count = report_count + 1 WHERE value = ?').run(suspect_phone);
  }

  broadcast('police', { type: 'NEW_FRAUD_REPORT', data: { case_number: caseNum, type: fraud_type } });
  log(req.user.id, 'fraud_report', caseNum, req.ip);

  res.json({ success: true, case_number: caseNum });
});

app.get('/api/fraud-reports', authMiddleware, (req, res) => {
  let query;
  if (req.user.role === 'police') {
    query = db.prepare(`
      SELECT f.*, u.name as reporter_name, u.phone as reporter_phone, u.area
      FROM fraud_reports f JOIN users u ON u.id = f.user_id
      ORDER BY f.created_at DESC LIMIT 100
    `).all();
  } else {
    query = db.prepare(`
      SELECT * FROM fraud_reports WHERE user_id = ? ORDER BY created_at DESC
    `).all(req.user.id);
  }
  res.json(query);
});

app.patch('/api/fraud-reports/:id/assign', authMiddleware, policeOnly, (req, res) => {
  db.prepare('UPDATE fraud_reports SET assigned_officer = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(req.user.id, 'investigating', req.params.id);
  res.json({ success: true });
});

// ─── SCAM CHECK ROUTES ────────────────────────────────────────────────────────
app.post('/api/scam/check', authMiddleware, (req, res) => {
  const { value } = req.body;
  if (!value) return res.status(400).json({ error: 'Value required' });

  const clean = value.replace(/[^a-zA-Z0-9.@-]/g, '');
  const results = db.prepare(`
    SELECT * FROM scam_database 
    WHERE value LIKE ? OR value LIKE ? OR ? LIKE '%' || value || '%'
    ORDER BY report_count DESC
  `).all(`%${clean}%`, `%${value}%`, value);

  res.json({
    is_scam: results.length > 0,
    risk_level: results[0]?.risk_level || 'safe',
    report_count: results[0]?.report_count || 0,
    description: results[0]?.description || null,
    matches: results
  });
});

// ─── CHECK-IN ROUTES ──────────────────────────────────────────────────────────
app.post('/api/checkin', authMiddleware, (req, res) => {
  const { type, notes } = req.body;
  const result = db.prepare('INSERT INTO check_ins (user_id, type, notes) VALUES (?,?,?)').run(req.user.id, type || 'manual', notes);
  broadcast('police', { type: 'CHECKIN', data: { user: req.user.name, check_in_id: result.lastInsertRowid } });
  res.json({ success: true, message: 'Check-in recorded! Family notified.' });
});

app.get('/api/checkin/history', authMiddleware, (req, res) => {
  const history = db.prepare('SELECT * FROM check_ins WHERE user_id = ? ORDER BY created_at DESC LIMIT 30').all(req.user.id);
  res.json(history);
});

// ─── POLICE DASHBOARD DATA ────────────────────────────────────────────────────
app.get('/api/dashboard/stats', authMiddleware, policeOnly, (req, res) => {
  const stats = {
    active_sos: db.prepare("SELECT COUNT(*) as c FROM sos_alerts WHERE status='active'").get().c,
    total_seniors: db.prepare("SELECT COUNT(*) as c FROM users WHERE role='senior'").get().c,
    fraud_reports_today: db.prepare("SELECT COUNT(*) as c FROM fraud_reports WHERE date(created_at)=date('now')").get().c,
    cases_pending: db.prepare("SELECT COUNT(*) as c FROM fraud_reports WHERE status='pending'").get().c,
    cases_investigating: db.prepare("SELECT COUNT(*) as c FROM fraud_reports WHERE status='investigating'").get().c,
    cases_resolved: db.prepare("SELECT COUNT(*) as c FROM fraud_reports WHERE status='resolved'").get().c,
    checkins_today: db.prepare("SELECT COUNT(*) as c FROM check_ins WHERE date(created_at)=date('now')").get().c,
    scam_numbers: db.prepare("SELECT COUNT(*) as c FROM scam_database WHERE type='phone'").get().c
  };
  res.json(stats);
});

app.get('/api/dashboard/activity', authMiddleware, policeOnly, (req, res) => {
  const sos = db.prepare(`
    SELECT 'sos' as type, s.created_at, u.name, s.status
    FROM sos_alerts s JOIN users u ON u.id = s.user_id
    ORDER BY s.created_at DESC LIMIT 5
  `).all();
  const reports = db.prepare(`
    SELECT 'report' as type, f.created_at, u.name, f.case_number, f.fraud_type
    FROM fraud_reports f JOIN users u ON u.id = f.user_id
    ORDER BY f.created_at DESC LIMIT 5
  `).all();
  const checkins = db.prepare(`
    SELECT 'checkin' as type, c.created_at, u.name
    FROM check_ins c JOIN users u ON u.id = c.user_id
    ORDER BY c.created_at DESC LIMIT 5
  `).all();

  const combined = [...sos, ...reports, ...checkins].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 15);
  res.json(combined);
});

app.get('/api/seniors', authMiddleware, policeOnly, (req, res) => {
  const seniors = db.prepare(`
    SELECT id, name, phone, age, area, address, citizen_id, medical_conditions, last_seen,
           (SELECT COUNT(*) FROM sos_alerts WHERE user_id = users.id AND status='active') as active_sos,
           (SELECT COUNT(*) FROM fraud_reports WHERE user_id = users.id) as total_reports,
           (SELECT created_at FROM check_ins WHERE user_id = users.id ORDER BY created_at DESC LIMIT 1) as last_checkin
    FROM users WHERE role = 'senior' ORDER BY name
  `).all();
  res.json(seniors);
});

// ─── ALERTS / NOTIFICATIONS ───────────────────────────────────────────────────
app.get('/api/alerts', authMiddleware, (req, res) => {
  const scamAlerts = db.prepare(`
    SELECT 'scam_alert' as type, description as title, created_at, risk_level
    FROM scam_database WHERE created_at > datetime('now', '-7 days')
    ORDER BY created_at DESC LIMIT 5
  `).all();
  res.json(scamAlerts);
});

// ─── SERVE FRONTEND ───────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));
app.get('/police', (req, res) => res.sendFile(path.join(__dirname, '../frontend/police.html')));

// ─── START SERVER ─────────────────────────────────────────────────────────────

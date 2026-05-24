const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'auto_pay.db');

let SQL;
let db;
const DB_DIR = path.dirname(DB_PATH);

// ── Init ──
async function init() {
  SQL = await require('sql.js')();
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }
  initTables();
  flush();
}

function flush() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function markDirty() {
  flush();
}

// ── Internal helpers ──
function qAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function qGet(sql, params = []) {
  const rows = qAll(sql, params);
  return rows[0];
}

function qRun(sql, params = []) {
  db.run(sql, params);
  const result = db.exec("SELECT last_insert_rowid()");
  const id = result[0] && result[0].values[0][0];
  markDirty();
  return { lastInsertRowid: id };
}

// ── Schema ──
function initTables() {
  // 用户表（与 AutoMagic App 中的用户关联）
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      phone       TEXT    UNIQUE NOT NULL,
      nickname    TEXT    DEFAULT '',
      created_at  TEXT    DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // 余额表（独立于用户主表，方便扩展）
  db.run(`
    CREATE TABLE IF NOT EXISTS balances (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL UNIQUE,
      amount      REAL    NOT NULL DEFAULT 0.0,
      updated_at  TEXT    DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 充值记录表
  db.run(`
    CREATE TABLE IF NOT EXISTS recharge_records (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      amount      REAL    NOT NULL,
      method      TEXT    DEFAULT 'unknown',   -- wechat / alipay / admin
      status      TEXT    DEFAULT 'completed',  -- pending / completed / failed
      note        TEXT    DEFAULT '',
      created_at  TEXT    DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 消费记录表（AI任务消耗）
  db.run(`
    CREATE TABLE IF NOT EXISTS deduction_records (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      amount      REAL    NOT NULL,
      model       TEXT    DEFAULT '',
      tokens_in   INTEGER DEFAULT 0,
      tokens_out  INTEGER DEFAULT 0,
      task_desc   TEXT    DEFAULT '',
      created_at  TEXT    DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Indexes
  try { db.run("CREATE INDEX IF NOT EXISTS idx_recharge_user ON recharge_records(user_id)"); } catch {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_deduction_user ON deduction_records(user_id)"); } catch {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_balance_user ON balances(user_id)"); } catch {}

  markDirty();
}

// ── Users ──
function createUser(phone, nickname) {
  let user = qGet("SELECT * FROM users WHERE phone = ?", [phone]);
  if (user) return user;

  const r = qRun("INSERT INTO users (phone, nickname) VALUES (?, ?)", [phone, nickname || '']);
  const userId = r.lastInsertRowid;

  // 新用户赠送初始余额（可选）
  qRun("INSERT INTO balances (user_id, amount) VALUES (?, ?)", [userId, 0.0]);

  return qGet("SELECT * FROM users WHERE id = ?", [userId]);
}

function getUserById(id) {
  return qGet("SELECT * FROM users WHERE id = ?", [id]);
}

function getUserByPhone(phone) {
  return qGet("SELECT * FROM users WHERE phone = ?", [phone]);
}

function getAllUsers() {
  return qAll("SELECT * FROM users ORDER BY id DESC");
}

// ── Balance ──
function getBalance(userId) {
  let bal = qGet("SELECT * FROM balances WHERE user_id = ?", [userId]);
  if (!bal) {
    qRun("INSERT INTO balances (user_id, amount) VALUES (?, ?)", [userId, 0.0]);
    bal = qGet("SELECT * FROM balances WHERE user_id = ?", [userId]);
  }
  return bal;
}

function setBalance(userId, amount) {
  qRun("UPDATE balances SET amount = ?, updated_at = datetime('now', 'localtime') WHERE user_id = ?", [amount, userId]);
  return getBalance(userId);
}

// ── Recharge Records ──
function createRecharge(userId, amount, method, status, note) {
  const r = qRun(
    "INSERT INTO recharge_records (user_id, amount, method, status, note) VALUES (?, ?, ?, ?, ?)",
    [userId, amount, method || 'unknown', status || 'completed', note || '']
  );

  // 自动更新余额
  const bal = getBalance(userId);
  const newAmount = (bal?.amount || 0) + amount;
  setBalance(userId, newAmount);

  return qGet("SELECT * FROM recharge_records WHERE id = ?", [r.lastInsertRowid]);
}

function getRechargeRecords(userId, limit = 50) {
  return qAll(
    "SELECT * FROM recharge_records WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    [userId, limit]
  );
}

function getAllRechargeRecords(limit = 100) {
  return qAll(
    "SELECT r.*, u.phone, u.nickname FROM recharge_records r JOIN users u ON r.user_id = u.id ORDER BY r.created_at DESC LIMIT ?",
    [limit]
  );
}

// ── Deduction Records ──
function createDeduction(userId, amount, model, tokensIn, tokensOut, taskDesc) {
  // 先检查余额
  const bal = getBalance(userId);
  if ((bal?.amount || 0) < amount) {
    throw new Error('Insufficient balance');
  }

  const r = qRun(
    "INSERT INTO deduction_records (user_id, amount, model, tokens_in, tokens_out, task_desc) VALUES (?, ?, ?, ?, ?, ?)",
    [userId, amount, model || '', tokensIn || 0, tokensOut || 0, taskDesc || '']
  );

  // 扣减余额
  const newAmount = (bal?.amount || 0) - amount;
  setBalance(userId, Math.max(0, newAmount));

  return qGet("SELECT * FROM deduction_records WHERE id = ?", [r.lastInsertRowid]);
}

function getDeductionRecords(userId, limit = 50) {
  return qAll(
    "SELECT * FROM deduction_records WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    [userId, limit]
  );
}

function getAllDeductionRecords(limit = 100) {
  return qAll(
    "SELECT d.*, u.phone, u.nickname FROM deduction_records d JOIN users u ON d.user_id = u.id ORDER BY d.created_at DESC LIMIT ?",
    [limit]
  );
}

// ── Stats ──
function getUserStats(userId) {
  const totalRecharge = qGet(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM recharge_records WHERE user_id = ? AND status = 'completed'",
    [userId]
  );
  const totalDeduction = qGet(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM deduction_records WHERE user_id = ?",
    [userId]
  );
  const rechargeCount = qGet(
    "SELECT COUNT(*) AS cnt FROM recharge_records WHERE user_id = ?",
    [userId]
  );
  const deductionCount = qGet(
    "SELECT COUNT(*) AS cnt FROM deduction_records WHERE user_id = ?",
    [userId]
  );

  return {
    totalRecharge: totalRecharge?.total || 0,
    totalDeduction: totalDeduction?.total || 0,
    rechargeCount: rechargeCount?.cnt || 0,
    deductionCount: deductionCount?.cnt || 0,
  };
}

module.exports = {
  init,
  createUser,
  getUserById,
  getUserByPhone,
  getAllUsers,
  getBalance,
  setBalance,
  createRecharge,
  getRechargeRecords,
  getAllRechargeRecords,
  createDeduction,
  getDeductionRecords,
  getAllDeductionRecords,
  flush,
  getUserStats,
};

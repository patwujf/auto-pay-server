const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || __dirname;
const DB_PATH = DATA_DIR === __dirname
  ? path.join(__dirname, 'data', 'auto_pay.db')
  : path.join(DATA_DIR, 'auto_pay.db');

let SQL;
let db;
const DB_DIR = path.dirname(DB_PATH);

// ── Helper: 生成订单号 ──
function generateOrderId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `PAY${ts}${rand}`;
}

// ── Helper: 生成随机的 mock 支付二维码 ID ──
function generateQRId() {
  return crypto.randomBytes(8).toString('hex');
}

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
  try {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (e) {
    console.error('DB flush error:', e.message);
  }
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
  // ── 用户表（与 AutoMagic App 中的用户关联） ──
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      phone       TEXT    UNIQUE NOT NULL,
      nickname    TEXT    DEFAULT '',
      created_at  TEXT    DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // ── 余额表（独立于用户主表） ──
  db.run(`
    CREATE TABLE IF NOT EXISTS balances (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL UNIQUE,
      amount      REAL    NOT NULL DEFAULT 0.0,
      updated_at  TEXT    DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // ── 充值记录表（内部充值） ──
  db.run(`
    CREATE TABLE IF NOT EXISTS recharge_records (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      amount      REAL    NOT NULL,
      method      TEXT    DEFAULT 'unknown',
      status      TEXT    DEFAULT 'completed',
      note        TEXT    DEFAULT '',
      order_id    TEXT    DEFAULT '',
      created_at  TEXT    DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // ── 消费记录表（AI任务消耗） ──
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

  // ══════════════════════════════════════════════════════════════
  //  聚合支付平台 — 新表
  // ══════════════════════════════════════════════════════════════

  // ── 支付订单表 ──
  db.run(`
    CREATE TABLE IF NOT EXISTS payment_orders (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id        TEXT    UNIQUE NOT NULL,         -- 平台订单号 (PAY...)
      user_id         INTEGER NOT NULL,                -- 下单用户
      amount          REAL    NOT NULL,                -- 支付金额
      subject         TEXT    DEFAULT '',              -- 商品标题
      description     TEXT    DEFAULT '',              -- 商品描述
      channel         TEXT    DEFAULT 'mock',          -- 支付渠道: wechat / alipay / mock
      status          TEXT    DEFAULT 'pending',       -- pending / paying / paid / failed / closed / refunded
      callback_url    TEXT    DEFAULT '',              -- 支付完成后的回调地址
      qr_id           TEXT    DEFAULT '',              -- Mock 二维码 ID
      paid_at         TEXT    DEFAULT '',              -- 支付时间
      created_at      TEXT    DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // ── 支付回调日志表 ──
  db.run(`
    CREATE TABLE IF NOT EXISTS payment_callbacks (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id        TEXT    NOT NULL,
      callback_url    TEXT    NOT NULL,
      status          TEXT    DEFAULT 'pending',       -- pending / success / failed
      response_body   TEXT    DEFAULT '',
      response_code   INTEGER DEFAULT 0,
      retry_count     INTEGER DEFAULT 0,
      created_at      TEXT    DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // Indexes
  try { db.run("CREATE INDEX IF NOT EXISTS idx_recharge_user ON recharge_records(user_id)"); } catch {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_deduction_user ON deduction_records(user_id)"); } catch {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_balance_user ON balances(user_id)"); } catch {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(user_id)"); } catch {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_payment_orders_order ON payment_orders(order_id)"); } catch {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status)"); } catch {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_payment_callbacks_order ON payment_callbacks(order_id)"); } catch {}

  markDirty();
}

// ════════════════════════════════════════════════════════════════
//  Users
// ════════════════════════════════════════════════════════════════

function createUser(phone, nickname) {
  let user = qGet("SELECT * FROM users WHERE phone = ?", [phone]);
  if (user) return user;

  const r = qRun("INSERT INTO users (phone, nickname) VALUES (?, ?)", [phone, nickname || '']);
  const userId = r.lastInsertRowid;
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

// ════════════════════════════════════════════════════════════════
//  Balance
// ════════════════════════════════════════════════════════════════

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

// ════════════════════════════════════════════════════════════════
//  Recharge Records（内部充值，保留向后兼容）
// ════════════════════════════════════════════════════════════════

function createRecharge(userId, amount, method, status, note, orderId) {
  const r = qRun(
    "INSERT INTO recharge_records (user_id, amount, method, status, note, order_id) VALUES (?, ?, ?, ?, ?, ?)",
    [userId, amount, method || 'unknown', status || 'completed', note || '', orderId || '']
  );
  const bal = getBalance(userId);
  const newAmount = (bal?.amount || 0) + amount;
  setBalance(userId, newAmount);
  return qGet("SELECT * FROM recharge_records WHERE id = ?", [r.lastInsertRowid]);
}

function getRechargeRecords(userId, limit = 50) {
  return qAll("SELECT * FROM recharge_records WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", [userId, limit]);
}

function getAllRechargeRecords(limit = 100) {
  return qAll("SELECT r.*, u.phone, u.nickname FROM recharge_records r JOIN users u ON r.user_id = u.id ORDER BY r.created_at DESC LIMIT ?", [limit]);
}

// ════════════════════════════════════════════════════════════════
//  Deduction Records
// ════════════════════════════════════════════════════════════════

function createDeduction(userId, amount, model, tokensIn, tokensOut, taskDesc) {
  const bal = getBalance(userId);
  if ((bal?.amount || 0) < amount) {
    throw new Error('Insufficient balance');
  }
  const r = qRun(
    "INSERT INTO deduction_records (user_id, amount, model, tokens_in, tokens_out, task_desc) VALUES (?, ?, ?, ?, ?, ?)",
    [userId, amount, model || '', tokensIn || 0, tokensOut || 0, taskDesc || '']
  );
  const newAmount = (bal?.amount || 0) - amount;
  setBalance(userId, Math.max(0, newAmount));
  return qGet("SELECT * FROM deduction_records WHERE id = ?", [r.lastInsertRowid]);
}

function getDeductionRecords(userId, limit = 50) {
  return qAll("SELECT * FROM deduction_records WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", [userId, limit]);
}

function getAllDeductionRecords(limit = 100) {
  return qAll("SELECT d.*, u.phone, u.nickname FROM deduction_records d JOIN users u ON d.user_id = u.id ORDER BY d.created_at DESC LIMIT ?", [limit]);
}

// ════════════════════════════════════════════════════════════════
//  聚合支付 — 订单管理
// ════════════════════════════════════════════════════════════════

// 创建支付订单
function createPaymentOrder(userId, amount, subject, description, channel, callbackUrl) {
  const orderId = generateOrderId();
  const qrId = generateQRId();
  const r = qRun(
    `INSERT INTO payment_orders (order_id, user_id, amount, subject, description, channel, callback_url, qr_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [orderId, userId, amount, subject || '', description || '', channel || 'mock', callbackUrl || '', qrId]
  );
  return getPaymentOrderByOrderId(orderId);
}

// 根据 order_id 查询订单
function getPaymentOrderByOrderId(orderId) {
  return qGet("SELECT * FROM payment_orders WHERE order_id = ?", [orderId]);
}

// 根据内部 id 查询订单
function getPaymentOrderById(id) {
  return qGet("SELECT * FROM payment_orders WHERE id = ?", [id]);
}

// 查询用户的订单列表
function getPaymentOrdersByUser(userId, limit = 50) {
  return qAll("SELECT * FROM payment_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", [userId, limit]);
}

// 查询所有订单（管理用）
function getAllPaymentOrders(limit = 100) {
  return qAll("SELECT * FROM payment_orders ORDER BY created_at DESC LIMIT ?", [limit]);
}

// 模拟支付（将 pending/paying 状态的订单设为 paid，并加余额）
function payOrder(orderId) {
  const order = getPaymentOrderByOrderId(orderId);
  if (!order) throw new Error('Order not found');
  if (order.status !== 'pending' && order.status !== 'paying') {
    throw new Error(`Order cannot be paid (current status: ${order.status})`);
  }

  // 更新订单状态
  qRun(
    "UPDATE payment_orders SET status = 'paid', paid_at = datetime('now', 'localtime') WHERE order_id = ?",
    [orderId]
  );

  // 充值余额
  createRecharge(order.user_id, order.amount, order.channel, 'completed', `支付订单 ${orderId}`, orderId);

  return getPaymentOrderByOrderId(orderId);
}

// 关闭订单
function closeOrder(orderId) {
  const order = getPaymentOrderByOrderId(orderId);
  if (!order) throw new Error('Order not found');
  if (order.status === 'paid' || order.status === 'refunded') {
    throw new Error(`Order cannot be closed (current status: ${order.status})`);
  }
  qRun("UPDATE payment_orders SET status = 'closed' WHERE order_id = ?", [orderId]);
  return getPaymentOrderByOrderId(orderId);
}

// 退款
function refundOrder(orderId) {
  const order = getPaymentOrderByOrderId(orderId);
  if (!order) throw new Error('Order not found');
  if (order.status !== 'paid') {
    throw new Error(`Order cannot be refunded (current status: ${order.status})`);
  }

  // 更新订单状态
  qRun("UPDATE payment_orders SET status = 'refunded' WHERE order_id = ?", [orderId]);

  // 从余额扣回
  const bal = getBalance(order.user_id);
  const newAmount = Math.max(0, (bal?.amount || 0) - order.amount);
  setBalance(order.user_id, newAmount);

  return getPaymentOrderByOrderId(orderId);
}

// ════════════════════════════════════════════════════════════════
//  支付回调日志
// ════════════════════════════════════════════════════════════════

function createCallbackLog(orderId, callbackUrl) {
  const r = qRun(
    "INSERT INTO payment_callbacks (order_id, callback_url) VALUES (?, ?)",
    [orderId, callbackUrl]
  );
  return qGet("SELECT * FROM payment_callbacks WHERE id = ?", [r.lastInsertRowid]);
}

function updateCallbackLog(id, status, responseBody, responseCode) {
  qRun(
    "UPDATE payment_callbacks SET status = ?, response_body = ?, response_code = ?, retry_count = retry_count + 1 WHERE id = ?",
    [status, responseBody || '', responseCode || 0, id]
  );
  return qGet("SELECT * FROM payment_callbacks WHERE id = ?", [id]);
}

function getCallbackLogsByOrder(orderId) {
  return qAll("SELECT * FROM payment_callbacks WHERE order_id = ? ORDER BY created_at DESC", [orderId]);
}

// ════════════════════════════════════════════════════════════════
//  Stats
// ════════════════════════════════════════════════════════════════

function getUserStats(userId) {
  const totalRecharge = qGet(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM recharge_records WHERE user_id = ? AND status = 'completed'", [userId]
  );
  const totalDeduction = qGet(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM deduction_records WHERE user_id = ?", [userId]
  );
  const rechargeCount = qGet("SELECT COUNT(*) AS cnt FROM recharge_records WHERE user_id = ?", [userId]);
  const deductionCount = qGet("SELECT COUNT(*) AS cnt FROM deduction_records WHERE user_id = ?", [userId]);
  const orderCount = qGet("SELECT COUNT(*) AS cnt FROM payment_orders WHERE user_id = ?", [userId]);

  return {
    totalRecharge: totalRecharge?.total || 0,
    totalDeduction: totalDeduction?.total || 0,
    rechargeCount: rechargeCount?.cnt || 0,
    deductionCount: deductionCount?.cnt || 0,
    orderCount: orderCount?.cnt || 0,
  };
}

module.exports = {
  init, flush,
  // Users
  createUser, getUserById, getUserByPhone, getAllUsers,
  // Balance
  getBalance, setBalance,
  // Recharge
  createRecharge, getRechargeRecords, getAllRechargeRecords,
  // Deduction
  createDeduction, getDeductionRecords, getAllDeductionRecords,
  // Payment Orders
  createPaymentOrder, getPaymentOrderByOrderId, getPaymentOrderById,
  getPaymentOrdersByUser, getAllPaymentOrders,
  payOrder, closeOrder, refundOrder,
  // Callbacks
  createCallbackLog, updateCallbackLog, getCallbackLogsByOrder,
  // Stats
  getUserStats,
};

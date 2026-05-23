const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());

// ── 静态文件（测试面板） ──
app.use(express.static(path.join(__dirname, 'public')));

// ── CORS（允许 AutoMagic App 调用） ──
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ══════════════════════════════════════════════════════════════════
//  用户 API
// ══════════════════════════════════════════════════════════════════

// 创建用户 / 根据手机号获取用户（不存在则创建）
app.post('/api/users', (req, res) => {
  try {
    const { phone, nickname } = req.body;
    if (!phone) return res.json({ ok: false, error: '手机号不能为空' });

    let user = db.getUserByPhone(phone);
    if (!user) {
      user = db.createUser(phone, nickname || '');
    }
    res.json({ ok: true, user });
  } catch (e) {
    console.error('POST /api/users error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 获取用户信息
app.get('/api/users/:id', (req, res) => {
  try {
    const user = db.getUserById(parseInt(req.params.id));
    if (!user) return res.status(404).json({ ok: false, error: '用户不存在' });
    res.json({ ok: true, user });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 所有用户列表（管理用）
app.get('/api/users', (req, res) => {
  try {
    const users = db.getAllUsers();
    res.json({ ok: true, users });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  余额 API
// ══════════════════════════════════════════════════════════════════

// 查询余额
app.get('/api/balance/:userId', (req, res) => {
  try {
    const balance = db.getBalance(parseInt(req.params.userId));
    if (!balance) return res.json({ ok: true, balance: { amount: 0 } });
    res.json({ ok: true, balance });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 管理员直接设置余额
app.post('/api/balance/set', (req, res) => {
  try {
    const { userId, amount } = req.body;
    if (!userId || amount === undefined) {
      return res.json({ ok: false, error: '参数不完整' });
    }
    const balance = db.setBalance(parseInt(userId), parseFloat(amount));
    res.json({ ok: true, balance });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  充值 API
// ══════════════════════════════════════════════════════════════════

// 创建充值记录（并自动更新余额）
app.post('/api/recharge', (req, res) => {
  try {
    const { userId, amount, method, status, note } = req.body;
    if (!userId || !amount) {
      return res.json({ ok: false, error: '参数不完整（需要 userId 和 amount）' });
    }
    const record = db.createRecharge(
      parseInt(userId),
      parseFloat(amount),
      method || 'unknown',
      status || 'completed',
      note || ''
    );
    const balance = db.getBalance(parseInt(userId));
    res.json({ ok: true, record, balance });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 获取用户的充值记录
app.get('/api/recharge/records/:userId', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const records = db.getRechargeRecords(parseInt(req.params.userId), limit);
    res.json({ ok: true, records });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 所有充值记录（管理用）
app.get('/api/recharge/records', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const records = db.getAllRechargeRecords(limit);
    res.json({ ok: true, records });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  消费（扣款）API
// ══════════════════════════════════════════════════════════════════

// 执行扣款（AI 任务消耗）
app.post('/api/deduct', (req, res) => {
  try {
    const { userId, amount, model, tokensIn, tokensOut, taskDesc } = req.body;
    if (!userId || !amount) {
      return res.json({ ok: false, error: '参数不完整（需要 userId 和 amount）' });
    }

    const balance = db.getBalance(parseInt(userId));
    if ((balance?.amount || 0) < parseFloat(amount)) {
      return res.json({ ok: false, error: '余额不足', balance: balance });
    }

    const record = db.createDeduction(
      parseInt(userId),
      parseFloat(amount),
      model || '',
      tokensIn || 0,
      tokensOut || 0,
      taskDesc || ''
    );

    const newBalance = db.getBalance(parseInt(userId));
    res.json({ ok: true, record, balance: newBalance });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 获取用户的消费记录
app.get('/api/deduct/records/:userId', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const records = db.getDeductionRecords(parseInt(req.params.userId), limit);
    res.json({ ok: true, records });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 所有消费记录（管理用）
app.get('/api/deduct/records', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const records = db.getAllDeductionRecords(limit);
    res.json({ ok: true, records });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  统计 API
// ══════════════════════════════════════════════════════════════════

// 用户统计信息
app.get('/api/stats/:userId', (req, res) => {
  try {
    const stats = db.getUserStats(parseInt(req.params.userId));
    const balance = db.getBalance(parseInt(req.params.userId));
    res.json({ ok: true, stats, balance });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  启动
// ══════════════════════════════════════════════════════════════════

async function start() {
  await db.init();

  // ── 数据持久化保障 ──
  // 1. 定时自动保存（每30秒一次，防止意外崩溃丢数据）
  setInterval(() => {
    try { db.flush?.(); } catch {}
  }, 30000);

  // 2. 进程退出时保存
  function safeFlush() {
    try { db.flush?.(); } catch {}
  }
  process.on('SIGINT', () => { safeFlush(); process.exit(0); });
  process.on('SIGTERM', () => { safeFlush(); process.exit(0); });
  process.on('exit', safeFlush);

  app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('  💰 AutoPay Server');
    console.log('');
    console.log(`  → http://localhost:${PORT}`);
    console.log('');
    console.log('  API Endpoints:');
    console.log(`  POST /api/users             创建/获取用户`);
    console.log(`  GET  /api/users             用户列表`);
    console.log(`  GET  /api/users/:id         获取用户信息`);
    console.log(`  GET  /api/balance/:userId   查询余额`);
    console.log(`  POST /api/recharge          充值`);
    console.log(`  GET  /api/recharge/records  充值记录`);
    console.log(`  GET  /api/recharge/records/:userId  用户充值记录`);
    console.log(`  POST /api/deduct            扣款消费`);
    console.log(`  GET  /api/deduct/records    消费记录`);
    console.log(`  GET  /api/deduct/records/:userId  用户消费记录`);
    console.log(`  GET  /api/stats/:userId     用户统计`);
    console.log('');
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});

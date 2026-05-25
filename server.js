const express = require('express');
const path = require('path');
const crypto = require('crypto');
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
//  用户 API（原有，保持不变）
// ══════════════════════════════════════════════════════════════════

app.post('/api/users', (req, res) => {
  try {
    const { phone, nickname } = req.body;
    if (!phone) return res.json({ ok: false, error: '手机号不能为空' });
    let user = db.getUserByPhone(phone);
    if (!user) user = db.createUser(phone, nickname || '');
    res.json({ ok: true, user });
  } catch (e) {
    console.error('POST /api/users error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/users/:id', (req, res) => {
  try {
    const user = db.getUserById(parseInt(req.params.id));
    if (!user) return res.status(404).json({ ok: false, error: '用户不存在' });
    res.json({ ok: true, user });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/users', (req, res) => {
  try {
    const users = db.getAllUsers();
    res.json({ ok: true, users });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  余额 API（原有，保持不变）
// ══════════════════════════════════════════════════════════════════

app.get('/api/balance/:userId', (req, res) => {
  try {
    const balance = db.getBalance(parseInt(req.params.userId));
    res.json({ ok: true, balance: balance || { amount: 0 } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/balance/set', (req, res) => {
  try {
    const { userId, amount } = req.body;
    if (!userId || amount === undefined) return res.json({ ok: false, error: '参数不完整' });
    const balance = db.setBalance(parseInt(userId), parseFloat(amount));
    res.json({ ok: true, balance });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  充值 API（原有，保持不变）
// ══════════════════════════════════════════════════════════════════

app.post('/api/recharge', (req, res) => {
  try {
    const { userId, amount, method, status, note, orderId } = req.body;
    if (!userId || !amount) return res.json({ ok: false, error: '参数不完整（需要 userId 和 amount）' });
    const record = db.createRecharge(
      parseInt(userId), parseFloat(amount),
      method || 'unknown', status || 'completed', note || '', orderId || ''
    );
    const balance = db.getBalance(parseInt(userId));
    res.json({ ok: true, record, balance });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/recharge/records/:userId', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const records = db.getRechargeRecords(parseInt(req.params.userId), limit);
    res.json({ ok: true, records });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

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
//  消费 API（原有，保持不变）
// ══════════════════════════════════════════════════════════════════

app.post('/api/deduct', (req, res) => {
  try {
    const { userId, amount, model, tokensIn, tokensOut, taskDesc } = req.body;
    if (!userId || !amount) return res.json({ ok: false, error: '参数不完整（需要 userId 和 amount）' });
    const balance = db.getBalance(parseInt(userId));
    if ((balance?.amount || 0) < parseFloat(amount)) {
      return res.json({ ok: false, error: '余额不足', balance });
    }
    const record = db.createDeduction(
      parseInt(userId), parseFloat(amount), model || '', tokensIn || 0, tokensOut || 0, taskDesc || ''
    );
    const newBalance = db.getBalance(parseInt(userId));
    res.json({ ok: true, record, balance: newBalance });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/deduct/records/:userId', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const records = db.getDeductionRecords(parseInt(req.params.userId), limit);
    res.json({ ok: true, records });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

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
//  统计 API（原有，保持不变）
// ══════════════════════════════════════════════════════════════════

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
//  ╔══════════════════════════════════════════════════════════════╗
//  ║   聚合支付平台 — Mock 支付 API                              ║
//  ║   后续接入真实支付平台时，替换此模块即可                    ║
//  ╚══════════════════════════════════════════════════════════════╝
// ══════════════════════════════════════════════════════════════════

// ── 1. 创建支付订单 ──
// AutoMagic 调用此接口创建一笔支付订单
// POST /api/pay/orders
// Body: { user_id, amount, subject, description, channel, callback_url }
app.post('/api/pay/orders', (req, res) => {
  try {
    const { user_id, amount, subject, description, channel, callback_url } = req.body;
    if (!user_id || !amount) {
      return res.json({ ok: false, error: '参数不完整（需要 user_id 和 amount）' });
    }
    if (parseFloat(amount) <= 0) {
      return res.json({ ok: false, error: '金额必须大于 0' });
    }

    const order = db.createPaymentOrder(
      parseInt(user_id), parseFloat(amount),
      subject || '', description || '',
      channel || 'mock', callback_url || ''
    );

    // 根据不同支付渠道，生成不同的支付信息
    const payInfo = generateMockPayInfo(order);

    res.json({
      ok: true,
      order: {
        order_id: order.order_id,
        amount: order.amount,
        subject: order.subject,
        channel: order.channel,
        status: order.status,
        created_at: order.created_at,
        pay_info: payInfo,
      },
    });
  } catch (e) {
    console.error('POST /api/pay/orders error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── 2. 查询订单 ──
// GET /api/pay/orders/:orderId
app.get('/api/pay/orders/:orderId', (req, res) => {
  try {
    const order = db.getPaymentOrderByOrderId(req.params.orderId);
    if (!order) return res.status(404).json({ ok: false, error: '订单不存在' });
    res.json({ ok: true, order });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── 3. 用户订单列表 ──
// GET /api/pay/orders/user/:userId
app.get('/api/pay/orders/user/:userId', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const orders = db.getPaymentOrdersByUser(parseInt(req.params.userId), limit);
    res.json({ ok: true, orders });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── 4. 所有订单（管理用） ──
app.get('/api/pay/orders', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const orders = db.getAllPaymentOrders(limit);
    res.json({ ok: true, orders });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── 5. 模拟支付（渠道统一入口） ──
// POST /api/pay/orders/:orderId/pay
// 模拟用户"确认支付"，将订单从 pending → paid
app.post('/api/pay/orders/:orderId/pay', async (req, res) => {
  try {
    const order = db.getPaymentOrderByOrderId(req.params.orderId);
    if (!order) return res.status(404).json({ ok: false, error: '订单不存在' });

    // 执行模拟支付
    const paidOrder = db.payOrder(order.order_id);

    // 如果有 callback_url，模拟异步回调
    let callbackResult = null;
    if (paidOrder.callback_url) {
      callbackResult = await simulateCallback(paidOrder);
    }

    res.json({
      ok: true,
      order: paidOrder,
      callback: callbackResult,
      message: '模拟支付成功',
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── 6. 关闭订单 ──
// POST /api/pay/orders/:orderId/close
app.post('/api/pay/orders/:orderId/close', (req, res) => {
  try {
    const order = db.closeOrder(req.params.orderId);
    res.json({ ok: true, order });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ── 7. 退款 ──
// POST /api/pay/orders/:orderId/refund
app.post('/api/pay/orders/:orderId/refund', (req, res) => {
  try {
    const order = db.refundOrder(req.params.orderId);
    res.json({ ok: true, order });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ── 8. 快捷支付（一步到位：创建 + 立即支付） ──
// POST /api/pay/quick
// Body: { user_id, amount, subject, description, channel }
// 适合 AutoMagic 内部自动充值场景
app.post('/api/pay/quick', async (req, res) => {
  try {
    const { user_id, amount, subject, description, channel } = req.body;
    if (!user_id || !amount) {
      return res.json({ ok: false, error: '参数不完整（需要 user_id 和 amount）' });
    }

    // 创建订单
    const order = db.createPaymentOrder(
      parseInt(user_id), parseFloat(amount),
      subject || '', description || '', channel || 'mock', ''
    );

    // 立即支付
    const paidOrder = db.payOrder(order.order_id);

    res.json({
      ok: true,
      order: paidOrder,
      message: '快捷支付成功',
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── 9. 模拟支付渠道 ──
// 返回各渠道的 mock 支付信息（后续接入真实平台时替换）
app.get('/api/pay/channels', (req, res) => {
  res.json({
    ok: true,
    channels: [
      {
        id: 'wechat',
        name: '微信支付',
        mock_type: 'qrcode',       // 模拟二维码
      },
      {
        id: 'alipay',
        name: '支付宝',
        mock_type: 'form_post',    // 模拟表单跳转
      },
      {
        id: 'mock',
        name: '模拟支付',
        mock_type: 'direct',       // 直接确认
        description: '测试用，无需跳转，点击即付',
      },
    ],
  });
});

// ── 10. 支付回调日志 ──
// GET /api/pay/callbacks/:orderId
app.get('/api/pay/callbacks/:orderId', (req, res) => {
  try {
    const logs = db.getCallbackLogsByOrder(req.params.orderId);
    res.json({ ok: true, logs });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  Mock 辅助函数
// ══════════════════════════════════════════════════════════════════

// 根据支付渠道生成 mock 支付信息
function generateMockPayInfo(order) {
  const base = {
    order_id: order.order_id,
    amount: order.amount,
    channel: order.channel,
  };

  switch (order.channel) {
    case 'wechat':
      return {
        ...base,
        type: 'qrcode',
        qr_data: `weixin://pay/mock/${order.qr_id}`,
        qr_image_url: `/mock/qr/${order.qr_id}.png`,  // 假二维码
        expires_in: 1800,
      };

    case 'alipay':
      return {
        ...base,
        type: 'form_post',
        form_action: `https://mock.alipay.com/pay/${order.qr_id}`,
        form_method: 'POST',
        form_fields: {
          out_trade_no: order.order_id,
          total_amount: order.amount.toFixed(2),
          subject: order.subject || '支付',
        },
        expires_in: 1800,
      };

    default:
      // mock = 直接确认
      return {
        ...base,
        type: 'direct',
        message: '模拟支付：直接调用 /api/pay/orders/:orderId/pay 即可完成支付',
        direct_pay_url: `/api/pay/orders/${order.order_id}/pay`,
      };
  }
}

// 模拟支付回调：向 callback_url 发送 POST 通知
async function simulateCallback(order) {
  if (!order.callback_url) return null;

  const log = db.createCallbackLog(order.order_id, order.callback_url);
  const payload = {
    order_id: order.order_id,
    status: 'paid',
    amount: order.amount,
    paid_at: order.paid_at,
    sign: crypto
      .createHash('md5')
      .update(`${order.order_id}|${order.amount}|${order.paid_at || ''}|mock_secret`)
      .digest('hex'),
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(order.callback_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const body = await response.text();
    db.updateCallbackLog(log.id, 'success', body, response.status);
    return { status: 'success', http_code: response.status };
  } catch (e) {
    db.updateCallbackLog(log.id, 'failed', e.message, 0);
    return { status: 'failed', error: e.message };
  }
}

// ══════════════════════════════════════════════════════════════════
//  启动
// ══════════════════════════════════════════════════════════════════

async function start() {
  await db.init();

  // 数据持久化保障
  setInterval(() => {
    try { db.flush?.(); } catch {}
  }, 30000);

  function safeFlush() {
    try { db.flush?.(); } catch {}
  }
  process.on('SIGINT', () => { safeFlush(); process.exit(0); });
  process.on('SIGTERM', () => { safeFlush(); process.exit(0); });
  process.on('exit', safeFlush);

  app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('  ╔══════════════════════════════════╗');
    console.log('  ║    💰 AutoPay · 聚合支付平台     ║');
    console.log('  ║    (Mock Shell)                  ║');
    console.log('  ╚══════════════════════════════════╝');
    console.log('');
    console.log(`  → http://localhost:${PORT}`);
    console.log('');
    console.log('  📋 用户 & 余额（原有）');
    console.log(`  POST /api/users             创建/获取用户`);
    console.log(`  GET  /api/balance/:userId   查询余额`);
    console.log(`  POST /api/recharge          充值`);
    console.log(`  POST /api/deduct            扣款消费`);
    console.log(`  GET  /api/stats/:userId     用户统计`);
    console.log('');
    console.log('  🆕 聚合支付 API（Mock）');
    console.log(`  POST /api/pay/orders        创建支付订单`);
    console.log(`  GET  /api/pay/orders        所有订单（管理）`);
    console.log(`  GET  /api/pay/orders/:id    查询订单`);
    console.log(`  GET  /api/pay/orders/user/:userId  用户订单`);
    console.log(`  POST /api/pay/orders/:id/pay      模拟支付`);
    console.log(`  POST /api/pay/orders/:id/close    关闭订单`);
    console.log(`  POST /api/pay/orders/:id/refund   退款`);
    console.log(`  POST /api/pay/quick         快捷支付（一步到位）`);
    console.log(`  GET  /api/pay/channels      支付渠道列表`);
    console.log(`  GET  /api/pay/callbacks/:id 回调日志`);
    console.log('');
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});

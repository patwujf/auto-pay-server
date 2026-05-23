// server.js
require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const codeService = require('./services/codeService');

const app = express();
const port = process.env.PORT || 3000;

// 中间件
app.use(express.json());

// 数据库初始化
const db = new sqlite3.Database('local.db', (err) => {
  if (err) {
    console.error('数据库连接失败:', err);
  } else {
    console.log('连接到 SQLite 数据库');
  }
});

// 初始化数据库表
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS user_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    data_key TEXT,
    data_value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
});

// JWT 认证中间件
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      code: 401, 
      message: '访问令牌缺失' 
    });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ 
        code: 403, 
        message: '令牌无效或已过期' 
      });
    }
    req.user = user;
    next();
  });
};

// 发送验证码接口 - 修改响应格式
app.post('/api/send-code', async (req, res) => {
  console.log('成功进入send-code:',req.body);
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ 
      code: 400, 
      message: '手机号不能为空' 
    });
  }

  try {
    const result = await codeService.generateAndSendCode(phone);
    
    if (result.success) {
      res.json({ 
        code: 200, 
        message: '验证码发送成功' + (result.code ? `，验证码：${result.code}` : '')
      });
    } else {
      res.status(400).json({ 
        code: 400, 
        message: result.message || '验证码发送失败' 
      });
    }
  } catch (error) {
    console.error('发送验证码时出错:', error);
    res.status(500).json({ 
      code: 500, 
      message: '系统错误，请稍后重试' 
    });
  }
});

// 验证登录接口 - 修改响应格式
app.post('/api/verify-login', async (req, res) => {

  
  console.log('成功进入verify-login:',req.body);
  const { phone, code } = req.body;

  if (!phone || !code) {
    return res.status(400).json({ 
      code: 400, 
      message: '手机号和验证码不能为空' 
    });
  }

  // 验证验证码
  if (!codeService.verifyCode(phone, code)) {
    return res.status(400).json({ 
      code: 400, 
      message: '验证码错误或已过期' 
    });
  }

  try {
    // 查找或创建用户
    let user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE phone = ?', [phone], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    let isNewUser = false;
    
    if (!user) {
      // 新用户注册
      const result = await new Promise((resolve, reject) => {
        db.run('INSERT INTO users (phone) VALUES (?)', [phone], function(err) {
          if (err) reject(err);
          else resolve(this);
        });
      });
      user = { 
        id: result.lastID, 
        phone: phone,
        created_at: null // 标记为新用户
      };
      isNewUser = true;
    } else {
      // 现有用户
      isNewUser = false;
    }

    // 生成JWT令牌
    const token = jwt.sign(
      { userId: user.id, phone: user.phone }, 
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({
      code: 200,
      data: {
        token: token,
        user: { 
          id: user.id, 
          phone: user.phone 
        },
        isNewUser: isNewUser
      }
    });

  } catch (error) {
    console.error('验证登录时出错:', error);
    res.status(500).json({ 
      code: 500, 
      message: '登录失败，请稍后重试' 
    });
  }
});

// 获取用户数据接口 - 修改响应格式
app.get('/api/my-data', authenticateToken, (req, res) => {
  console.log('成功进入my-data:',req.body);
  db.all(
    'SELECT * FROM user_data WHERE user_id = ?',
    [req.user.userId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ 
          code: 500, 
          message: '数据库查询失败' 
        });
      }
      res.json({ 
        code: 200,
        data: rows 
      });
    }
  );
});

// 保存用户数据接口 - 修改响应格式
app.post('/api/my-data', authenticateToken, (req, res) => {
  console.log('成功进入my-data:',req.body);
  const { key, value } = req.body;
  if (!key) {
    return res.status(400).json({ 
      code: 400, 
      message: '数据键不能为空' 
    });
  }

  db.run(
    'INSERT OR REPLACE INTO user_data (user_id, data_key, data_value) VALUES (?, ?, ?)',
    [req.user.userId, key, value],
    function(err) {
      if (err) {
        return res.status(500).json({ 
          code: 500, 
          message: '数据保存失败' 
        });
      }
      res.json({ 
        code: 200,
        data: { 
          success: true, 
          id: this.lastID 
        }
      });
    }
  );
});

// 短信服务状态接口
app.get('/api/sms-status', (req, res) => {
  console.log('成功进入sms-status:',req.body);
  res.json({
    code: 200,
    data: {
      service: 'tencent-cloud-sms',
      environment: process.env.NODE_ENV || 'development',
      stats: codeService.getStats(),
      timestamp: new Date().toISOString()
    }
  });
});

// 健康检查接口
app.get('/api/health', (req, res) => {
  console.log('成功进入health:',req.body);
  res.json({ 
    code: 200,
    data: { 
      status: 'ok', 
      service: 'auth-server',
      timestamp: new Date().toISOString()
    }
  });
});

// 启动服务器
app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
  console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
  console.log(`短信服务: ${process.env.TENCENT_SECRET_ID ? '生产模式' : '模拟模式'}`);
  console.log(`API基础路径: /api`);
});
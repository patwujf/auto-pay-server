// initDb.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./local.db'); // 数据库会保存在这个文件里

db.serialize(() => {
  // 1. 创建用户表
  db.run(`CREATE TABLE IF NOT EXISTS users (
    userId TEXT PRIMARY KEY,
    phone TEXT UNIQUE NOT NULL,
    name TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 2. 创建用户数据表（模拟每个用户自己的数据）
  db.run(`CREATE TABLE IF NOT EXISTS user_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    dataKey TEXT NOT NULL,
    dataValue TEXT,
    FOREIGN KEY (userId) REFERENCES users (userId),
    UNIQUE(userId, dataKey)
  )`);

  console.log('✅ 数据库表初始化完成！');
  console.log('📁 已创建数据库文件: local.db');
});

db.close();
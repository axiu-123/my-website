'use strict';

const path = require('path');
const express = require('express');
const config = require('./config');

const translateRouter = require('./routes/translate');
const chatRouter = require('./routes/chat');
const musicRouter = require('./routes/music');
const composeRouter = require('./routes/compose');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// 简单的请求日志
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// 独立功能页路由（支持 /feature 与 /feature/ 两种写法）
app.get(/^\/(home|translate|music|organize|dedup|chat|pet|compose)\/?$/, (req, res) => {
  const seg = req.path.replace(/^\/|\/$/g, '');
  res.sendFile(path.join(PUBLIC_DIR, seg, 'index.html'));
});

app.use(express.static(PUBLIC_DIR));

// API 路由
app.use('/api/translate', translateRouter);
app.use('/api/chat', chatRouter);
app.use('/api/music', musicRouter);
app.use('/api/compose', composeRouter);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// 根路径重定向到首页
app.get('/', (req, res) => {
  res.redirect('/home/');
});

const PORT = config.port;
app.listen(PORT, config.host, () => {
  console.log(`\n========================================`);
  console.log(` 多功能聚合网站已启动`);
  console.log(` 本地访问: http://localhost:${PORT}`);
  console.log(` 首页:     http://localhost:${PORT}/home/`);
  console.log(`========================================\n`);
  if (!config.deepseek.apiKey) {
    console.log('[提示] 未检测到 DEEPSEEK_API_KEY，AI 聊天将使用本地情绪支持回退引擎。');
  }
});

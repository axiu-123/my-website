'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const config = require('./config');

const translateRouter = require('./routes/translate');
const chatRouter = require('./routes/chat');
const musicRouter = require('./routes/music');
const composeRouter = require('./routes/compose');
const petllmRouter = require('./routes/petllm');

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

// 桌面版下载：GitHub API 传不了 199MB 单文件，所以 zip 在仓库里被切成 5MB 分片。
// 这里按字节范围把分片流式拼成一个标准 zip 响应，用户点链接就是正常下载，
// 并支持 Range / 断点续传；不需要在构建时真的合并出一个大文件。
const DOWNLOAD_DIR = path.join(PUBLIC_DIR, 'pet', 'downloads');
let petPkgManifest = null;
function petPkg() {
  if (!petPkgManifest) {
    petPkgManifest = JSON.parse(fs.readFileSync(path.join(DOWNLOAD_DIR, 'manifest.json'), 'utf8'));
  }
  return petPkgManifest;
}
app.get('/pet/download', async (req, res) => {
  let m;
  try {
    m = petPkg();
  } catch (e) {
    return res.status(503).type('text/plain').send('桌面版安装包尚未就绪，请稍后再试');
  }
  const total = m.size;
  let start = 0;
  let end = total - 1;
  let partial = false;
  const range = req.headers.range;
  if (range) {
    const mt = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
    if (!mt || (!mt[1] && !mt[2])) {
      res.set('Content-Range', 'bytes */' + total);
      return res.status(416).end();
    }
    partial = true;
    if (!mt[1]) start = Math.max(0, total - Number(mt[2])); // bytes=-N
    else {
      start = Number(mt[1]);
      if (mt[2]) end = Math.min(Number(mt[2]), total - 1);
    }
    if (start > end || start >= total) {
      res.set('Content-Range', 'bytes */' + total);
      return res.status(416).end();
    }
  }
  res.status(partial ? 206 : 200);
  res.set({
    'Content-Type': 'application/zip',
    'Content-Length': String(end - start + 1),
    'Accept-Ranges': 'bytes',
    'Content-Disposition': 'attachment; filename="' + m.filename + '"',
    'Cache-Control': 'public, max-age=300'
  });
  if (partial) res.set('Content-Range', 'bytes ' + start + '-' + end + '/' + total);
  if (req.method === 'HEAD') return res.end();

  let pos = 0;
  try {
    for (let i = 0; i < m.parts; i++) {
      const partSize = i === m.parts - 1 ? total - i * m.chunk : m.chunk;
      const partStart = pos;
      const partEnd = pos + partSize - 1;
      pos += partSize;
      if (partEnd < start || partStart > end) continue;
      const from = Math.max(start, partStart) - partStart;
      const to = Math.min(end, partEnd) - partStart;
      const file = path.join(DOWNLOAD_DIR, m.partPrefix + String(i).padStart(m.width, '0'));
      const rs = fs.createReadStream(file, { start: from, end: to });
      for await (const chunk of rs) {
        if (res.destroyed) return;
        if (!res.write(chunk)) {
          await new Promise((resolve) => {
            const done = () => {
              res.removeListener('drain', done);
              res.removeListener('close', done);
              resolve();
            };
            res.once('drain', done);
            res.once('close', done);
          });
        }
      }
    }
    res.end();
  } catch (e) {
    console.error('[pet/download]', e.message);
    if (!res.headersSent) res.status(500).type('text/plain').send('下载失败：' + e.message);
    else res.destroy();
  }
});

app.use(express.static(PUBLIC_DIR));

// API 路由
app.use('/api/translate', translateRouter);
app.use('/api/chat', chatRouter);
app.use('/api/music', musicRouter);
app.use('/api/compose', composeRouter);
app.use('/api/pet/llm', petllmRouter);

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

'use strict';

const express = require('express');
const router = express.Router();
const config = require('../config');
const https = require('https');

// GET /api/compose/status  返回是否配置了外部作曲服务
router.get('/status', (req, res) => {
  res.json({
    externalConfigured: Boolean(config.compose.apiBase && config.compose.apiKey),
  });
});

// POST /api/compose  若配置了 Suno 类外部服务则转发，否则提示使用本地生成
router.post('/', async (req, res) => {
  const { prompt, style, title } = req.body || {};
  if (config.compose.apiBase && config.compose.apiKey) {
    try {
      const payload = JSON.stringify({ prompt, style, title });
      const url = new URL(config.compose.apiBase + '/generate');
      const body = await new Promise((resolve, reject) => {
        const req2 = https.request(
          {
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.compose.apiKey}`,
              'Content-Length': Buffer.byteLength(payload),
            },
          },
          (r) => {
            let d = '';
            r.on('data', (c) => (d += c));
            r.on('end', () => resolve(d));
          }
        );
        req2.on('error', reject);
        req2.write(payload);
        req2.end();
      });
      return res.json({ mode: 'external', raw: body });
    } catch (e) {
      return res.status(502).json({ error: '外部作曲服务调用失败: ' + e.message });
    }
  }
  res.json({
    mode: 'local',
    message:
      '未配置外部作曲服务，已使用本地生成式作曲引擎（Tone.js）。请在 .env 中配置 COMPOSE_API_BASE 与 COMPOSE_API_KEY 以接入 Suno 类服务。',
  });
});

module.exports = router;

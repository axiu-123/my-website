'use strict';

const express = require('express');
const router = express.Router();
const https = require('https');

// 桌宠页是把分片拼成 blob: 文档再导航过去的，部分浏览器会把它当成 null origin
// 并对 application/json 的 POST 发预检。这里显式放行：Key 完全由用户自己提供，
// 服务端不保存也不代付，开放 CORS 不会泄露任何站内凭据。
router.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// 代理「用户自带 Key」的大模型请求：服务端不持有/不支付任何 token，仅做转发，避免浏览器侧 CORS。
function proxy(body) {
  return new Promise((resolve, reject) => {
    const temp = Number(body.temperature);
    const maxTokens = Number(body.max_tokens);
    const payload = JSON.stringify({
      model: body.model || 'deepseek-chat',
      messages: body.messages || [],
      temperature: Number.isFinite(temp) ? Math.min(2, Math.max(0, temp)) : 0.9,
      max_tokens: Number.isFinite(maxTokens) ? Math.min(4096, Math.max(1, Math.floor(maxTokens))) : 320,
      stream: false,
    });
    let url;
    try {
      url = new URL((body.baseUrl || 'https://api.deepseek.com/v1').replace(/\/+$/, '') + '/chat/completions');
    } catch (e) {
      return reject(new Error('Base URL 不合法'));
    }
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + body.key,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            if (j.error) return reject(new Error(j.error.message || 'API 错误'));
            const text =
              j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : '';
            resolve(text || '');
          } catch (e) {
            reject(new Error('解析大模型响应失败'));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// POST /api/pet/llm  body: { key, baseUrl, model, messages, temperature, max_tokens }
router.post('/', async (req, res) => {
  try {
    const { key, baseUrl, model, messages, temperature, max_tokens } = req.body || {};
    if (!key) {
      return res.status(400).json({ error: '未提供 API Key（请在桌宠设置里填写你自己的 Key）' });
    }
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: '缺少对话内容' });
    }
    const text = await proxy({ key, baseUrl, model, messages, temperature, max_tokens });
    res.json({ reply: text });
  } catch (e) {
    res.status(502).json({ error: '调用大模型失败: ' + e.message });
  }
});

module.exports = router;

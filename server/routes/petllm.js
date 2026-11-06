'use strict';

const express = require('express');
const router = express.Router();
const https = require('https');

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

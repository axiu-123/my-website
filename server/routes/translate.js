'use strict';

const express = require('express');
const router = express.Router();
const config = require('../config');
const https = require('https');
const http = require('http');

function getJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib
      .get(url, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('解析响应失败'));
          }
        });
      })
      .on('error', reject);
  });
}

// POST /api/translate
// body: { text, from, to }  from/to 形如 "zh-CN" "en" 等；from 可为 "auto"
router.post('/', async (req, res) => {
  try {
    const { text, from = 'auto', to = 'zh-CN' } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ error: '请输入待翻译文本' });
    }
    const langpair = `${from === 'auto' ? 'autodetect' : from}|${to}`;
    const url =
      `${config.translate.endpoint}?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}`;
    const data = await getJson(url);
    const translated =
      data && data.responseData && data.responseData.translatedText;
    if (!translated) {
      return res.status(502).json({ error: '翻译服务未返回结果', raw: data });
    }
    res.json({
      translated,
      from: from === 'auto' ? (data.responseData?.detectedLanguage || from) : from,
      to,
      service: 'MyMemory',
    });
  } catch (e) {
    res.status(500).json({ error: '翻译失败: ' + e.message });
  }
});

// 支持的语言列表（供前端下拉使用）
router.get('/languages', (req, res) => {
  res.json([
    { code: 'auto', name: '自动检测' },
    { code: 'zh-CN', name: '中文(简体)' },
    { code: 'zh-TW', name: '中文(繁体)' },
    { code: 'en', name: '英语' },
    { code: 'ja', name: '日语' },
    { code: 'ko', name: '韩语' },
    { code: 'fr', name: '法语' },
    { code: 'de', name: '德语' },
    { code: 'es', name: '西班牙语' },
    { code: 'ru', name: '俄语' },
    { code: 'pt', name: '葡萄牙语' },
    { code: 'it', name: '意大利语' },
    { code: 'ar', name: '阿拉伯语' },
    { code: 'th', name: '泰语' },
    { code: 'vi', name: '越南语' },
  ]);
});

module.exports = router;

'use strict';

const express = require('express');
const router = express.Router();
const config = require('../config');
const https = require('https');
const http = require('http');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/** GET 并返回文本（带 UA、超时、错误码检查） */
function getText(url, timeout = 9000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          'User-Agent': UA,
          Accept: 'application/json,text/plain,*/*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          return reject(new Error('上游 HTTP ' + res.statusCode));
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve(data));
      }
    );
    req.on('error', reject);
    req.setTimeout(timeout, () => req.destroy(new Error('请求超时')));
  });
}

/** POST JSON 并返回文本 */
function postJson(url, payload, headers = {}, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const req = lib.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': UA,
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error('上游 HTTP ' + res.statusCode + ' ' + data.slice(0, 100)));
          }
          resolve(data);
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(timeout, () => req.destroy(new Error('请求超时')));
    req.write(body);
    req.end();
  });
}

/* ------------------------------------------------------------------ *
 * 方案 1：Google 免费接口（client=gtx，无需密钥，质量稳定）
 * ------------------------------------------------------------------ */
async function googleTranslate(text, from, to) {
  const sl = from === 'auto' ? 'auto' : from;
  const url =
    `${config.translate.googleEndpoint}?client=gtx&dt=t` +
    `&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(to)}` +
    `&q=${encodeURIComponent(text)}`;
  const raw = await getText(url);
  const data = JSON.parse(raw);
  if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error('返回格式异常');
  const translated = data[0]
    .map((seg) => (seg && typeof seg[0] === 'string' ? seg[0] : ''))
    .join('');
  if (!translated.trim()) throw new Error('未返回译文');
  const detected =
    (typeof data[2] === 'string' && data[2]) || (from === 'auto' ? 'auto' : from);
  return { translated, detected };
}

/* ------------------------------------------------------------------ *
 * 方案 2：微软 Edge 免费翻译（无需密钥，令牌约 10 分钟有效）
 * ------------------------------------------------------------------ */
const EDGE_LANG = { 'zh-CN': 'zh-Hans', 'zh-TW': 'zh-Hant' };
let edgeToken = { v: '', t: 0 };

async function getEdgeToken() {
  if (edgeToken.v && Date.now() - edgeToken.t < 8 * 60 * 1000) return edgeToken.v;
  const raw = await getText('https://edge.microsoft.com/translate/auth', 8000);
  const token = String(raw || '').trim();
  if (token.length < 100) throw new Error('获取令牌失败');
  edgeToken = { v: token, t: Date.now() };
  return token;
}

async function edgeTranslate(text, from, to) {
  const token = await getEdgeToken();
  const tl = EDGE_LANG[to] || to;
  const sl = from === 'auto' ? '' : EDGE_LANG[from] || from;
  const qs =
    `api-version=3.0&to=${encodeURIComponent(tl)}` + (sl ? `&from=${encodeURIComponent(sl)}` : '');
  const url = `https://api-edge.cognitive.microsofttranslator.com/translate?${qs}`;
  const raw = await postJson(url, [{ Text: text }], { Authorization: 'Bearer ' + token });
  const data = JSON.parse(raw);
  const item = Array.isArray(data) && data[0];
  const translated = item && item.translations && item.translations[0] && item.translations[0].text;
  if (!translated) throw new Error('未返回译文');
  const detected =
    (item.detectedLanguage && item.detectedLanguage.language) || (from === 'auto' ? 'auto' : from);
  return { translated, detected };
}

/* ------------------------------------------------------------------ *
 * 方案 3：MyMemory（额度按 IP 每天限流，作为最后兜底）
 * ------------------------------------------------------------------ */
async function myMemoryTranslate(text, from, to) {
  const langpair = `${from === 'auto' ? 'autodetect' : from}|${to}`;
  let url =
    `${config.translate.endpoint}?q=${encodeURIComponent(text)}` +
    `&langpair=${encodeURIComponent(langpair)}`;
  if (config.translate.email) url += `&de=${encodeURIComponent(config.translate.email)}`;

  const raw = await getText(url);
  const data = JSON.parse(raw);
  const translated = data && data.responseData && data.responseData.translatedText;
  if (!translated) throw new Error('未返回译文');
  // 额度用尽时会把警告写进 translatedText，绝不能当译文返回
  if (/MYMEMORY WARNING|USED ALL AVAILABLE FREE TRANSLATIONS|QUERY LENGTH LIMIT/i.test(translated)) {
    throw new Error('免费额度已用尽');
  }
  const detected =
    (data.responseData && data.responseData.detectedLanguage) || (from === 'auto' ? 'auto' : from);
  return { translated, detected };
}

/* ---------------- 简易内存缓存：减少重复请求与上游限流 ---------------- */
const cache = new Map();
function cacheGet(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.t > config.translate.cacheTtl) {
    cache.delete(key);
    return null;
  }
  return item.v;
}
function cacheSet(key, value) {
  if (cache.size > 800) cache.clear();
  cache.set(key, { v: value, t: Date.now() });
}

// POST /api/translate
// body: { text, from, to }  from/to 形如 "zh-CN" "en"；from 可为 "auto"
router.post('/', async (req, res) => {
  try {
    const { text, from = 'auto', to = 'zh-CN' } = req.body || {};
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: '请输入待翻译文本' });
    }
    const q = String(text).slice(0, 5000);
    const key = `${from}|${to}|${q}`;

    const hit = cacheGet(key);
    if (hit) return res.json({ ...hit, cached: true });

    const providers = [
      ['Google', googleTranslate],
      ['Edge', edgeTranslate],
      ['MyMemory', myMemoryTranslate],
    ];
    const errors = [];

    for (const [name, fn] of providers) {
      try {
        const r = await fn(q, from, to);
        const payload = { translated: r.translated, from: r.detected, to, service: name };
        cacheSet(key, payload);
        return res.json(payload);
      } catch (e) {
        errors.push(`${name}: ${e.message}`);
      }
    }

    return res.status(502).json({
      error: '翻译服务暂时不可用，请稍后重试',
      detail: errors,
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

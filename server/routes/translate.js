'use strict';

/**
 * 翻译路由（多源自动兜底）
 *
 * 源顺序（可通过环境变量 TRANSLATE_PROVIDER_ORDER 调整）：
 *   1. deepl    —— DeepL API Free（需 DEEPL_API_KEY，质量最好、额度稳定）
 *   2. bing     —— Bing 翻译网页接口（无需密钥，按会话限流，云主机上最稳）
 *   3. google   —— Google gtx 免费接口（无需密钥，部分机房 IP 会被 429）
 *   4. google2  —— Google dict-chrome-ex 变体（换端点，绕过单端点限流）
 *   5. simply   —— SimplyTranslate 公共代理（转发 Google，第三方服务）
 *   6. mymemory —— MyMemory（按 IP 每日限额，作为最后兜底）
 *
 * 说明：公共免费接口都有不可控的限流/失效风险，生产环境建议配置
 * DEEPL_API_KEY（免费注册，无需信用卡，50 万字符/月）彻底稳定下来。
 */

const express = require('express');
const router = express.Router();
const config = require('../config');
const https = require('https');
const http = require('http');
const zlib = require('zlib');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/* ------------------------------------------------------------------ *
 * 基础 HTTP 工具
 * ------------------------------------------------------------------ */

/**
 * 通用请求：支持重定向、gzip 解压、返回 { status, headers, body }
 */
function request(url, opts = {}, _depth = 0) {
  const {
    method = 'GET',
    headers = {},
    body = null,
    timeout = 12000,
    followRedirect = true,
    maxRedirect = 2,
  } = opts;

  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || undefined,
        path: u.pathname + u.search,
        method,
        headers: {
          'User-Agent': UA,
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate',
          ...headers,
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        if (
          followRedirect &&
          status >= 300 &&
          status < 400 &&
          res.headers.location &&
          _depth < maxRedirect
        ) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          return resolve(request(next, { ...opts, method: 'GET', body: null }, _depth + 1));
        }
        let stream = res;
        const enc = String(res.headers['content-encoding'] || '');
        if (enc.includes('gzip')) stream = res.pipe(zlib.createGunzip());
        else if (enc.includes('deflate')) stream = res.pipe(zlib.createInflate());

        let data = '';
        stream.setEncoding('utf8');
        stream.on('data', (c) => (data += c));
        stream.on('end', () => resolve({ status, headers: res.headers, body: data }));
        stream.on('error', reject);
      }
    );
    req.on('error', reject);
    req.setTimeout(timeout, () => req.destroy(new Error('请求超时')));
    if (body) req.write(body);
    req.end();
  });
}

/** GET 文本，非 2xx 直接抛错 */
async function getText(url, headers = {}, timeout = 9000) {
  const r = await request(url, { headers, timeout });
  if (r.status >= 400) throw new Error('上游 HTTP ' + r.status);
  return r.body;
}

/** POST 表单（application/x-www-form-urlencoded） */
async function postForm(url, fields, headers = {}, timeout = 12000) {
  const body = new URLSearchParams(fields).toString();
  const r = await request(url, {
    method: 'POST',
    body,
    timeout,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
      ...headers,
    },
  });
  if (r.status >= 400) throw new Error('上游 HTTP ' + r.status);
  return r.body;
}

/* ------------------------------------------------------------------ *
 * 方案 1：DeepL API Free（需密钥）
 * ------------------------------------------------------------------ */
const DEEPL_LANG = { 'zh-CN': 'ZH', 'zh-TW': 'ZH', 'en': 'EN' };

async function deeplTranslate(text, from, to) {
  const key = config.translate.deeplKey;
  if (!key) throw new Error('未配置 DEEPL_API_KEY');
  const host = key.endsWith(':fx')
    ? 'https://api-free.deepl.com'
    : 'https://api.deepl.com';
  const body = new URLSearchParams({ text, target_lang: DEEPL_LANG[to] || to.toUpperCase() });
  if (from !== 'auto') body.set('source_lang', DEEPL_LANG[from] || from.toUpperCase());
  const r = await request(host + '/v2/translate', {
    method: 'POST',
    body: body.toString(),
    headers: {
      Authorization: 'DeepL-Auth-Key ' + key,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body.toString()),
    },
  });
  if (r.status >= 400) throw new Error('上游 HTTP ' + r.status);
  const data = JSON.parse(r.body);
  const item = data.translations && data.translations[0];
  if (!item || !item.text) throw new Error('未返回译文');
  return {
    translated: item.text,
    detected: (item.detected_source_language || '').toLowerCase() || from,
  };
}

/* ------------------------------------------------------------------ *
 * 方案 2：Bing 翻译网页接口（无需密钥）
 * 通过 /translator 页面拿到 IG 与防滥用令牌，复用其会话调用 ttranslatev3
 * ------------------------------------------------------------------ */
const BING_LANG = { 'zh-CN': 'zh-Hans', 'zh-TW': 'zh-Hant', 'auto': 'auto-detect' };
let bingSession = { cookie: '', ig: '', key: '', token: '', host: '', t: 0 };

function pickSetCookie(headers) {
  const sc = headers['set-cookie'];
  if (!sc) return '';
  const arr = Array.isArray(sc) ? sc : [sc];
  return arr.map((c) => String(c).split(';')[0]).join('; ');
}

async function refreshBingSession(force = false) {
  if (!force && bingSession.ig && Date.now() - bingSession.t < 25 * 60 * 1000) return bingSession;

  const hosts = config.translate.bingHosts;
  let lastErr = null;

  for (const host of hosts) {
    try {
      const url = `https://${host}/translator`;
      const r = await request(url, { timeout: 15000 });
      if (r.status >= 400) throw new Error('上游 HTTP ' + r.status);
      const html = r.body;
      const ig = (html.match(/IG:"([A-Fa-f0-9]{16,})"/) || [])[1];
      const params = (html.match(/params_AbusePreventionHelper\s*=\s*\[([^\]]+)\]/) || [])[1];
      if (!ig || !params) throw new Error('页面未包含会话参数');
      const parts = params.split(',');
      const key = parts[0].replace(/["'\s]/g, '');
      const token = parts[1].replace(/["'\s]/g, '');
      if (!key || !token) throw new Error('防滥用令牌解析失败');

      bingSession = {
        cookie: pickSetCookie(r.headers),
        ig,
        key,
        token,
        host,
        t: Date.now(),
      };
      return bingSession;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error('会话获取失败: ' + (lastErr ? lastErr.message : '未知'));
}

async function bingTranslate(text, from, to, retried = false) {
  const s = await refreshBingSession();
  const sl = BING_LANG[from] || from;
  const tl = BING_LANG[to] || to;
  const qs = `isVertical=1&&IG=${s.ig}&IID=translator.5028.1`;
  const url = `https://${s.host}/ttranslatev3?${qs}`;

  let raw;
  try {
    raw = await postForm(
      url,
      { fromLang: sl, to: tl, text, token: s.token, key: s.key },
      {
        Cookie: s.cookie,
        Referer: `https://${s.host}/translator`,
        Origin: `https://${s.host}`,
        Accept: '*/*',
      },
      15000
    );
  } catch (e) {
    if (!retried) {
      await refreshBingSession(true);
      return bingTranslate(text, from, to, true);
    }
    throw e;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    // 会话过期时返回的是 HTML，刷新后重试一次
    if (!retried) {
      await refreshBingSession(true);
      return bingTranslate(text, from, to, true);
    }
    throw new Error('返回非 JSON');
  }
  if (data && data.statusCode && data.statusCode >= 400) {
    if (!retried) {
      await refreshBingSession(true);
      return bingTranslate(text, from, to, true);
    }
    throw new Error('接口返回 ' + data.statusCode);
  }
  const item = Array.isArray(data) ? data[0] : null;
  const translated =
    item && item.translations && item.translations[0] && item.translations[0].text;
  if (!translated) throw new Error('未返回译文');
  const detected =
    (item.detectedLanguage && item.detectedLanguage.language) || (from === 'auto' ? 'auto' : from);
  return { translated, detected };
}

/* ------------------------------------------------------------------ *
 * 方案 3/4：Google 免费接口的两个变体
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

async function googleAltTranslate(text, from, to) {
  const sl = from === 'auto' ? 'auto' : from;
  const url =
    `${config.translate.googleAltEndpoint}?client=dict-chrome-ex` +
    `&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(to)}` +
    `&q=${encodeURIComponent(text)}`;
  const raw = await getText(url);
  const data = JSON.parse(raw);
  // 返回形如 ["译文"] 或 [["译文","源文"]]
  let translated = '';
  if (Array.isArray(data)) {
    translated = data
      .map((seg) => (Array.isArray(seg) ? seg[0] : typeof seg === 'string' ? seg : ''))
      .join('');
  }
  if (!translated.trim()) throw new Error('返回格式异常');
  return { translated, detected: from === 'auto' ? 'auto' : from };
}

/* ------------------------------------------------------------------ *
 * 方案 5：SimplyTranslate 公共实例（代理 Google）
 * ------------------------------------------------------------------ */
const SIMPLY_LANG = { 'zh-CN': 'zh-Hans', 'zh-TW': 'zh-Hant', auto: 'auto' };

async function simplyTranslate(text, from, to) {
  const sl = SIMPLY_LANG[from] || from;
  const tl = SIMPLY_LANG[to] || to;
  let lastErr = null;
  for (const base of config.translate.simplyHosts) {
    try {
      const url =
        `${base}/api/translate/?engine=google` +
        `&from=${encodeURIComponent(sl)}&to=${encodeURIComponent(tl)}` +
        `&text=${encodeURIComponent(text)}`;
      const raw = await getText(url, { Accept: 'application/json' }, 12000);
      const data = JSON.parse(raw);
      const translated = data && (data.translated_text || data.translatedText);
      if (!translated) throw new Error('未返回译文');
      return { translated, detected: data.detected_language || (from === 'auto' ? 'auto' : from) };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('实例不可用');
}

/* ------------------------------------------------------------------ *
 * 方案 6：MyMemory（按 IP 每日限额，最后兜底）
 * ------------------------------------------------------------------ */
async function myMemoryTranslate(text, from, to) {
  const langpair = `${from === 'auto' ? 'autodetect' : from}|${to}`;
  let url =
    `${config.translate.endpoint}?q=${encodeURIComponent(text)}` +
    `&langpair=${encodeURIComponent(langpair)}`;
  if (config.translate.email) url += `&de=${encodeURIComponent(config.translate.email)}`;

  const raw = await getText(url);
  const data = JSON.parse(raw);
  if (data && data.responseStatus && Number(data.responseStatus) >= 400) {
    throw new Error('接口返回 ' + data.responseStatus);
  }
  const translated = data && data.responseData && data.responseData.translatedText;
  if (!translated) throw new Error('未返回译文');
  if (/MYMEMORY WARNING|USED ALL AVAILABLE FREE TRANSLATIONS|QUERY LENGTH LIMIT/i.test(translated)) {
    throw new Error('免费额度已用尽');
  }
  const detected =
    (data.responseData && data.responseData.detectedLanguage) || (from === 'auto' ? 'auto' : from);
  return { translated, detected };
}

/* ------------------------------------------------------------------ *
 * Provider 注册表 + 缓存
 * ------------------------------------------------------------------ */
const PROVIDERS = {
  deepl: deeplTranslate,
  bing: bingTranslate,
  google: googleTranslate,
  google2: googleAltTranslate,
  simply: simplyTranslate,
  mymemory: myMemoryTranslate,
};

function providerList() {
  const order = String(config.translate.providerOrder || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && PROVIDERS[s]);
  return (order.length ? order : ['bing', 'google', 'google2', 'simply', 'mymemory'])
    .filter((name) => {
      // 未配置密钥的 deepl 直接跳过，避免无谓报错
      if (name === 'deepl' && !config.translate.deeplKey) return false;
      return true;
    })
    .map((name) => [name, PROVIDERS[name]]);
}

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

/* ------------------------------------------------------------------ *
 * 路由
 * ------------------------------------------------------------------ */

// POST /api/translate  body: { text, from, to }
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

    const errors = [];
    for (const [name, fn] of providerList()) {
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
      error: '所有翻译源暂时不可用，请稍后重试',
      detail: errors,
      hint: '公共免费接口有按 IP 限流；在 Render 环境变量里配置 DEEPL_API_KEY（免费注册、无需信用卡）可彻底稳定。',
    });
  } catch (e) {
    res.status(500).json({ error: '翻译失败: ' + e.message });
  }
});

// GET /api/translate/diagnose —— 逐个探测翻译源可用性（运维排查用）
router.get('/diagnose', async (req, res) => {
  const text = String(req.query.text || 'good morning');
  const from = String(req.query.from || 'en');
  const to = String(req.query.to || 'zh-CN');
  const results = await Promise.all(
    providerList().map(async ([name, fn]) => {
      const started = Date.now();
      try {
        const r = await fn(text, from, to);
        return { provider: name, ok: true, ms: Date.now() - started, sample: r.translated };
      } catch (e) {
        return { provider: name, ok: false, ms: Date.now() - started, error: e.message };
      }
    })
  );
  res.json({
    order: providerList().map(([n]) => n),
    deeplConfigured: !!config.translate.deeplKey,
    results,
  });
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

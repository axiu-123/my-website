'use strict';

const fs = require('fs');
const path = require('path');

// 极简 .env 加载（仅当对应变量尚未在环境中设置时写入）
(function loadEnv() {
  try {
    const f = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(f)) return;
    fs.readFileSync(f, 'utf8')
      .split('\n')
      .forEach((line) => {
        const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
      });
  } catch (e) {
    /* 忽略 */
  }
})();

/**
 * 运行时配置（可通过环境变量覆盖，详见 .env.example）
 */
const config = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',

  // AI 聊天 / 桌宠"推理"使用的模型服务（默认 DeepSeek 开放平台）
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    // 若本地无密钥，则启用本地情绪支持回退引擎
    fallbackEnabled: true,
  },

  // 音乐解析服务（第三方解析源，可替换为你自建/合规的服务）
  music: {
    // 默认公共解析源（可能随时失效，建议在 config.js 中替换为自建服务）
    neteaseEndpoint:
      process.env.MUSIC_NETCLOUD_ENDPOINT ||
      'https://api.imjad.cn/cloudmusic/',
    qqEndpoint:
      process.env.MUSIC_QQ_ENDPOINT ||
      'https://api.imjad.cn/qqmusic/',
    // 解析后音频的直连下载是否需要本服务做代理（解决跨域/防盗链）
    proxyDownload: process.env.MUSIC_PROXY_DOWNLOAD !== 'false',
  },

  // AI 作曲（Suno 类服务，可选；未配置则使用本地生成式作曲）
  compose: {
    apiBase: process.env.COMPOSE_API_BASE || '',
    apiKey: process.env.COMPOSE_API_KEY || '',
  },

  // 翻译服务：默认优先走 Google 免费接口（无需密钥、质量好），失败时回退 MyMemory
  translate: {
    googleEndpoint:
      process.env.TRANSLATE_GOOGLE_ENDPOINT ||
      'https://translate.googleapis.com/translate_a/single',
    // MyMemory 兜底（可选：填一个邮箱可获得更高免费额度）
    endpoint:
      process.env.TRANSLATE_ENDPOINT ||
      'https://api.mymemory.translated.net/get',
    email: process.env.TRANSLATE_EMAIL || '',
    // 译文缓存时长（毫秒），减少重复请求
    cacheTtl: Number(process.env.TRANSLATE_CACHE_TTL) || 10 * 60 * 1000,
  },
};

module.exports = config;

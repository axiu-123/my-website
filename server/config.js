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

  // 翻译服务：多源自动兜底（详见 routes/translate.js 顶部说明）
  translate: {
    // 源优先级，逗号分隔；留空使用默认 bing,google,google2,simply,mymemory
    providerOrder: process.env.TRANSLATE_PROVIDER_ORDER || '',
    // DeepL API Free（可选，注册免费、无需信用卡；配置后质量与稳定性最佳）
    deeplKey: process.env.DEEPL_API_KEY || '',

    // Bing 翻译网页接口的候选域名（无需密钥，云主机上最稳）
    bingHosts: (process.env.TRANSLATE_BING_HOSTS || 'cn.bing.com,www.bing.com')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),

    // Google 两个免费端点
    googleEndpoint:
      process.env.TRANSLATE_GOOGLE_ENDPOINT ||
      'https://translate.googleapis.com/translate_a/single',
    googleAltEndpoint:
      process.env.TRANSLATE_GOOGLE_ALT_ENDPOINT ||
      'https://clients5.google.com/translate_a/t',

    // SimplyTranslate 公共实例（代理 Google，第三方服务，可能失效）
    simplyHosts: (
      process.env.TRANSLATE_SIMPLY_HOSTS ||
      'https://simplytranslate.org,https://translate.josias.dev'
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),

    // MyMemory 兜底（按 IP 每日限额；填邮箱可提高额度）
    endpoint:
      process.env.TRANSLATE_ENDPOINT ||
      'https://api.mymemory.translated.net/get',
    email: process.env.TRANSLATE_EMAIL || '',

    // 译文缓存时长（毫秒），减少重复请求
    cacheTtl: Number(process.env.TRANSLATE_CACHE_TTL) || 10 * 60 * 1000,
  },
};

module.exports = config;

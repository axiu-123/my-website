'use strict';

const express = require('express');
const router = express.Router();
const config = require('../config');
const https = require('https');
const http = require('http');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://music.163.com/' } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('解析解析源响应失败'));
          }
        });
      }
    );
    req.on('error', reject);
  });
}

// 从分享链接中解析歌曲 id
function extractId(platform, input) {
  if (/^\d+$/.test(input)) return input; // 直接给的 id
  if (platform === 'netease') {
    const m = input.match(/id=(\d+)/);
    if (m) return m[1];
  }
  if (platform === 'qq') {
    const m = input.match(/songDetail\/([A-Za-z0-9]+)/) || input.match(/songmid=([A-Za-z0-9]+)/) || input.match(/([A-Za-z0-9]{10,})/);
    if (m) return m[1];
  }
  return null;
}

// 统一抽取 { url, name, artist, br }
function normalize(platform, json) {
  try {
    if (platform === 'netease') {
      const arr = json.data || [];
      const best = arr.sort((a, b) => (b.br || 0) - (a.br || 0))[0] || {};
      const info = json.songinfo || json.songs?.[0] || {};
      const name = info.name || json.name || '未知歌曲';
      const artist = Array.isArray(info.artist)
        ? info.artist.map((a) => a.name).join('/')
        : info.artist || info.singer || '';
      return { url: best.url, name, artist, br: best.br };
    } else {
      const arr = json.data || [];
      const best = arr.sort((a, b) => (b.br || 0) - (a.br || 0))[0] || {};
      const info = json.songinfo || json.song || {};
      const name = info.name || info.title || '未知歌曲';
      const artist = info.singer || info.artist || '';
      return { url: best.url, name, artist, br: best.br };
    }
  } catch (e) {
    return null;
  }
}

// POST /api/music/parse  { platform, input }
router.post('/parse', async (req, res) => {
  try {
    const { platform, input } = req.body || {};
    if (!['netease', 'qq'].includes(platform)) {
      return res.status(400).json({ error: 'platform 需为 netease 或 qq' });
    }
    if (!input || !input.trim()) {
      return res.status(400).json({ error: '请输入歌曲链接或 ID' });
    }
    const id = extractId(platform, input.trim());
    if (!id) return res.status(400).json({ error: '无法从输入中解析出歌曲 ID' });
    const endpoint =
      platform === 'netease' ? config.music.neteaseEndpoint : config.music.qqEndpoint;
    const json = await fetchJson(`${endpoint}?type=song&id=${encodeURIComponent(id)}`);
    const song = normalize(platform, json);
    if (!song || !song.url) {
      return res.status(502).json({ error: '解析失败：未获取到音频地址（解析源可能已失效）' });
    }
    res.json({ ...song, platform, id });
  } catch (e) {
    res.status(500).json({ error: '解析异常: ' + e.message });
  }
});

// POST /api/music/search  { platform, keyword }
router.post('/search', async (req, res) => {
  try {
    const { platform, keyword } = req.body || {};
    if (!['netease', 'qq'].includes(platform)) {
      return res.status(400).json({ error: 'platform 需为 netease 或 qq' });
    }
    if (!keyword || !keyword.trim()) {
      return res.status(400).json({ error: '请输入搜索关键词' });
    }
    const endpoint =
      platform === 'netease' ? config.music.neteaseEndpoint : config.music.qqEndpoint;
    const json = await fetchJson(
      `${endpoint}?type=search&w=${encodeURIComponent(keyword.trim())}`
    );
    const list = json.result?.songs || json.data?.list || json.list || [];
    const items = list.slice(0, 10).map((s) => ({
      id: s.id || s.songmid || s.mid,
      name: s.name || s.title,
      artist: s.artist || s.singer || (s.artists && s.artists.map((a) => a.name).join('/')) || '',
    }));
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: '搜索异常: ' + e.message });
  }
});

// GET /api/music/download?url=...&name=...  代理音频流，解决跨域/防盗链，命名下载
router.get('/download', async (req, res) => {
  try {
    const { url, name } = req.query;
    if (!url) return res.status(400).send('missing url');
    const lib = String(url).startsWith('https') ? https : http;
    const safeName = (name || 'audio').replace(/[\\/:*?"<>|]/g, '_');
    lib
      .get(
        String(url),
        { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://music.163.com/' } },
        (up) => {
          if (up.statusCode >= 300 && up.statusCode < 400 && up.headers.location) {
            return res.redirect(up.headers.location);
          }
          res.setHeader('Content-Type', up.headers['content-type'] || 'audio/mpeg');
          res.setHeader('Content-Disposition', `attachment; filename="${safeName}.mp3"`);
          up.pipe(res);
        }
      )
      .on('error', (e) => res.status(500).send('download error: ' + e.message));
  } catch (e) {
    res.status(500).send('error: ' + e.message);
  }
});

module.exports = router;

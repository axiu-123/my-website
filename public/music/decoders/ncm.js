/*
 * ncm.js — 网易云音乐 .ncm 解密入口（纯浏览器）
 * 底层解密使用 ncmdump-js（public/vendor/ncmdump.umd.js，MIT License，挂全局 NcmDump）。
 */
(function (global) {
  'use strict';

  // uint8: 完整文件的 Uint8Array
  global.decryptNcm = async function decryptNcm(uint8) {
    const N = global.NcmDump;
    if (!N || typeof N.parseNcm !== 'function') return { ok: false, message: 'NcmDump 库未加载' };
    try {
      const r = N.parseNcm(uint8);
      if (!r || !r.audio || !r.audio.length) return { ok: false, message: '解析失败：未得到音频数据' };
      const meta = r.metadata || {};
      const name = meta.musicName || '未知歌曲';
      const artist = Array.isArray(meta.artist)
        ? meta.artist.map((a) => (Array.isArray(a) ? a[0] : a)).join('/')
        : (meta.artistName || '');
      return {
        ok: true,
        audio: r.audio,
        format: r.format || 'mp3',
        name,
        artist,
        album: meta.album || '',
      };
    } catch (e) {
      return { ok: false, message: '不是有效的网易云 ncm 文件: ' + e.message };
    }
  };
})(typeof window !== 'undefined' ? window : this);

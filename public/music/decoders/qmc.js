/*
 * qmc.js — QQ 音乐加密文件解密入口（纯浏览器）
 * 移植自 jiangyalin/ncm-or-kgma-to-flac (decrypt/qmc.js) 的解密核心，
 * 去除 music-metadata / iconv / ID3 写入 / 联网查询等依赖，仅做解密。
 */
(function (global) {
  'use strict';

  const M = global.QmcMask;

  // 扩展名 -> 处理函数 / 默认输出格式 / 是否需要从文件尾部探测 mask
  const HandlerMap = {
    mgg:     { handler: M.QmcMaskDetectMgg,     ext: 'ogg',  detect: true },
    mflac:   { handler: M.QmcMaskDetectMflac,   ext: 'flac', detect: true },
    qmc0:    { handler: M.QmcMaskGetDefault,    ext: 'mp3',  detect: false },
    qmc2:    { handler: M.QmcMaskGetDefault,    ext: 'ogg',  detect: false },
    qmc3:    { handler: M.QmcMaskGetDefault,    ext: 'mp3',  detect: false },
    qmcogg:  { handler: M.QmcMaskGetDefault,    ext: 'ogg',  detect: false },
    qmcflac: { handler: M.QmcMaskGetDefault,    ext: 'flac', detect: false },
    bkcmp3:  { handler: M.QmcMaskGetDefault,    ext: 'mp3',  detect: false },
    bkcflac: { handler: M.QmcMaskGetDefault,    ext: 'flac', detect: false },
    tkm:     { handler: M.QmcMaskGetDefault,    ext: 'm4a',  detect: false },
  };

  const HEADS = {
    mp3:  [0x49, 0x44, 0x33], // ID3
    flac: [0x66, 0x4C, 0x61, 0x43], // fLaC
    ogg:  [0x4F, 0x67, 0x67, 0x53], // OggS
    m4a:  [0x66, 0x74, 0x79, 0x70], // ftyp
    wav:  [0x52, 0x49, 0x46, 0x46], // RIFF
  };

  function detectExt(data, fallback) {
    for (const k in HEADS) {
      const h = HEADS[k];
      if (data.length >= h.length && h.every((v, i) => v === data[i])) return k;
    }
    return fallback;
  }

  // uint8: 完整文件的 Uint8Array; ext: 小写扩展名（不含点）
  global.decryptQmc = async function decryptQmc(uint8, ext) {
    if (!M) return { ok: false, message: 'QmcMask 库未加载' };
    if (!(ext in HandlerMap)) return { ok: false, message: '不支持的 QQ 音乐格式: .' + ext };
    const h = HandlerMap[ext];
    let audioData, seed;
    try {
      if (h.detect) {
        if (uint8.length < 8) return { ok: false, message: '文件过小，无法解析' };
        const t = uint8.subarray(uint8.length - 4);
        const keyLen = (t[0] | (t[1] << 8) | (t[2] << 16) | (t[3] << 24)) >>> 0;
        if (keyLen <= 0 || keyLen > uint8.length) return { ok: false, message: '无法解析密钥长度' };
        const keyPos = uint8.length - 4 - keyLen;
        audioData = uint8.slice(0, keyPos);
        seed = h.handler(audioData);
        if (!seed) return { ok: false, message: '.' + ext + ' 暂不支持（需旧版密钥，未内置）' };
      } else {
        audioData = uint8;
        seed = h.handler(audioData);
      }
      const musicDecoded = seed.Decrypt(audioData);
      const outExt = detectExt(musicDecoded, h.ext);
      return { ok: true, audio: musicDecoded, ext: outExt };
    } catch (e) {
      return { ok: false, message: '解密失败: ' + e.message };
    }
  };
})(typeof window !== 'undefined' ? window : this);

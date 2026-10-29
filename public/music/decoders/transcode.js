/*
 * transcode.js — 浏览器端音频转码（flac / ogg / m4a -> mp3）
 * 使用 Web Audio API 解码为 PCM，再用 lamejs（public/vendor/lame.min.js，全局 lamejs）编码为 MP3。
 * 若源已是 mp3，则直接返回原字节，避免二次压缩与耗时。
 */
(function (global) {
  'use strict';

  function floatToInt16(input) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  // uint8: 解密后的音频字节; fromExt: 解密得到的格式
  // 返回：mp3 的 Uint8Array（Blob 由调用方构造）
  global.transcodeToMp3 = async function transcodeToMp3(uint8, fromExt) {
    if (fromExt === 'mp3') return uint8; // 已是 mp3，直接返回

    const Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx) throw new Error('当前浏览器不支持 Web Audio API，无法转码');
    if (typeof global.lamejs === 'undefined') throw new Error('lamejs 未加载，无法编码 MP3');

    const ctx = new Ctx();
    try {
      // decodeAudioData 需要 ArrayBuffer（避免共享视图导致 detach）
      const ab = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength);
      const audioBuf = await ctx.decodeAudioData(ab);
      const lame = new global.lamejs();
      const kbps = 192;
      const enc = new lame.Mp3Encoder(audioBuf.numberOfChannels, audioBuf.sampleRate, kbps);
      const left = audioBuf.getChannelData(0);
      const right = audioBuf.numberOfChannels > 1 ? audioBuf.getChannelData(1) : left;
      const l16 = floatToInt16(left);
      const r16 = floatToInt16(right);
      const block = 1152;
      const chunks = [];
      for (let i = 0; i < l16.length; i += block) {
        const lc = l16.subarray(i, i + block);
        const rc = r16.subarray(i, i + block);
        const buf = enc.encodeBuffer(lc, rc);
        if (buf.length) chunks.push(buf);
      }
      const end = enc.flush();
      if (end.length) chunks.push(end);

      // 合并为单个 Uint8Array
      let total = 0;
      chunks.forEach((c) => (total += c.length));
      const out = new Uint8Array(total);
      let off = 0;
      chunks.forEach((c) => {
        out.set(c, off);
        off += c.length;
      });
      return out;
    } finally {
      if (ctx.close) ctx.close();
    }
  };
})(typeof window !== 'undefined' ? window : this);

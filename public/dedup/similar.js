// 文件查重 · 高级模式算法（纯前端，无依赖）
// 思路：把文件名归一化（去版本词/括号/标点/年份），再用 Dice 相似度 + token 包含式判定"疑似同一首歌"
(function (root) {
  // 常见版本/修饰词（中英文）：去这些后剩下的才是歌名核心
  const VER_WORDS = [
    'live', 'remaster', 'remastered', 'remix', 'dj', 'edit', 'explicit', 'clean',
    'acoustic', 'instrumental', 'karaoke', 'demo', 'radio', 'vip', 'ost', 'tv',
    '试听', '伴奏', '翻唱', '原唱', '现场', '高清', '无损', '高品质', '高品', '标准',
    '极高', '纯音乐', '片段', '完整版', '铃声', '新版', '官方', '正式', '原版', '独家',
    '超清', '母带', 'flac', 'mp3', 'm4a', 'wav', 'ape'
  ];

  function stripVer(s) {
    s = String(s).toLowerCase();
    for (const w of VER_WORDS) {
      // 整词移除（避免误伤歌名中含该串的情况，用边界判断）
      s = s.replace(new RegExp('(^|[^a-z0-9])' + w + '([^a-z0-9]|$)', 'g'), '$1 $2');
    }
    s = s.replace(/\b(19|20)\d{2}\b/g, ' '); // 年份
    s = s.replace(/[^\p{L}\p{N}\s]/gu, ' '); // 去标点
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  function tokens(s) {
    return stripVer(s).split(/\s+/).filter(Boolean);
  }
  function norm(s) {
    return tokens(s).join(' ');
  }

  function bigrams(s) {
    const set = new Set();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  }
  function dice(a, b) {
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    const A = bigrams(a), B = bigrams(b);
    let inter = 0;
    for (const x of A) if (B.has(x)) inter++;
    const denom = A.size + B.size;
    return denom === 0 ? 0 : (2 * inter) / denom;
  }

  // 双特征相似度：完整归一串的 Dice，或任一 token 与对方完整串的高相似（处理"歌手-歌名" vs "歌名"）
  function score(nameX, nameY) {
    const nx = norm(nameX), ny = norm(nameY);
    let s = dice(nx, ny);
    const tx = tokens(nameX), ty = tokens(nameY);
    for (const x of tx) s = Math.max(s, dice(x, ny));
    for (const y of ty) s = Math.max(s, dice(y, nx));
    return s;
  }

  function ext(name) {
    const i = name.lastIndexOf('.');
    return i < 0 ? '' : name.slice(i + 1).toLowerCase();
  }

  // files: [{name, full, size, handle, parent}]
  // opts: { threshold, sameExt }
  function groupSimilar(files, opts) {
    const threshold = opts && typeof opts.threshold === 'number' ? opts.threshold : 0.82;
    const sameExt = !!(opts && opts.sameExt);
    const n = files.length;
    const parent = Array.from({ length: n }, (_, i) => i);

    function find(x) { return parent[x] === x ? x : (parent[x] = find(parent[x])); }
    function union(a, b) { parent[find(a)] = find(b); }

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (sameExt && ext(files[i].name) !== ext(files[j].name)) continue;
        const s = score(files[i].name, files[j].name);
        if (s >= threshold) union(i, j);
      }
    }

    const compMap = {};
    for (let i = 0; i < n; i++) {
      const r = find(i);
      (compMap[r] = compMap[r] || []).push(i);
    }

    const groups = [];
    for (const r of Object.keys(compMap)) {
      const idx = compMap[r];
      if (idx.length < 2) continue;
      const members = idx.map((i) => files[i]);
      // 推荐保留：尺寸最大者（音质通常更好），相等则首个
      let keep = 0;
      for (let k = 1; k < members.length; k++) {
        if (members[k].size > members[keep].size) keep = k;
      }
      // 组代表核心名：取最短的归一串
      const rep = members.map((m) => norm(m.name)).sort((a, b) => a.length - b.length)[0] || '';
      groups.push({ key: rep, members, keepIndex: keep });
    }
    // 按推荐保留项之外的重复数排序，重复越多越靠前
    groups.sort((a, b) => b.members.length - a.members.length);
    return groups;
  }

  const api = { stripVer, tokens, norm, dice, score, ext, groupSimilar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.DedupSimilar = api;
})(typeof self !== 'undefined' ? self : this);

(function () {
  'use strict';

  // ============ 原在线解析（保留，但已不可靠） ============
  const platform = document.getElementById('platform');
  const kw = document.getElementById('kw');
  const searchBtn = document.getElementById('search');
  const searchResult = document.getElementById('searchResult');
  const input = document.getElementById('input');
  const parseBtn = document.getElementById('parse');
  const out = document.getElementById('out');

  searchBtn.addEventListener('click', async () => {
    const keyword = kw.value.trim();
    if (!keyword) return;
    searchBtn.disabled = true;
    searchResult.innerHTML = '<span class="note">搜索中……</span>';
    try {
      const r = await api('/api/music/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: platform.value, keyword }),
      });
      if (!r.items || !r.items.length) {
        searchResult.innerHTML = '<span class="note">未找到结果（第三方解析源可能已失效）</span>';
      } else {
        searchResult.innerHTML =
          '<table class="tbl"><thead><tr><th>歌曲</th><th>歌手</th><th></th></tr></thead><tbody>' +
          r.items
            .map(
              (it) =>
                `<tr><td>${escapeHtml(it.name)}</td><td>${escapeHtml(it.artist || '')}</td>` +
                `<td><button class="ghost" data-id="${it.id}" style="padding:5px 10px;">选</button></td></tr>`
            )
            .join('') +
          '</tbody></table>';
        searchResult.querySelectorAll('button[data-id]').forEach((b) => {
          b.addEventListener('click', () => {
            input.value = b.getAttribute('data-id');
            searchResult.querySelectorAll('button[data-id]').forEach((x) => (x.disabled = false));
            b.disabled = true;
          });
        });
      }
    } catch (e) {
      searchResult.innerHTML = '<span class="note" style="color:var(--danger)">搜索失败：' + e.message + '</span>';
    } finally {
      searchBtn.disabled = false;
    }
  });

  parseBtn.addEventListener('click', async () => {
    const v = input.value.trim();
    if (!v) return;
    parseBtn.disabled = true;
    out.style.display = 'block';
    out.className = 'result';
    out.textContent = '解析中……';
    try {
      const r = await api('/api/music/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: platform.value, input: v }),
      });
      const name = `${r.name} - ${r.artist || '未知'}`.replace(/[\\/:*?"<>|]/g, '_');
      out.className = 'result ok';
      out.innerHTML =
        `<b>${escapeHtml(r.name)}</b> — ${escapeHtml(r.artist || '未知')}<br>` +
        `<span class="tag green">${r.platform === 'netease' ? '网易云' : 'QQ音乐'}</span>` +
        `<span class="tag gray">${(r.br / 1000) | 0} kbps</span><br><br>` +
        `<a class="ghost" href="/api/music/download?url=${encodeURIComponent(r.url)}&name=${encodeURIComponent(name)}" download>⬇ 下载 MP3</a>`;
    } catch (e) {
      out.className = 'result error';
      out.textContent = '解析失败：' + e.message;
    } finally {
      parseBtn.disabled = false;
    }
  });

  // ============ 本地文件解密 / 转码（纯浏览器端） ============
  const fileInput = document.getElementById('fileInput');
  const fileList = document.getElementById('fileList');

  function mimeOf(ext) {
    return (
      { mp3: 'audio/mpeg', flac: 'audio/flac', ogg: 'audio/ogg', m4a: 'audio/mp4', wav: 'audio/x-wav' }[ext] ||
      'application/octet-stream'
    );
  }

  class FileCard {
    constructor(name) {
      this.el = document.createElement('div');
      this.el.className = 'card';
      this.el.innerHTML = `<div class="c-name">${escapeHtml(name)}</div><div class="c-status note">处理中…</div><div class="c-actions"></div>`;
      this.statusEl = this.el.querySelector('.c-status');
      this.actionsEl = this.el.querySelector('.c-actions');
      fileList.appendChild(this.el);
    }
    ok(meta, ext) {
      this.statusEl.className = 'c-status ok';
      this.statusEl.textContent = `✅ ${meta}（${ext}）`;
    }
    fail(msg) {
      this.statusEl.className = 'c-status error';
      this.statusEl.textContent = '❌ ' + msg;
    }
    setStatus(t) {
      this.statusEl.textContent = t;
    }
    addDownload(label, url, filename) {
      const a = document.createElement('a');
      a.className = 'ghost';
      a.href = url;
      a.download = filename;
      a.textContent = label;
      this.actionsEl.appendChild(a);
    }
    addButton(label, fn) {
      const b = document.createElement('button');
      b.className = 'ghost';
      b.textContent = label;
      b.onclick = fn;
      this.actionsEl.appendChild(b);
    }
  }

  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    for (const f of files) {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      const card = new FileCard(f.name);
      try {
        const buf = await f.arrayBuffer();
        const uint8 = new Uint8Array(buf);
        let res;
        if (ext === 'ncm') {
          if (typeof window.decryptNcm !== 'function') {
            card.fail('NcmDump 库未加载');
            continue;
          }
          res = await window.decryptNcm(uint8);
        } else {
          if (typeof window.decryptQmc !== 'function') {
            card.fail('Qmc 解密库未加载');
            continue;
          }
          res = await window.decryptQmc(uint8, ext);
        }
        if (!res || !res.ok) {
          card.fail((res && res.message) || '未知错误');
          continue;
        }
        const outExt = res.ext || res.format || 'mp3';
        const meta = res.name ? `${res.name} — ${res.artist || '未知'}` : f.name.replace(/\.[^.]+$/, '');
        card.ok(meta, outExt);

        const baseName = (res.name ? `${res.name} - ${res.artist || '未知'}` : f.name.replace(/\.[^.]+$/, '')).replace(
          /[\\/:*?"<>|]/g,
          '_'
        );
        const blob = new Blob([res.audio], { type: mimeOf(outExt) });
        const url = URL.createObjectURL(blob);
        card.addDownload(`⬇ 下载 ${outExt.toUpperCase()}`, url, `${baseName}.${outExt}`);

        if (outExt !== 'mp3') {
          card.addButton('⬇ 转 MP3 下载', async () => {
            card.setStatus('转码中…（无损格式较长，请稍候，手机可能较慢）');
            try {
              const mp3 = await window.transcodeToMp3(res.audio, outExt);
              const b2 = mp3 instanceof Blob ? mp3 : new Blob([mp3], { type: 'audio/mpeg' });
              const u2 = URL.createObjectURL(b2);
              card.addDownload('⬇ MP3 已生成', u2, `${baseName}.mp3`);
              card.setStatus('✅ MP3 已生成，点击上方按钮下载');
            } catch (err) {
              card.setStatus('转码失败：' + err.message + '（可改用桌面端工具，或直接下载原格式）');
            }
          });
        }
      } catch (err) {
        card.fail('处理异常: ' + err.message);
      }
    }
    fileInput.value = '';
  });
})();

(async function () {
  const platform = document.getElementById('platform');
  const kw = document.getElementById('kw');
  const searchBtn = document.getElementById('search');
  const searchResult = document.getElementById('searchResult');
  const input = document.getElementById('input');
  const parseBtn = document.getElementById('parse');
  const out = document.getElementById('out');

  let current = null; // { url, name, artist }

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
        searchResult.innerHTML = '<span class="note">未找到结果</span>';
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
      current = r;
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
})();

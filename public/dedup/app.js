(async function () {
  const pickBtn = document.getElementById('pick');
  const dirNameEl = document.getElementById('dirName');
  const recursiveEl = document.getElementById('recursive');
  const scanBtn = document.getElementById('scan');
  const resultEl = document.getElementById('result');
  const quarantineBtn = document.getElementById('quarantine');

  let dirHandle = null;
  let dups = []; // 重复文件的 {handle, name, hash}

  if (!window.showDirectoryPicker) {
    dirNameEl.innerHTML =
      '<span style="color:var(--danger)">当前浏览器不支持文件夹读写（File System Access API）。请使用 Chrome / Edge 打开本页。</span>';
    pickBtn.disabled = true;
  }

  pickBtn.addEventListener('click', async () => {
    try {
      dirHandle = await window.showDirectoryPicker();
      dirNameEl.textContent = '已选择文件夹：' + dirHandle.name;
      scanBtn.disabled = false;
    } catch (e) {
      dirNameEl.textContent = '未选择文件夹';
    }
  });

  async function* walk(dir, base) {
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === 'file') yield { name, full: base + name, handle };
      else if (handle.kind === 'directory' && recursiveEl.checked)
        yield* walk(handle, base + name + '/');
    }
  }

  async function sha256(file) {
    const buf = await file.arrayBuffer();
    const h = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  scanBtn.addEventListener('click', async () => {
    if (!dirHandle) return;
    scanBtn.disabled = true;
    resultEl.innerHTML = '<span class="note">正在计算文件指纹……</span>';
    const groups = {}; // hash -> [entries]
    let count = 0;
    for await (const f of walk(dirHandle, '')) {
      count++;
      resultEl.innerHTML = `<span class="note">正在计算文件指纹…… 已处理 ${count} 个</span>`;
      try {
        const file = await f.handle.getFile();
        if (file.size === 0) continue;
        const h = await sha256(file);
        (groups[h] = groups[h] || []).push({ ...f, size: file.size, hash: h });
      } catch (e) {}
    }
    // 找出重复组
    dups = [];
    const rows = [];
    let dupCount = 0;
    for (const h of Object.keys(groups)) {
      const g = groups[h];
      if (g.length > 1) {
        g.forEach((it, i) => {
          const isDup = i > 0;
          if (isDup) {
            dups.push(it);
            dupCount++;
          }
          rows.push(
            `<tr><td>${escapeHtml(it.full)}</td><td>${(it.size / 1024).toFixed(1)} KB</td>` +
            `<td>${h.slice(0, 12)}…</td>` +
            `<td class="${isDup ? 'dup' : 'ok-text'}">${isDup ? '重复' : '保留'}</td></tr>`
          );
        });
      }
    }
    if (!dups.length) {
      resultEl.innerHTML = `<div class="result ok">查重完成：共扫描 ${count} 个文件，未发现重复项 🎉</div>`;
      quarantineBtn.style.display = 'none';
    } else {
      resultEl.innerHTML =
        `<div class="result"><b>查重完成：</b>扫描 ${count} 个文件，发现 ${dupCount} 个重复文件（分属 ${Object.values(groups).filter((g) => g.length > 1).length} 组）。</div>` +
        '<table class="tbl"><thead><tr><th>文件路径</th><th>大小</th><th>指纹</th><th>状态</th></tr></thead><tbody>' +
        rows.join('') + '</tbody></table>';
      quarantineBtn.style.display = 'inline-block';
    }
    scanBtn.disabled = false;
  });

  async function moveToDupFolder(srcHandle, fileName, hash) {
    const dupDir = await dirHandle.getDirectoryHandle('重复文件', { create: true });
    const safeName = fileName.replace(/[\\/:*?"<>|]/g, '_');
    const destName = hash.slice(0, 8) + '_' + safeName;
    const dest = await dupDir.getFileHandle(destName, { create: true });
    const w = await dest.createWritable();
    const file = await srcHandle.getFile();
    await w.write(await file.arrayBuffer());
    await w.close();
    await srcHandle.remove();
  }

  quarantineBtn.addEventListener('click', async () => {
    quarantineBtn.disabled = true;
    let done = 0;
    for (const d of dups) {
      try {
        await moveToDupFolder(d.handle, d.full, d.hash);
        done++;
      } catch (e) {
        console.error('隔离失败', d.full, e);
      }
    }
    quarantineBtn.style.display = 'none';
    resultEl.innerHTML += `<div class="result ok">已隔离 ${done} 个重复文件到「重复文件」文件夹，原件已保留。</div>`;
    quarantineBtn.disabled = false;
  });
})();

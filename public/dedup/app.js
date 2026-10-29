(async function () {
  const pickBtn = document.getElementById('pick');
  const dirNameEl = document.getElementById('dirName');
  const recursiveEl = document.getElementById('recursive');
  const scanBtn = document.getElementById('scan');
  const resultEl = document.getElementById('result');
  const actionsEl = document.getElementById('actions');
  const deleteBtn = document.getElementById('deleteSel');
  const delCountEl = document.getElementById('delCount');
  const selectDupsBtn = document.getElementById('selectDups');
  const quarantineBtn = document.getElementById('quarantine');
  const modeEls = document.querySelectorAll('input[name="mode"]');
  const advOptions = document.getElementById('advOptions');
  const thresholdEl = document.getElementById('threshold');
  const thValEl = document.getElementById('thVal');
  const sameExtEl = document.getElementById('sameExt');

  let dirHandle = null;
  let currentGroups = []; // [{key, members:[{name,full,size,handle,parent}], keepIndex, mode}]
  let currentMode = 'exact';

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmtSize(b) {
    if (b >= 1048576) return (b / 1048576).toFixed(2) + ' MB';
    return (b / 1024).toFixed(1) + ' KB';
  }

  if (!window.showDirectoryPicker) {
    dirNameEl.innerHTML =
      '<span style="color:var(--danger)">当前浏览器不支持文件夹读写（File System Access API）。请使用电脑版 Chrome / Edge 打开本页。</span>';
    pickBtn.disabled = true;
  }

  function getMode() {
    for (const m of modeEls) if (m.checked) return m.value;
    return 'exact';
  }

  modeEls.forEach((m) =>
    m.addEventListener('change', () => {
      advOptions.style.display = getMode() === 'adv' ? 'block' : 'none';
    })
  );
  thresholdEl.addEventListener('input', () => (thValEl.textContent = (+thresholdEl.value).toFixed(2)));

  pickBtn.addEventListener('click', async () => {
    try {
      dirHandle = await window.showDirectoryPicker();
      dirNameEl.textContent = '已选择文件夹：' + dirHandle.name;
      scanBtn.disabled = false;
    } catch (e) {
      dirNameEl.textContent = '未选择文件夹';
    }
  });

  async function* walk(dir, base, parent) {
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === 'file') yield { name, full: base + name, handle, parent };
      else if (handle.kind === 'directory' && recursiveEl.checked)
        yield* walk(handle, base + name + '/', handle);
    }
  }

  async function sha256(file) {
    const buf = await file.arrayBuffer();
    const h = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  scanBtn.addEventListener('click', async () => {
    if (!dirHandle) return;
    currentMode = getMode();
    scanBtn.disabled = true;
    actionsEl.style.display = 'none';
    resultEl.innerHTML = '<span class="note">正在扫描……</span>';

    const files = [];
    for await (const f of walk(dirHandle, '', dirHandle)) {
      try {
        const file = await f.handle.getFile();
        files.push({ ...f, size: file.size });
      } catch (e) {}
    }

    let groups = [];
    if (currentMode === 'exact') {
      resultEl.innerHTML = '<span class="note">精确模式：正在计算 SHA-256 内容指纹……</span>';
      const map = {};
      let processed = 0;
      for (const f of files) {
        processed++;
        if (processed % 20 === 0)
          resultEl.innerHTML = `<span class="note">正在计算指纹…… 已处理 ${processed}/${files.length}</span>`;
        try {
          const file = await f.handle.getFile();
          if (file.size === 0) continue;
          const h = await sha256(file);
          (map[h] = map[h] || []).push({ ...f, hash: h });
        } catch (e) {}
      }
      for (const h of Object.keys(map)) {
        const g = map[h];
        if (g.length > 1) groups.push({ key: h.slice(0, 10), members: g, keepIndex: 0, mode: 'exact' });
      }
      groups.sort((a, b) => b.members.length - a.members.length);
    } else {
      // 高级模式：仅按文件名相似度，无需读内容
      resultEl.innerHTML = '<span class="note">高级模式：正在比对文件名相似度……</span>';
      groups = window.DedupSimilar.groupSimilar(
        files.map((f) => ({ name: f.name, size: f.size, handle: f.handle, parent: f.parent, full: f.full })),
        { threshold: +thresholdEl.value, sameExt: sameExtEl.checked }
      ).map((g) => ({ key: g.key, members: g.members, keepIndex: g.keepIndex, mode: 'adv' }));
    }

    renderGroups(groups);
    scanBtn.disabled = false;
  });

  function renderGroups(groups) {
    currentGroups = groups;
    if (!groups.length) {
      resultEl.innerHTML = `<div class="result ok">查重完成：未发现重复项 🎉（共扫描 ${' '}）</div>`;
      actionsEl.style.display = 'none';
      return;
    }
    let totalDup = 0;
    const cards = groups
      .map((g, gi) => {
        const isExact = g.mode === 'exact';
        const head = isExact
          ? `内容相同的重复组（指纹 ${escapeHtml(g.key)}…）`
          : `疑似同一首：${escapeHtml(g.key || '（文件名高度相似）')}`;
        const rows = g.members
          .map((m, mi) => {
            const isKeep = mi === g.keepIndex;
            totalDup += isKeep ? 0 : 1;
            return `<tr>
              <td><input type="checkbox" class="delbox" data-gi="${gi}" data-mi="${mi}" ${isKeep ? '' : ''}/></td>
              <td>${escapeHtml(m.full)}</td>
              <td>${fmtSize(m.size)}</td>
              <td class="${isKeep ? 'ok-text' : 'dup'}">${isKeep ? '保留' : '可删'}</td>
            </tr>`;
          })
          .join('');
        return `<div class="dup-group">
          <div class="dup-group-head">${head} <span class="note">（${g.members.length} 个，推荐保留 ${escapeHtml(g.members[g.keepIndex].name)}）</span></div>
          <table class="tbl"><thead><tr><th>删?</th><th>文件</th><th>大小</th><th>状态</th></tr></thead><tbody>${rows}</tbody></table>
        </div>`;
      })
      .join('');

    resultEl.innerHTML =
      `<div class="result"><b>查重完成：</b>发现 ${groups.length} 组重复，共 ${totalDup} 个可删项。</div>` +
      cards;
    actionsEl.style.display = 'block';
    updateDelCount();
  }

  function updateDelCount() {
    const n = document.querySelectorAll('.delbox:checked').length;
    delCountEl.textContent = n;
    deleteBtn.disabled = n === 0;
  }
  resultEl.addEventListener('change', (e) => {
    if (e.target.classList.contains('delbox')) updateDelCount();
  });

  selectDupsBtn.addEventListener('click', () => {
    document.querySelectorAll('.delbox').forEach((c) => (c.checked = true));
    updateDelCount();
  });

  // 删除选中项（直接移除文件，二次确认）
  deleteBtn.addEventListener('click', async () => {
    const boxes = [...document.querySelectorAll('.delbox:checked')];
    if (!boxes.length) return;
    const adv = currentMode === 'adv';
    const msg = adv
      ? `高级模式按"文件名相似"判定重复，可能误删真正不同的文件。\n确定要永久删除选中的 ${boxes.length} 个文件吗？\n⚠️ 此操作不可恢复！`
      : `确定要永久删除选中的 ${boxes.length} 个文件吗？\n⚠️ 此操作不可恢复！`;
    if (!confirm(msg)) return;

    deleteBtn.disabled = true;
    let done = 0, fail = 0;
    const removed = []; // {gi, mi}
    for (const c of boxes) {
      const gi = +c.dataset.gi, mi = +c.dataset.mi;
      const m = currentGroups[gi] && currentGroups[gi].members[mi];
      if (!m) continue;
      try {
        await m.parent.removeEntry(m.name);
        removed.push(gi + ':' + mi);
        done++;
      } catch (e) {
        fail++;
        console.error('删除失败', m.full, e);
      }
    }
    // 从内存移除已删项并重新渲染
    for (const key of removed.sort((a, b) => b.localeCompare(a))) {
      const [gi, mi] = key.split(':').map(Number);
      currentGroups[gi].members.splice(mi, 1);
    }
    currentGroups = currentGroups.filter((g) => g.members.length > 1);
    if (currentGroups.length) renderGroups(currentGroups);
    else {
      resultEl.innerHTML = `<div class="result ok">已删除 ${done} 个文件，无剩余重复组 🎉</div>`;
      actionsEl.style.display = 'none';
    }
    if (fail) resultEl.innerHTML += `<div class="result warn">有 ${fail} 个文件删除失败（可能被占用或无权限）。</div>`;
    deleteBtn.disabled = false;
  });

  // 隔离到「重复文件」文件夹（原功能保留）
  quarantineBtn.addEventListener('click', async () => {
    const targets = [];
    currentGroups.forEach((g, gi) =>
      g.members.forEach((m, mi) => {
        if (mi !== g.keepIndex) targets.push(m);
      })
    );
    if (!targets.length) return;
    quarantineBtn.disabled = true;
    const dupDir = await dirHandle.getDirectoryHandle('重复文件', { create: true });
    let done = 0;
    for (const m of targets) {
      try {
        const safe = m.full.replace(/[\\/:*?"<>|]/g, '_');
        const dest = await dupDir.getFileHandle('dup_' + safe, { create: true });
        const w = await dest.createWritable();
        const file = await m.handle.getFile();
        await w.write(await file.arrayBuffer());
        await w.close();
        await m.parent.removeEntry(m.name);
        done++;
      } catch (e) {
        console.error('隔离失败', m.full, e);
      }
    }
    currentGroups = [];
    resultEl.innerHTML = `<div class="result ok">已隔离 ${done} 个重复文件到「重复文件」文件夹，原件保留。</div>`;
    actionsEl.style.display = 'none';
    quarantineBtn.disabled = false;
  });
})();

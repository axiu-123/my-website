(async function () {
  const pickBtn = document.getElementById('pick');
  const dirNameEl = document.getElementById('dirName');
  const mode = document.getElementById('mode');
  const customRules = document.getElementById('customRules');
  const rulesTA = document.getElementById('rules');
  const renamePrefix = document.getElementById('renamePrefix');
  const previewBtn = document.getElementById('preview');
  const planEl = document.getElementById('plan');
  const applyBtn = document.getElementById('apply');

  let dirHandle = null;

  if (!window.showDirectoryPicker) {
    dirNameEl.innerHTML =
      '<span style="color:var(--danger)">当前浏览器不支持文件夹写入（File System Access API）。请使用 Chrome / Edge 打开本页以使用整理功能。</span>';
    pickBtn.disabled = true;
  }

  mode.addEventListener('change', () => {
    customRules.style.display = mode.value === 'custom' ? 'block' : 'none';
  });

  pickBtn.addEventListener('click', async () => {
    try {
      dirHandle = await window.showDirectoryPicker();
      dirNameEl.textContent = '已选择文件夹：' + dirHandle.name;
      previewBtn.disabled = false;
    } catch (e) {
      dirNameEl.textContent = '未选择文件夹';
    }
  });

  function parseCustom(text) {
    const map = {};
    text.split('\n').forEach((line) => {
      const m = line.match(/^(.+?)=>(.+)$/);
      if (!m) return;
      const exts = m[1].split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      const folder = m[2].trim();
      exts.forEach((e) => (map[e] = folder));
    });
    return map;
  }

  const BUILTIN = {
    jpg: '图片', jpeg: '图片', png: '图片', gif: '图片', webp: '图片', bmp: '图片', heic: '图片', svg: '图片',
    mp4: '视频', mov: '视频', avi: '视频', mkv: '视频', webm: '视频', flv: '视频',
    mp3: '音乐', wav: '音乐', flac: '音乐', m4a: '音乐', aac: '音乐', ogg: '音乐',
    pdf: '文档', doc: '文档', docx: '文档', xls: '文档', xlsx: '文档', ppt: '文档', pptx: '文档', txt: '文档', md: '文档', csv: '文档',
    zip: '压缩包', rar: '压缩包', '7z': '压缩包', tar: '压缩包', gz: '压缩包',
    js: '代码', ts: '代码', html: '代码', css: '代码', py: '代码', java: '代码', json: '代码', go: '代码', cpp: '代码',
  };

  function targetFolder(name, lastModified) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (mode.value === 'ext') return BUILTIN[ext] || '其他';
    if (mode.value === 'date') {
      const d = new Date(lastModified);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    if (mode.value === 'custom') {
      const map = parseCustom(rulesTA.value);
      return map[ext] || '其他';
    }
    return '其他';
  }

  async function listFiles() {
    const files = [];
    for await (const [name, handle] of dirHandle.entries()) {
      if (handle.kind === 'file') {
        const f = await handle.getFile();
        files.push({ name, handle, lastModified: f.lastModified });
      }
    }
    return files;
  }

  let plan = [];

  previewBtn.addEventListener('click', async () => {
    if (!dirHandle) return;
    planEl.innerHTML = '<span class="note">扫描中……</span>';
    const files = await listFiles();
    plan = files
      .map((f) => {
        const folder = targetFolder(f.name, f.lastModified);
        const prefix = renamePrefix.checked ? folder + '_' : '';
        return { handle: f.handle, from: f.name, toFolder: folder, toName: prefix + f.name };
      })
      .filter((p) => p.toFolder !== '');
    renderPlan(plan);
  });

  function renderPlan(p) {
    if (!p.length) {
      planEl.innerHTML = '<span class="note">没有需要整理的文件。</span>';
      applyBtn.style.display = 'none';
      return;
    }
    planEl.innerHTML =
      '<p class="note">将执行以下移动（共 ' + p.length + ' 个文件）：</p>' +
      '<table class="tbl"><thead><tr><th>原文件名</th><th>移动到</th></tr></thead><tbody>' +
      p.map((x) => `<tr><td>${escapeHtml(x.from)}</td><td>${escapeHtml(x.toFolder + '/' + x.toName)}</td></tr>`).join('') +
      '</tbody></table>';
    applyBtn.style.display = 'inline-block';
  }

  async function moveOne(f, toFolder, toName) {
    const src = f.handle;
    const parts = toFolder.split('/');
    let cur = dirHandle;
    for (const part of parts) cur = await cur.getDirectoryHandle(part, { create: true });
    const dest = await cur.getFileHandle(toName, { create: true });
    const w = await dest.createWritable();
    const file = await src.getFile();
    await w.write(await file.arrayBuffer());
    await w.close();
    await src.remove();
  }

  applyBtn.addEventListener('click', async () => {
    applyBtn.disabled = true;
    let done = 0;
    for (const x of plan) {
      try {
        await moveOne(x.handle, x.toFolder, x.toName);
        done++;
      } catch (e) {
        console.error('移动失败', x.from, e);
      }
    }
    applyBtn.style.display = 'none';
    planEl.innerHTML = `<div class="result ok">整理完成，共移动 ${done} 个文件。</div>`;
    applyBtn.disabled = false;
  });
})();

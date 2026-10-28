(async function () {
  // ---------- 文字互译 ----------
  const fromSel = document.getElementById('from');
  const toSel = document.getElementById('to');
  const src = document.getElementById('src');
  const out = document.getElementById('out');
  const btn = document.getElementById('btn');
  const swap = document.getElementById('swap');
  const imgTo = document.getElementById('imgTo');

  let langOptions = '';
  try {
    const langs = await api('/api/translate/languages');
    langOptions = langs.map((l) => `<option value="${l.code}">${l.name}</option>`).join('');
  } catch (e) {
    langOptions = '<option value="auto">自动检测</option><option value="zh-CN">中文(简体)</option><option value="en">英语</option>';
  }
  fromSel.innerHTML = langOptions;
  toSel.innerHTML = langOptions;
  imgTo.innerHTML = langOptions;
  fromSel.value = 'auto';
  toSel.value = 'zh-CN';
  imgTo.value = 'zh-CN';

  btn.addEventListener('click', async () => {
    const text = src.value.trim();
    if (!text) return;
    btn.disabled = true;
    out.style.display = 'block';
    out.className = 'result';
    out.textContent = '翻译中……';
    try {
      const r = await api('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, from: fromSel.value, to: toSel.value }),
      });
      out.className = 'result ok';
      out.innerHTML = `<b>译文：</b><br>${escapeHtml(r.translated)}<br><span class="note">（${r.service} · 目标语言 ${r.to}）</span>`;
    } catch (e) {
      showTranslateError(out, e);
    } finally {
      btn.disabled = false;
    }
  });

  // 翻译源全挂时给出可执行的修复指引，而不是只丢一句“失败”
  function showTranslateError(node, e) {
    node.className = 'result error';
    if (/所有翻译源暂时不可用/.test(e.message)) {
      node.innerHTML =
        '<b>翻译源暂时不可用</b><br>' +
        '云端服务器的共享 IP 被公共翻译接口限流了（Google / Bing / MyMemory 都会这样）。' +
        '配置任意一个<b>免费密钥</b>即可永久解决：<br>' +
        '① <b>百度翻译开放平台</b>（免费 5 万字符/天，无需信用卡）→ 拿 APPID + 密钥<br>' +
        '② Render 后台 → 你的服务 → <b>Environment</b> → 添加 ' +
        '<code>BAIDU_TRANSLATE_APPID</code>、<code>BAIDU_TRANSLATE_KEY</code> → 重新部署<br>' +
        '<span class="note">也支持 <code>DEEPL_API_KEY</code>（DeepL 免费版）或 <code>DEEPSEEK_API_KEY</code>（大模型翻译）。</span>';
      return;
    }
    node.textContent = '翻译失败：' + e.message;
  }

  swap.addEventListener('click', () => {
    const f = fromSel.value;
    if (f === 'auto') return alert('自动检测语言不可作为目标，请先指定源语言');
    fromSel.value = toSel.value;
    toSel.value = f;
  });

  // ---------- 标签页切换 ----------
  const tabs = document.querySelectorAll('#tabs .tab');
  tabs.forEach((t) =>
    t.addEventListener('click', () => {
      tabs.forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      document.getElementById('pane-text').style.display = t.dataset.tab === 'text' ? '' : 'none';
      document.getElementById('pane-image').style.display = t.dataset.tab === 'image' ? '' : 'none';
    })
  );

  // ---------- 截图 / 图片翻译 ----------
  const drop = document.getElementById('drop');
  const fileInput = document.getElementById('file');
  const preview = document.getElementById('preview');
  const ocrLang = document.getElementById('ocrLang');
  const ocrBtn = document.getElementById('ocrBtn');
  const ocrStatus = document.getElementById('ocrStatus');
  const ocrResult = document.getElementById('ocrResult');
  const ocrText = document.getElementById('ocrText');
  const ocrTrans = document.getElementById('ocrTrans');
  const reTranslate = document.getElementById('reTranslate');

  let currentFile = null;

  function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) return alert('请选择图片文件');
    currentFile = file;
    preview.src = URL.createObjectURL(file);
    preview.style.display = 'block';
    ocrBtn.disabled = false;
    ocrResult.style.display = 'none';
  }

  drop.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('drag');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const it of items) {
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        handleFile(it.getAsFile());
        break;
      }
    }
  });

  async function translateText(text) {
    const r = await api('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, from: 'auto', to: imgTo.value }),
    });
    return r.translated;
  }

  async function doOCR() {
    if (!currentFile || !window.Tesseract) {
      return alert('OCR 引擎未加载，请检查网络（Tesseract.js 需从 CDN 加载）');
    }
    ocrBtn.disabled = true;
    ocrStatus.style.display = 'block';
    ocrStatus.className = 'result';
    ocrStatus.textContent = '正在加载 OCR 引擎并识别文字……（首次较慢）';
    try {
      const canvas = document.createElement('canvas');
      await new Promise((res, rej) => {
        preview.onload = res;
        preview.onerror = rej;
        if (preview.complete) res();
      });
      canvas.width = preview.naturalWidth || preview.width;
      canvas.height = preview.naturalHeight || preview.height;
      canvas.getContext('2d').drawImage(preview, 0, 0);
      const { data } = await Tesseract.recognize(canvas, ocrLang.value, {
        logger: (p) => {
          if (p.status === 'recognizing text') {
            ocrStatus.textContent = `识别中… ${Math.round(p.progress * 100)}%`;
          }
        },
      });
      const text = (data.text || '').trim();
      if (!text) {
        ocrStatus.className = 'result error';
        ocrStatus.textContent = '未识别到文字，请换一张更清晰的截图试试。';
        ocrBtn.disabled = false;
        return;
      }
      ocrStatus.className = 'result ok';
      ocrStatus.textContent = `识别完成，共 ${text.length} 个字符，正在翻译…`;
      ocrText.value = text;
      try {
        const translated = await translateText(text);
        ocrTrans.textContent = translated;
        ocrResult.style.display = 'block';
        ocrStatus.textContent = `识别完成，共 ${text.length} 个字符`;
      } catch (err) {
        // OCR 成功但翻译失败：保留识别出的原文，方便用户手动复制
        ocrStatus.className = 'result error';
        ocrStatus.innerHTML =
          /所有翻译源暂时不可用/.test(err.message)
            ? '文字已识别（见下方文本框），但<b>翻译源被云端 IP 限流</b>。配置免费密钥可永久解决（详见「文字互译」页提示）。'
            : '文字已识别，但翻译失败：' + escapeHtml(err.message);
        ocrResult.style.display = 'block';
        ocrTrans.textContent = '（翻译暂不可用，可直接复制上方原文）';
      }
    } catch (e) {
      ocrStatus.className = 'result error';
      ocrStatus.textContent = 'OCR 失败：' + e.message;
    } finally {
      ocrBtn.disabled = false;
    }
  }

  ocrBtn.addEventListener('click', doOCR);
  reTranslate.addEventListener('click', async () => {
    const text = ocrText.value.trim();
    if (!text) return;
    reTranslate.disabled = true;
    ocrTrans.textContent = '翻译中…';
    try {
      ocrTrans.textContent = await translateText(text);
    } catch (e) {
      ocrTrans.textContent = '翻译失败：' + e.message;
    } finally {
      reTranslate.disabled = false;
    }
  });
})();

// 共享导航与工具函数
const FEATURES = [
  { key: 'home', label: '首页', href: '/home/' },
  { key: 'translate', label: '语言互译', href: '/translate/' },
  { key: 'music', label: '音乐解析', href: '/music/' },
  { key: 'organize', label: '文件整理', href: '/organize/' },
  { key: 'dedup', label: '文件查重', href: '/dedup/' },
  { key: 'chat', label: 'AI 聊天', href: '/chat/' },
  { key: 'pet', label: '桌面宠宠', href: '/pet/' },
  { key: 'compose', label: 'AI 作曲', href: '/compose/' },
];

function renderNav(active) {
  const bar = document.getElementById('topbar');
  if (!bar) return;
  const links = FEATURES.map(
    (f) =>
      `<a href="${f.href}" class="${f.key === active ? 'active' : ''}">${f.label}</a>`
  ).join('');
  bar.innerHTML = `
    <div class="logo">聚</div>
    <div>
      <div class="brand-name">多功能聚合站</div>
      <div class="brand-sub">One Site · Many Tools</div>
    </div>
    <nav class="links">${links}</nav>`;
}

async function api(url, opts) {
  const res = await fetch(url, opts);
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || '请求失败');
    return j;
  }
  if (!res.ok) throw new Error('请求失败 ' + res.status);
  return res;
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

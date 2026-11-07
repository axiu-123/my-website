/* ==========================================================================
 * 鲸鱼娘 · 网页版「陪工作 / 工作状态检测」（2.5D 桌宠专用，运行时注入）
 * --------------------------------------------------------------------------
 * 由 /pet/ 的 loader 在拼合 13 个分片后内联进页面，成品 HTML 零改动。
 *
 * 与桌面版的区别（重要，别混淆）：
 *   · 桌面版：Electron 主进程用前台窗口标题 / 程序名 / 系统级键鼠空闲判定，
 *             能知道「你在哪个软件里工作」，精确，但只有桌面版能做。
 *   · 网页版：浏览器沙箱不允许读取其它窗口，也不提供系统级空闲时间，
 *             因此这里用的是浏览器拿得到的信号：
 *               标签页可见性 + 窗口焦点 + 本页主动交互(键入/点击/滚轮/滚动)
 *             据此推断「主人正在电脑前忙」，空闲或切走则判定结束工作。
 *             它是近似判定，不等价于桌面版，也不读取任何窗口标题或内容。
 *
 * 隐私：纯本地、不联网、不上传、不截屏、不读窗口标题/内容，
 *       不消耗 API 额度；默认开启，右下角小圆点可随时关闭并记住选择。
 *
 * 表现层完全复刻桌面版 v2026.11.06.9：闭口微微笑、本子和笔放在手边
 * （不画假手）、眼睛照常眨眼、台词「本鱼来陪主人工作」，结束时收起复原。
 * ========================================================================== */
(() => {
  'use strict';

  /* 桌面版有自己的主进程检测 + 注入层，避免重复挂载 */
  if (window.__desktop) return;
  const pet = document.getElementById('pet');
  if (!pet) return;

  /* ---------------- 配置 ---------------- */
  var LS_KEY = 'whalepet.workdetect.enabled';
  /* /pet/ 的 loader 把页面拼成 blob URL 打开，原地址上的 ?wb=0 会丢失，
     所以由 loader 注入 window.__WD_PARAMS 透传；直接用本地文件时则读自身 search。 */
  var params = new URLSearchParams(window.__WD_PARAMS || location.search || '');
  var saved = null;
  try { saved = localStorage.getItem(LS_KEY); } catch (_) { /* 隐私模式忽略 */ }
  var enabled = params.has('wb') ? params.get('wb') !== '0'
              : (saved === null ? true : saved === '1');

  var WINDOW_MS  = 25000;   // 最近 25 秒内有主动交互 = 仍在忙
  var ENTER_WAIT = 2500;    // 满足后 2.5 秒进入，避免误触发
  var EXIT_IDLE  = 180000;  // 连续 3 分钟无交互 = 结束工作
  var EXIT_HIDDEN = 90000;  // 标签页隐藏 90 秒 = 结束工作
  var TICK = 4000;

  /* ---------------- 样式（复刻桌面版 + 开关） ---------------- */
  var css = document.createElement('style');
  css.textContent = [
    'body.wb-on #fig { opacity:1 !important; }',
    'body.wb-on #act { display:none !important; }',
    'body.wb-on #zzz { opacity:0 !important; }',
    'html body.wb-on #shade, html body.wb-on #form { display:block !important; }',
    '#wbLayer { position:absolute; inset:0; z-index:70; pointer-events:none; display:none; }',
    '#wbLayer.wb-show { display:block; }',
    '#wbLayer > svg { position:absolute; inset:0; width:100%; height:100%; overflow:visible; }',
    '#wbMouth, #wbStationery, .wb-breathe { transform-box:view-box; }',
    '#wbMouth { opacity:0; }',
    '#wbStationery { opacity:0; transform-origin:118px 202px; }',
    '.wb-breathe { transform-origin:118px 202px; }',
    '.wb-run #wbMouth { animation:wbMouthIn .4s ease .35s both; }',
    '.wb-out #wbMouth { animation:wbMouthOut .3s ease both; }',
    '.wb-run #wbStationery { animation:wbBringIn .88s cubic-bezier(.2,1.25,.35,1) .55s both; }',
    '.wb-out #wbStationery { animation:wbBringOut .4s ease-in both; }',
    '.wb-run .wb-breathe { animation:wbBreathe 3.6s ease-in-out 1.55s infinite; }',
    /* 终态兜底：某些嵌入式 / 被遮挡窗口会冻结 CSS 动画时间轴（currentTime 停在 0），
       动画时长走完后用 !important 钉死最终状态，保证造型一定完整显示。
       退出前会移除 wb-settled，让收起动画照常播放。 */
    '.wb-run.wb-settled #wbMouth { opacity:1 !important; }',
    '.wb-run.wb-settled #wbStationery { opacity:1 !important; transform:none !important; }',
    '@keyframes wbMouthIn { 0%{opacity:0} 100%{opacity:1} }',
    '@keyframes wbMouthOut { from{opacity:1} to{opacity:0} }',
    '@keyframes wbBringIn {',
    '  0%{opacity:0;transform:translate(-26px,20px) rotate(-18deg) scale(.72)}',
    '  66%{opacity:1;transform:translate(3px,-2px) rotate(3deg) scale(1.03)}',
    '  100%{opacity:1;transform:translate(0,0) rotate(0) scale(1)} }',
    '@keyframes wbBringOut { from{opacity:1;transform:translate(0,0) rotate(0)}',
    '  to{opacity:0;transform:translate(-24px,18px) rotate(-16deg) scale(.72)} }',
    '@keyframes wbBreathe { 0%,100%{transform:translateY(0) rotate(0)}',
    '  50%{transform:translateY(-1.2px) rotate(-.7deg)} }',
    '@media (prefers-reduced-motion: reduce) {',
    '  .wb-run #wbMouth, .wb-run #wbStationery, .wb-run .wb-breathe',
    '    { animation-duration:.01ms; animation-delay:0s; } }',
    /* 右下角开关：默认极淡，hover 才明显，不挡桌宠 */
    '#wdToggle { position:fixed; right:14px; bottom:14px; z-index:9999;',
    '  width:28px; height:28px; padding:0; border:1px solid rgba(91,99,211,.35);',
    '  border-radius:50%; background:rgba(255,255,255,.72); color:#5b63d3;',
    '  font-size:14px; line-height:26px; text-align:center; cursor:pointer;',
    '  opacity:.32; transition:opacity .2s, transform .2s;',
    '  box-shadow:0 2px 8px rgba(40,60,110,.12); }',
    '#wdToggle:hover, #wdToggle:focus-visible { opacity:1; transform:scale(1.08); outline:none; }',
    '#wdToggle[aria-pressed="true"] { background:#5b63d3; color:#fff; border-color:#5b63d3; }'
  ].join('\n');
  document.head.appendChild(css);

  /* ---------------- 陪工作造型（与桌面版 v9 同一套坐标） ----------------
     #pet 为 220x330；嘴中心 svg(126,168.5)；原立绘双手约 (96,210)/(150,210)。
     不画任何假手 / 假手指，本子和笔只放在手边。 */
  var layer = document.createElement('div');
  layer.id = 'wbLayer';
  layer.innerHTML =
    '<svg viewBox="0 0 220 330" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
      '<defs>' +
        '<radialGradient id="wbSkin" cx="50%" cy="50%" r="50%">' +
          '<stop offset="0%" stop-color="#f5e4db"/>' +
          '<stop offset="55%" stop-color="#f5e4db"/>' +
          '<stop offset="100%" stop-color="#f5e4db" stop-opacity="0"/>' +
        '</radialGradient>' +
      '</defs>' +
      '<g id="wbMouth">' +
        '<ellipse cx="126" cy="168.5" rx="20" ry="11.5" fill="url(#wbSkin)"/>' +
        '<path d="M119 168.5 Q126 170 133 168.5" stroke="#a07868" stroke-width="1.3" stroke-linecap="round" opacity="0.9" fill="none"/>' +
      '</g>' +
      '<g id="wbStationery">' +
        '<g class="wb-breathe">' +
          '<g id="wbBook" transform="rotate(-8 90 197)">' +
            '<rect x="76" y="182" width="28" height="30" rx="3.6" fill="#343a46"/>' +
            '<rect x="79" y="184" width="23.5" height="26" rx="2.3" fill="#fffaf0" stroke="#3a4150" stroke-width="1.1"/>' +
            '<g fill="none" stroke="#b9c9d8" stroke-width="1" stroke-linecap="round">' +
              '<path d="M83 191 H99 M83 196 H99 M83 201 H99 M83 206 H96"/>' +
            '</g>' +
            '<rect x="76" y="182" width="4.6" height="30" rx="2.3" fill="#dc6b7d"/>' +
            '<g fill="#fffaf0">' +
              '<circle cx="78.3" cy="187" r="0.9"/><circle cx="78.3" cy="194" r="0.9"/>' +
              '<circle cx="78.3" cy="201" r="0.9"/><circle cx="78.3" cy="208" r="0.9"/>' +
            '</g>' +
          '</g>' +
          '<g id="wbPen" transform="rotate(20 150 194)">' +
            '<rect x="147" y="176" width="5.5" height="32" rx="2.5" fill="#313b4f" stroke="#20283a" stroke-width="0.9"/>' +
            '<rect x="147.3" y="179" width="4.9" height="5" rx="1.2" fill="#dc6b7d"/>' +
            '<path d="M147 207 L149.7 217 L152.4 207 Z" fill="#f3c969" stroke="#20283a" stroke-width="0.8" stroke-linejoin="round"/>' +
            '<path d="M148.6 216 Q149.7 218 150.8 216" fill="none" stroke="#20283a" stroke-width="0.9"/>' +
            '<path d="M152.4 180 L154.6 179.5 L154.6 190 L152.4 190 Z" fill="#c8d2df" stroke="#20283a" stroke-width="0.7"/>' +
          '</g>' +
        '</g>' +
      '</g>' +
    '</svg>';
  pet.appendChild(layer);

  /* ---------------- 台词气泡（复用成品 HTML 的 __petUI） ---------------- */
  function say(text) {
    var ui = window.__petUI;
    if (ui && typeof ui.showBubble === 'function') { ui.showBubble(text, 4600); return; }
    /* 兜底：成品 UI 尚未就绪时延迟重试一次 */
    setTimeout(function () {
      var u = window.__petUI;
      if (u && typeof u.showBubble === 'function') u.showBubble(text, 4600);
    }, 400);
  }

  /* ---------------- 状态机 ---------------- */
  var state = false, outTimer = null, enterTimer = null, settleTimer = null;

  function enter() {
    if (state) return;
    state = true;
    clearTimeout(outTimer);
    clearTimeout(settleTimer);
    document.body.classList.add('wb-on');
    layer.classList.remove('wb-out', 'wb-run', 'wb-settled');
    layer.classList.add('wb-show');
    void layer.offsetWidth;                 // 强制回流，保证动画可重播
    layer.classList.add('wb-run');
    settleTimer = setTimeout(function () {
      settleTimer = null;
      if (state) layer.classList.add('wb-settled');
    }, 1600);
    say('本鱼来陪主人工作');
  }

  function exit() {
    if (!state) return;
    state = false;
    clearTimeout(settleTimer); settleTimer = null;
    layer.classList.remove('wb-settled', 'wb-run');
    layer.classList.add('wb-out');
    outTimer = setTimeout(function () {
      layer.classList.remove('wb-show', 'wb-out');
      document.body.classList.remove('wb-on');
    }, 480);
  }

  /* ---------------- 浏览器可行的「工作状态」判定 ----------------
     只采信主动交互：键入 / 点击 / 滚轮 / 滚动 / 触摸。
     纯 mousemove 不算（看视频、鼠标晃过都会误判）。 */
  var lastActive = 0, hiddenAt = 0;

  function markActive() { lastActive = Date.now(); evaluate(); }

  function evaluate() {
    if (!enabled) return;
    var now = Date.now();
    var visible = document.visibilityState === 'visible';
    if (visible) hiddenAt = 0;
    else if (!hiddenAt) hiddenAt = now;

    var busy = visible && (now - lastActive) < WINDOW_MS;

    if (!state && busy) {
      if (!enterTimer) {
        enterTimer = setTimeout(function () {
          enterTimer = null;
          if (enabled && document.visibilityState === 'visible' &&
              Date.now() - lastActive < WINDOW_MS) enter();
        }, ENTER_WAIT);
      }
    } else if (!busy && enterTimer) {
      clearTimeout(enterTimer); enterTimer = null;
    }

    if (state) {
      var idleTooLong = now - lastActive > EXIT_IDLE;
      var hiddenTooLong = !visible && hiddenAt && now - hiddenAt > EXIT_HIDDEN;
      if (idleTooLong || hiddenTooLong) exit();
    }
  }

  ['keydown', 'pointerdown', 'wheel', 'scroll', 'touchstart'].forEach(function (ev) {
    window.addEventListener(ev, markActive, { passive: true, capture: true });
  });
  document.addEventListener('visibilitychange', evaluate);
  window.addEventListener('focus', evaluate);
  window.addEventListener('blur', evaluate);
  setInterval(evaluate, TICK);

  /* ---------------- 开关 ---------------- */
  var btn = document.createElement('button');
  btn.id = 'wdToggle';
  btn.type = 'button';
  btn.setAttribute('aria-label', '陪工作监测开关');
  btn.title = '陪工作监测：网页版用「页面活跃度」近似判断，不读取任何窗口内容。点击可关闭 / 开启。';
  function paint() {
    btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    btn.textContent = enabled ? '⏱' : '○';
    btn.title = (enabled ? '陪工作监测：已开启' : '陪工作监测：已关闭') +
                '（网页版用页面活跃度近似判断，不读取任何窗口内容）· 点击切换';
  }
  btn.addEventListener('click', function () {
    enabled = !enabled;
    try { localStorage.setItem(LS_KEY, enabled ? '1' : '0'); } catch (_) {}
    paint();
    if (!enabled) { clearTimeout(enterTimer); enterTimer = null; exit(); }
    else evaluate();
  });
  document.body.appendChild(btn);
  paint();

  /* 自检 / 调试入口 */
  window.__workDetect = {
    enter: enter,
    exit: exit,
    get active() { return state; },
    get enabled() { return enabled; },
    enable: function () { enabled = true; paint(); evaluate(); },
    disable: function () { enabled = false; paint(); exit(); },
    probe: function () {
      return {
        platform: 'web',
        engine: 'page-activity',
        enabled: enabled,
        active: state,
        settled: layer.classList.contains('wb-settled'),
        lastActive: lastActive,
        visibility: document.visibilityState,
        petFound: !!pet,
        layerFound: !!document.getElementById('wbLayer'),
        mouthFound: !!document.getElementById('wbMouth'),
        bookFound: !!document.getElementById('wbBook'),
        penFound: !!document.getElementById('wbPen'),
        fakeHandFound: !!document.getElementById('wbGrip'),
        bubbleAvailable: !!(window.__petUI && window.__petUI.showBubble)
      };
    }
  };
})();

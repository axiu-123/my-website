(async function () {
  const chat = document.getElementById('chat');
  const input = document.getElementById('input');
  const sendBtn = document.getElementById('send');
  const badge = document.getElementById('modeBadge');

  const messages = [];

  function addMsg(role, text) {
    const m = el(
      `<div class="msg ${role}"><div class="who">${role === 'user' ? '你' : '暖暖'}</div><div class="bubble"></div></div>`
    );
    m.querySelector('.bubble').textContent = text;
    chat.appendChild(m);
    chat.scrollTop = chat.scrollHeight;
  }

  addMsg('bot', '嗨，我是暖暖～不管是想问点什么，还是今天心情有点起伏，都可以跟我说。我在呢 💛');

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addMsg('user', text);
    messages.push({ role: 'user', content: text });
    sendBtn.disabled = true;
    const typing = el('<div class="msg bot"><div class="who">暖暖</div><div class="bubble">正在输入…</div></div>');
    chat.appendChild(typing);
    chat.scrollTop = chat.scrollHeight;
    try {
      const r = await api('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messages.slice(-20) }),
      });
      typing.remove();
      addMsg('bot', r.reply);
      messages.push({ role: 'assistant', content: r.reply });
      badge.className = 'tag ' + (r.mode === 'deepseek' ? 'green' : 'gray');
      badge.textContent = '模式：' + (r.mode === 'deepseek' ? 'DeepSeek 大模型' : r.mode === 'fallback' ? '回退(本地)' : '本地情绪支持');
    } catch (e) {
      typing.remove();
      addMsg('bot', '哎呀，刚才有点小状况：' + e.message);
    } finally {
      sendBtn.disabled = false;
    }
  }
})();

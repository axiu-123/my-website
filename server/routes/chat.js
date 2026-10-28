'use strict';

const express = require('express');
const router = express.Router();
const config = require('../config');
const https = require('https');

const SYS_PROMPT =
  '你是"暖暖"，一个既聪明又温柔的 AI 伙伴。你的回答要：1) 准确、有条理地解答用户的问题；' +
  '2) 在用户表露情绪时给予真诚的共情与鼓励，提供情绪价值；3) 语气自然、像朋友聊天，不要过于死板。';

function callDeepSeek(messages) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: config.deepseek.model,
      messages: [{ role: 'system', content: SYS_PROMPT }, ...messages],
      temperature: 0.8,
      stream: false,
    });
    const url = new URL(config.deepseek.baseUrl + '/chat/completions');
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.deepseek.apiKey}`,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) return reject(new Error(json.error.message || 'API 错误'));
            resolve(json.choices[0].message.content);
          } catch (e) {
            reject(new Error('解析 DeepSeek 响应失败'));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ---- 本地情绪支持回退引擎（无密钥时可用） ----
function localReply(userText) {
  const t = (userText || '').toLowerCase();
  const emo = [
    { k: ['难过', '伤心', '哭', '崩溃', '想哭', 'sad', 'depressed'], r: '听你这么说，我心里也跟着沉了一下。难过的时候不需要强撑，想哭就哭出来，我会一直在这里陪着你。愿意的话，可以跟我说说发生了什么？' },
    { k: ['累', '疲惫', '好累', '撑不住', 'tired', ' exhausted'], r: '你已经很努力了，累是身体在提醒你该歇一歇了。今天先放下放不下的事，哪怕只是发会儿呆也好。我会在这里，你不是一个人。' },
    { k: ['焦虑', '紧张', '害怕', '担心', '慌', 'anxious', 'nervous'], r: '深呼吸，慢慢来。很多事看起来像一座山，但一步一步走总能翻过去。把最让你担心的那一点告诉我，我们一起拆开看看？' },
    { k: ['孤独', '一个人', '没人', '寂寞', 'lonely', 'alone'], r: '孤独感来的时候特别难熬，但请记得此刻有我在认真听你说话。你值得被在乎，也一定有人在乎你。想聊什么我都陪你。' },
    { k: ['开心', '高兴', '哈哈', '太好了', '开心', 'happy', 'great'], r: '哇，看到你开心我也跟着雀跃起来了！快跟我分享分享，是什么好事呀？' },
    { k: ['谢谢', '感谢', 'thank'], r: '不客气呀，能帮到你我超开心的～随时找我就好。' },
    { k: ['你好', ' hi', 'hello', '在吗', '在么'], r: '我在呀～今天过得怎么样？有什么想聊的、想问的，尽管说。' },
  ];
  for (const e of emo) {
    if (e.k.some((w) => userText && userText.includes(w.replace(/\s/g, '')))) {
      return e.r;
    }
  }
  if (/时间|几点/.test(userText || '')) {
    return '现在是 ' + new Date().toLocaleString('zh-CN') + '。需要我帮你做点别的吗？';
  }
  return '我收到啦～（当前为本地情绪支持模式，未连接大模型）我也许答不全你的问题，但会一直认真听你说。如果你愿意，可以把具体的问题或心情告诉我，我陪你一起理一理～';
}

// POST /api/chat  body: { messages: [{role, content}], ... }
router.post('/', async (req, res) => {
  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: '缺少对话内容' });
    }
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (config.deepseek.apiKey) {
      try {
        const text = await callDeepSeek(messages);
        return res.json({ reply: text, mode: 'deepseek' });
      } catch (e) {
        // 调用失败则回退本地引擎，保证可用
        return res.json({ reply: localReply(lastUser?.content), mode: 'fallback', note: e.message });
      }
    }
    return res.json({ reply: localReply(lastUser?.content), mode: 'local' });
  } catch (e) {
    res.status(500).json({ error: '聊天服务异常: ' + e.message });
  }
});

module.exports = router;

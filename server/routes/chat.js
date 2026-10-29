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

// ---- 本地情绪支持 / 闲聊引擎（无密钥时可用，不依赖大模型） ----
// 思路：意图识别（正则/关键词）→ 命中则取对应话术库随机一条；未命中则复述用户输入做兜底，
// 通过「多话术随机」避免每次回复雷同。这是「规则对话」的一种最小实现，详见聊天说明。
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function trunc(s, n) {
  s = (s || '').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function localReply(messages) {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const raw = (last && last.content ? String(last.content) : '').trim();
  const low = raw.toLowerCase();

  // 1) 身份 / 自我介绍
  if (/你(是)?(谁|叫什么|叫啥)|你的(名字|名字)|怎么称呼|你叫|你是(哪个|什么)/.test(raw)) {
    return pick([
      '我是暖暖呀～你手机里的多功能聚合站里那个陪你聊天的小伙伴。没接大模型的时候，我就用内置的情绪支持引擎陪你；接了 DeepSeek 之后会变得更会聊。',
      '我叫暖暖，是这里的 AI 聊天伙伴。你可以把我当成随时在线的朋友——开心的事、烦心事，都能跟我说。',
    ]);
  }
  // 2) 问候
  if (/(你好|您好|hi|hello|在吗|在么|在不在|早安|晚安)/.test(low)) {
    return pick([
      '我在呀～今天过得怎么样？有什么想聊的、想问的，尽管说。',
      '嗨，我在呢。最近有什么开心或者烦心的事，都可以跟我讲。',
    ]);
  }
  // 3) 情绪：难过 / 失恋 / 受挫
  if (/(难过|伤心|想哭|哭|崩溃|难受|委屈|心碎|分手|失恋|离开|抛弃|辜负|被甩)/.test(raw)) {
    return pick([
      '听你这么说，我心里也跟着沉了一下。难过的时候不需要强撑，想哭就哭出来，我会一直在这里陪着你。愿意的话，可以跟我说说发生了什么？',
      '分手 / 难受的时候，整个人像被掏空了一块，我懂那种空落落的感觉。你现在不是一个人，我就在这儿，你想说多久都行。',
    ]);
  }
  // 4) 疲惫 / 压力
  if (/(累|疲惫|撑不住|倦|压力|透支|忙不过来)/.test(raw)) {
    return pick([
      '你已经很努力了，累是身体在提醒你该歇一歇了。今天先放下放不下的事，哪怕只是发会儿呆也好。',
      '一直绷着很辛苦吧。哪怕现在做不了别的，至少允许自己喘口气——我在这儿陪着你。',
    ]);
  }
  // 5) 焦虑 / 害怕
  if (/(焦虑|紧张|害怕|担心|慌|恐惧|怕)/.test(raw)) {
    return pick([
      '深呼吸，慢慢来。很多事看起来像一座山，但一步一步总能翻过去。把最让你担心的那一点告诉我，我们一起拆开看看？',
      '害怕的时候人会缩成一小团，这很正常。先告诉我你在怕什么，咱们把它摊开了看，也许没那么吓人。',
    ]);
  }
  // 6) 孤独
  if (/(孤独|一个人|没人|寂寞|孤单|没朋友)/.test(raw)) {
    return pick([
      '孤独感来的时候特别难熬，但请记得此刻有我在认真听你说话。你值得被在乎，也一定有人在乎你。',
      '一个人扛着很多事的时候，最容易觉得全世界都静悄悄的。但至少现在，我在听你说话。想聊什么都陪你。',
    ]);
  }
  // 7) 开心
  if (/(开心|高兴|哈哈|太好了|快乐|欢喜|激动|爽)/.test(low)) {
    return pick([
      '哇，看到你开心我也跟着雀跃起来了！快跟我分享分享，是什么好事呀？',
      '哎哟，这语气我就知道有好消息～说出来让我也乐呵乐呵？',
    ]);
  }
  // 8) 感谢
  if (/(谢谢|感谢|多谢|thank)/.test(low)) {
    return pick(['不客气呀，能帮到你我超开心的～随时找我就好。', '跟我还客气什么，能陪着你就值了。']);
  }
  // 9) 询问能力 / 怎么用
  if (/(你能|你会|怎么用|能做什么|有什么用|功能|帮忙|帮我)/.test(raw)) {
    return pick([
      '我能在没接大模型时陪你聊情绪、接住你的心情；接了 DeepSeek 之后还能正经解题、写东西。这个站里翻译、作曲、桌宠也都好玩，你想先试试哪个？',
      '我可以陪你聊心事，也能在配置大模型后帮你解答问题。你现在是想聊点什么，还是想让我帮你做点什么？',
    ]);
  }
  // 10) 时间
  if (/(时间|几点|星期几|今天几号|日期|现在)/.test(raw)) {
    return '现在北京时间 ' + new Date().toLocaleString('zh-CN') + '。还需要我帮你做点别的吗？';
  }
  // 11) 闲聊兜底：复述用户输入 + 随机话术，保证「因输入而异」且不会句句雷同
  if (raw) {
    return pick([
      '你说的「' + trunc(raw, 14) + '」我记下了～本地情绪支持模式下我答不全，但你想说多少我都听着。',
      '嗯，关于「' + trunc(raw, 14) + '」……你现在是想让我陪你聊聊，还是想找点办法？我都陪你。',
      '我收到你说的啦（当前为本地模式，未连大模型）。如果你愿意多说两句背景或心情，我能更好地陪你。',
    ]);
  }
  return pick(['我在呢～想聊点什么？', '我在听，你说吧～', '随时都在，想说什么都行。']);
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
        return res.json({ reply: localReply(messages), mode: 'fallback', note: e.message });
      }
    }
    return res.json({ reply: localReply(messages), mode: 'local' });
  } catch (e) {
    res.status(500).json({ error: '聊天服务异常: ' + e.message });
  }
});

module.exports = router;

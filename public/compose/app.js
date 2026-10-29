(function () {
  const out = document.getElementById('out');
  const genBtn = document.getElementById('gen');
  const stopBtn = document.getElementById('stop');
  const dlBtn = document.getElementById('dl');
  const promptEl = document.getElementById('prompt');
  const recommendEl = document.getElementById('recommend');
  const moodSel = document.getElementById('mood');
  const bpmEl = document.getElementById('bpm');
  const barsEl = document.getElementById('bars');

  // ============================================================
  // 1) 风格预设库（含「按风格分类的乐器组合」）
  // ============================================================
  const STYLES = {
    happy:     { label: '流行 Pop',     emotion: '开心 / 明亮', scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 4, 5, 3], root: 60, bpm: [108, 124], drum: 'pop',    density: 0.8,  desc: '大调明亮、跳进，适合喜悦、日常、副歌', instr: { melody: 'piano', bass: 'synthBass', chord: 'epiano', pad: 'strings' } },
    sad:       { label: '悲伤 Ballad',  emotion: '伤感 / 低落', scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 8, 7], root: 57, bpm: [60, 78],   drum: 'ballad', density: 0.5,  desc: '小调忧郁、长线条，适合失恋、思念',     instr: { melody: 'piano', bass: 'fretless', chord: 'epiano', pad: 'strings' } },
    electronic: { label: '电子 / EDM',  emotion: '兴奋 / 律动', scale: [0, 3, 5, 7, 10],       prog: [0, 0, 5, 3], root: 60, bpm: [124, 132], drum: 'four',   density: 0.85, desc: '四四拍强律动，适合派对、运动',       instr: { melody: 'lead', bass: 'synthBass', chord: 'lead', pad: 'pad' } },
    chinese:   { label: '古风 / 国风',  emotion: '婉转 / 叙事', scale: [0, 2, 4, 7, 9],         prog: [0, 4, 5, 1], root: 60, bpm: [78, 96],   drum: 'soft',   density: 0.6,  desc: '五声音阶、留白，适合江湖、抒情',   instr: { melody: 'pluck', bass: 'fretless', chord: 'pad', pad: 'pad' } },
    lofi:      { label: 'Lo-Fi 放松',   emotion: '松弛 / 治愈', scale: [0, 3, 5, 7, 10],        prog: [0, 5, 3, 4], root: 57, bpm: [68, 84],   drum: 'lofi',   density: 0.45, desc: '慵懒摇摆、切分，适合学习、睡前',   instr: { melody: 'epiano', bass: 'fretless', chord: 'epiano', pad: 'pad' } },
    epic:      { label: '史诗 / 电影感', emotion: '宏大 / 紧张', scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 2, 4, 5], root: 55, bpm: [90, 110],  drum: 'epic',   density: 0.6,  desc: '小调铺陈、推进，适合游戏、高潮',   instr: { melody: 'strings', bass: 'synthBass', chord: 'organ', pad: 'strings' } },
    jazz:      { label: '爵士 Jazz',    emotion: '慵懒 / 夜色', scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 3, 1, 4], root: 58, bpm: [80, 100],  drum: 'jazz',   density: 0.6,  desc: '七声音阶、切分、 improvisation，适合咖啡、夜晚', instr: { melody: 'sax', bass: 'upright', chord: 'epiano', pad: 'pad' } },
    rock:      { label: '摇滚 Rock',    emotion: '热血 / 力量', scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 5, 3, 4], root: 57, bpm: [120, 150], drum: 'rock',   density: 0.85, desc: '强力和弦、失真驱动，适合燃、奋斗',   instr: { melody: 'rockGuitar', bass: 'rockBass', chord: 'rockGuitar', pad: 'pad' } },
    ambient:   { label: '氛围 / 纯音乐', emotion: '空灵 / 沉思', scale: [0, 2, 5, 7, 9],         prog: [0, 2, 4, 2], root: 60, bpm: [60, 80],   drum: 'none',   density: 0.3,  desc: '大量留白、缓慢，适合冥想、背景',   instr: { melody: 'pad', bass: 'fretless', chord: 'pad', pad: 'pad' } },
    rnb:       { label: 'R&B / 慢摇',   emotion: '暧昧 / 律动', scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 5, 3, 1], root: 58, bpm: [85, 100],  drum: 'rnb',    density: 0.6,  desc: '切分律动、松弛，适合夜晚、情感',   instr: { melody: 'epiano', bass: 'fretless', chord: 'epiano', pad: 'strings' } },
    classical: { label: '古典 Classical', emotion: '典雅 / 庄重', scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 3, 4, 3], root: 60, bpm: [80, 110], drum: 'none', density: 0.55, desc: '自然大调、弦乐与钢琴交织，适合典礼、叙事', instr: { melody: 'piano', bass: 'upright', chord: 'piano', pad: 'strings' } },
  };

  // 乐器音色标签（用于编辑器下拉）
  const TIMBRE_LABELS = {
    piano: '钢琴 Grand Piano', epiano: '电钢 / Rhodes', rockGuitar: '电吉他（失真）', acGuitar: '木吉他',
    sax: '萨克斯', trumpet: '小号', strings: '弦乐合奏', organ: '管风琴',
    lead: '合成主音', pad: '铺底 Pad', pluck: '拨弦 / 古琴', bell: '钟琴',
  };

  function midiToNote(m) { return Tone.Frequency(m, 'midi').toNote(); }

  // ============================================================
  // 2) 乐器工厂：按音色创建 Tone.js 乐器（不再清一色电子 Synth）
  // ============================================================
  // 每个乐器返回 { voice, out, fx }：voice 用于 triggerAttackRelease，
  // out 是效果链末端（接外部混响/延迟），fx 为需释放的效果节点。真实度来自更自然
  // 的包络 + 专属效果链（失真/颤音/合唱/旋转音箱等）。
  function makeTimbre(t) {
    switch (t) {
      case 'piano': {
        const v = new Tone.PolySynth(Tone.FMSynth, { volume: -7, harmonicity: 1, modulationIndex: 1.3,
          oscillator: { type: 'sine' }, modulation: { type: 'triangle' },
          envelope: { attack: 0.002, decay: 1.4, sustain: 0.12, release: 1.6 } });
        const ch = new Tone.Chorus({ frequency: 2.5, delayTime: 0.2, depth: 0.03 }); ch.start();
        v.connect(ch);
        return { voice: v, out: ch, fx: [ch] };
      }
      case 'epiano': {
        const v = new Tone.PolySynth(Tone.FMSynth, { volume: -9, harmonicity: 0.5, modulationIndex: 3,
          oscillator: { type: 'sine' }, modulation: { type: 'sine' },
          envelope: { attack: 0.005, decay: 0.8, sustain: 0.3, release: 1.2 } });
        const tr = new Tone.Tremolo({ frequency: 4.5, depth: 0.08 }); tr.start();
        v.connect(tr);
        return { voice: v, out: tr, fx: [tr] };
      }
      case 'rockGuitar': {
        const v = new Tone.PolySynth(Tone.FMSynth, { volume: -10, harmonicity: 0.5, modulationIndex: 1.2,
          oscillator: { type: 'sawtooth' }, modulation: { type: 'square' },
          envelope: { attack: 0.004, decay: 0.35, sustain: 0.3, release: 0.5 } });
        const dist = new Tone.Distortion(0.4);
        const cab = new Tone.Filter(2800, 'lowpass');
        v.connect(dist); dist.connect(cab);
        return { voice: v, out: cab, fx: [dist, cab] };
      }
      case 'acGuitar': {
        const v = new Tone.PolySynth(Tone.PluckSynth, { volume: -4, attackNoise: 1, dampening: 4200, resonance: 0.92 });
        return { voice: v, out: v, fx: [] };
      }
      case 'sax': {
        const v = new Tone.PolySynth(Tone.AMSynth, { volume: -8, harmonicity: 1,
          oscillator: { type: 'sawtooth' }, modulation: { type: 'square' },
          envelope: { attack: 0.06, decay: 0.2, sustain: 0.7, release: 0.5 } });
        const vib = new Tone.Vibrato({ frequency: 5.2, depth: 0.06 }); vib.start();
        v.connect(vib);
        return { voice: v, out: vib, fx: [vib] };
      }
      case 'trumpet': {
        const v = new Tone.PolySynth(Tone.AMSynth, { volume: -9, harmonicity: 1,
          oscillator: { type: 'square' }, modulation: { type: 'sawtooth' },
          envelope: { attack: 0.04, decay: 0.15, sustain: 0.7, release: 0.4 } });
        const vib = new Tone.Vibrato({ frequency: 5.5, depth: 0.05 }); vib.start();
        v.connect(vib);
        return { voice: v, out: vib, fx: [vib] };
      }
      case 'strings': {
        const v = new Tone.PolySynth(Tone.Synth, { volume: -13, oscillator: { type: 'triangle' },
          envelope: { attack: 0.4, decay: 0.3, sustain: 0.8, release: 1.6 } });
        const ch = new Tone.Chorus({ frequency: 3, delayTime: 0.2, depth: 0.05 }); ch.start();
        v.connect(ch);
        return { voice: v, out: ch, fx: [ch] };
      }
      case 'organ': {
        const v = new Tone.PolySynth(Tone.Synth, { volume: -12, oscillator: { type: 'fatsine', count: 3, spread: 20 },
          envelope: { attack: 0.02, decay: 0.2, sustain: 0.7, release: 0.6 } });
        const rot = new Tone.Rotary({ frequency: 5, depth: 0.4 }); rot.start();
        v.connect(rot);
        return { voice: v, out: rot, fx: [rot] };
      }
      case 'lead': {
        const v = new Tone.PolySynth(Tone.Synth, { volume: -10, oscillator: { type: 'sawtooth' },
          envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3 } });
        const dist = new Tone.Distortion(0.15);
        v.connect(dist);
        return { voice: v, out: dist, fx: [dist] };
      }
      case 'bell': {
        const v = new Tone.PolySynth(Tone.Synth, { volume: -10, oscillator: { type: 'sine' },
          envelope: { attack: 0.002, decay: 1.0, sustain: 0.0, release: 0.8 } });
        return { voice: v, out: v, fx: [] };
      }
      case 'pad': {
        const v = new Tone.PolySynth(Tone.Synth, { volume: -16, oscillator: { type: 'triangle' },
          envelope: { attack: 0.5, decay: 0.4, sustain: 0.7, release: 1.6 } });
        const ch = new Tone.Chorus({ frequency: 2.8, delayTime: 0.2, depth: 0.06 }); ch.start();
        v.connect(ch);
        return { voice: v, out: ch, fx: [ch] };
      }
      case 'pluck':
      default: {
        const v = new Tone.PolySynth(Tone.PluckSynth, { volume: -4, attackNoise: 1, dampening: 5000, resonance: 0.9 });
        return { voice: v, out: v, fx: [] };
      }
    }
  }

  function makeBass(t) {
    const base = { volume: -8, envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.3 } };
    switch (t) {
      case 'fretless': { const v = new Tone.MonoSynth({ ...base, volume: -6, oscillator: { type: 'sine' }, envelope: { attack: 0.02, decay: 0.3, sustain: 0.7, release: 0.5 } }); return { voice: v, out: v, fx: [] }; }
      case 'upright':  { const v = new Tone.MonoSynth({ ...base, volume: -7, oscillator: { type: 'sine' }, envelope: { attack: 0.03, decay: 0.4, sustain: 0.5, release: 0.6 } }); return { voice: v, out: v, fx: [] }; }
      case 'rockBass': {
        const v = new Tone.MonoSynth({ ...base, volume: -7, oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.25 } });
        const dist = new Tone.Distortion(0.25);
        v.connect(dist);
        return { voice: v, out: dist, fx: [dist] };
      }
      case 'synthBass':
      default:         { const v = new Tone.MonoSynth({ ...base, oscillator: { type: 'square' } }); return { voice: v, out: v, fx: [] }; }
    }
  }

  // 每次创建一套乐器（含独立的混响/延迟，兼容离线渲染上下文）
  function makeInstruments(set) {
    const reverb = new Tone.Freeverb({ roomSize: 0.72, dampening: 3500, wet: 0.22 }).toDestination();
    const delay = new Tone.FeedbackDelay('8n', 0.15); delay.wet.value = 0.15; delay.connect(reverb);
    const fxAll = [reverb, delay];
    const build = (t) => { const w = makeTimbre(t); w.out.connect(reverb); w.out.connect(delay); fxAll.push(...w.fx); return w.voice; };
    const melody = build(set.melody);
    const chord = build(set.chord);
    const pad = build(set.pad);
    const bassW = makeBass(set.bass);
    const bass = bassW.voice; bassW.out.toDestination(); fxAll.push(...bassW.fx);
    const kick = new Tone.MembraneSynth({ volume: -6 }).toDestination();
    const snare = new Tone.NoiseSynth({ volume: -12, noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.18 } }).toDestination();
    const hat = new Tone.NoiseSynth({ volume: -20, noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.04 } }).toDestination();
    return { melody, chord, pad, bass, kick, snare, hat, _fx: fxAll };
  }

  function disposeInst(inst) {
    ['melody', 'chord', 'pad', 'bass', 'kick', 'snare', 'hat'].forEach((k) => { try { inst[k].dispose(); } catch (e) {} });
    (inst._fx || []).forEach((f) => { try { f.dispose(); } catch (e) {} });
  }

  // ============================================================
  // 3) 提示词引导（基础模式）：识别风格 + 情绪 + BPM + 小节
  // ============================================================
  function inferPrompt(prompt) {
    const p = (prompt || '').toLowerCase();
    const rules = [
      { k: 'happy', re: /欢快|开心|快乐|愉快|upbeat|happy|跑步|运动|喜庆|活泼|阳光/ },
      { k: 'sad', re: /悲伤|难过|哭|伤感|sad|失恋|思念|emo|孤独/ },
      { k: 'electronic', re: /电子|赛博|edm|电音|蹦迪|dj|派对|夜店|动感/ },
      { k: 'chinese', re: /古风|国风|中国|武侠|江湖|民乐|中式/ },
      { k: 'lofi', re: /lofi|放松|lo-fi|学习|安静|睡前|chill|发呆|佛系/ },
      { k: 'epic', re: /史诗|电影|宏大|游戏|战斗|cinematic|紧张|壮阔/ },
      { k: 'jazz', re: /爵士|jazz|咖啡|夜色|慵懒|萨克斯/ },
      { k: 'rock', re: /摇滚|燃|热血|奋斗|rock|金属|电吉他/ },
      { k: 'ambient', re: /氛围|冥想|纯音乐|空灵|思考|background|环境/ },
      { k: 'rnb', re: /rnb|慢摇|暧昧|夜晚|情歌|都市/ },
      { k: 'classical', re: /古典|classical|钢琴曲|奏鸣|交响|典雅|庄重|巴赫|莫扎特/ },
    ];
    let key = null, matched = [];
    for (const r of rules) if (r.re.test(p)) { key = r.k; matched.push(STYLES[r.k].label); break; }

    let bpmHint = null;
    if (/快|激烈|燃|高能|动感|蹦/.test(p)) bpmHint = 'fast';
    if (/慢|安静|舒缓|睡前|轻柔|放松/.test(p)) bpmHint = 'slow';
    const wantFull = /完整|一首歌|整首|长篇|叙事|故事|歌/.test(p);

    if (!key) return { ok: false, reason: '未从提示词识别出明确风格，请在下方手动选择，或补充风格/情绪关键词。' };
    const s = STYLES[key];
    let bpm = Math.round((s.bpm[0] + s.bpm[1]) / 2);
    if (bpmHint === 'fast') bpm = s.bpm[1];
    if (bpmHint === 'slow') bpm = s.bpm[0];
    bpm = Math.max(60, Math.min(180, bpm));
    const bars = wantFull ? 16 : 8;
    let reason = `识别到关键词「${matched.join('、')}」，匹配风格「${s.label}」（情绪：${s.emotion}）。${s.desc}。`;
    reason += bpmHint === 'fast' ? '你提到偏快/高能，已取该风格上限速度。' : bpmHint === 'slow' ? '你提到偏慢/舒缓，已取该风格下限速度。' : '';
    reason += wantFull ? '你似乎想要完整作品，已建议 16 小节（可切到高级模式做完整编曲）。' : '已建议 8 小节起步，想做完整歌曲请用高级模式。';
    return { ok: true, style: key, bpm, bars, reason };
  }

  function showRecommend() {
    const r = inferPrompt(promptEl.value);
    if (!r.ok) { recommendEl.style.display = 'none'; return; }
    recommendEl.style.display = 'block';
    recommendEl.innerHTML =
      `<b>🎯 智能推荐</b><br>` +
      `推荐风格：<b>${STYLES[r.style].label}</b> ｜ 情绪：${STYLES[r.style].emotion}<br>` +
      `建议速度：<b>${r.bpm} BPM</b> ｜ 建议小节：<b>${r.bars}</b><br>` +
      `<span class="note">${r.reason}</span><br>` +
      `<span class="note">点击「生成并播放」将采用以下推荐；你也可手动改下方选项。</span>`;
    moodSel.value = r.style; bpmEl.value = r.bpm; barsEl.value = r.bars;
  }
  promptEl.addEventListener('input', showRecommend);

  // ============================================================
  // 4) 生成引擎（旋律/和声/铺底/贝斯/鼓 + 力度 + 密度可配）
  // ============================================================
  function genSection(mood, root, bars, bpm, dyn, drumsOn, t0, densityOverride) {
    const beat = 60 / bpm;
    const barLen = beat * 4;
    const E = { melody: [], chords: [], pad: [], bass: [], drums: [] };
    const density = densityOverride != null ? densityOverride : mood.density;
    const scaleMidi = mood.scale.map((i) => root + i).concat(mood.scale.map((i) => root + 12 + i));

    for (let b = 0; b < bars; b++) {
      const barStart = t0 + b * barLen;
      const deg = mood.prog[b % mood.prog.length];
      const chordRoot = root + mood.scale[deg % mood.scale.length] + (deg >= mood.scale.length ? 12 : 0);
      const hasMajorThird = mood.scale.some((d) => d % 12 === 4);
      const third = chordRoot + (hasMajorThird ? 4 : 3);
      const fifth = chordRoot + 7;
      const chordNotes = [chordRoot, third, fifth];

      E.chords.push({ t: barStart, dur: barLen * 0.96, notes: chordNotes.map(midiToNote), vel: 0.45 * dyn + 0.18 });
      E.pad.push({ t: barStart, dur: barLen, notes: chordNotes.map(midiToNote), vel: 0.16 * dyn });
      E.bass.push({ t: barStart, dur: beat * 0.9, note: midiToNote(chordRoot - 12), vel: 0.6 * dyn + 0.2 });
      E.bass.push({ t: barStart + beat * 2, dur: beat * 0.9, note: midiToNote(chordRoot - 12), vel: 0.5 * dyn + 0.18 });

      const sub = beat / 2;
      let prev = scaleMidi[Math.floor(Math.random() * 5)];
      const steps = 8;
      for (let i = 0; i < steps; i++) {
        if (Math.random() > density) continue;
        const jump = Math.random() < 0.18 ? 2 : 0;
        const step = [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)] + jump;
        const idx = Math.max(0, Math.min(scaleMidi.length - 1, scaleMidi.indexOf(prev) + step));
        prev = scaleMidi[idx];
        const isDownbeat = i % 2 === 0;
        E.melody.push({
          t: barStart + i * sub,
          dur: (isDownbeat ? sub * 0.9 : sub * 0.7),
          note: midiToNote(prev),
          vel: (isDownbeat ? 0.32 : 0.22) * dyn + 0.25,
        });
      }
      if (drumsOn && mood.drum !== 'none') drumInto(E.drums, mood.drum, barStart, beat, 0.5 * dyn + 0.4, b);
    }
    E.total = bars * barLen;
    return E;
  }

  function drumInto(d, type, s, beat, vel, barIdx) {
    const hat = (t, v) => d.push({ t, type: 'hat', vel: v });
    const kick = (t, v) => d.push({ t, type: 'kick', vel: v });
    const snare = (t, v) => d.push({ t, type: 'snare', vel: v });
    switch (type) {
      case 'pop':
        kick(s, vel); kick(s + 2 * beat, vel); snare(s + beat, vel); snare(s + 3 * beat, vel);
        for (let i = 0; i < 8; i++) hat(s + i * beat / 2, vel * 0.5); break;
      case 'four':
        for (let i = 0; i < 4; i++) kick(s + i * beat, vel);
        for (let i = 0; i < 8; i++) hat(s + i * beat / 2, vel * 0.45); break;
      case 'ballad':
        kick(s, vel * 0.9); snare(s + 2 * beat, vel * 0.85);
        for (let i = 0; i < 4; i++) hat(s + i * beat, vel * 0.35); break;
      case 'lofi':
        kick(s, vel * 0.9); snare(s + 2 * beat, vel * 0.8);
        for (let i = 0; i < 8; i++) hat(s + i * beat / 2 + (i % 2 ? beat / 4 : 0), vel * 0.4); break;
      case 'rock':
        kick(s, vel); kick(s + 2 * beat, vel); kick(s + 3 * beat, vel * 0.8);
        snare(s + beat, vel); snare(s + 3 * beat, vel);
        for (let i = 0; i < 8; i++) hat(s + i * beat / 2, vel * 0.5); break;
      case 'epic':
        kick(s, vel); kick(s + 2 * beat, vel);
        snare(s + beat, vel); snare(s + 3 * beat, vel);
        for (let i = 0; i < 16; i++) hat(s + i * beat / 4, vel * 0.35); break;
      case 'rnb':
        kick(s, vel); kick(s + 2.5 * beat, vel * 0.85);
        snare(s + beat, vel);
        for (let i = 0; i < 8; i++) hat(s + i * beat / 2 + (i % 2 ? beat / 3 : 0), vel * 0.4); break;
      case 'jazz':
        kick(s, vel * 0.7); kick(s + 2 * beat, vel * 0.7);
        snare(s + beat, vel * 0.5); snare(s + 3 * beat, vel * 0.5);
        for (let i = 0; i < 8; i++) hat(s + i * beat / 2, vel * 0.35); break;
      case 'soft':
      default:
        for (let i = 0; i < 4; i++) hat(s + i * beat, vel * 0.3); break;
    }
  }

  function concatSections(sections, bpm) {
    let t = 0;
    const E = { melody: [], chords: [], pad: [], bass: [], drums: [], total: 0 };
    for (const s of sections) {
      const ev = genSection(s.mood, s.root, s.bars, bpm, s.dyn, s.drums, t, s.density);
      E.melody.push(...ev.melody); E.chords.push(...ev.chords);
      E.pad.push(...ev.pad); E.bass.push(...ev.bass); E.drums.push(...ev.drums);
      t += ev.total;
    }
    E.total = t;
    return E;
  }

  function scheduleOn(inst, ev) {
    ev.melody.forEach((n) => Tone.Transport.scheduleOnce((time) => inst.melody.triggerAttackRelease(n.note, n.dur, time, n.vel), n.t));
    ev.chords.forEach((c) => Tone.Transport.scheduleOnce((time) => inst.chord.triggerAttackRelease(c.notes, c.dur, time, c.vel), c.t));
    ev.pad.forEach((c) => Tone.Transport.scheduleOnce((time) => inst.pad.triggerAttackRelease(c.notes, c.dur, time, c.vel), c.t));
    ev.bass.forEach((b) => Tone.Transport.scheduleOnce((time) => inst.bass.triggerAttackRelease(b.note, b.dur, time, b.vel), b.t));
    ev.drums.forEach((d) => Tone.Transport.scheduleOnce((time) => {
      if (d.type === 'kick') inst.kick.triggerAttackRelease('C1', '8n', time, d.vel);
      else if (d.type === 'snare') inst.snare.triggerAttackRelease('16n', time, d.vel);
      else inst.hat.triggerAttackRelease('32n', time, d.vel);
    }, d.t));
  }

  // 实时播放：用 Tone.now() 的绝对音频时间调度，每个片段独立 inst + 独立时间起点，
  // 完全不共享全局 Transport，彻底规避「播放头停在结尾导致后续静音」的问题。
  function playEvents(inst, ev) {
    const base = Tone.now() + 0.06;
    ev.melody.forEach((n) => inst.melody.triggerAttackRelease(n.note, n.dur, base + n.t, n.vel));
    ev.chords.forEach((c) => inst.chord.triggerAttackRelease(c.notes, c.dur, base + c.t, c.vel));
    ev.pad.forEach((c) => inst.pad.triggerAttackRelease(c.notes, c.dur, base + c.t, c.vel));
    ev.bass.forEach((b) => inst.bass.triggerAttackRelease(b.note, b.dur, base + b.t, b.vel));
    ev.drums.forEach((d) => {
      if (d.type === 'kick') inst.kick.triggerAttackRelease('C1', '8n', base + d.t, d.vel);
      else if (d.type === 'snare') inst.snare.triggerAttackRelease('16n', base + d.t, d.vel);
      else inst.hat.triggerAttackRelease('32n', base + d.t, d.vel);
    });
  }

  function setProgress(p) { const bar = document.getElementById('progressBar'); if (bar) bar.style.width = (Math.max(0, Math.min(1, p)) * 100).toFixed(1) + '%'; }

  async function startPlayback(events, set, bpm) {
    stopLive(); stopPreview();
    await Tone.start();
    const inst = makeInstruments(set);
    playEvents(inst, events);
    const totalMs = events.total * 1000 + 600;
    const startT = performance.now();
    let stopped = false;
    setProgress(0);
    const iv = setInterval(() => { if (stopped) return; setProgress((performance.now() - startT) / totalMs); }, 100);
    const stop = () => {
      if (stopped) return; stopped = true; clearInterval(iv); setProgress(0);
      try { disposeInst(inst); } catch (e) {}
    };
    const to = setTimeout(stop, totalMs + 200);
    return { stop: () => { clearTimeout(to); stop(); } };
  }

  // ============================================================
  // 5) 基础模式：AI 直接生成
  // ============================================================
  let currentEvents = null, currentInstrSet = null, currentBpm = 110, live = null;

  async function playCurrent() {
    stopLive();
    live = await startPlayback(currentEvents, currentInstrSet, currentBpm);
  }
  function stopLive() { if (live) { try { live.stop(); } catch (e) {} live = null; } }

  genBtn.addEventListener('click', async () => {
    showRecommend();
    const inferred = inferPrompt(promptEl.value);
    const key = inferred.ok ? inferred.style : moodSel.value;
    const bpm = parseInt(bpmEl.value) || 110;
    const bars = parseInt(barsEl.value) || 8;
    const s = STYLES[key];
    currentInstrSet = s.instr;
    currentBpm = bpm;
    currentEvents = concatSections([{ mood: s, root: s.root, bars, dyn: 0.85, drums: s.drum !== 'none', density: s.density }], bpm);
    out.style.display = 'block'; out.className = 'result ok';
    out.innerHTML = `🎯 AI 已为你直接生成：<b>${s.label}（${s.emotion}）</b><br>${bpm} BPM · ${bars} 小节 ｜ 乐器：${TIMBRE_LABELS[s.instr.melody]} / ${TIMBRE_LABELS[s.instr.bass]}<br>旋律 ${currentEvents.melody.length} 音 ｜ 和弦 ${currentEvents.chords.length} 段 ｜ 贝斯 ${currentEvents.bass.length} 音 ｜ 鼓点 ${currentEvents.drums.length} 个 ｜ 铺底 ${currentEvents.pad.length} 段。点击「停止」可随时结束，多次点击可换随机版本。`;
    await playCurrent();
  });

  // ============================================================
  // 6) 高级模式：AI 领航四步工作流
  // ============================================================
  const modeBasic = document.getElementById('modeBasic');
  const modeAdv = document.getElementById('modeAdv');
  const basicPanel = document.getElementById('basicPanel');
  const advPanel = document.getElementById('advPanel');
  const advStep1 = document.getElementById('advStep1');
  const advStep2 = document.getElementById('advStep2');
  const advStep3 = document.getElementById('advStep3');
  const advStep4 = document.getElementById('advStep4');
  const advBack = document.getElementById('advBack');
  const advNext = document.getElementById('advNext');
  const stepDots = Array.from(document.querySelectorAll('.step-dot'));

  const GENRE_ORDER = ['happy', 'rock', 'jazz', 'classical', 'electronic', 'chinese', 'ambient', 'rnb', 'epic', 'lofi'];
  const MAIN_GENRES = ['happy', 'rock', 'jazz', 'classical'];

  let advGenre = null;
  let advFragments = [];      // [{id,label,spec,events,bpm,set}]
  let advSelected = new Set();
  let advStep = 1;
  let preview = null;

  function setMode(adv) {
    modeBasic.classList.toggle('active', !adv);
    modeAdv.classList.toggle('active', adv);
    basicPanel.style.display = adv ? 'none' : 'block';
    advPanel.style.display = adv ? 'block' : 'none';
    if (adv) { stopLive(); renderStep1(); showAdvStep(1); }
    else { stopPreview(); }
  }
  modeBasic.addEventListener('click', () => setMode(false));
  modeAdv.addEventListener('click', () => setMode(true));

  function showAdvStep(n) {
    advStep = n;
    stepDots.forEach((d, i) => d.classList.toggle('on', i + 1 <= n));
    [advStep1, advStep2, advStep3, advStep4].forEach((el, i) => el.style.display = (i + 1 === n) ? 'block' : 'none');
    advBack.style.visibility = n > 1 ? 'visible' : 'hidden';
    advNext.style.display = n < 4 ? 'inline-block' : 'none';
    if (n === 2) renderStep2();
    if (n === 3) renderStep3();
    if (n === 4) renderStep4();
  }

  function genVariantBpm() { return Math.round((STYLES[advGenre].bpm[0] + STYLES[advGenre].bpm[1]) / 2); }

  function renderStep1() {
    advStep1.innerHTML = '<p class="note">第 1 步 · 选择你想创作的音乐类型，AI 将据此推荐并生成片段。也可让 AI 根据你的提示词自动推荐。</p>';
    const grid = document.createElement('div'); grid.className = 'genre-grid';
    GENRE_ORDER.forEach((k) => {
      const s = STYLES[k];
      const card = document.createElement('button');
      card.className = 'genre-card' + (MAIN_GENRES.includes(k) ? ' main' : '');
      card.innerHTML = `<b>${s.label}</b><span>${s.emotion}</span>`;
      card.addEventListener('click', () => { advGenre = k; advFragments = []; advSelected = new Set(); grid.querySelectorAll('.genre-card').forEach((c) => c.classList.remove('chosen')); card.classList.add('chosen'); advNext.disabled = false; });
      grid.appendChild(card);
    });
    advStep1.appendChild(grid);
    const rec = document.createElement('button');
    rec.className = 'ghost'; rec.id = 'advRec';
    rec.textContent = '🎯 让 AI 按提示词推荐类型';
    rec.addEventListener('click', () => {
      const r = inferPrompt(promptEl.value);
      if (!r.ok) { alert('提示词未识别出风格，请直接点选上方类型。'); return; }
      advGenre = r.style; advFragments = []; advSelected = new Set();
      grid.querySelectorAll('.genre-card').forEach((c, i) => { if (GENRE_ORDER[i] === r.style) c.classList.add('chosen'); });
      advNext.disabled = false;
    });
    advStep1.appendChild(rec);
    advNext.disabled = true;
  }

  function generateFragments() {
    const g = advGenre, base = STYLES[g].root, bpm = genVariantBpm(), mel = STYLES[g].instr.melody;
    const variants = [
      { label: '动机 A · 主旋律', density: STYLES[g].density, drums: STYLES[g].drum !== 'none', trans: 0 },
      { label: '动机 B · 抒情', density: Math.max(0.3, STYLES[g].density - 0.3), drums: false, trans: 0 },
      { label: '动机 C · 律动', density: Math.min(0.95, STYLES[g].density + 0.1), drums: STYLES[g].drum !== 'none', trans: 2 },
    ];
    advFragments = variants.map((v, i) => {
      const spec = { style: g, root: base + v.trans, bars: 4, density: v.density, drums: v.drums, trans: v.trans, mel };
      return { id: i, label: v.label, spec, events: genSection(STYLES[g], spec.root, spec.bars, bpm, 0.85, spec.drums, 0, spec.density), bpm, set: STYLES[g].instr };
    });
    advSelected = new Set([0]);
  }

  function renderStep2() {
    if (!advFragments.length) generateFragments();
    stopPreview();
    advStep2.innerHTML = `<p class="note">第 2 步 · AI 基于「${STYLES[advGenre].label}」生成了 ${advFragments.length} 段不同音乐片段，试听后勾选你喜欢的（可多选），再下一步修改。</p>`;
    const wrap = document.createElement('div'); wrap.className = 'frag-grid';
    advFragments.forEach((f) => {
      const card = document.createElement('div'); card.className = 'frag-card';
      card.innerHTML = `<label class="frag-pick"><input type="checkbox" data-id="${f.id}" ${advSelected.has(f.id) ? 'checked' : ''}/> 选用</label>` +
        `<div class="frag-name">${f.label}</div>` +
        `<div class="note">${f.bpm} BPM · 4 小节 · ${f.spec.drums ? '含鼓' : '无鼓'}</div>` +
        `<button class="ghost frag-play" data-id="${f.id}">▶ 试听</button>`;
      wrap.appendChild(card);
    });
    advStep2.appendChild(wrap);
    const regen = document.createElement('button'); regen.className = 'ghost'; regen.textContent = '🔄 重新生成一批片段';
    regen.addEventListener('click', () => { advFragments = []; advSelected = new Set(); renderStep2(); });
    advStep2.appendChild(regen);

    wrap.querySelectorAll('.frag-play').forEach((btn) => btn.addEventListener('click', async () => {
      const f = advFragments[+btn.dataset.id];
      stopPreview(); preview = await startPlayback(f.events, f.set, f.bpm);
    }));
    wrap.querySelectorAll('.frag-pick input').forEach((cb) => cb.addEventListener('change', () => {
      if (cb.checked) advSelected.add(+cb.dataset.id); else advSelected.delete(+cb.dataset.id);
    }));
  }

  function transposeLabel(t) { return t === 0 ? '原调' : (t > 0 ? `升 ${t} 半音` : `降 ${-t} 半音`); }
  function timbreOptions(sel) {
    return Object.keys(TIMBRE_LABELS).map((k) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${TIMBRE_LABELS[k]}</option>`).join('');
  }

  function renderStep3() {
    let ids = Array.from(advSelected);
    if (!ids.length) { ids = [0]; advSelected = new Set([0]); }
    stopPreview();
    advStep3.innerHTML = '<p class="note">第 3 步 · 对所选片段做局部修改（乐器 / 移调 / 密度 / 小节 / 鼓），改完可即时试听。</p>';
    ids.forEach((id) => {
      const f = advFragments[id];
      const box = document.createElement('div'); box.className = 'edit-box';
      box.innerHTML =
        `<div class="edit-title">${f.label}</div>` +
        `<label>旋律乐器<select class="e-mel" data-id="${id}">${timbreOptions(f.spec.mel)}</select></label>` +
        `<label>移调<select class="e-trans" data-id="${id}">${[-5,-4,-3,-2,-1,0,1,2,3,4,5].map((t)=>`<option value="${t}" ${t===f.spec.trans?'selected':''}>${transposeLabel(t)}</option>`).join('')}</select></label>` +
        `<label>密度<input type="range" class="e-den" data-id="${id}" value="${f.spec.density}" min="0.3" max="0.95" step="0.05"/></label>` +
        `<label>小节<input type="number" class="e-bars" data-id="${id}" value="${f.spec.bars}" min="2" max="16"/></label>` +
        `<label>鼓<input type="checkbox" class="e-drums" data-id="${id}" ${f.spec.drums ? 'checked' : ''}/></label>` +
        `<button class="ghost e-play" data-id="${id}">▶ 试听修改后</button>`;
      advStep3.appendChild(box);
    });

    const apply = (id) => {
      const f = advFragments[id];
      const mel = advStep3.querySelector(`.e-mel[data-id="${id}"]`).value;
      const trans = parseInt(advStep3.querySelector(`.e-trans[data-id="${id}"]`).value, 10);
      const density = parseFloat(advStep3.querySelector(`.e-den[data-id="${id}"]`).value);
      const bars = Math.max(2, parseInt(advStep3.querySelector(`.e-bars[data-id="${id}"]`).value) || 4);
      const drums = advStep3.querySelector(`.e-drums[data-id="${id}"]`).checked;
      f.spec = { style: advGenre, root: STYLES[advGenre].root + trans, bars, density, drums, trans, mel };
      f.events = genSection(STYLES[advGenre], f.spec.root, f.spec.bars, f.bpm, 0.85, f.spec.drums, 0, f.spec.density);
      f.set = { ...STYLES[advGenre].instr, melody: mel };
    };
    advStep3.querySelectorAll('.e-mel,.e-trans,.e-den,.e-bars,.e-drums').forEach((el) => el.addEventListener('change', () => apply(+el.dataset.id)));
    advStep3.querySelectorAll('.e-play').forEach((btn) => btn.addEventListener('click', async () => {
      apply(+btn.dataset.id); const f = advFragments[+btn.dataset.id];
      stopPreview(); preview = await startPlayback(f.events, f.set, f.bpm);
    }));
  }

  function renderStep4() {
    const ids = Array.from(advSelected);
    advStep4.innerHTML = '<p class="note">第 4 步 · AI 将把你选用的片段编排成完整歌曲（前奏→主歌→副歌→桥段→尾奏），并实现情感与调性转变，由 AI 主导完成作曲。</p>' +
      `<button class="primary" id="advCompose">🎼 AI 完成作曲并播放</button><div id="advResult" class="result" style="display:none"></div>`;
    document.getElementById('advCompose').addEventListener('click', () => {
      stopLive(); stopPreview();
      const sel = ids.map((i) => advFragments[i].spec);
      const bpm = genVariantBpm();
      const melodyTimbre = sel[0].mel;
      const set = { ...STYLES[advGenre].instr, melody: melodyTimbre };
      const sections = [];
      if (sel.length >= 2) {
        const a = sel[0], b = sel[1];
        sections.push({ mood: STYLES[advGenre], bars: 2, dyn: 0.45, drums: false, root: a.root, density: 0.4 });
        sections.push({ mood: STYLES[advGenre], bars: a.bars, dyn: 0.8, drums: a.drums, root: a.root, density: a.density });
        sections.push({ mood: STYLES[advGenre], bars: b.bars, dyn: 1.0, drums: b.drums, root: b.root + 2, density: b.density });
        sections.push({ mood: STYLES[advGenre], bars: a.bars, dyn: 0.8, drums: a.drums, root: a.root, density: a.density });
        sections.push({ mood: STYLES[advGenre], bars: b.bars, dyn: 0.85, drums: b.drums, root: b.root + 4, density: Math.max(0.3, b.density - 0.2) });
        sections.push({ mood: STYLES[advGenre], bars: b.bars, dyn: 1.0, drums: b.drums, root: b.root + 2, density: b.density });
        sections.push({ mood: STYLES[advGenre], bars: 2, dyn: 0.4, drums: false, root: a.root, density: 0.35 });
      } else {
        const f = sel[0];
        sections.push({ mood: STYLES[advGenre], bars: 2, dyn: 0.45, drums: false, root: f.root, density: 0.4 });
        sections.push({ mood: STYLES[advGenre], bars: f.bars, dyn: 0.8, drums: f.drums, root: f.root, density: f.density });
        sections.push({ mood: STYLES[advGenre], bars: f.bars, dyn: 1.0, drums: f.drums, root: f.root + 2, density: f.density });
        sections.push({ mood: STYLES[advGenre], bars: f.bars, dyn: 0.85, drums: f.drums, root: f.root + 4, density: Math.max(0.3, f.density - 0.2) });
        sections.push({ mood: STYLES[advGenre], bars: f.bars, dyn: 1.0, drums: f.drums, root: f.root + 2, density: f.density });
        sections.push({ mood: STYLES[advGenre], bars: 2, dyn: 0.4, drums: false, root: f.root, density: 0.35 });
      }
      currentEvents = concatSections(sections, bpm);
      currentInstrSet = set;
      currentBpm = bpm;
      const res = document.getElementById('advResult');
      res.style.display = 'block'; res.className = 'result ok';
      const struct = sections.map((s, i) => `第${i + 1}段`).join(' → ');
      res.innerHTML = `✅ AI 已完成作曲：<b>${STYLES[advGenre].label}</b> 完整歌曲<br>结构：${struct} ｜ 共 ${currentEvents.total.toFixed(1)} 秒 ｜ 旋律乐器：${TIMBRE_LABELS[melodyTimbre]}<br>旋律 ${currentEvents.melody.length} 音 ｜ 和弦 ${currentEvents.chords.length} 段 ｜ 鼓点 ${currentEvents.drums.length} 个。<div class="export-row"><button class="primary" id="advDlWav">⬇ 导出 WAV</button><button class="ghost" id="advDlMp3">⬇ 导出 MP3</button></div>`;
      document.getElementById('advDlWav').addEventListener('click', (e) => doExport('wav', e.currentTarget));
      document.getElementById('advDlMp3').addEventListener('click', (e) => doExport('mp3', e.currentTarget));
      playCurrent();
    });
  }

  function stopPreview() { if (preview) { try { preview.stop(); } catch (e) {} preview = null; } }
  advNext.addEventListener('click', () => {
    if (advStep === 1 && !advGenre) return;
    if (advStep === 2 && !advSelected.size) { alert('请至少勾选一段片段'); return; }
    showAdvStep(Math.min(4, advStep + 1));
  });
  advBack.addEventListener('click', () => showAdvStep(Math.max(1, advStep - 1)));

  // ============================================================
  // 7) 导出 WAV（浏览器离线渲染，不占服务器）
  // ============================================================
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function audioBufferToWav(ab) {
    const numCh = ab.numberOfChannels, len = ab.length, sr = ab.sampleRate;
    const bytesPerSample = 2, blockAlign = numCh * bytesPerSample, dataSize = len * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize), view = new DataView(buffer);
    const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
    writeStr(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); writeStr(8, 'WAVE');
    writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, numCh, true); view.setUint32(24, sr, true);
    view.setUint32(28, sr * blockAlign, true); view.setUint16(32, blockAlign, true); view.setUint16(34, 16, true);
    writeStr(36, 'data'); view.setUint32(40, dataSize, true);
    let off = 44;
    for (let i = 0; i < len; i++) for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, ab.getChannelData(c)[i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2;
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  function audioBufferToMp3(ab, kbps) {
    const lame = window.lamejs;
    if (!lame) return null;
    const ch = ab.numberOfChannels, sr = ab.sampleRate;
    const enc = new lame.Mp3Encoder(ch, sr, kbps || 192);
    const l = ab.getChannelData(0), r = ch > 1 ? ab.getChannelData(1) : l;
    const li = new Int16Array(l.length), ri = new Int16Array(r.length);
    for (let i = 0; i < l.length; i++) {
      const sl = Math.max(-1, Math.min(1, l[i])); li[i] = sl < 0 ? sl * 0x8000 : sl * 0x7fff;
      const sr2 = Math.max(-1, Math.min(1, r[i])); ri[i] = sr2 < 0 ? sr2 * 0x8000 : sr2 * 0x7fff;
    }
    const bs = 1152, data = [];
    for (let i = 0; i < li.length; i += bs) {
      const lb = li.subarray(i, i + bs), rb = ri.subarray(i, i + bs);
      const buf = ch > 1 ? enc.encodeBuffer(lb, rb) : enc.encodeBuffer(lb);
      if (buf.length) data.push(new Int8Array(buf));
    }
    const end = enc.flush();
    if (end.length) data.push(new Int8Array(end));
    return new Blob(data, { type: 'audio/mpeg' });
  }

  async function renderBuffer() {
    if (!currentEvents) throw new Error('请先生成一段音乐');
    const ev = currentEvents, bpm = currentBpm, set = currentInstrSet;
    return await Tone.Offline(async () => {
      Tone.Transport.cancel();
      const inst = makeInstruments(set);
      Tone.Transport.bpm.value = bpm;
      scheduleOn(inst, ev);
      Tone.Transport.start();
    }, ev.total + 0.6);
  }

  async function doExport(kind, btn) {
    if (!currentEvents) return alert('请先生成一段音乐');
    btn.disabled = true; const old = btn.textContent; btn.textContent = '渲染中…';
    try {
      const ab = await renderBuffer();
      if (kind === 'mp3') {
        const blob = audioBufferToMp3(ab, 192);
        if (!blob) { alert('当前环境缺少 MP3 编码器，已改导出 WAV'); downloadBlob(audioBufferToWav(ab), `composition_${Date.now()}.wav`); }
        else downloadBlob(blob, `composition_${Date.now()}.mp3`);
      } else {
        downloadBlob(audioBufferToWav(ab), `composition_${Date.now()}.wav`);
      }
    } catch (e) { alert('导出失败：' + e.message); }
    finally { btn.disabled = false; btn.textContent = old; }
  }

  stopBtn.addEventListener('click', () => { stopLive(); stopPreview(); });
  dlBtn.addEventListener('click', (e) => doExport('wav', e.currentTarget));
  const dlMp3El = document.getElementById('dlMp3');
  if (dlMp3El) dlMp3El.addEventListener('click', (e) => doExport('mp3', e.currentTarget));
})();

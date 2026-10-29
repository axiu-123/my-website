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
  const advToggle = document.getElementById('advToggle');
  const advPanel = document.getElementById('advPanel');

  // ============================================================
  // 1) 风格预设库（更丰富的音乐性描述）
  // ============================================================
  const STYLES = {
    happy:     { label: '欢快 Pop',     emotion: '开心 / 明亮', scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 4, 5, 3], root: 60, bright: true,  bpm: [108, 124], drum: 'pop',    melOsc: 'triangle', density: 0.82, desc: '大调明亮，跳跃，适合喜悦、日常' },
    sad:       { label: '悲伤 Ballad',  emotion: '伤感 / 低落', scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 8, 7], root: 57, bright: false, bpm: [60, 78],   drum: 'ballad', melOsc: 'sine',     density: 0.5,  desc: '小调忧郁，长线条，适合失恋、思念' },
    electronic: { label: '电子 / EDM',  emotion: '兴奋 / 律动', scale: [0, 3, 5, 7, 10],       prog: [0, 0, 5, 3], root: 60, bright: true,  bpm: [124, 132], drum: 'four',   melOsc: 'sawtooth', density: 0.85, desc: '四四拍强律动，适合派对、运动' },
    chinese:   { label: '古风 / 国风',  emotion: '婉转 / 叙事', scale: [0, 2, 4, 7, 9],         prog: [0, 4, 5, 1], root: 60, bright: true,  bpm: [78, 96],   drum: 'soft',   melOsc: 'triangle', density: 0.6,  desc: '五声音阶，留白，适合江湖、抒情' },
    lofi:      { label: 'Lo-Fi 放松',   emotion: '松弛 / 治愈', scale: [0, 3, 5, 7, 10],        prog: [0, 5, 3, 4], root: 57, bright: false, bpm: [68, 84],   drum: 'lofi',   melOsc: 'sine',     density: 0.45, desc: '慵懒摇摆，切分，适合学习、睡前' },
    epic:      { label: '史诗 / 电影感', emotion: '宏大 / 紧张', scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 2, 4, 5], root: 55, bright: false, bpm: [90, 110],  drum: 'epic',   melOsc: 'sawtooth', density: 0.6,  desc: '小调铺陈，推进，适合游戏、高潮' },
    jazz:      { label: '爵士 / R&B 柔', emotion: '慵懒 / 夜色', scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 3, 1, 4], root: 58, bright: false, bpm: [80, 100],  drum: 'soft',   melOsc: 'triangle', density: 0.6,  desc: '七声音阶，切分，适合咖啡、夜晚' },
    rock:      { label: '摇滚 / 流行燃', emotion: '热血 / 力量', scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 5, 3, 4], root: 57, bright: true,  bpm: [120, 150], drum: 'rock',   melOsc: 'square',   density: 0.85, desc: '强力和弦，驱动，适合燃、奋斗' },
    ambient:   { label: '氛围 / 纯音乐', emotion: '空灵 / 沉思', scale: [0, 2, 5, 7, 9],         prog: [0, 2, 4, 2], root: 60, bright: true,  bpm: [60, 80],   drum: 'none',   melOsc: 'sine',     density: 0.3,  desc: '大量留白，缓慢，适合冥想、背景' },
    rnb:       { label: 'R&B / 慢摇',   emotion: '暧昧 / 律动', scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 5, 3, 1], root: 58, bright: false, bpm: [85, 100],  drum: 'rnb',    melOsc: 'triangle', density: 0.6,  desc: '切分律动，松弛，适合夜晚、情感' },
  };

  function midiToNote(m) { return Tone.Frequency(m, 'midi').toNote(); }

  // ============================================================
  // 2) 提示词引导：识别风格 + 情绪 + 建议 BPM + 建议小节 + 理由
  // ============================================================
  function inferPrompt(prompt) {
    const p = (prompt || '').toLowerCase();
    const rules = [
      { k: 'happy',     re: /欢快|开心|快乐|愉快|upbeat|happy|跑步|运动|喜庆|活泼|阳光/ },
      { k: 'sad',       re: /悲伤|难过|哭|伤感|sad|失恋|思念|emo|孤独|emo/ },
      { k: 'electronic', re: /电子|赛博|edm|电音|蹦迪|dj|派对|夜店|动感/ },
      { k: 'chinese',   re: /古风|国风|中国|武侠|江湖|民乐|中式/ },
      { k: 'lofi',      re: /lofi|放松|lo-fi|学习|安静|睡前|chill|发呆|佛系/ },
      { k: 'epic',      re: /史诗|电影|宏大|游戏|战斗|cinematic|史诗感|紧张|壮阔/ },
      { k: 'jazz',      re: /爵士|jazz|咖啡|夜色|慵懒|萨克斯/ },
      { k: 'rock',      re: /摇滚|燃|热血|奋斗|rock|金属|电吉他/ },
      { k: 'ambient',   re: /氛围|冥想|纯音乐|空灵|思考|background|环境/ },
      { k: 'rnb',       re: /rnb|慢摇|暧昧|夜晚|情歌|都市/ },
    ];
    let key = null, matched = [];
    for (const r of rules) if (r.re.test(p)) { key = r.k; matched.push(STYLES[r.k].label); break; }

    // 速度倾向
    let bpmHint = null;
    if (/快|激烈|燃|高能|动感|蹦/.test(p)) bpmHint = 'fast';
    if (/慢|安静|舒缓|睡前|轻柔|放松/.test(p)) bpmHint = 'slow';

    // 完整度倾向（完整歌曲 → 更多小节）
    const wantFull = /完整|一首歌|整首|长篇|叙事|故事|歌/.test(p);

    if (!key) {
      return { ok: false, reason: '未从提示词识别出明确风格，请在下方手动选择，或补充风格/情绪关键词。' };
    }
    const s = STYLES[key];
    let bpm = Math.round((s.bpm[0] + s.bpm[1]) / 2);
    if (bpmHint === 'fast') bpm = s.bpm[1];
    if (bpmHint === 'slow') bpm = s.bpm[0];
    bpm = Math.max(60, Math.min(180, bpm));
    const bars = wantFull ? 16 : 8;
    let reason = `识别到关键词「${matched.join('、')}」，匹配风格「${s.label}」（情绪：${s.emotion}）。${s.desc}。`;
    reason += bpmHint === 'fast' ? '你提到偏快/高能，已取该风格上限速度。' : bpmHint === 'slow' ? '你提到偏慢/舒缓，已取该风格下限速度。' : '';
    reason += wantFull ? '你似乎想要完整作品，已建议 16 小节（可切换到高级模式编排段落）。' : '已建议 8 小节起步，想做完整歌曲请用高级模式。';
    return { ok: true, style: key, bpm, bars, reason };
  }

  function showRecommend() {
    const r = inferPrompt(promptEl.value);
    if (!r.ok) {
      recommendEl.style.display = 'none';
      return;
    }
    recommendEl.style.display = 'block';
    recommendEl.innerHTML =
      `<b>🎯 智能推荐</b><br>` +
      `推荐风格：<b>${STYLES[r.style].label}</b> ｜ 情绪：${STYLES[r.style].emotion}<br>` +
      `建议速度：<b>${r.bpm} BPM</b> ｜ 建议小节：<b>${r.bars}</b><br>` +
      `<span class="note">${r.reason}</span><br>` +
      `<span class="note">点击「生成并播放」将采用以下推荐；你也可手动改下方选项。</span>`;
    // 实时把推荐回填到控件
    moodSel.value = r.style;
    bpmEl.value = r.bpm;
    barsEl.value = r.bars;
  }
  promptEl.addEventListener('input', showRecommend);

  // ============================================================
  // 3) 生成引擎（旋律/和声/铺底/贝斯/鼓 + 力度）
  // ============================================================
  function genSection(mood, root, bars, bpm, dyn, drumsOn, t0) {
    const beat = 60 / bpm;
    const barLen = beat * 4;
    const E = { melody: [], chords: [], pad: [], bass: [], drums: [] };
    const scaleMidi = mood.scale
      .map((i) => root + i)
      .concat(mood.scale.map((i) => root + 12 + i));

    for (let b = 0; b < bars; b++) {
      const barStart = t0 + b * barLen;
      const deg = mood.prog[b % mood.prog.length];
      const chordRoot = root + mood.scale[deg % mood.scale.length] + (deg >= mood.scale.length ? 12 : 0);
      const third = chordRoot + (mood.bright ? 4 : 3);
      const fifth = chordRoot + 7;
      const chordNotes = [chordRoot, third, fifth];

      // 和声（每小节）
      E.chords.push({ t: barStart, dur: barLen * 0.96, notes: chordNotes.map(midiToNote), vel: 0.45 * dyn + 0.18 });
      // 铺底 pad（更厚）
      E.pad.push({ t: barStart, dur: barLen, notes: chordNotes.map(midiToNote), vel: 0.16 * dyn });
      // 贝斯（跟随和弦根音，低八度）
      E.bass.push({ t: barStart, dur: beat * 0.9, note: midiToNote(chordRoot - 12), vel: 0.6 * dyn + 0.2 });
      E.bass.push({ t: barStart + beat * 2, dur: beat * 0.9, note: midiToNote(chordRoot - 12), vel: 0.5 * dyn + 0.18 });

      // 旋律（密度随风格；随机游走 + 偶尔跳进）
      const sub = beat / 2; // 八分音符
      let prev = scaleMidi[Math.floor(Math.random() * 5)];
      const steps = 8;
      for (let i = 0; i < steps; i++) {
        if (Math.random() > mood.density) continue; // 留白
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

      // 鼓
      if (drumsOn && mood.drum !== 'none') {
        drumInto(E.drums, mood.drum, barStart, beat, 0.5 * dyn + 0.4, b);
      }
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
        for (let i = 0; i < 8; i++) hat(s + i * beat / 2, vel * 0.5);
        break;
      case 'four':
        for (let i = 0; i < 4; i++) kick(s + i * beat, vel);
        for (let i = 0; i < 8; i++) hat(s + i * beat / 2, vel * 0.45);
        break;
      case 'ballad':
        kick(s, vel * 0.9); snare(s + 2 * beat, vel * 0.85);
        for (let i = 0; i < 4; i++) hat(s + i * beat, vel * 0.35);
        break;
      case 'lofi':
        kick(s, vel * 0.9); snare(s + 2 * beat, vel * 0.8);
        for (let i = 0; i < 8; i++) hat(s + i * beat / 2 + (i % 2 ? beat / 4 : 0), vel * 0.4);
        break;
      case 'rock':
        kick(s, vel); kick(s + 2 * beat, vel); kick(s + 3 * beat, vel * 0.8);
        snare(s + beat, vel); snare(s + 3 * beat, vel);
        for (let i = 0; i < 8; i++) hat(s + i * beat / 2, vel * 0.5);
        break;
      case 'epic':
        kick(s, vel); kick(s + 2 * beat, vel);
        snare(s + beat, vel); snare(s + 3 * beat, vel);
        for (let i = 0; i < 16; i++) hat(s + i * beat / 4, vel * 0.35);
        break;
      case 'rnb':
        kick(s, vel); kick(s + 2.5 * beat, vel * 0.85);
        snare(s + beat, vel);
        for (let i = 0; i < 8; i++) hat(s + i * beat / 2 + (i % 2 ? beat / 3 : 0), vel * 0.4);
        break;
      case 'soft':
      default:
        for (let i = 0; i < 4; i++) hat(s + i * beat, vel * 0.3);
        break;
    }
  }

  function concatSections(sections, bpm) {
    let t = 0;
    const E = { melody: [], chords: [], pad: [], bass: [], drums: [], total: 0 };
    for (const s of sections) {
      const ev = genSection(s.mood, s.root, s.bars, bpm, s.dyn, s.drums, t);
      E.melody.push(...ev.melody); E.chords.push(...ev.chords);
      E.pad.push(...ev.pad); E.bass.push(...ev.bass); E.drums.push(...ev.drums);
      t += ev.total;
    }
    E.total = t;
    return E;
  }

  // ============================================================
  // 4) 播放 / 导出
  // ============================================================
  let live = null;
  let currentEvents = null;
  let currentBpm = 110;

  function makeInstruments(bright) {
    const fx = new Tone.FeedbackDelay('8n', 0.18);
    fx.wet.value = 0.22; fx.toDestination();
    const melody = new Tone.PolySynth(Tone.Synth, {
      volume: -6, oscillator: { type: bright ? 'triangle' : 'sine' },
      envelope: { attack: 0.02, decay: 0.2, sustain: 0.4, release: 0.6 },
    });
    melody.connect(fx); melody.toDestination();
    const chord = new Tone.PolySynth(Tone.Synth, {
      volume: -16, oscillator: { type: 'sine' },
      envelope: { attack: 0.04, decay: 0.3, sustain: 0.5, release: 0.8 },
    });
    chord.connect(fx); chord.toDestination();
    const pad = new Tone.PolySynth(Tone.Synth, {
      volume: -22, oscillator: { type: 'sine' },
      envelope: { attack: 0.4, decay: 0.4, sustain: 0.7, release: 1.4 },
    });
    pad.toDestination();
    const bass = new Tone.MonoSynth({
      volume: -10, oscillator: { type: 'triangle' },
      envelope: { attack: 0.02, decay: 0.2, sustain: 0.6, release: 0.4 },
    }).toDestination();
    const kick = new Tone.MembraneSynth({ volume: -6 }).toDestination();
    const snare = new Tone.NoiseSynth({
      volume: -12, noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.18 },
    }).toDestination();
    const hat = new Tone.NoiseSynth({
      volume: -20, noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.04 },
    }).toDestination();
    return { melody, chord, pad, bass, kick, snare, hat };
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

  async function play() {
    await Tone.start();
    stopLive();
    const bright = currentParams.bright;
    const inst = makeInstruments(bright);
    Tone.Transport.bpm.value = currentBpm;
    Tone.Transport.cancel();
    scheduleOn(inst, currentEvents);
    Tone.Transport.start();
    const timeout = setTimeout(() => stopLive(), currentEvents.total * 1000 + 400);
    live = {
      stop() {
        try { Tone.Transport.stop(); Tone.Transport.cancel(); } catch (e) {}
        [inst.melody, inst.chord, inst.pad, inst.bass, inst.kick, inst.snare, inst.hat].forEach((s) => { try { s.dispose(); } catch (e) {} });
      },
      timeout,
    };
  }

  function stopLive() {
    if (live) { clearTimeout(live.timeout); live.stop(); live = null; }
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

  async function exportWav() {
    if (!currentEvents) return alert('请先生成一段旋律');
    dlBtn.disabled = true; dlBtn.textContent = '渲染中…';
    try {
      const ev = currentEvents, bpm = currentBpm;
      const rendered = await Tone.Offline(async () => {
        const inst = makeInstruments(currentParams.bright);
        Tone.Transport.bpm.value = bpm;
        scheduleOn(inst, ev);
        Tone.Transport.start();
      }, ev.total + 0.6);
      const blob = audioBufferToWav(rendered);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `composition_${Date.now()}.wav`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert('导出失败：' + e.message); }
    finally { dlBtn.disabled = false; dlBtn.textContent = '⬇ 导出 WAV'; }
  }

  // ============================================================
  // 5) 高级模式：段落编辑器
  // ============================================================
  const SECTIONS = [];
  const sectionsEl = document.getElementById('sections');
  const baseKeyNote = document.getElementById('baseKeyNote');
  const baseKeyOct = document.getElementById('baseKeyOct');

  function baseKeyMidi() {
    const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
    return NOTE[baseKeyNote.value] + (parseInt(baseKeyOct.value, 10) + 1) * 12;
  }

  const SECTION_PRESETS = ['前奏 Intro', '主歌 Verse', '预副歌 Pre', '副歌 Chorus', '桥段 Bridge', '间奏 Inter', '尾奏 Outro', '自由'];
  const TEMPLATES = {
    pop: [
      { name: '前奏 Intro', style: 'lofi', bars: 2, transpose: 0, dyn: 0.5, drums: false },
      { name: '主歌 Verse', style: 'happy', bars: 4, transpose: 0, dyn: 0.75, drums: true },
      { name: '副歌 Chorus', style: 'happy', bars: 4, transpose: 0, dyn: 1.0, drums: true },
      { name: '桥段 Bridge', style: 'sad', bars: 4, transpose: 0, dyn: 0.8, drums: true },
      { name: '副歌 Chorus', style: 'happy', bars: 4, transpose: 0, dyn: 1.0, drums: true },
      { name: '尾奏 Outro', style: 'lofi', bars: 2, transpose: 0, dyn: 0.4, drums: false },
    ],
    ballad: [
      { name: '前奏 Intro', style: 'sad', bars: 2, transpose: 0, dyn: 0.45, drums: false },
      { name: '主歌 Verse', style: 'sad', bars: 4, transpose: 0, dyn: 0.7, drums: false },
      { name: '副歌 Chorus', style: 'sad', bars: 4, transpose: 0, dyn: 0.9, drums: true },
      { name: '桥段 Bridge', style: 'epic', bars: 4, transpose: 2, dyn: 0.85, drums: true },
      { name: '副歌 Chorus', style: 'sad', bars: 4, transpose: 0, dyn: 0.9, drums: true },
      { name: '尾奏 Outro', style: 'sad', bars: 2, transpose: 0, dyn: 0.35, drums: false },
    ],
    narrative: [
      { name: '前奏 Intro', style: 'ambient', bars: 2, transpose: 0, dyn: 0.4, drums: false },
      { name: '主歌 Verse', style: 'chinese', bars: 4, transpose: 0, dyn: 0.7, drums: true },
      { name: '副歌 Chorus', style: 'chinese', bars: 4, transpose: 0, dyn: 1.0, drums: true },
      { name: '桥段 Bridge', style: 'epic', bars: 4, transpose: 3, dyn: 0.85, drums: true },
      { name: '副歌 Chorus', style: 'chinese', bars: 4, transpose: 3, dyn: 1.0, drums: true },
      { name: '尾奏 Outro', style: 'ambient', bars: 2, transpose: 0, dyn: 0.35, drums: false },
    ],
  };

  function styleOptions(sel) {
    return Object.keys(STYLES)
      .map((k) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${STYLES[k].label}（${STYLES[k].emotion}）</option>`)
      .join('');
  }
  function transposeOptions(t) {
    let opts = '';
    for (let i = -5; i <= 5; i++) {
      const lbl = i === 0 ? '原调' : (i > 0 ? `升 ${i} 半音` : `降 ${-i} 半音`);
      opts += `<option value="${i}" ${i === t ? 'selected' : ''}>${lbl}</option>`;
    }
    return opts;
  }

  function renderSections() {
    if (!SECTIONS.length) {
      sectionsEl.innerHTML = '<span class="note">尚未添加段落，点下方按钮用模板或手动添加。</span>';
      return;
    }
    sectionsEl.innerHTML = SECTIONS.map((s, i) => `
      <div class="sec-row">
        <div class="sec-idx">${i + 1}</div>
        <input class="sec-name" data-i="${i}" value="${s.name}" />
        <select class="sec-style" data-i="${i}">${styleOptions(s.style)}</select>
        <label>小节<input type="number" class="sec-bars" data-i="${i}" value="${s.bars}" min="1" max="16" /></label>
        <label>调性<select class="sec-trans" data-i="${i}">${transposeOptions(s.transpose)}</select></label>
        <label>力度<input type="range" class="sec-dyn" data-i="${i}" value="${s.dyn}" min="0.3" max="1" step="0.05" /></label>
        <label>鼓<input type="checkbox" class="sec-drums" data-i="${i}" ${s.drums ? 'checked' : ''} /></label>
        <button class="sec-del ghost" data-i="${i}">✕</button>
      </div>`).join('');
  }

  function bindSectionEvents() {
    sectionsEl.querySelectorAll('.sec-name').forEach((e) => e.addEventListener('change', () => (SECTIONS[e.dataset.i].name = e.value)));
    sectionsEl.querySelectorAll('.sec-style').forEach((e) => e.addEventListener('change', () => (SECTIONS[e.dataset.i].style = e.value)));
    sectionsEl.querySelectorAll('.sec-bars').forEach((e) => e.addEventListener('change', () => (SECTIONS[e.dataset.i].bars = Math.max(1, parseInt(e.value) || 1))));
    sectionsEl.querySelectorAll('.sec-trans').forEach((e) => e.addEventListener('change', () => (SECTIONS[e.dataset.i].transpose = parseInt(e.value, 10))));
    sectionsEl.querySelectorAll('.sec-dyn').forEach((e) => e.addEventListener('input', () => (SECTIONS[e.dataset.i].dyn = parseFloat(e.value))));
    sectionsEl.querySelectorAll('.sec-drums').forEach((e) => e.addEventListener('change', () => (SECTIONS[e.dataset.i].drums = e.checked)));
    sectionsEl.querySelectorAll('.sec-del').forEach((e) => e.addEventListener('click', () => { SECTIONS.splice(e.dataset.i, 1); renderSections(); }));
  }

  function loadTemplate(name) {
    SECTIONS.length = 0;
    TEMPLATES[name].forEach((s) => SECTIONS.push({ ...s }));
    renderSections(); bindSectionEvents();
  }

  document.getElementById('tplPop').addEventListener('click', () => loadTemplate('pop'));
  document.getElementById('tplBallad').addEventListener('click', () => loadTemplate('ballad'));
  document.getElementById('tplNarr').addEventListener('click', () => loadTemplate('narrative'));
  document.getElementById('addSec').addEventListener('click', () => {
    SECTIONS.push({ name: '新段落', style: moodSel.value, bars: 4, transpose: 0, dyn: 0.85, drums: true });
    renderSections(); bindSectionEvents();
  });

  advToggle.addEventListener('change', () => {
    advPanel.style.display = advToggle.checked ? 'block' : 'none';
    if (advToggle.checked && !SECTIONS.length) loadTemplate('pop');
  });

  // ============================================================
  // 6) 生成入口
  // ============================================================
  let currentParams = null;

  genBtn.addEventListener('click', async () => {
    showRecommend();
    let sections, bpm, label, meta;
    if (advToggle.checked) {
      if (!SECTIONS.length) return alert('请先添加至少一个段落');
      bpm = Math.max(60, Math.min(180, parseInt(bpmEl.value) || 110));
      const base = baseKeyMidi();
      sections = SECTIONS.map((s) => ({
        mood: STYLES[s.style], root: base + s.transpose, bars: s.bars, dyn: s.dyn, drums: s.drums,
      }));
      currentParams = { bright: true };
      currentBpm = bpm;
      currentEvents = concatSections(sections, bpm);
      const trans = SECTIONS.map((s, i) => `${s.name}${s.transpose ? (s.transpose > 0 ? ` (+${s.transpose})` : ` (${s.transpose})`) : ''}`).join(' → ');
      label = '高级模式 · 多段落';
      meta = `共 ${SECTIONS.length} 段（${trans}），总 ${currentEvents.total.toFixed(1)} 秒`;
    } else {
      const inferred = inferPrompt(promptEl.value);
      const key = inferred.ok ? inferred.style : moodSel.value;
      bpm = parseInt(bpmEl.value) || 110;
      const bars = parseInt(barsEl.value) || 8;
      const s = STYLES[key];
      currentParams = { bright: s.bright };
      currentBpm = bpm;
      currentEvents = concatSections([{ mood: s, root: s.root, bars, dyn: 0.85, drums: s.drum !== 'none' }], bpm);
      label = `${s.label}（${s.emotion}）`;
      meta = `${bpm} BPM · ${bars} 小节`;
    }

    out.style.display = 'block';
    out.className = 'result ok';
    out.innerHTML = `已生成：<b>${label}</b><br>${meta}<br>旋律 ${currentEvents.melody.length} 音 ｜ 和弦 ${currentEvents.chords.length} 段 ｜ 贝斯 ${currentEvents.bass.length} 音 ｜ 鼓点 ${currentEvents.drums.length} 个 ｜ 铺底 ${currentEvents.pad.length} 段。点击「停止」可随时结束。`;
    await play();
  });

  stopBtn.addEventListener('click', stopLive);
  dlBtn.addEventListener('click', exportWav);
})();

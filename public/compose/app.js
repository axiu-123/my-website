(function () {
  const out = document.getElementById('out');
  const genBtn = document.getElementById('gen');
  const stopBtn = document.getElementById('stop');
  const dlBtn = document.getElementById('dl');

  const MOODS = {
    happy: { scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 4, 5, 3], root: 60, bright: true, drums: 'pop' },
    sad: { scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 8, 7], root: 57, bright: false, drums: 'ballad' },
    electronic: { scale: [0, 3, 5, 7, 10], prog: [0, 0, 5, 3], root: 60, bright: true, drums: 'four' },
    chinese: { scale: [0, 2, 4, 7, 9], prog: [0, 4, 5, 1], root: 60, bright: true, drums: 'soft' },
    lofi: { scale: [0, 3, 5, 7, 10], prog: [0, 5, 3, 4], root: 57, bright: false, drums: 'lofi' },
  };

  function midiToNote(m) {
    return Tone.Frequency(m, 'midi').toNote();
  }

  function inferMood(prompt) {
    const p = (prompt || '').toLowerCase();
    if (/开心|欢快|快乐|愉快|upbeat|happy|跑步|运动/.test(p)) return 'happy';
    if (/悲伤|难过|哭|伤感|sad|失恋/.test(p)) return 'sad';
    if (/电子|赛博|edm|电音|蹦迪|dj/.test(p)) return 'electronic';
    if (/古风|中国|国风|武侠|chinese/.test(p)) return 'chinese';
    if (/lofi|放松|lo-fi|学习|安静|sleep/.test(p)) return 'lofi';
    return null;
  }

  function generate(params) {
    const m = MOODS[params.mood];
    const beat = 60 / params.bpm;
    const barLen = beat * 4;
    const scaleMidi = m.scale
      .map((i) => m.root + i)
      .concat(m.scale.map((i) => m.root + 12 + i));
    const melody = [], chords = [], drums = [];
    for (let b = 0; b < params.bars; b++) {
      const barStart = b * barLen;
      const deg = m.prog[b % m.prog.length];
      const chordRoot = m.root + m.scale[deg % m.scale.length] + (deg >= m.scale.length ? 12 : 0);
      const third = chordRoot + (m.bright ? 4 : 3);
      const fifth = chordRoot + 7;
      chords.push({ t: barStart, dur: barLen * 0.95, notes: [chordRoot, third, fifth].map(midiToNote) });

      let prev = scaleMidi[Math.floor(Math.random() * scaleMidi.length)];
      for (let i = 0; i < 4; i++) {
        if (Math.random() < 0.16) continue; // 留白
        const step = [-2, -1, 0, 1, 2][Math.floor(Math.random() * 5)];
        const idx = Math.max(0, Math.min(scaleMidi.length - 1, scaleMidi.indexOf(prev) + step));
        prev = scaleMidi[idx];
        melody.push({ t: barStart + i * (beat / 2), dur: beat / 2 * 0.9, note: midiToNote(prev) });
      }

      if (m.drums === 'four') {
        for (let i = 0; i < 4; i++) drums.push({ t: barStart + i * beat, type: 'kick' });
      } else {
        drums.push({ t: barStart, type: 'kick' });
        drums.push({ t: barStart + beat * 2, type: 'kick' });
      }
      for (let i = 0; i < 4; i++) drums.push({ t: barStart + i * beat + beat / 2, type: 'hat' });
    }
    return { melody, chords, drums, total: params.bars * barLen };
  }

  let live = null; // {stop, timeout}
  let currentEvents = null;

  function makeInstruments(bright) {
    const fx = new Tone.FeedbackDelay('8n', 0.18);
    fx.wet.value = 0.25;
    fx.toDestination();
    const melody = new Tone.PolySynth(Tone.Synth, {
      volume: -6,
      oscillator: { type: bright ? 'triangle' : 'sine' },
      envelope: { attack: 0.02, decay: 0.2, sustain: 0.4, release: 0.6 },
    });
    melody.connect(fx);
    melody.toDestination();
    const chord = new Tone.PolySynth(Tone.Synth, {
      volume: -14,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.04, decay: 0.3, sustain: 0.5, release: 0.8 },
    });
    chord.connect(fx);
    chord.toDestination();
    const kick = new Tone.MembraneSynth().toDestination();
    const hat = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.05 },
    }).toDestination();
    return { melody, chord, kick, hat };
  }

  function scheduleOn(inst, ev) {
    ev.melody.forEach((n) =>
      Tone.Transport.scheduleOnce((time) => inst.melody.triggerAttackRelease(n.note, n.dur, time), n.t)
    );
    ev.chords.forEach((c) =>
      Tone.Transport.scheduleOnce((time) => inst.chord.triggerAttackRelease(c.notes, c.dur, time), c.t)
    );
    ev.drums.forEach((d) =>
      Tone.Transport.scheduleOnce((time) => {
        if (d.type === 'kick') inst.kick.triggerAttackRelease('C1', '8n', time);
        else inst.hat.triggerAttackRelease('16n', time);
      }, d.t)
    );
  }

  async function play() {
    await Tone.start();
    stopLive();
    const bright = MOODS[currentParams.mood].bright;
    const inst = makeInstruments(bright);
    Tone.Transport.bpm.value = currentParams.bpm;
    Tone.Transport.cancel();
    scheduleOn(inst, currentEvents);
    Tone.Transport.start();
    const timeout = setTimeout(() => stopLive(), currentEvents.total * 1000 + 300);
    live = {
      stop() {
        try { Tone.Transport.stop(); Tone.Transport.cancel(); } catch (e) {}
        [inst.melody, inst.chord, inst.kick, inst.hat].forEach((s) => { try { s.dispose(); } catch (e) {} });
      },
      timeout,
    };
  }

  function stopLive() {
    if (live) {
      clearTimeout(live.timeout);
      live.stop();
      live = null;
    }
  }

  function audioBufferToWav(ab) {
    const numCh = ab.numberOfChannels;
    const len = ab.length;
    const sr = ab.sampleRate;
    const bytesPerSample = 2;
    const blockAlign = numCh * bytesPerSample;
    const dataSize = len * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
    writeStr(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); writeStr(8, 'WAVE');
    writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, numCh, true); view.setUint32(24, sr, true);
    view.setUint32(28, sr * blockAlign, true); view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data'); view.setUint32(40, dataSize, true);
    let off = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < numCh; c++) {
        let s = Math.max(-1, Math.min(1, ab.getChannelData(c)[i]));
        view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        off += 2;
      }
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  async function exportWav() {
    if (!currentEvents) return alert('请先生成一段旋律');
    dlBtn.disabled = true;
    dlBtn.textContent = '渲染中…';
    try {
      const bright = MOODS[currentParams.mood].bright;
      const ev = currentEvents;
      const rendered = await Tone.Offline(async () => {
        const inst = makeInstruments(bright);
        Tone.Transport.bpm.value = currentParams.bpm;
        scheduleOn(inst, ev);
        Tone.Transport.start();
      }, ev.total + 0.5);
      const blob = audioBufferToWav(rendered);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `composition_${currentParams.mood}_${Date.now()}.wav`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('导出失败：' + e.message);
    } finally {
      dlBtn.disabled = false;
      dlBtn.textContent = '⬇ 导出 WAV';
    }
  }

  let currentParams = null;

  genBtn.addEventListener('click', async () => {
    const promptVal = document.getElementById('prompt').value;
    const inferred = inferMood(promptVal);
    const moodSel = document.getElementById('mood');
    if (inferred) moodSel.value = inferred;
    const params = {
      mood: moodSel.value,
      bpm: parseInt(document.getElementById('bpm').value) || 110,
      bars: parseInt(document.getElementById('bars').value) || 4,
    };
    currentParams = params;
    currentEvents = generate(params);
    out.style.display = 'block';
    out.className = 'result ok';
    const inf = inferred ? `（已从提示词识别为「${moodSel.options[moodSel.selectedIndex].text}」）` : '';
    out.innerHTML = `已生成：<b>${moodSel.options[moodSel.selectedIndex].text}</b> · ${params.bpm} BPM · ${params.bars} 小节 ${inf}<br>旋律音符 ${currentEvents.melody.length} 个，和弦 ${currentEvents.chords.length} 段，鼓点 ${currentEvents.drums.length} 个。点击「停止」可随时结束。`;
    await play();
  });

  stopBtn.addEventListener('click', stopLive);
  dlBtn.addEventListener('click', exportWav);
})();

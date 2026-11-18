// Procedural WebAudio sounds: no audio files, everything is synthesized in the browser. The
// context is created on the first user gesture (browsers block sound before one) and stays
// silent until then; mute (M) silences the master gain.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenGain = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // Engine: a sawtooth through a lowpass, pitch and gain following speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: a sine whose pitch wobbles between two tones, gain by police distance.
      const sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      const sirenLfo = ctx.createOscillator();
      sirenLfo.type = 'square';
      sirenLfo.frequency.value = 0.55;
      const sirenLfoGain = ctx.createGain();
      sirenLfoGain.gain.value = 260;
      sirenLfo.connect(sirenLfoGain);
      sirenLfoGain.connect(sirenOsc.frequency);
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenLfo.start();
      return true;
    } catch {
      return false;
    }
  }

  /** One tone at an absolute time offset from now. */
  function tone(freq, delay, dur, type, vol) {
    if (!ctx || muted) return;
    const when = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.2, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(when);
    osc.stop(when + dur);
  }

  /** One burst of filtered noise (thuds and crashes). */
  function noise(dur, vol, filterFreq) {
    if (!ctx || muted) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 800;
    const gain = ctx.createGain();
    gain.gain.value = vol || 0.3;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  return {
    /** Call from a user gesture: creates the context and resumes it. */
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.5;
    },
    /** Every frame: engine hum follows the car's speed, silent on foot. */
    engine(speed, driving) {
      if (!ctx || muted) return;
      const ratio = Math.min(1, Math.abs(speed) / 540);
      engineGain.gain.setTargetAtTime(driving ? 0.04 + ratio * 0.11 : 0, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(50 + ratio * 150, ctx.currentTime, 0.1);
    },
    /** Every frame: siren fades in as the nearest police car closes in. */
    siren(nearestDist) {
      if (!ctx || muted) return;
      const target = nearestDist < 900 ? 0.06 * (1 - nearestDist / 900) : 0;
      sirenGain.gain.setTargetAtTime(target, ctx.currentTime, 0.2);
    },
    click() {
      tone(660, 0, 0.07, 'sine', 0.15);
    },
    pickup() {
      tone(880, 0, 0.1, 'sine', 0.2);
      tone(1318, 0.08, 0.14, 'sine', 0.2);
    },
    punch() {
      noise(0.12, 0.35, 500);
    },
    crash() {
      noise(0.25, 0.4, 900);
    },
    objective() {
      tone(523, 0, 0.12, 'triangle', 0.22);
      tone(659, 0.1, 0.12, 'triangle', 0.22);
      tone(784, 0.2, 0.2, 'triangle', 0.22);
    },
    missionDone() {
      tone(523, 0, 0.15, 'triangle', 0.22);
      tone(659, 0.12, 0.15, 'triangle', 0.22);
      tone(784, 0.24, 0.15, 'triangle', 0.22);
      tone(1046, 0.36, 0.3, 'triangle', 0.25);
    },
    busted() {
      tone(392, 0, 0.25, 'sawtooth', 0.18);
      tone(311, 0.22, 0.25, 'sawtooth', 0.18);
      tone(233, 0.44, 0.5, 'sawtooth', 0.18);
    },
  };
}

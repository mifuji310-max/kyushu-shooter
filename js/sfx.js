// 効果音（WebAudioで合成。音源ファイル不要・オフライン可）。
// 音量/ミュートは localStorage に保存。ブラウザの自動再生制限に対応するため、
// 最初のユーザー操作で init()/resume() を呼ぶこと。
const SFX = {
  ctx: null,
  master: null,
  enabled: true,
  volume: 0.6,
  _loaded: false,

  init() {
    if (!this._loaded) {
      const v = parseFloat(localStorage.getItem('kyushu_vol'));
      if (!isNaN(v)) this.volume = Math.max(0, Math.min(1, v));
      if (localStorage.getItem('kyushu_muted') === '1') this.enabled = false;
      this._loaded = true;
    }
    if (this.ctx) { this.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this._applyGain();
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
    this.resume();
  },

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    localStorage.setItem('kyushu_vol', String(this.volume));
    this._applyGain();
  },
  setMuted(m) {
    this.enabled = !m;
    localStorage.setItem('kyushu_muted', m ? '1' : '0');
    this._applyGain();
  },
  isMuted() { return !this.enabled; },
  _applyGain() { if (this.master) this.master.gain.value = this.enabled ? this.volume : 0; },

  // 単音（周波数スライド対応）
  _tone(freq, dur, opt) {
    opt = opt || {};
    if (!this.ctx || !this.enabled || this.volume <= 0) return;
    const t0 = this.ctx.currentTime + (opt.delay || 0);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = opt.type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (opt.slideTo) o.frequency.exponentialRampToValueAtTime(opt.slideTo, t0 + dur);
    const vol = opt.vol == null ? 0.3 : opt.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + (opt.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  },

  // ノイズ（爆発など）
  _noise(dur, opt) {
    opt = opt || {};
    if (!this.ctx || !this.enabled || this.volume <= 0) return;
    const t0 = this.ctx.currentTime + (opt.delay || 0);
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opt.lp || 2000;
    const g = this.ctx.createGain(); g.gain.value = opt.vol == null ? 0.3 : opt.vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
  },

  // ─ 効果音 ─
  shoot()      { this._tone(720, 0.07, { type: 'square', vol: 0.10, slideTo: 500 }); },
  explosion()  { this._noise(0.3, { vol: 0.28, lp: 1200 }); this._tone(140, 0.28, { type: 'sawtooth', vol: 0.16, slideTo: 45 }); },
  damage()     { this._tone(200, 0.25, { type: 'sawtooth', vol: 0.3, slideTo: 80 }); },
  powerup()    { [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.12, { type: 'triangle', vol: 0.22, delay: i * 0.06 })); },
  barrier()    { this._tone(400, 0.32, { type: 'sine', vol: 0.24, slideTo: 950 }); },
  bossWarn()   { for (let i = 0; i < 3; i++) this._tone(680, 0.16, { type: 'square', vol: 0.2, delay: i * 0.3 }); },
  bossDefeat() { this._noise(0.6, { vol: 0.36, lp: 1400 }); [420, 300, 200, 120].forEach((f, i) => this._tone(f, 0.24, { type: 'sawtooth', vol: 0.22, delay: i * 0.11 })); },
  clear()      { [523, 659, 784, 1047, 1319].forEach((f, i) => this._tone(f, 0.24, { type: 'triangle', vol: 0.26, delay: i * 0.12 })); },
  tick()       { this._tone(600, 0.05, { type: 'square', vol: 0.15 }); },
};

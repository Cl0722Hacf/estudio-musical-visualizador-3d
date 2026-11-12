import { DRUM_KEYS, TRACK_IDS, cutHz, semis, withBank, type DrumKey, type Project, type Timbre, type TrackId } from './model'

export type Samples = Partial<Record<DrumKey, AudioBuffer>>
const noiseBuf = (ctx: BaseAudioContext) => {
  const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return b
}
const impulse = (ctx: BaseAudioContext) => {
  const len = Math.floor(ctx.sampleRate * 2.4); const b = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) }
  return b
}
const driveCurve = (drive: number) => {
  const n = 1024; const c = new Float32Array(n); const k = drive * 40
  for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; c[i] = k === 0 ? x : ((1 + k) * x) / (1 + k * Math.abs(x)) }
  return c
}

// Cadena de mezcla + efectos + masterización + voces. Se usa en tiempo real y para exportar WAV (OfflineAudioContext).
type BassVoice = { o: OscillatorNode; f: BiquadFilterNode; g: GainNode; hz: number; end: number }
export class Rig {
  tracks = {} as Record<TrackId, GainNode>
  private bus: GainNode; private shaper: WaveShaperNode; private filter: BiquadFilterNode
  private dL: DelayNode; private dR: DelayNode; private fbL: GainNode; private fbR: GainNode; private dWet: GainNode
  private rWet: GainNode; private noise: AudioBuffer; private lastDrive = -1; private rt: boolean
  private boostG: GainNode; private comp: DynamicsCompressorNode
  private last: Partial<Record<'bass' | 'lead', { hz: number; t: number }>> = {}
  private ctx: BaseAudioContext
  private samples: Samples
  constructor(ctx: BaseAudioContext, dest: AudioNode, p: Project, samples: Samples = {}) {
    this.ctx = ctx; this.samples = samples
    this.rt = !(ctx instanceof OfflineAudioContext)
    this.noise = noiseBuf(ctx)
    this.bus = ctx.createGain(); this.shaper = ctx.createWaveShaper(); this.shaper.oversample = '2x'
    this.filter = ctx.createBiquadFilter()
    const master = ctx.createGain(); this.comp = ctx.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 4
    this.boostG = ctx.createGain()
    // Limitador / Maximizer maestro: umbral cercano a 0 dB, ratio alto y ataque rápido
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.09
    for (const t of TRACK_IDS) { this.tracks[t] = ctx.createGain(); this.tracks[t].connect(this.bus) }
    this.bus.connect(this.shaper); this.shaper.connect(this.filter)
    this.filter.connect(master)
    const dIn = ctx.createGain(); this.filter.connect(dIn)
    this.dL = ctx.createDelay(2); this.dR = ctx.createDelay(2); this.fbL = ctx.createGain(); this.fbR = ctx.createGain(); this.dWet = ctx.createGain()
    const pl = ctx.createStereoPanner(); pl.pan.value = -0.8; const pr = ctx.createStereoPanner(); pr.pan.value = 0.8
    dIn.connect(this.dL); this.dL.connect(pl); pl.connect(this.dWet)
    this.dL.connect(this.fbL); this.fbL.connect(this.dR); this.dR.connect(pr); pr.connect(this.dWet)
    this.dR.connect(this.fbR); this.fbR.connect(this.dL); this.dWet.connect(master)
    const conv = ctx.createConvolver(); conv.buffer = impulse(ctx); this.rWet = ctx.createGain()
    this.filter.connect(conv); conv.connect(this.rWet); this.rWet.connect(master)
    const mxPre = ctx.createGain(); this.mxPre = mxPre; const mxIn = ctx.createGain(); mxIn.gain.value = 0.5; const mxCeil = ctx.createWaveShaper(); const mxCv = new Float32Array(2049); for (let i = 0; i < 2049; i++) { const a = 2 * (i / 1024 - 1); const m = Math.abs(a); const y = m <= 0.8 ? m : 0.8 + 0.18 * Math.tanh((m - 0.8) / 0.18); mxCv[i] = Math.sign(a) * y } mxCeil.curve = mxCv; master.connect(mxPre); mxPre.connect(this.comp); this.comp.connect(this.boostG); this.boostG.connect(lim); lim.connect(mxIn); mxIn.connect(mxCeil); mxCeil.connect(dest)
    this.apply(p, true)
  }
  private set(prm: AudioParam, v: number, init: boolean) { if (this.rt && !init) prm.setTargetAtTime(v, this.ctx.currentTime, 0.02); else prm.value = v }
  apply(p: Project, init = false) {
    const f = p.fx
    this.filter.type = f.filterType
    this.set(this.filter.frequency, cutHz(f.cutoff), init); this.set(this.filter.Q, 0.1 + f.res * 16, init)
    if (f.drive !== this.lastDrive) { this.shaper.curve = driveCurve(f.drive); this.lastDrive = f.drive }
    const beat = 60 / p.bpm
    this.set(this.dL.delayTime, beat * 0.75, init); this.set(this.dR.delayTime, beat * 0.75, init)
    this.set(this.fbL.gain, f.delayFb * 0.8, init); this.set(this.fbR.gain, f.delayFb * 0.8, init)
    this.set(this.dWet.gain, f.delayMix * 0.9, init); this.set(this.rWet.gain, f.reverbMix * 1.4, init)
    { const bo = !!p.boost; if (this.mxPre) this.set(this.mxPre.gain, bo ? 1.6 : 1, init); this.set(this.boostG.gain, bo ? 1.25 : 1, init); this.set(this.comp.threshold, bo ? -6 : -14, init); this.set(this.comp.knee, bo ? 6 : 30, init); this.set(this.comp.ratio, bo ? 12 : 4, init); this.set(this.comp.attack, 0.003, init); this.set(this.comp.release, bo ? 0.15 : 0.25, init) }
    const solo = TRACK_IDS.some((t) => p.mixer[t].solo)
    for (const t of TRACK_IDS) { const m = p.mixer[t]; const on = solo ? m.solo : !m.mute; this.set(this.tracks[t].gain, on ? m.vol : 0, init) }
  }
  schedule(p: Project, step: number, t: number, stepDur: number) {
    for (const k of DRUM_KEYS) if (p.drums[k][step]) this.drum(k, t, p.vel[k][step])
    const b = p.bass[step]
    if (b >= 0) this.bassNote(p, t, b, stepDur * p.bassSynth.gate, p.vel.bass[step])
    const l = p.lead[step]
    if (l >= 0) {
      const v = p.vel.lead[step]
      if (p.leadMode === 'chord') [l, l + 2, l + 4].forEach((d, i) => this.leadNote(t, 220 * Math.pow(2, semis(d) / 12), stepDur * 1.6, p.leadTimbre, v * 0.6, 0, i === 0))
      else this.leadNote(t, 220 * Math.pow(2, semis(l) / 12), stepDur * 1.6, p.leadTimbre, v, p.glide.lead, true)
    }
  }
  // Portamento / glide: la nota resbala desde la anterior (si fue reciente)
  private slide(prm: AudioParam, t: number, hz: number, ms: number, tr: 'bass' | 'lead', scale = 1, record = true) {
    const last = this.last[tr]
    if (ms > 0 && last && t >= last.t && t - last.t < 1.5) { prm.setValueAtTime(last.hz * scale, t); prm.exponentialRampToValueAtTime(hz * scale, t + ms / 1000) }
    else prm.setValueAtTime(hz * scale, t)
    if (record) this.last[tr] = { hz, t }
  }
  private hit(out: AudioNode, vel: number) { const g = this.ctx.createGain(); g.gain.value = vel; g.connect(out); return g }
  drum(k: DrumKey, t: number, vel = 1) {
    const c = this.ctx; const out = this.hit(this.tracks[k], vel)
    const smp = this.samples[k]
    if (smp) { const s = c.createBufferSource(); s.buffer = smp; s.connect(out); s.start(t); return }
    if (k === 'kick') {
      const o = c.createOscillator(); const g = c.createGain()
      o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14)
      g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.38)
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.4)
    } else if (k === 'snare') {
      this.noiseHit(out, t, 0.18, 1800, 'highpass', 0.6)
      const o = c.createOscillator(); const g = c.createGain(); o.type = 'triangle'
      o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.1)
      g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.14)
    } else if (k === 'clap') { for (let i = 0; i < 3; i++) this.noiseHit(out, t + i * 0.012, 0.09, 1200, 'bandpass', 0.45) }
    else if (k === 'hat') this.noiseHit(out, t, 0.05, 7000, 'highpass', 0.3)
    else this.noiseHit(out, t, 0.28, 7000, 'highpass', 0.28)
  }
  private noiseHit(out: AudioNode, t: number, dur: number, freq: number, type: BiquadFilterType, vol: number) {
    const c = this.ctx; const s = c.createBufferSource(); s.buffer = this.noise
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    s.connect(f).connect(g).connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02)
  }
  private mxPre: GainNode | null = null
  private bv: BassVoice | null = null
  // Bajo 100% monofónico: una sola voz; cada nota nueva silencia la anterior o (con Glide) reutiliza el mismo oscilador y resbala con rampa exponencial
  bassNote(p: Project, t: number, deg: number, dur: number, vel = 1) {
    const c = this.ctx; const s = p.bassSynth; const hz = 55 * Math.pow(2, semis(deg) / 12)
    const gl = p.glide.bass
    const hold = (prm: AudioParam, at: number, val: number) => {
      if (typeof prm.cancelAndHoldAtTime === 'function') prm.cancelAndHoldAtTime(at)
      else { prm.cancelScheduledValues(at); prm.setValueAtTime(val, at) }
    }
    const old = this.bv
    const legato = !!old && gl > 0 && old.end > 0 && t <= old.end + 0.5
    let v: BassVoice
    if (old && legato) v = old
    else {
      if (old) { hold(old.g.gain, Math.max(0, t - 0.006), 0.0001); old.g.gain.linearRampToValueAtTime(0.0001, Math.max(t, 0.001)); old.o.stop(t + 0.03) }
      const o = c.createOscillator(); const f = c.createBiquadFilter(); const g = c.createGain()
      f.type = 'lowpass'; f.Q.value = 6; g.gain.value = 0.0001; o.frequency.value = hz
      o.connect(f).connect(g).connect(this.tracks.bass); o.start(Math.max(0, t - 0.02))
      v = { o, f, g, hz, end: 0 }
    }
    this.bv = v
    v.o.type = s.wave
    const fq = v.o.frequency
    if (legato) { hold(fq, t, v.hz); fq.exponentialRampToValueAtTime(hz, t + Math.max(0.01, gl / 1000)) }
    else { fq.cancelScheduledValues(t); fq.setValueAtTime(hz, t) }
    const ff = v.f.frequency
    hold(ff, t, s.cutoff * 2.5); ff.linearRampToValueAtTime(s.cutoff * 2.5, t + 0.012)
    ff.exponentialRampToValueAtTime(Math.max(120, s.cutoff * 0.5), t + Math.max(0.08, dur))
    const gp = v.g.gain
    hold(gp, t, 0.0001); gp.linearRampToValueAtTime(0.55 * vel, t + 0.012)
    gp.setValueAtTime(0.55 * vel, t + Math.max(0.02, dur * 0.7)); gp.exponentialRampToValueAtTime(0.0001, t + dur + 0.08)
    v.hz = hz; v.end = t + dur + 0.08; v.o.stop(v.end + 0.6)
  }
  leadNote(t: number, hz: number, dur: number, timbre: Timbre, vel = 1, glide = 0, record = true) {
    const c = this.ctx; const out = this.tracks.lead; const g = c.createGain()
    if (timbre === 'fm') {
      const car = c.createOscillator(); const mod = c.createOscillator(); const mg = c.createGain()
      this.slide(car.frequency, t, hz, glide, 'lead', 1, false); this.slide(mod.frequency, t, hz, glide, 'lead', 2, record)
      mg.gain.setValueAtTime(hz * 3, t); mg.gain.exponentialRampToValueAtTime(1, t + 0.3)
      mod.connect(mg).connect(car.frequency)
      g.gain.setValueAtTime(0.4 * vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + Math.max(0.3, dur))
      car.connect(g).connect(out); car.start(t); mod.start(t); car.stop(t + dur + 0.2); mod.stop(t + dur + 0.2)
    } else if (timbre === 'sub') {
      const o = c.createOscillator(); const o2 = c.createOscillator(); o.type = 'sine'; o2.type = 'triangle'
      this.slide(o.frequency, t, hz, glide, 'lead', 0.5, false); this.slide(o2.frequency, t, hz, glide, 'lead', 0.5, record)
      const g2 = c.createGain(); g2.gain.value = 0.35
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5 * vel, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1)
      o.connect(g); o2.connect(g2).connect(g); g.connect(out); o.start(t); o2.start(t); o.stop(t + dur + 0.15); o2.stop(t + dur + 0.15)
    } else {
      const o = c.createOscillator(); o.type = timbre; this.slide(o.frequency, t, hz, glide, 'lead', 1, record)
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(700, t + dur)
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.22 * vel, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1)
      o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.15)
    }
  }
}

export class Engine {
  ctx: AudioContext | null = null
  rig: Rig | null = null
  recDest: MediaStreamAudioDestinationNode | null = null
  samples: Samples = {}
  project!: Project
  playing = false
  notesPlayed = 0
  songPos = 0
  onStep: (s: number) => void = () => {}
  onSong: (pos: number, bank: number) => void = () => {}
  private analyser!: AnalyserNode; private freq = new Uint8Array(1024); private wave = new Uint8Array(2048); private volume = 0.8
  private step = 0; private next = 0; private timer = 0; private raf = 0; private vol: GainNode | null = null
  private queue: { s: number; t: number; bank: number; pos: number }[] = []
  private fileGain: GainNode | null = null; private mediaSrc: MediaElementAudioSourceNode | null = null; private mediaEl: HTMLMediaElement | null = null
  private micSrc: MediaStreamAudioSourceNode | null = null; private micStream: MediaStream | null = null; private micMon: GainNode | null = null; private micGain: GainNode | null = null
  private recMix: GainNode | null = null

  init() {
    if (this.ctx) return
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AC(); this.ctx = ctx
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = 0.6
    this.freq = new Uint8Array(this.analyser.frequencyBinCount); this.wave = new Uint8Array(this.analyser.fftSize)
    const out = ctx.createGain(); const vol = ctx.createGain(); vol.gain.value = this.volume; this.vol = vol
    this.rig = new Rig(ctx, out, this.project, this.samples)
    out.connect(this.analyser); out.connect(vol); vol.connect(ctx.destination)
    this.recMix = ctx.createGain(); vol.connect(this.recMix)
    this.recDest = ctx.createMediaStreamDestination(); this.recMix.connect(this.recDest)
    this.fileGain = ctx.createGain(); this.fileGain.connect(vol); this.fileGain.connect(this.analyser)
  }
  apply() { this.rig?.apply(this.project) }
  async setSample(k: DrumKey, buf: ArrayBuffer | null) {
    if (!buf) { delete this.samples[k]; return }
    this.init(); this.samples[k] = await this.ctx!.decodeAudioData(buf.slice(0))
  }
  // Fuente externa 1: reproductor de archivos (mp3/wav/ogg)
  attachMedia(el: HTMLMediaElement) {
    this.init()
    if (this.mediaEl === el) return
    this.mediaEl = el; this.mediaSrc = this.ctx!.createMediaElementSource(el); this.mediaSrc.connect(this.fileGain!)
    void this.ctx!.resume()
  }
  // Fuente externa 2: micrófono / línea en vivo. El monitoreo (oírlo) es opcional para evitar acoples.
  async startMic(monitor: boolean) {
    this.init(); await this.ctx!.resume()
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
    this.micStream = stream; this.micSrc = this.ctx!.createMediaStreamSource(stream)
    this.micGain = this.ctx!.createGain(); this.micMon = this.ctx!.createGain(); this.micMon.gain.value = monitor ? 1 : 0
    this.micSrc.connect(this.micGain); this.micGain.connect(this.analyser); this.micGain.connect(this.recMix!); this.micGain.connect(this.micMon); this.micMon.connect(this.vol!)
  }
  setMicMonitor(on: boolean) { if (this.micMon) this.micMon.gain.value = on ? 1 : 0 }
  stopMic() { this.micStream?.getTracks().forEach((t) => t.stop()); this.micSrc?.disconnect(); this.micGain?.disconnect(); this.micMon?.disconnect(); this.micStream = null; this.micSrc = null }

  async play() {
    this.init(); await this.ctx!.resume()
    if (this.playing) return
    this.playing = true; this.step = 0; this.songPos = 0; this.next = this.ctx!.currentTime + 0.08
    this.timer = window.setInterval(() => this.tick(), 25)
    let lastPos = -1
    const loop = () => {
      if (!this.playing) return
      const now = this.ctx!.currentTime
      while (this.queue.length && this.queue[0].t <= now) {
        const q = this.queue.shift()!; this.onStep(q.s)
        if (q.pos !== lastPos) { lastPos = q.pos; this.onSong(q.pos, q.bank) }
      }
      this.raf = requestAnimationFrame(loop)
    }
    loop()
  }
  pause() { this.playing = false; window.clearInterval(this.timer); cancelAnimationFrame(this.raf); this.queue = []; this.onStep(-1) }
  setVolume(v: number) { this.volume = v; if (this.vol && this.ctx) this.vol.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02) }
  private tick() {
    const c = this.ctx!; const p = this.project; const dur = 60 / p.bpm / 4
    while (this.next < c.currentTime + 0.12) {
      const pos = p.songMode ? this.songPos % p.song.length : 0
      const bank = p.songMode ? p.song[pos] : p.bank
      const at = this.next + (this.step % 2 ? p.swing * dur * 0.6 : 0)
      this.rig!.schedule(withBank(p, bank), this.step, at, dur)
      this.queue.push({ s: this.step, t: at, bank, pos })
      this.next += dur; this.step++
      if (this.step >= p.steps) { this.step = 0; if (p.songMode) this.songPos = (this.songPos + 1) % p.song.length }
    }
  }
  audition(track: TrackId, deg = 0) {
    this.init(); void this.ctx!.resume(); const t = this.ctx!.currentTime + 0.01; const r = this.rig!
    if (track === 'bass') r.bassNote(this.project, t, deg, 0.3)
    else if (track === 'lead') r.leadNote(t, 220 * Math.pow(2, semis(deg) / 12), 0.3, this.project.leadTimbre)
    else r.drum(track, t)
  }
  playNote(n: number) {
    this.init(); void this.ctx!.resume(); this.notesPlayed++
    this.rig!.leadNote(this.ctx!.currentTime + 0.005, 261.63 * Math.pow(2, n / 12), 0.45, this.project.leadTimbre)
  }
  getBands() {
    if (!this.ctx) return { bass: 0, mid: 0, treble: 0, level: 0 }
    this.analyser.getByteFrequencyData(this.freq)
    const hz = this.ctx.sampleRate / this.analyser.fftSize
    const avg = (lo: number, hi: number) => { const a = Math.max(1, Math.floor(lo / hz)); const b = Math.max(a + 1, Math.floor(hi / hz)); let s = 0; for (let i = a; i < b; i++) s += this.freq[i]; return s / (b - a) / 255 }
    const bass = Math.min(1, avg(30, 180) * 1.25); const mid = Math.min(1, avg(180, 4000) * 1.6); const treble = Math.min(1, avg(4000, 14000) * 3)
    return { bass, mid, treble, level: (bass + mid + treble) / 3 }
  }
  getSpectrum() { return this.freq }
  // Osciloscopio y medidor de picos (dBFS) tomados del mismo AnalyserNode
  getWave() { if (this.ctx) this.analyser.getByteTimeDomainData(this.wave); else this.wave.fill(128); return this.wave }
  getPeakDb() { let m = 0; for (let i = 0; i < this.wave.length; i++) { const v = Math.abs(this.wave[i] - 128) / 128; if (v > m) m = v } return m <= 0.0001 ? -90 : 20 * Math.log10(m) }
}

function encodeWav(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels; const n = buf.length; const out = new DataView(new ArrayBuffer(44 + n * ch * 2))
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true)
  out.setUint16(22, ch, true); out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true)
  w(36, 'data'); out.setUint32(40, n * ch * 2, true)
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c)); let o = 44
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, data[c][i])); out.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2 }
  return new Blob([out], { type: 'audio/wav' })
}

// Renderiza la canción completa (si el modo canción está activo) o el patrón activo, con mezcla, efectos y limitador → WAV 16 bits / 44.1 kHz
export async function renderWav(p: Project, samples: Samples = {}): Promise<Blob> {
  const sr = 44100; const dur = 60 / p.bpm / 4; const seq = p.songMode ? p.song : [p.bank]
  const loop = seq.length * p.steps * dur + dur; const tail = 2.5
  const ctx = new OfflineAudioContext(2, Math.ceil((loop + tail) * sr), sr)
  const rig = new Rig(ctx, ctx.destination, p, samples)
  seq.forEach((bi, bk) => { const q = withBank(p, bi); for (let s = 0; s < p.steps; s++) rig.schedule(q, s, 0.05 + (bk * p.steps + s) * dur + (s % 2 ? p.swing * dur * 0.6 : 0), dur) })
  return encodeWav(await ctx.startRendering())
}

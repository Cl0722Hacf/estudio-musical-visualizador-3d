export type DrumKey = 'kick' | 'snare' | 'clap' | 'hat' | 'ohat'
export type TrackId = DrumKey | 'bass' | 'lead'
export const DRUM_KEYS: DrumKey[] = ['kick', 'snare', 'clap', 'hat', 'ohat']
export const TRACK_IDS: TrackId[] = [...DRUM_KEYS, 'bass', 'lead']
export const LABELS: Record<TrackId, string> = { kick: 'Bombo', snare: 'Caja', clap: 'Palmas / Perc', hat: 'Hi-hat', ohat: 'Hi-hat abierto', bass: 'Bajo', lead: 'Lead / Requinto / Acordes' }
export type Wave = 'sawtooth' | 'square' | 'sine' | 'triangle'
export type Timbre = 'sawtooth' | 'square' | 'fm' | 'sub'
export const TIMBRES: { id: Timbre; label: string }[] = [
  { id: 'sawtooth', label: 'Sawtooth' }, { id: 'square', label: 'Square' }, { id: 'fm', label: 'FM Pluck' }, { id: 'sub', label: 'Sub Bass' },
]
export interface Mix { vol: number; mute: boolean; solo: boolean }
export interface Fx { filterType: 'lowpass' | 'highpass'; cutoff: number; res: number; delayMix: number; delayFb: number; reverbMix: number; drive: number }
export interface Look { aspect: number; artist: string; title: string; font: number; pos: number; spec: number; shake: number; flash: number }
export interface Bank { drums: Record<DrumKey, boolean[]>; bass: number[]; lead: number[]; vel: Record<TrackId, number[]> }
export interface Project {
  name: string; bpm: number; steps: 16 | 32; swing: number
  drums: Record<DrumKey, boolean[]>; bass: number[]; lead: number[]; vel: Record<TrackId, number[]>
  bank: number; banks: Bank[]; song: number[]; songMode: boolean
  glide: { bass: number; lead: number }; boost: boolean
  leadTimbre: Timbre; leadMode: 'lead' | 'chord'
  bassSynth: { wave: Wave; cutoff: number; gate: number }
  mixer: Record<TrackId, Mix>; fx: Fx; look: Look; scene: number; palette: number
}
export const SCENES = ['Núcleo Orbital', 'Túnel Cibernético', 'Singularidad Cósmica', 'Terreno Espectral']
export const PALETTES = [
  { name: 'Neón Cyberpunk', c: [0xff2bd6, 0x20e0ff, 0x8844ff], bg: 0x06040d },
  { name: 'Dorado Bélico', c: [0xffb300, 0xff6a00, 0xfff1b8], bg: 0x0b0702 },
  { name: 'Fuego Carmesí', c: [0xff1a3c, 0xff6a3d, 0x9a0020], bg: 0x0b0305 },
  { name: 'Hielo Ártico', c: [0x7fe3ff, 0xbfefff, 0x3b7bff], bg: 0x030811 },
]
export const ASPECTS = [
  { name: 'Horizontal 16:9 (YouTube)', r: 16 / 9, w: 1920, h: 1080 },
  { name: 'Vertical 9:16 (TikTok / Reels / Shorts)', r: 9 / 16, w: 1080, h: 1920 },
  { name: 'Cuadrado 1:1 (Portada)', r: 1, w: 1080, h: 1080 },
]
export const FONTS = [
  { name: 'Moderna', css: 'system-ui, Segoe UI, sans-serif' }, { name: 'Elegante', css: 'Georgia, serif' },
  { name: 'Mono', css: 'Courier New, monospace' }, { name: 'Impacto', css: 'Impact, Haettenschweiler, sans-serif' },
]
export const POSITIONS = ['Arriba', 'Centro', 'Abajo']
export const SPECS = ['Sin espectro', 'Barras 2D', 'Barras 3D']
export const BANK_LETTERS = ['A', 'B', 'C', 'D']
export const BANK_NAMES = ['Intro', 'Verso', 'Coro / Drop', 'Outro']
export const semis = (d: number) => [0, 3, 5, 7, 10][d % 5] + 12 * Math.floor(d / 5)
const CH = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const noteLabel = (track: 'bass' | 'lead', d: number) => { const a = (track === 'bass' ? 21 : 45) + semis(d); return CH[a % 12] + Math.floor(a / 12) }
export const cutHz = (c: number) => 40 * Math.pow(450, c)
const clamp = (v: unknown, a: number, b: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : d }
const z = (n = 32) => Array<boolean>(n).fill(false)
const MIXDEF: Record<TrackId, number> = { kick: 0.9, snare: 0.8, clap: 0.6, hat: 0.5, ohat: 0.45, bass: 0.85, lead: 0.6 }
const velDefault = () => { const v = {} as Record<TrackId, number[]>; for (const t of TRACK_IDS) v[t] = Array<number>(32).fill(1); return v }
const emptyDrums = () => ({ kick: z(), snare: z(), clap: z(), hat: z(), ohat: z() })
export const emptyBank = (): Bank => ({ drums: emptyDrums(), bass: Array(32).fill(-1), lead: Array(32).fill(-1), vel: velDefault() })

export function defaultProject(): Project {
  const mixer = {} as Record<TrackId, Mix>
  for (const t of TRACK_IDS) mixer[t] = { vol: MIXDEF[t], mute: false, solo: false }
  const b = emptyBank()
  return {
    name: 'Nuevo ritmo', bpm: 120, steps: 16, swing: 0,
    drums: b.drums, bass: b.bass, lead: b.lead, vel: b.vel, bank: 0, banks: [b, emptyBank(), emptyBank(), emptyBank()], song: [0], songMode: false,
    glide: { bass: 0, lead: 0 }, boost: false,
    leadTimbre: 'sawtooth', leadMode: 'lead', bassSynth: { wave: 'sawtooth', cutoff: 1000, gate: 0.8 }, mixer,
    fx: { filterType: 'lowpass', cutoff: 1, res: 0.1, delayMix: 0, delayFb: 0.35, reverbMix: 0.12, drive: 0 },
    look: { aspect: 0, artist: '', title: '', font: 0, pos: 2, spec: 1, shake: 0, flash: 0 },
    scene: 0, palette: 0,
  }
}

// ---- Bancos de patrones (A-D): el patrón activo vive en drums/bass/lead/vel ----
export const commit = (p: Project): Project => ({ ...p, banks: p.banks.map((b, i) => (i === p.bank ? { drums: p.drums, bass: p.bass, lead: p.lead, vel: p.vel } : b)) })
export const withBank = (p: Project, i: number): Project => (i === p.bank ? p : { ...p, bank: i, drums: p.banks[i].drums, bass: p.banks[i].bass, lead: p.banks[i].lead, vel: p.banks[i].vel })
export function switchBank(p: Project, i: number): Project { const c = commit(p); const b = c.banks[i]; return { ...c, bank: i, drums: b.drums, bass: b.bass, lead: b.lead, vel: b.vel } }
export function copyBank(p: Project, to: number): Project {
  const c = commit(p); const s = c.banks[c.bank]; const banks = c.banks.slice()
  banks[to] = { drums: Object.fromEntries(DRUM_KEYS.map((k) => [k, s.drums[k].slice()])) as Bank['drums'], bass: s.bass.slice(), lead: s.lead.slice(), vel: Object.fromEntries(TRACK_IDS.map((t) => [t, s.vel[t].slice()])) as Bank['vel'] }
  return { ...c, banks }
}
export const songSteps = (p: Project) => (p.songMode ? p.song.length : 1) * p.steps

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalize(raw: any): Project {
  const d = defaultProject()
  if (!raw || typeof raw !== 'object') return d
  const rep = <T,>(a: unknown, fill: T, f: (x: unknown) => T): T[] => Array.from({ length: 32 }, (_, i) => (Array.isArray(a) && a.length ? f(a[i % a.length]) : fill))
  const deg = (x: unknown) => { const n = Math.round(Number(x)); return n >= 0 && n <= 7 ? n : -1 }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nb = (s: any): Bank => {
    const src = s && typeof s === 'object' ? s : {}; const dr = src.drums || src.tracks || {}
    const drums = {} as Record<DrumKey, boolean[]>; for (const k of DRUM_KEYS) drums[k] = rep(dr[k], false, Boolean)
    const vel = {} as Record<TrackId, number[]>; for (const t of TRACK_IDS) vel[t] = rep(src.vel && src.vel[t], 1, (x) => clamp(x, 0.1, 1, 1))
    return { drums, bass: rep(src.bass, -1, deg), lead: rep(src.lead, -1, deg), vel }
  }
  const w = nb(raw)
  const bank = Math.round(clamp(raw.bank, 0, 3, 0))
  const banks = Array.isArray(raw.banks) && raw.banks.length === 4 ? raw.banks.map(nb) : [w, emptyBank(), emptyBank(), emptyBank()]
  if (!(Array.isArray(raw.banks) && raw.banks.length === 4)) banks[0] = w
  const bs = raw.bassSynth || raw.synth || {}
  const mixer = {} as Record<TrackId, Mix>
  for (const t of TRACK_IDS) { const m = (raw.mixer && raw.mixer[t]) || {}; mixer[t] = { vol: clamp(m.vol, 0, 1, d.mixer[t].vol), mute: !!m.mute, solo: !!m.solo } }
  const fx = raw.fx || {}; const lk = raw.look || {}; const gl = raw.glide || {}
  const song = Array.isArray(raw.song) ? raw.song.map((x: unknown) => Math.round(clamp(x, 0, 3, 0))).slice(0, 32) : []
  return {
    name: String(raw.name || d.name).slice(0, 40), bpm: Math.round(clamp(raw.bpm, 40, 220, 120)), steps: Number(raw.steps) === 32 ? 32 : 16, swing: clamp(raw.swing, 0, 0.6, 0),
    drums: w.drums, bass: w.bass, lead: w.lead, vel: w.vel, bank, banks, song: song.length ? song : [0], songMode: !!raw.songMode,
    glide: { bass: clamp(gl.bass, 0, 500, 0), lead: clamp(gl.lead, 0, 500, 0) }, boost: !!raw.boost,
    leadTimbre: (['sawtooth', 'square', 'fm', 'sub'] as Timbre[]).includes(raw.leadTimbre) ? raw.leadTimbre : 'sawtooth', leadMode: raw.leadMode === 'chord' ? 'chord' : 'lead',
    bassSynth: { wave: (['sawtooth', 'square', 'sine', 'triangle'] as Wave[]).includes(bs.wave) ? bs.wave : 'sawtooth', cutoff: clamp(bs.cutoff, 150, 6000, 1000), gate: clamp(bs.gate, 0.2, 8, 0.8) },
    mixer,
    fx: { filterType: fx.filterType === 'highpass' ? 'highpass' : 'lowpass', cutoff: clamp(fx.cutoff, 0, 1, 1), res: clamp(fx.res, 0, 1, 0.1), delayMix: clamp(fx.delayMix, 0, 1, 0), delayFb: clamp(fx.delayFb, 0, 0.95, 0.35), reverbMix: clamp(fx.reverbMix, 0, 1, 0.12), drive: clamp(fx.drive, 0, 1, 0) },
    look: { aspect: Math.round(clamp(lk.aspect, 0, 2, 0)), artist: String(lk.artist || '').slice(0, 60), title: String(lk.title || '').slice(0, 60), font: Math.round(clamp(lk.font, 0, 3, 0)), pos: Math.round(clamp(lk.pos, 0, 2, 2)), spec: Math.round(clamp(lk.spec, 0, 2, 1)), shake: clamp(lk.shake, 0, 1, 0), flash: clamp(lk.flash, 0, 1, 0) },
    scene: Math.round(clamp(raw.scene, 0, 3, 0)), palette: Math.round(clamp(raw.palette, 0, 3, 0)),
  }
}

// ---- Enlaces compartibles (hash de la URL) ----
const bits = (a: boolean[]) => a.map((x) => (x ? '1' : '0')).join('')
const digs = (a: number[]) => a.map((x) => (x < 0 ? '.' : String(x))).join('')
const vels = (a: number[]) => a.map((x) => String(Math.round(x * 9))).join('')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const packBank = (b: Bank): any => ({ drums: Object.fromEntries(DRUM_KEYS.map((k) => [k, bits(b.drums[k])])), bass: digs(b.bass), lead: digs(b.lead), vel: Object.fromEntries(TRACK_IDS.map((t) => [t, vels(b.vel[t])])) })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const unpackBank = (o: any): any => {
  if (!o || typeof o !== 'object') return o
  for (const k of DRUM_KEYS) if (typeof o.drums?.[k] === 'string') o.drums[k] = [...o.drums[k]].map((c: string) => c === '1')
  for (const k of ['bass', 'lead']) if (typeof o[k] === 'string') o[k] = [...o[k]].map((c: string) => (c === '.' ? -1 : Number(c)))
  if (o.vel) for (const t of TRACK_IDS) if (typeof o.vel[t] === 'string') o.vel[t] = [...o.vel[t]].map((c: string) => Math.max(0.1, Number(c) / 9))
  return o
}
export function encodeShare(p: Project): string {
  const c = commit(p); const o = { ...c, ...packBank(c), banks: c.banks.map(packBank) }
  const bin = Array.from(new TextEncoder().encode(JSON.stringify(o)), (b) => String.fromCharCode(b)).join('')
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export function decodeShare(s: string): Project | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
    const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))))
    unpackBank(o); if (Array.isArray(o.banks)) o.banks.forEach(unpackBank)
    return normalize(o)
  } catch { return null }
}

// ---- Generador de beats coherente ----
export function generateBeat(p: Project): Project {
  const r = Math.random
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)]
  const style = pick(['four', 'break', 'half'] as const)
  const drums = { kick: z(), snare: z(), clap: z(), hat: z(), ohat: z() }
  const bass = Array<number>(32).fill(-1)
  const lead = Array<number>(32).fill(-1)
  for (let s = 0; s < 32; s++) {
    const b = s % 16
    if (style === 'four') {
      if (b % 4 === 0) drums.kick[s] = true
      if (b === 4 || b === 12) { drums.snare[s] = true; drums.clap[s] = r() < 0.7 }
      if (b % 2 === 0) drums.hat[s] = true
      if (b % 4 === 2) drums.ohat[s] = r() < 0.6
    } else if (style === 'break') {
      if (b === 0 || b === 10 || ((b === 7 || b === 14) && r() < 0.4)) drums.kick[s] = true
      if (b === 4 || b === 12) drums.snare[s] = true
      if (b % 2 === 0) drums.hat[s] = true
      if (b % 2 === 1 && r() < 0.18) drums.hat[s] = true
      if (b === 15) drums.ohat[s] = r() < 0.5
    } else {
      if (b === 0 || b === 6 || (b === 10 && r() < 0.6)) drums.kick[s] = true
      if (s % 32 === 8 || s % 32 === 24) { drums.snare[s] = true; drums.clap[s] = true }
      if (b % 2 === 0 || r() < 0.3) drums.hat[s] = true
    }
  }
  for (let s = 0; s < 32; s++) {
    const b = s % 16
    const hit = drums.kick[s] ? r() < 0.85 : style !== 'half' && b % 4 === 2 && r() < 0.35
    if (hit && (s === 0 || bass[s - 1] < 0)) bass[s] = pick([0, 0, 0, 2, 3, 4, 5])
  }
  const bar: number[] = Array<number>(16).fill(-1)
  for (const pos of [0, 2, 4, 6, 8, 10, 12, 14].filter(() => r() < 0.45)) bar[pos] = pick([2, 3, 4, 5, 7, 4])
  for (let s = 0; s < 32; s++) lead[s] = s < 16 ? bar[s] : r() < 0.3 && bar[s - 16] >= 0 ? pick([2, 3, 4, 5, 7]) : bar[s - 16]
  const bpm = style === 'four' ? 120 + Math.floor(r() * 19) : style === 'break' ? 96 + Math.floor(r() * 17) : 130 + Math.floor(r() * 19)
  return { ...p, name: 'Beat aleatorio', bpm, drums, bass, lead, vel: velDefault(), leadMode: r() < 0.4 ? 'chord' : 'lead', swing: style === 'break' ? 0.15 : 0 }
}

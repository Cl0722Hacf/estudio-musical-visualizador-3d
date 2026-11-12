import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.resolve(process.cwd(), 'data')
const FACTORY_FILE = path.join(DATA_DIR, 'presets.json')
const USER_FILE = path.join(DATA_DIR, 'user-rhythms.json')
const DRUMS = ['kick', 'snare', 'clap', 'hat', 'ohat']
const TRACKS = [...DRUMS, 'bass', 'lead']
const MIXDEF = { kick: 0.9, snare: 0.8, clap: 0.6, hat: 0.5, ohat: 0.45, bass: 0.85, lead: 0.6 }
const clamp = (v, a, b, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : d }
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback } }
const writeJson = (file, data) => { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n') }
export const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'ritmo'
const rep = (a, fill, f) => Array.from({ length: 32 }, (_, i) => (Array.isArray(a) && a.length ? f(a[i % a.length]) : fill))
const degS = (n) => { const v = Math.round(Number(n)); return v >= 0 && v <= 7 ? v : -1 }
// Normaliza un banco de patrón (batería, bajo, lead y velocidad por paso)
const normBank = (b) => {
  const src = b && typeof b === 'object' ? b : {}; const dr = src.drums || src.tracks || {}
  const drums = {}; for (const k of DRUMS) drums[k] = rep(dr[k], false, Boolean)
  const vel = {}; for (const t of TRACKS) vel[t] = rep(src.vel && src.vel[t], 1, (x) => clamp(x, 0.1, 1, 1))
  return { drums, bass: rep(src.bass, -1, degS), lead: rep(src.lead, -1, degS), vel }
}

// Valida y normaliza un proyecto (acepta el formato anterior de 16 pasos)
export function validate(b) {
  if (!b || typeof b !== 'object') return { error: 'Cuerpo JSON invalido' }
  const name = String(b.name || '').trim().slice(0, 40)
  if (!name) return { error: 'El ritmo necesita un nombre' }
  const bpm = Math.round(Number(b.bpm))
  if (!(bpm >= 40 && bpm <= 220)) return { error: 'El BPM debe estar entre 40 y 220' }
  const src = b.drums || b.tracks
  if (!src || typeof src !== 'object') return { error: 'Faltan las pistas de bateria (drums)' }
  const drums = {}
  for (const k of DRUMS) {
    if (!Array.isArray(src[k]) || ![16, 32].includes(src[k].length)) return { error: 'drums.' + k + ' debe tener 16 o 32 pasos' }
    drums[k] = rep(src[k], false, Boolean)
  }
  const deg = (n) => { const v = Math.round(Number(n)); return v >= 0 && v <= 7 ? v : -1 }
  if (!Array.isArray(b.bass) || ![16, 32].includes(b.bass.length)) return { error: 'bass debe tener 16 o 32 pasos' }
  const s = b.bassSynth || b.synth || {}
  const mixer = {}
  for (const t of TRACKS) { const m = (b.mixer && b.mixer[t]) || {}; mixer[t] = { vol: clamp(m.vol, 0, 1, MIXDEF[t]), mute: !!m.mute, solo: !!m.solo } }
  const f = b.fx || {}
  const w = normBank({ ...b, drums })
  const hasBanks = Array.isArray(b.banks) && b.banks.length === 4
  const banks = hasBanks ? b.banks.map(normBank) : [w, normBank({}), normBank({}), normBank({})]
  if (!hasBanks) banks[0] = w
  const song = Array.isArray(b.song) ? b.song.map((x) => Math.round(clamp(x, 0, 3, 0))).slice(0, 32) : []
  const gl = b.glide || {}; const lk = b.look || {}
  return {
    value: {
      name, bpm, steps: Number(b.steps) === 32 ? 32 : 16, swing: clamp(b.swing, 0, 0.6, 0),
      drums, bass: rep(b.bass, -1, deg), lead: rep(b.lead, -1, deg), vel: w.vel,
      bank: Math.round(clamp(b.bank, 0, 3, 0)), banks, song: song.length ? song : [0], songMode: !!b.songMode,
      glide: { bass: clamp(gl.bass, 0, 500, 0), lead: clamp(gl.lead, 0, 500, 0) }, boost: !!b.boost,
      look: { aspect: Math.round(clamp(lk.aspect, 0, 2, 0)), artist: String(lk.artist || '').slice(0, 60), title: String(lk.title || '').slice(0, 60), font: Math.round(clamp(lk.font, 0, 3, 0)), pos: Math.round(clamp(lk.pos, 0, 2, 2)), spec: Math.round(clamp(lk.spec, 0, 2, 1)), shake: clamp(lk.shake, 0, 1, 0), flash: clamp(lk.flash, 0, 1, 0) },
      leadTimbre: ['sawtooth', 'square', 'fm', 'sub'].includes(b.leadTimbre) ? b.leadTimbre : 'sawtooth', leadMode: b.leadMode === 'chord' ? 'chord' : 'lead',
      bassSynth: { wave: ['sawtooth', 'square', 'sine', 'triangle'].includes(s.wave) ? s.wave : 'sawtooth', cutoff: clamp(s.cutoff, 150, 6000, 1000), gate: clamp(s.gate, 0.2, 8, 0.8) },
      mixer,
      fx: { filterType: f.filterType === 'highpass' ? 'highpass' : 'lowpass', cutoff: clamp(f.cutoff, 0, 1, 1), res: clamp(f.res, 0, 1, 0.1), delayMix: clamp(f.delayMix, 0, 1, 0), delayFb: clamp(f.delayFb, 0, 0.95, 0.35), reverbMix: clamp(f.reverbMix, 0, 1, 0.12), drive: clamp(f.drive, 0, 1, 0) },
      scene: Math.round(clamp(b.scene, 0, 3, 0)), palette: Math.round(clamp(b.palette, 0, 3, 0)),
    },
  }
}

const all = () => [
  ...readJson(FACTORY_FILE, []).map((r) => ({ ...r, source: 'factory' })),
  ...readJson(USER_FILE, []).map((r) => ({ ...r, source: 'user' })),
]

function send(res, code, obj) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(obj))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = ''
    req.on('data', (c) => { d += c; if (d.length > 300000) { reject(new Error('Cuerpo demasiado grande')); req.destroy() } })
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}) } catch { reject(new Error('JSON invalido')) } })
    req.on('error', reject)
  })
}

// API REST: GET /api/rhythms, GET /api/rhythms/:id, POST /api/rhythms, DELETE /api/rhythms/:id
export function createApiMiddleware() {
  return async (req, res, next) => {
    try {
      const url = new URL(req.url, 'http://local')
      const parts = url.pathname.split('/').filter(Boolean)
      if (parts[0] === 'api') parts.shift()
      if (parts[0] !== 'rhythms') return next ? next() : send(res, 404, { error: 'No encontrado' })
      const id = parts[1]
      if (req.method === 'GET' && !id) return send(res, 200, { rhythms: all() })
      if (req.method === 'GET') {
        const r = all().find((x) => x.id === id)
        return r ? send(res, 200, r) : send(res, 404, { error: 'Ritmo no encontrado' })
      }
      if (req.method === 'POST' && !id) {
        const v = validate(await readBody(req))
        if (v.error) return send(res, 400, { error: v.error })
        const factoryIds = new Set(readJson(FACTORY_FILE, []).map((r) => r.id))
        let rid = slug(v.value.name)
        if (factoryIds.has(rid)) rid += '-usuario'
        const users = readJson(USER_FILE, [])
        const rec = { id: rid, ...v.value, savedAt: new Date().toISOString() }
        const i = users.findIndex((u) => u.id === rid)
        if (i >= 0) users[i] = rec; else users.push(rec)
        writeJson(USER_FILE, users)
        return send(res, i >= 0 ? 200 : 201, { rhythm: { ...rec, source: 'user' } })
      }
      if (req.method === 'DELETE' && id) {
        const users = readJson(USER_FILE, [])
        const kept = users.filter((u) => u.id !== id)
        if (kept.length === users.length) return send(res, 404, { error: 'Solo se pueden borrar ritmos guardados por el usuario' })
        writeJson(USER_FILE, kept)
        return send(res, 200, { ok: true })
      }
      return send(res, 405, { error: 'Metodo no permitido' })
    } catch (e) {
      send(res, 400, { error: e.message || 'Error' })
    }
  }
}

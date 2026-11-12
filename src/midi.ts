import { DRUM_KEYS, semis, withBank, type DrumKey, type Project } from './model'

const GM: Record<DrumKey, number> = { kick: 36, snare: 38, clap: 39, hat: 42, ohat: 46 }
const PPQ = 480
const STEP = PPQ / 4
interface Ev { t: number; off: boolean; b: number[] }
const vlq = (n: number) => { const o = [n & 0x7f]; while ((n >>= 7)) o.unshift((n & 0x7f) | 0x80); return o }
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
function chunk(evs: Ev[], head: number[]): number[] {
  evs.sort((a, b) => a.t - b.t || Number(b.off) - Number(a.off))
  const body = [...head]; let last = 0
  for (const e of evs) { body.push(...vlq(e.t - last), ...e.b); last = e.t }
  body.push(0, 0xff, 0x2f, 0)
  return [0x4d, 0x54, 0x72, 0x6b, ...u32(body.length), ...body]
}
const note = (evs: Ev[], t: number, len: number, ch: number, n: number, vel: number) => {
  const v = Math.max(1, Math.min(127, Math.round(vel * 110)))
  evs.push({ t, off: false, b: [0x90 | ch, n, v] }, { t: t + len, off: true, b: [0x80 | ch, n, 0] })
}

// Archivo MIDI estándar (formato 1, 480 PPQ): tempo, batería (canal 10), bajo y melodía. Exporta la canción completa si el modo canción está activo.
export function buildMidi(p: Project): Blob {
  const seq = p.songMode ? p.song : [p.bank]
  const drums: Ev[] = []; const bass: Ev[] = []; const lead: Ev[] = []
  const name = (s: string) => { const b = Array.from(new TextEncoder().encode(s)); return [0xff, 0x03, ...vlq(b.length), ...b] }
  bass.push({ t: 0, off: false, b: [0xc0, 38] }); lead.push({ t: 0, off: false, b: [0xc1, 80] })
  seq.forEach((bi, bk) => {
    const q = withBank(p, bi)
    for (let s = 0; s < p.steps; s++) {
      const t = (bk * p.steps + s) * STEP
      for (const k of DRUM_KEYS) if (q.drums[k][s]) note(drums, t, STEP / 2, 9, GM[k], q.vel[k][s])
      if (q.bass[s] >= 0) note(bass, t, Math.max(30, Math.round(STEP * p.bassSynth.gate)), 0, 33 + semis(q.bass[s]), q.vel.bass[s])
      if (q.lead[s] >= 0) for (const d of p.leadMode === 'chord' ? [q.lead[s], q.lead[s] + 2, q.lead[s] + 4] : [q.lead[s]]) note(lead, t, Math.round(STEP * 1.6), 1, 57 + semis(d), q.vel.lead[s])
    }
  })
  const us = Math.round(60000000 / p.bpm)
  const tempo: Ev[] = [{ t: 0, off: false, b: [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255] }, { t: 0, off: false, b: name(p.name || 'Estudio') }]
  const out = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 4, (PPQ >> 8) & 255, PPQ & 255,
    ...chunk(tempo, []), ...chunk(drums, []), ...chunk(bass, []), ...chunk(lead, [])]
  return new Blob([new Uint8Array(out)], { type: 'audio/midi' })
}

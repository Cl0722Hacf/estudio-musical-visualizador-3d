import './cleanup'
import './selftest'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Engine, renderWav } from './audio'
import { ASPECTS, BANK_LETTERS, BANK_NAMES, DRUM_KEYS, FONTS, LABELS, PALETTES, POSITIONS, SCENES, SPECS, TIMBRES, TRACK_IDS, commit, copyBank, decodeShare, defaultProject, encodeShare, generateBeat, noteLabel, normalize, songSteps, switchBank, type DrumKey, type Project, type Timbre, type TrackId } from './model'
import { Visualizer, vizCtl } from './Visualizer'
import { buildMidi } from './midi'
import { idbDel, idbGet, idbSet } from './store'
import { api, type Rhythm } from './api'

const KEY = 'studio.project.v2'
const KEYMAP: Record<string, number> = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15 }
const BLACK = new Set([1, 3, 6, 8, 10, 13, 15])
const KEYCAP: Record<number, string> = Object.fromEntries(Object.entries(KEYMAP).map(([k, n]) => [n, k.toUpperCase()]))

function loadInitial(): { p: Project; boot: boolean } {
  try {
    const h = location.hash.match(/p=([^&]+)/)
    if (h) { const p = decodeShare(h[1]); if (p) return { p, boot: true } }
    const s = localStorage.getItem(KEY)
    if (s) return { p: normalize(JSON.parse(s)), boot: true }
  } catch { /* sin respaldo */ }
  return { p: defaultProject(), boot: false }
}
const download = (blob: Blob, name: string) => {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}
const fname = (p: Project, ext: string) => (p.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'ritmo') + '.' + ext

const fmt = (n: number) => (Number.isFinite(n) ? Math.floor(n / 60) + ':' + String(Math.floor(n % 60)).padStart(2, '0') : '0:00')

// Osciloscopio en vivo + medidor de picos (VU) verde / amarillo / rojo en dBFS
function Meters({ engine }: { engine: Engine }) {
  const sc = useRef<HTMLCanvasElement>(null); const vu = useRef<HTMLCanvasElement>(null); const [db, setDb] = useState(-90)
  useEffect(() => {
    let raf = 0; let hold = -90; let n = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const w = engine.getWave(); const c = sc.current!.getContext('2d')!; const W = sc.current!.width; const H = sc.current!.height
      c.fillStyle = '#07050f'; c.fillRect(0, 0, W, H); c.strokeStyle = '#3cff9a'; c.lineWidth = 1.5; c.beginPath()
      for (let i = 0; i < W; i++) { const y = H - (w[Math.floor((i / W) * w.length)] / 255) * H; if (i) c.lineTo(i, y); else c.moveTo(i, y) }
      c.stroke()
      hold = Math.max(engine.getPeakDb(), hold - 0.5)
      const g = vu.current!.getContext('2d')!; const VW = vu.current!.width; const VH = vu.current!.height
      g.fillStyle = '#07050f'; g.fillRect(0, 0, VW, VH)
      const x = (d: number) => Math.max(0, Math.min(1, (d + 48) / 48)) * VW
      const seg = (a: number, b: number, col: string) => { const e = Math.min(x(hold), x(b)); if (e > x(a)) { g.fillStyle = col; g.fillRect(x(a), 0, e - x(a), VH) } }
      seg(-48, -12, '#2fe36b'); seg(-12, -3, '#ffd23f'); seg(-3, 0, '#ff4d4d')
      g.fillStyle = '#fff'; g.fillRect(x(hold) - 1, 0, 2, VH)
      if (++n % 6 === 0) setDb(Math.round(hold))
    }
    loop(); return () => cancelAnimationFrame(raf)
  }, [engine])
  return (
    <div className="meters"><canvas id="scope" ref={sc} width={170} height={44} /><div><canvas id="vu" ref={vu} width={170} height={12} /><small id="vu-db">{db <= -90 ? '-∞' : db} dBFS</small></div></div>
  )
}

export default function App() {
  const engineRef = useRef<Engine | null>(null)
  if (!engineRef.current) engineRef.current = new Engine()
  const engine = engineRef.current
  const init = useRef(loadInitial()).current
  const [project, setProject] = useState<Project>(init.p)
  const [playing, setPlaying] = useState(false)
  const [step, setStep] = useState(-1)
  const [rhythms, setRhythms] = useState<Rhythm[]>([])
  const [saveName, setSaveName] = useState(init.p.name)
  const [status, setStatus] = useState('Cargando ritmos...')
  const [current, setCurrent] = useState('')
  const [volume, setVolume] = useState(0.8)
  const [vj, setVj] = useState(false)
  const [recording, setRecording] = useState(false)
  const [active, setActive] = useState<number[]>([])
  const [bitrate, setBitrate] = useState(10)
  const [micOn, setMicOn] = useState(false)
  const [monitor, setMonitor] = useState(false)
  const [ext, setExt] = useState({ name: '', playing: false, t: 0, d: 0 })
  const [smp, setSmp] = useState<Partial<Record<DrumKey, string>>>({})
  const [playPos, setPlayPos] = useState(0)
  const [playBank, setPlayBank] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const paint = useRef<{ track: TrackId; on: boolean } | null>(null)
  const recRef = useRef<{ rec: MediaRecorder; timer: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const playRef = useRef<() => void>(() => {})

  ;(window as unknown as { __engine: Engine }).__engine = engine
  engine.project = project
  useEffect(() => { engine.apply() }, [engine, project])
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(commit(project))) } catch { /* lleno */ } }, [project])
  const upd = useCallback((fn: (p: Project) => Project) => setProject(fn), [])

  const loadRhythm = useCallback((r: Rhythm) => {
    setProject(normalize(r)); setSaveName(r.source === 'factory' ? r.name + ' (copia)' : r.name); setCurrent(r.id); setStatus('Cargado: ' + r.name)
  }, [])
  const refresh = useCallback(async (first = false) => {
    try {
      const list = await api.list(); setRhythms(list)
      if (first && !init.boot && list[0]) loadRhythm(list[0])
      else setStatus(first ? 'Sesión recuperada · ' + list.length + ' ritmos disponibles' : list.length + ' ritmos disponibles')
    } catch (e) { setStatus('No se pudo conectar con la API: ' + (e as Error).message) }
  }, [loadRhythm, init.boot])
  useEffect(() => { engine.onStep = setStep; engine.onSong = (pos, bank) => { setPlayPos(pos); setPlayBank(bank) }; void refresh(true); return () => engine.pause() }, [engine, refresh])
  useEffect(() => {
    void (async () => {
      for (const k of DRUM_KEYS) { const sv = await idbGet(k).catch(() => undefined); if (sv) { await engine.setSample(k, sv.buf).catch(() => {}); setSmp((m) => ({ ...m, [k]: sv.name })) } }
    })()
  }, [engine])

  const togglePlay = useCallback(async () => {
    if (engine.playing) { engine.pause(); setPlaying(false) } else { await engine.play(); setPlaying(true) }
  }, [engine])
  playRef.current = () => { void togglePlay() }

  // Teclado del ordenador: A-L notas blancas, W-P sostenidos, espacio = play/pause
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement; const typing = tg.tagName === 'TEXTAREA' || (tg.tagName === 'INPUT' && (tg as HTMLInputElement).type === 'text')
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) playRef.current(); return }
      const n = KEYMAP[e.key.toLowerCase()]
      if (n !== undefined && !e.repeat) { engine.playNote(n); setActive((a) => [...a, n]) }
    }
    const up = (e: KeyboardEvent) => { const n = KEYMAP[e.key.toLowerCase()]; if (n !== undefined) setActive((a) => a.filter((x) => x !== n)) }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [engine])
  useEffect(() => {
    const u = () => { paint.current = null }; window.addEventListener('pointerup', u)
    const fs = () => { if (!document.fullscreenElement) setVj(false) }; document.addEventListener('fullscreenchange', fs)
    return () => { window.removeEventListener('pointerup', u); document.removeEventListener('fullscreenchange', fs) }
  }, [])

  // ---- Velocidad (fuerza) por paso: rueda del mouse o clic derecho ----
  useEffect(() => {
    const el = gridRef.current; if (!el) return
    const setVel = (t: TrackId, i: number, f: (v: number) => number) => setProject((p) => ({ ...p, vel: { ...p.vel, [t]: p.vel[t].map((x, j) => (j === i ? f(x) : x)) } }))
    const hit = (e: Event) => { const c = (e.target as HTMLElement).closest('[data-t]') as HTMLElement | null; return c ? { t: c.dataset.t as TrackId, i: Number(c.dataset.s) } : null }
    const wheel = (e: WheelEvent) => { const h = hit(e); if (!h) return; e.preventDefault(); const d = e.deltaY < 0 ? 0.1 : -0.1; setVel(h.t, h.i, (v) => Math.max(0.1, Math.min(1, Math.round((v + d) * 10) / 10))) }
    const ctx = (e: MouseEvent) => { const h = hit(e); if (!h) return; e.preventDefault(); setVel(h.t, h.i, (v) => { const n = [0.7, 0.45, 0.2].find((x) => x < v - 0.01); return n ?? 1 }) }
    el.addEventListener('wheel', wheel, { passive: false }); el.addEventListener('contextmenu', ctx)
    return () => { el.removeEventListener('wheel', wheel); el.removeEventListener('contextmenu', ctx) }
  }, [])

  // ---- Cuadrícula: pintar / borrar arrastrando ----
  const cur = (t: TrackId, row: number, i: number) => (t === 'bass' || t === 'lead' ? project[t][i] === row : project.drums[t][i])
  const setCell = (t: TrackId, row: number, i: number, on: boolean) => {
    if (on && !cur(t, row, i)) engine.audition(t, row)
    upd((p) => {
      if (t === 'bass' || t === 'lead') return { ...p, [t]: p[t].map((v, j) => (j === i ? (on ? row : v === row ? -1 : v) : v)) }
      return { ...p, drums: { ...p.drums, [t]: p.drums[t].map((v, j) => (j === i ? on : v)) } }
    })
  }
  const cellDown = (t: TrackId, row: number, i: number) => { const on = !cur(t, row, i); paint.current = { track: t, on }; setCell(t, row, i, on) }
  const cellEnter = (t: TrackId, row: number, i: number) => { const pt = paint.current; if (pt && (pt.track === t)) setCell(t, row, i, pt.on) }
  const cell = (t: TrackId, row: number, i: number) => (
    <button key={i} data-r={t === 'bass' || t === 'lead' ? t + row : t} data-s={i} data-t={t}
      style={{ opacity: cur(t, row, i) ? 0.35 + 0.65 * project.vel[t][i] : undefined }}
      title={cur(t, row, i) ? 'Velocidad ' + Math.round(project.vel[t][i] * 100) + '% (rueda o clic derecho)' : undefined}
      className={'cell' + (t === 'bass' ? ' b' : t === 'lead' ? ' l' : '') + (cur(t, row, i) ? ' on' : '') + (i % 4 === 0 ? ' beat' : '') + (i === step && (!project.songMode || playBank === project.bank) ? ' now' : '')}
      aria-pressed={cur(t, row, i)} aria-label={LABELS[t] + ' paso ' + (i + 1)}
      onPointerDown={(e) => { e.preventDefault(); cellDown(t, row, i) }} onPointerEnter={() => cellEnter(t, row, i)}
      onClick={(e) => { if (e.detail === 0) { cellDown(t, row, i); paint.current = null } }} />
  )
  const mix = (t: TrackId) => {
    const m = project.mixer[t]; const set = (patch: Partial<typeof m>) => upd((p) => ({ ...p, mixer: { ...p.mixer, [t]: { ...p.mixer[t], ...patch } } }))
    return (
      <span className="mix">
        <button id={'m-' + t} className={'ms' + (m.mute ? ' mute' : '')} aria-pressed={m.mute} title="Mute" onClick={() => set({ mute: !m.mute })}>M</button>
        <button id={'s-' + t} className={'ms' + (m.solo ? ' solo' : '')} aria-pressed={m.solo} title="Solo" onClick={() => set({ solo: !m.solo })}>S</button>
        <input id={'v-' + t} type="range" min={0} max={1} step={0.01} value={m.vol} title="Volumen del canal" onChange={(e) => set({ vol: Number(e.target.value) })} />
      </span>
    )
  }
  const glideCtl = (t: 'bass' | 'lead') => (
    <label className="gl">Glide <input id={'glide-' + t} type="range" min={0} max={400} step={5} value={project.glide[t]} onChange={(e) => upd((p) => ({ ...p, glide: { ...p.glide, [t]: Number(e.target.value) } }))} /> <b>{project.glide[t]} ms</b></label>
  )
  const setLook = (patch: Partial<Project['look']>) => upd((p) => ({ ...p, look: { ...p.look, ...patch } }))
  const fxSlider = (id: string, label: string, key: keyof Project['fx'], min = 0, max = 1) => (
    <label className="knob">{label}<input id={'fx-' + id} type="range" min={min} max={max} step={0.01} value={project.fx[key] as number} onChange={(e) => upd((p) => ({ ...p, fx: { ...p.fx, [key]: Number(e.target.value) } }))} /><b>{Math.round((project.fx[key] as number) * 100)}</b></label>
  )
  const nSteps = project.steps
  const range = (n: number) => Array.from({ length: n }, (_, i) => i)

  // ---- Biblioteca ----
  const save = async () => {
    try { const r = await api.save(commit({ ...project, name: saveName })); setCurrent(r.id); setStatus('Guardado "' + r.name + '" en data/user-rhythms.json'); setRhythms(await api.list()) }
    catch (e) { setStatus('Error al guardar: ' + (e as Error).message) }
  }
  const remove = async (r: Rhythm) => { try { await api.remove(r.id); setStatus('Borrado: ' + r.name); setRhythms(await api.list()) } catch (e) { setStatus('Error al borrar: ' + (e as Error).message) } }

  // ---- Exportaciones ----
  const exportWav = async () => {
    setStatus('Renderizando audio...')
    try { const b = await renderWav(commit(project), engine.samples); download(b, fname(project, 'wav')); setStatus('Audio exportado: ' + fname(project, 'wav') + ' (' + Math.round(b.size / 1024) + ' KB)') }
    catch (e) { setStatus('Error al exportar audio: ' + (e as Error).message) }
  }
  const stopRecord = () => { const r = recRef.current; if (r) { window.clearTimeout(r.timer); if (r.rec.state !== 'inactive') r.rec.stop() } }
  const toggleRecord = async () => {
    if (recRef.current) { stopRecord(); return }
    const reset = () => { vizCtl.hires = null; vizCtl.composite = null; vizCtl.apply() }
    try {
      engine.init(); await engine.ctx!.resume()
      const A = ASPECTS[project.look.aspect]; const a = audioRef.current
      const extFile = !!(a && ext.name && ext.playing); const external = extFile || micOn
      vizCtl.hires = [A.w, A.h]; vizCtl.apply()
      const comp = document.createElement('canvas'); comp.width = A.w; comp.height = A.h; vizCtl.composite = comp.getContext('2d')
      if (extFile && a) { a.currentTime = 0; await a.play() }
      else if (!external) { if (engine.playing) engine.pause(); await engine.play(); setPlaying(true) }
      await new Promise((r) => setTimeout(r, 250))
      const stream = comp.captureStream(60); engine.recDest!.stream.getAudioTracks().forEach((t) => stream.addTrack(t))
      const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m))
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: bitrate * 1_000_000 } : { videoBitsPerSecond: bitrate * 1_000_000 }); const chunks: Blob[] = []
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
      rec.onstop = () => {
        reset(); if (a) a.onended = null
        const b = new Blob(chunks, { type: 'video/webm' }); download(b, fname(project, 'webm')); recRef.current = null; setRecording(false)
        setStatus('Videoclip guardado: ' + fname(project, 'webm') + ' · ' + A.w + 'x' + A.h + ' · ' + bitrate + ' Mbps (' + Math.round(b.size / 1024) + ' KB)')
      }
      let ms = 30000
      if (!external && project.songMode) ms = ((songSteps(project) * 60) / project.bpm / 4) * 1000 + 2500
      if (micOn) ms = 300000
      if (extFile && a) { ms = 600000; a.onended = () => stopRecord() }
      rec.start(250); recRef.current = { rec, timer: window.setTimeout(stopRecord, ms) }; setRecording(true)
      setStatus('Grabando ' + A.w + 'x' + A.h + ' a ' + bitrate + ' Mbps... pulsa de nuevo para terminar')
    } catch (e) { reset(); setStatus('No se pudo grabar: ' + (e as Error).message) }
  }
  const exportMidi = () => { const b = buildMidi(commit(project)); download(b, fname(project, 'mid')); setStatus('MIDI exportado: ' + fname(project, 'mid') + (project.songMode ? ' (canción completa)' : ' (patrón ' + BANK_LETTERS[project.bank] + ')')) }
  const loadSample = async (k: DrumKey, f?: File) => {
    if (!f) return
    try { const buf = await f.arrayBuffer(); await engine.setSample(k, buf); await idbSet(k, { name: f.name, buf }); setSmp((m) => ({ ...m, [k]: f.name })); setStatus('Sample cargado en ' + LABELS[k] + ': ' + f.name); engine.audition(k) }
    catch (e) { setStatus('No se pudo leer el sample: ' + (e as Error).message) }
  }
  const clearSample = async (k: DrumKey) => { await engine.setSample(k, null); await idbDel(k).catch(() => {}); setSmp((m) => { const n = { ...m }; delete n[k]; return n }); setStatus('Sample quitado: ' + LABELS[k]) }
  const onAudioFile = (f?: File) => {
    const a = audioRef.current; if (!f || !a) return
    if (a.src) URL.revokeObjectURL(a.src)
    a.src = URL.createObjectURL(f); engine.attachMedia(a); setExt({ name: f.name, playing: false, t: 0, d: 0 }); setStatus('Audio externo cargado: ' + f.name)
  }
  const extPlay = async () => { const a = audioRef.current; if (!a || !ext.name) return; try { engine.attachMedia(a); await engine.ctx!.resume(); if (a.paused) await a.play(); else a.pause() } catch (e) { setStatus('No se pudo reproducir el audio: ' + (e as Error).message) } }
  const toggleMic = async () => {
    if (micOn) { engine.stopMic(); setMicOn(false); setStatus('Micrófono apagado'); return }
    try { await engine.startMic(monitor); setMicOn(true); setStatus('Micrófono activo' + (monitor ? ' (monitoreo ON: usa auriculares)' : '')) }
    catch (e) { setStatus('No se pudo acceder al micrófono: ' + (e as Error).message) }
  }
  const exportJson = () => { download(new Blob([JSON.stringify(commit(project), null, 2)], { type: 'application/json' }), fname(project, 'json')); setStatus('Proyecto exportado: ' + fname(project, 'json')) }
  const importJson = (f?: File) => {
    if (!f) return
    f.text().then((t) => { const p = normalize(JSON.parse(t)); setProject(p); setSaveName(p.name); setStatus('Proyecto importado: ' + p.name) }).catch(() => setStatus('El archivo JSON no es válido'))
  }
  const copyLink = async () => {
    const url = location.origin + location.pathname + '#p=' + encodeShare(project)
    history.replaceState(null, '', '#p=' + encodeShare(project))
    try { await navigator.clipboard.writeText(url); setStatus('Enlace copiado al portapapeles (' + url.length + ' caracteres)') } catch { setStatus('Enlace colocado en la barra de direcciones (cópialo desde ahí)') }
  }
  const goVj = () => { setVj(true); document.documentElement.requestFullscreen?.().catch(() => {}) }
  const exitVj = () => { setVj(false); if (document.fullscreenElement) void document.exitFullscreen() }

  const whites = range(16).filter((n) => !BLACK.has(n))
  const sceneSel = <select id="scene" value={project.scene} onChange={(e) => upd((p) => ({ ...p, scene: Number(e.target.value) }))}>{SCENES.map((s, i) => <option key={i} value={i}>{s}</option>)}</select>
  const palSel = <select id="palette" value={project.palette} onChange={(e) => upd((p) => ({ ...p, palette: Number(e.target.value) }))}>{PALETTES.map((s, i) => <option key={i} value={i}>{s.name}</option>)}</select>
  const melodic = (t: 'bass' | 'lead'): ReactNode => (
    <div className="grid" id={t + '-grid'}>
      {[7, 6, 5, 4, 3, 2, 1, 0].map((d) => <div className="row" key={d}><span className="lbl">{noteLabel(t, d)}</span>{range(nSteps).map((i) => cell(t, d, i))}</div>)}
    </div>
  )

  return (
    <div className={'app' + (vj ? ' vj' : '')}>
      <header className="hide-vj"><h1>Estudio Musical 3D</h1><span className="sub">Edición Pro · Canción completa · Samples · Fuente externa · Exportación MIDI / WAV / Video</span>
        <div className="mastering"><Meters engine={engine} /><button id="boost" className={project.boost ? 'on' : ''} aria-pressed={project.boost} title="Limitador maestro con ganancia extra" onClick={() => upd((p) => ({ ...p, boost: !p.boost }))}>⚡ Boost comercial</button></div></header>
      <main>
        <section className="panel seq hide-vj">
          <div className="transport">
            <button id="play" className={playing ? 'on' : ''} onClick={togglePlay}>{playing ? '⏸ Pausar' : '▶ Reproducir'}</button>
            <label>BPM <input id="bpm" type="range" min={60} max={200} value={project.bpm} onChange={(e) => upd((p) => ({ ...p, bpm: Number(e.target.value) }))} /> <b id="bpm-val">{project.bpm}</b></label>
            <label>Swing <input id="swing" type="range" min={0} max={0.6} step={0.01} value={project.swing} onChange={(e) => upd((p) => ({ ...p, swing: Number(e.target.value) }))} /></label>
            <span className="seg" role="group" aria-label="Longitud del patrón">
              <button id="steps16" className={nSteps === 16 ? 'on' : ''} onClick={() => upd((p) => ({ ...p, steps: 16 }))}>16 pasos</button>
              <button id="steps32" className={nSteps === 32 ? 'on' : ''} onClick={() => upd((p) => ({ ...p, steps: 32 }))}>32 pasos</button>
            </span>
            <label>Master <input id="vol" type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => { const v = Number(e.target.value); setVolume(v); engine.setVolume(v) }} /></label>
            <button id="random" onClick={() => { upd((p) => generateBeat(p)); setStatus('Beat aleatorio generado') }}>🎲 Generar beat</button>
            <button id="clear" onClick={() => { upd((p) => ({ ...p, drums: defaultProject().drums, bass: defaultProject().bass, lead: defaultProject().lead })); setStatus('Cuadrícula limpia') }}>Limpiar</button>
          </div>
          <div className="banks" id="banks">
            <b>Patrones</b>
            {BANK_LETTERS.map((L, i) => <button key={L} id={'bank-' + L} className={'bk' + (project.bank === i ? ' on' : '')} title={BANK_NAMES[i]} onClick={() => upd((p) => switchBank(p, i))}>{L}</button>)}
            <small>{BANK_NAMES[project.bank]}</small><span className="sep">Copiar a →</span>
            {BANK_LETTERS.map((L, i) => <button key={L} id={'copy-' + L} className="bk" disabled={project.bank === i} onClick={() => { upd((p) => copyBank(p, i)); setStatus('Patrón ' + BANK_LETTERS[project.bank] + ' copiado a ' + L) }}>{L}</button>)}
          </div>
          <div className="song" id="song">
            <label><input type="checkbox" id="song-mode" checked={project.songMode} onChange={(e) => upd((p) => ({ ...p, songMode: e.target.checked }))} /> Modo Canción</label>
            {project.song.map((b, i) => <span key={i} className={'chip' + (project.songMode && playing && i === playPos ? ' now' : '')}>{BANK_LETTERS[b]}<button aria-label="Quitar bloque" onClick={() => upd((p) => ({ ...p, song: p.song.length > 1 ? p.song.filter((_, j) => j !== i) : p.song }))}>×</button></span>)}
            <span className="sep">Añadir</span>
            {BANK_LETTERS.map((L, i) => <button key={L} id={'add-' + L} className="bk" onClick={() => upd((p) => ({ ...p, song: [...p.song, i].slice(0, 32) }))}>+{L}</button>)}
            <button id="song-reset" onClick={() => upd((p) => ({ ...p, song: [0] }))}>Reiniciar</button>
          </div>
          <div className="smpbar" id="smpbar"><b>Samples</b>
            {DRUM_KEYS.map((k) => (
              <span key={k} className="smp"><label className="btn" id={'smp-' + k}>Cargar sample (.wav) · {LABELS[k]}<input id={'smpf-' + k} type="file" accept=".wav,audio/*" hidden onChange={(e) => { void loadSample(k, e.target.files?.[0]); e.target.value = '' }} /></label>
                {smp[k] && <><small>{smp[k]}</small><button className="ms" title="Quitar sample" onClick={() => void clearSample(k)}>✕</button></>}</span>
            ))}
          </div>
          <div className="scroll" ref={gridRef}>
            <h3>Batería</h3>
            <div className="grid" id="drum-grid">
              {DRUM_KEYS.map((k: DrumKey) => <div className="row" key={k}><span className="lbl">{LABELS[k]}</span>{mix(k)}{range(nSteps).map((i) => cell(k, 0, i))}</div>)}
            </div>
            <h3>Bajo {mix('bass')} {glideCtl('bass')}</h3>
            {melodic('bass')}
            <h3>{LABELS.lead} {mix('lead')} {glideCtl('lead')}
              <select id="timbre" value={project.leadTimbre} onChange={(e) => upd((p) => ({ ...p, leadTimbre: e.target.value as Timbre }))}>{TIMBRES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
              <span className="seg"><button id="mode-lead" className={project.leadMode === 'lead' ? 'on' : ''} onClick={() => upd((p) => ({ ...p, leadMode: 'lead' }))}>Lead</button><button id="mode-chord" className={project.leadMode === 'chord' ? 'on' : ''} onClick={() => upd((p) => ({ ...p, leadMode: 'chord' }))}>Acordes</button></span>
            </h3>
            {melodic('lead')}
          </div>
          <div className="fx">
            <h3>Rack de efectos maestro</h3>
            <div className="knobs">
              <label className="knob">Filtro
                <select id="fx-type" value={project.fx.filterType} onChange={(e) => { const ft = e.target.value as 'lowpass' | 'highpass'; upd((p) => ({ ...p, fx: { ...p.fx, filterType: ft, cutoff: ft === 'lowpass' ? 1 : 0 } })) }}><option value="lowpass">Lowpass</option><option value="highpass">Highpass</option></select></label>
              {fxSlider('cutoff', 'Cutoff', 'cutoff')}{fxSlider('res', 'Resonancia', 'res')}
              {fxSlider('delay', 'Delay mix', 'delayMix')}{fxSlider('fb', 'Feedback', 'delayFb', 0, 0.95)}
              {fxSlider('reverb', 'Reverb', 'reverbMix')}{fxSlider('drive', 'Overdrive', 'drive')}
            </div>
          </div>
          <div className="kbd">
            <h3>Miniteclado <small>(teclas A-L y W-P · Espacio = Play/Pause)</small></h3>
            <div className="piano" id="piano">
              {whites.map((n, wi) => <button key={n} className={'key w' + (active.includes(n) ? ' on' : '')} data-n={n} onPointerDown={() => { engine.playNote(n); setActive((a) => [...a, n]) }} onPointerUp={() => setActive((a) => a.filter((x) => x !== n))} onPointerLeave={() => setActive((a) => a.filter((x) => x !== n))}><i>{KEYCAP[n]}</i>
                {BLACK.has(n + 1) && n + 1 <= 15 && <span className={'key bk' + (active.includes(n + 1) ? ' on' : '')} style={{ left: 26 + wi * 0 }} data-n={n + 1} onPointerDown={(e) => { e.stopPropagation(); engine.playNote(n + 1); setActive((a) => [...a, n + 1]) }} onPointerUp={(e) => { e.stopPropagation(); setActive((a) => a.filter((x) => x !== n + 1)) }}><i>{KEYCAP[n + 1]}</i></span>}
              </button>)}
            </div>
          </div>
          <div className="save">
            <input id="name" value={saveName} maxLength={40} onChange={(e) => setSaveName(e.target.value)} />
            <button id="save" onClick={save}>Guardar en la API</button>
          </div>
        </section>
        <section className="panel side">
          <div className="vizwrap">
            <div className="vizbar"><label>Escena 3D {sceneSel}</label><label>Paleta {palSel}</label>
              <button id="btn-vj" className="hide-vj" onClick={goVj}>⛶ Pantalla completa (VJ)</button></div>
            <div className="vjbar"><button id="vj-play" onClick={togglePlay}>{playing ? '⏸' : '▶'}</button>{sceneSel}{palSel}<button id="vj-exit" onClick={exitVj}>✕ Salir</button></div>
            <Visualizer engine={engine} scene={project.scene} palette={project.palette} look={project.look} />
          </div>
          <div className="looks hide-vj" id="looks">
            <label>Formato <select id="aspect" value={project.look.aspect} onChange={(e) => setLook({ aspect: Number(e.target.value) })}>{ASPECTS.map((a, i) => <option key={i} value={i}>{a.name}</option>)}</select></label>
            <label>Artista <input id="artist" value={project.look.artist} maxLength={60} placeholder="Nombre del artista" onChange={(e) => setLook({ artist: e.target.value })} /></label>
            <label>Canción <input id="songtitle" value={project.look.title} maxLength={60} placeholder="Título de la canción" onChange={(e) => setLook({ title: e.target.value })} /></label>
            <label>Tipografía <select id="font" value={project.look.font} onChange={(e) => setLook({ font: Number(e.target.value) })}>{FONTS.map((f, i) => <option key={i} value={i}>{f.name}</option>)}</select></label>
            <label>Posición <select id="pos" value={project.look.pos} onChange={(e) => setLook({ pos: Number(e.target.value) })}>{POSITIONS.map((f, i) => <option key={i} value={i}>{f}</option>)}</select></label>
            <label>Espectro <select id="spec" value={project.look.spec} onChange={(e) => setLook({ spec: Number(e.target.value) })}>{SPECS.map((f, i) => <option key={i} value={i}>{f}</option>)}</select></label>
            <label>Sacudida <input id="shake" type="range" min={0} max={1} step={0.05} value={project.look.shake} onChange={(e) => setLook({ shake: Number(e.target.value) })} /></label>
            <label>Destello <input id="flash" type="range" min={0} max={1} step={0.05} value={project.look.flash} onChange={(e) => setLook({ flash: Number(e.target.value) })} /></label>
            <label>Bitrate <select id="bitrate" value={bitrate} onChange={(e) => setBitrate(Number(e.target.value))}>{[8, 10, 12].map((b) => <option key={b} value={b}>{b} Mbps</option>)}</select></label>
          </div>
          <details className="hide-vj ext" id="ext" open>
            <summary>Fuente de Audio Externa</summary>
            <div className="extrow">
              <label className="btn" id="ext-file-btn">Subir audio (.mp3 / .wav / .ogg)<input id="ext-file" type="file" accept=".mp3,.wav,.ogg,audio/*" hidden onChange={(e) => { onAudioFile(e.target.files?.[0]); e.target.value = '' }} /></label>
              <small id="ext-name">{ext.name || 'Ningún archivo'}</small>
            </div>
            <div className="extrow">
              <button id="ext-play" disabled={!ext.name} onClick={() => void extPlay()}>{ext.playing ? '⏸ Pausa' : '▶ Play'}</button>
              <input id="ext-seek" type="range" min={0} max={ext.d || 1} step={0.1} value={ext.t} disabled={!ext.name} onChange={(e) => { if (audioRef.current) audioRef.current.currentTime = Number(e.target.value) }} />
              <small id="ext-time">{fmt(ext.t)} / {fmt(ext.d)}</small>
            </div>
            <div className="extrow">
              <button id="mic-toggle" className={micOn ? 'rec' : ''} onClick={() => void toggleMic()}>{micOn ? '⏹ Apagar micrófono' : '🎙 Micrófono / línea en vivo'}</button>
              <label><input id="mic-monitor" type="checkbox" checked={monitor} onChange={(e) => { setMonitor(e.target.checked); engine.setMicMonitor(e.target.checked) }} /> Escucharlo (usa auriculares)</label>
            </div>
            <audio ref={audioRef} id="ext-audio" preload="metadata"
              onTimeUpdate={(e) => { const a = e.currentTarget; setExt((x) => ({ ...x, t: a.currentTime, d: a.duration || 0 })) }}
              onLoadedMetadata={(e) => { const a = e.currentTarget; setExt((x) => ({ ...x, d: a.duration || 0 })) }}
              onPlay={() => setExt((x) => ({ ...x, playing: true }))} onPause={() => setExt((x) => ({ ...x, playing: false }))} onEnded={() => setExt((x) => ({ ...x, playing: false }))} />
          </details>
          <div className="hide-vj">
            <h2>Exportar y compartir</h2>
            <div className="exports">
              <button id="btn-wav" onClick={exportWav}>💾 Exportar audio (.wav){project.songMode ? ' · canción' : ''}</button>
              <button id="btn-midi" onClick={exportMidi}>🎹 Exportar MIDI (.mid)</button>
              <button id="btn-video" className={recording ? 'rec' : ''} onClick={toggleRecord}>{recording ? '⏹ Detener grabación' : '🎥 Grabar videoclip 3D'}</button>
              <button id="btn-json" onClick={exportJson}>📤 Exportar JSON</button>
              <button id="btn-import" onClick={() => fileRef.current?.click()}>📥 Importar JSON</button>
              <button id="btn-link" onClick={copyLink}>🔗 Copiar enlace</button>
              <input ref={fileRef} id="file-json" type="file" accept=".json,application/json" hidden onChange={(e) => { importJson(e.target.files?.[0]); e.target.value = '' }} />
            </div>
            <h2>Biblioteca</h2>
            <ul id="library" className="lib">
              {rhythms.map((r) => (
                <li key={r.id} className={r.id === current ? 'cur' : ''}>
                  <span>{r.name} <small>{r.bpm} BPM · {r.steps} pasos · {r.source === 'factory' ? 'de fábrica' : 'guardado'}</small></span>
                  <span><button data-load={r.id} onClick={() => loadRhythm(r)}>Cargar</button>{r.source === 'user' && <button data-del={r.id} onClick={() => remove(r)}>Borrar</button>}</span>
                </li>
              ))}
            </ul>
            <div id="status" role="status" className="status">{status}</div>
          </div>
        </section>
      </main>
    </div>
  )
}
void TRACK_IDS

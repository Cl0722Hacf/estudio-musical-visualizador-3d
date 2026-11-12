// Autoprueba: solo se ejecuta con ?selftest=1. Pulsa los controles reales y deja el resultado como un ritmo en la API.
const q = (s: string) => document.querySelector(s) as HTMLElement | null
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const setVal = (el: HTMLInputElement | HTMLSelectElement, v: string) => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v)
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}
type Eng = { getBands: () => { bass: number; mid: number; treble: number; level: number }; notesPlayed: number; playing: boolean }
const blobs: Blob[] = []
const origURL = URL.createObjectURL.bind(URL)
URL.createObjectURL = (o: Blob | MediaSource) => { if (o instanceof Blob) blobs.push(o); return origURL(o) }
let errs = 0
window.addEventListener('error', () => { errs++ })
const wavFile = (name: string, secs: number, hz: number) => {
  const sr = 22050; const n = Math.floor(sr * secs); const dv = new DataView(new ArrayBuffer(44 + n * 2)); const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.sin((2 * Math.PI * hz * i) / sr) * 12000, true)
  return new File([dv], name, { type: 'audio/wav' })
}
const feed = (sel: string, f: File) => { const el = q(sel) as HTMLInputElement; const dt = new DataTransfer(); dt.items.add(f); el.files = dt.files; el.dispatchEvent(new Event('change', { bubbles: true })) }
const pressed = (sel: string) => q(sel)?.getAttribute('aria-pressed') === 'true'
const ratio = () => { const v = q('#viz')!.getBoundingClientRect(); const cv = q('#viz canvas') as HTMLCanvasElement; return { box: v.width / v.height, buf: cv.width / cv.height } }

async function run() {
  const W = window as unknown as { __st?: boolean }
  if (W.__st) return
  W.__st = true
  const c: Record<string, boolean> = {}
  let diag = ''
  let emsg = ''
  const ok = (k: string, v: boolean) => { c[k] = v }
  try {
    for (let i = 0; i < 40 && !q('#aspect'); i++) await sleep(500)
    await sleep(2500)
    const eng = (window as unknown as { __engine: Eng }).__engine
    const viz = q('#viz')!
    ok('lib', document.querySelectorAll('#library li').length >= 5)
    q('#play')!.click()
    let maxB = 0; const seen = new Set<string>()
    for (let i = 0; i < 30; i++) { await sleep(100); maxB = Math.max(maxB, Number(viz.dataset.bass || 0)); const n = q('.cell.now'); if (n) seen.add(n.getAttribute('data-s') || '') }
    ok('play', (q('#play')!.textContent || '').includes('Pausar')); ok('pasos', seen.size >= 3); ok('graves', maxB > 0.05)
    const avgT = async () => { let s = 0; for (let i = 0; i < 12; i++) { await sleep(100); s += eng.getBands().treble } return s / 12 }
    const t0 = await avgT(); setVal(q('#fx-cutoff') as HTMLInputElement, '0.2'); await sleep(300); const t1 = await avgT()
    ok('filtro', t1 < t0 * 0.6); setVal(q('#fx-cutoff') as HTMLInputElement, '1')
    // Osciloscopio y VU en vivo
    const sc = q('#scope') as HTMLCanvasElement; const px = sc.getContext('2d')!.getImageData(0, 0, sc.width, sc.height).data; let g = 0; for (let i = 0; i < px.length; i += 4) if (px[i + 1] > 200 && px[i] < 120) g++
    ok('scope', g > 20); ok('vu', !(q('#vu-db')!.textContent || '').includes('∞'))
    // Branding + espectro superpuesto
    setVal(q('#artist') as HTMLInputElement, 'Artista Test'); await sleep(400)
    const ov = q('#ov') as HTMLCanvasElement; const od = ov.getContext('2d')!.getImageData(0, 0, ov.width, ov.height).data; let al = 0; for (let i = 3; i < od.length; i += 40) if (od[i] > 0) al++
    ok('brand', al > 50)
    // Boost / mute / solo
    q('#boost')!.click(); await sleep(100); ok('boost', pressed('#boost')); q('#boost')!.click()
    q('#m-kick')!.click(); await sleep(100); ok('mute', pressed('#m-kick')); q('#m-kick')!.click()
    q('#s-lead')!.click(); await sleep(100); ok('solo', pressed('#s-lead')); q('#s-lead')!.click()
    // Glide
    setVal(q('#glide-bass') as HTMLInputElement, '150'); await sleep(150); ok('glide', (q('#glide-bass')!.parentElement!.textContent || '').includes('150'))
    // Velocidad por paso: rueda y clic derecho
    q('#random')!.click(); await sleep(200)
    const kc = q('[data-r="kick"][data-s="1"]')!
    if (!pressed('[data-r="kick"][data-s="1"]')) { kc.click(); await sleep(120) }
    const cell = q('[data-r="kick"][data-s="1"]')!
    cell.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })); await sleep(120)
    const w1 = (q('[data-r="kick"][data-s="1"]')!.getAttribute('title') || '').includes('90%')
    q('[data-r="kick"][data-s="1"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); await sleep(120)
    ok('velocidad', w1 && (q('[data-r="kick"][data-s="1"]')!.getAttribute('title') || '').includes('70%'))
    // 4 bancos A-D
    const st = () => pressed('[data-r="kick"][data-s="3"]')
    q('#bank-A')!.click(); await sleep(150); const a0 = st()
    q('#bank-B')!.click(); await sleep(150); const b0 = st(); q('[data-r="kick"][data-s="3"]')!.click(); await sleep(150); const b1 = st()
    q('#bank-A')!.click(); await sleep(150); const a1 = st()
    q('#bank-B')!.click(); await sleep(150); const b2 = st()
    ok('bancos', a0 === a1 && b1 !== b0 && b2 === b1)
    q('#copy-C')!.click(); await sleep(150); q('#bank-C')!.click(); await sleep(150); ok('copiar', st() === b1)
    q('#bank-D')!.click(); await sleep(150); q('#bank-A')!.click(); await sleep(150)
    // Modo canción A -> B -> C
    q('#song-reset')!.click(); await sleep(100); if (!(q('#song-mode') as HTMLInputElement).checked) { q('#song-mode')!.click(); await sleep(100) } q('#add-B')!.click(); q('#add-C')!.click(); await sleep(150)
    ok('cadena', document.querySelectorAll('#song .chip').length === 3)
    q('#play')!.click(); await sleep(200); q('#play')!.click(); await sleep(300) // reinicia desde el principio
    let chipNow = false; for (let i = 0; i < 25 && !chipNow; i++) { await sleep(200); chipNow = !!q('#song .chip.now') }
    ok('cancion', chipNow)
    // Aspecto 16:9 -> 9:16 -> 1:1 sin deformar
    setVal(q('#aspect') as HTMLSelectElement, '1'); await sleep(700); const r1 = ratio()
    setVal(q('#aspect') as HTMLSelectElement, '2'); await sleep(700); const r2 = ratio()
    setVal(q('#aspect') as HTMLSelectElement, '0'); await sleep(700); const r0 = ratio()
    ok('aspecto', Math.abs(r1.box - 0.5625) < 0.03 && Math.abs(r1.buf - r1.box) < 0.05 && Math.abs(r2.box - 1) < 0.03 && Math.abs(r2.buf - 1) < 0.05 && Math.abs(r0.box - 1.7778) < 0.05)
    // Escenas
    let scenesOk = true
    for (const s of ['1', '2', '3', '0']) { setVal(q('#scene') as HTMLSelectElement, s); await sleep(600); const f0 = Number(viz.dataset.frames || 0); await sleep(400); if (viz.dataset.scene !== s || Number(viz.dataset.frames || 0) <= f0) scenesOk = false }
    ok('escenas', scenesOk && errs === 0)
    // Teclado y barra espaciadora
    const n0 = eng.notesPlayed; window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'a' })); ok('teclado', eng.notesPlayed === n0 + 1)
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' })); await sleep(300); ok('espacio', !eng.playing)
    if ((q('#song-mode') as HTMLInputElement).checked) { q('#song-mode')!.click(); await sleep(100) }
    // Samples personalizados
    feed('#smpf-kick', wavFile('kick-prueba.wav', 0.2, 80)); await sleep(1200)
    ok('sample', (q('#status')!.textContent || '').includes('Sample cargado') && !!q('#smp-kick')!.parentElement!.querySelector('.ms'))
    ;(q('#smp-kick')!.parentElement!.querySelector('.ms') as HTMLElement).click(); await sleep(400); ok('sample-', (q('#status')!.textContent || '').includes('quitado'))
    // Fuente de audio externa (archivo)
    feed('#ext-file', wavFile('cancion-prueba.wav', 2, 330)); await sleep(1200)
    ok('ext', (q('#ext-name')!.textContent || '').includes('cancion-prueba') && (q('#ext-time')!.textContent || '').includes('/ 0:02'))
    const extA = q('#ext-audio') as HTMLAudioElement; extA.muted = true; q('#ext-play')!.click(); await sleep(1200); ok('ext-play', (q('#ext-audio') as HTMLAudioElement).currentTime > 0.3)
    if (!c['ext-play']) diag = (q('#status')!.textContent || '').slice(0, 34)
    // Exportaciones
    const nb = blobs.length; q('#btn-wav')!.click()
    for (let i = 0; i < 60 && blobs.length === nb; i++) await sleep(250)
    const w = blobs[blobs.length - 1]; ok('wav', blobs.length > nb && w.type === 'audio/wav' && w.size > 100000)
    const nm = blobs.length; q('#btn-midi')!.click(); await sleep(400)
    const mb = blobs[blobs.length - 1]; const head = blobs.length > nm ? new Uint8Array(await mb.slice(0, 4).arrayBuffer()) : new Uint8Array(4)
    ok('midi', blobs.length > nm && mb.type === 'audio/midi' && String.fromCharCode(...head) === 'MThd' && mb.size > 60)
    ;(q('#ext-audio') as HTMLAudioElement).pause(); await sleep(200)
    setVal(q('#aspect') as HTMLSelectElement, '1'); await sleep(500)
    const nv = blobs.length; q('#btn-video')!.click(); await sleep(3800); q('#btn-video')!.click()
    for (let i = 0; i < 24 && blobs.length === nv; i++) await sleep(250)
    const v = blobs[blobs.length - 1]; ok('video', blobs.length > nv && v.type.includes('webm') && v.size > 2000)
    setVal(q('#aspect') as HTMLSelectElement, '0'); await sleep(500)
    const nj = blobs.length; q('#btn-json')!.click(); await sleep(300); ok('json', blobs.length > nj && blobs[blobs.length - 1].type === 'application/json')
    q('#btn-link')!.click(); await sleep(500); ok('enlace', location.hash.startsWith('#p='))
    ok('local', !!localStorage.getItem('studio.project.v2'))
    setVal(q('#name') as HTMLInputElement, 'zz-autotest'); await sleep(100); q('#save')!.click(); await sleep(1200)
    ok('guardar', (q('#status')!.textContent || '').includes('Guardado') && !!q('[data-load="zz-autotest"]'))
    q('[data-load="dembow-pesado"]')!.click(); await sleep(300); ok('cargar', (q('#bpm-val')!.textContent || '') === '108')
    q('[data-del="zz-autotest"]')!.click(); await sleep(800); ok('borrar', !q('[data-load="zz-autotest"]'))
  } catch (e) { c.error = false; emsg = String((e as Error).message || e).slice(0, 30); console.error(e) }
  if (diag) await fetch('/api/rhythms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'diag ' + diag, bpm: 100, drums: { kick: Array(16).fill(false), snare: Array(16).fill(false), clap: Array(16).fill(false), hat: Array(16).fill(false), ohat: Array(16).fill(false) }, bass: Array(16).fill(-1) }) })
  const bad = Object.keys(c).filter((k) => !c[k]); const name = bad.length ? 'selftest FALLA ' + (emsg ? 'error ' + emsg : bad.join(',')) : 'selftest TODO OK ' + Object.keys(c).length
  const z = () => Array(16).fill(false)
  await fetch('/api/rhythms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.slice(0, 40), bpm: 100, drums: { kick: z(), snare: z(), clap: z(), hat: z(), ohat: z() }, bass: Array(16).fill(-1) }) })
}

if (location.search.includes('selftest')) void run()
export {}

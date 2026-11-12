import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Engine } from './audio'
import { FONTS, PALETTES, SCENES, type Look } from './model'

// Control compartido con la grabación de video: resolución alta y lienzo de composición (3D + branding)
export const vizCtl = { hires: null as [number, number] | null, composite: null as CanvasRenderingContext2D | null, apply: () => {} }

function drawOverlay(c: CanvasRenderingContext2D, W: number, H: number, look: Look, spec: Uint8Array, bass: number, flash: number, col: string[]) {
  c.clearRect(0, 0, W, H)
  if (flash > 0.01) { c.fillStyle = 'rgba(255,255,255,' + (flash * look.flash * 0.5).toFixed(3) + ')'; c.fillRect(0, 0, W, H) }
  if (look.spec > 0) {
    const N = 48; const bw = W / N; const maxH = H * 0.24
    for (let i = 0; i < N; i++) {
      const v = spec[1 + Math.floor(Math.pow(i / N, 1.7) * 420)] / 255; const h = Math.max(2, v * maxH * (1 + bass * 0.35)); const x = i * bw + bw * 0.12; const w = bw * 0.76; const y = H - h - H * 0.02
      c.fillStyle = col[i % 2]
      if (look.spec === 1) c.fillRect(x, y, w, h)
      else {
        const d = w * 0.35
        c.fillRect(x, y, w, h)
        c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.moveTo(x, y); c.lineTo(x + d, y - d); c.lineTo(x + w + d, y - d); c.lineTo(x + w, y); c.fill()
        c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.moveTo(x + w, y); c.lineTo(x + w + d, y - d); c.lineTo(x + w + d, y + h - d); c.lineTo(x + w, y + h); c.fill()
      }
    }
  }
  if (look.artist || look.title) {
    const fs = Math.min(W * 0.075, H * 0.085); const fam = FONTS[look.font].css
    const y0 = look.pos === 0 ? H * 0.1 : look.pos === 1 ? H * 0.48 : look.spec > 0 ? H * 0.64 : H * 0.88
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = fs * 0.25
    if (look.artist) { c.fillStyle = '#ffffff'; c.font = '700 ' + fs + 'px ' + fam; c.fillText(look.artist, W / 2, y0, W * 0.92) }
    if (look.title) { c.fillStyle = col[1]; c.font = '400 ' + fs * 0.6 + 'px ' + fam; c.fillText(look.title, W / 2, y0 + (look.artist ? fs * 0.95 : 0), W * 0.92) }
    c.shadowBlur = 0
  }
}

interface Bands { bass: number; mid: number; treble: number; level: number }
interface Frame { t: number; dt: number; b: Bands; spec: Uint8Array; col: THREE.Color[]; cam: THREE.Camera }
interface Scn { group: THREE.Group; update: (f: Frame) => void; cam: [number, number, number]; target: [number, number, number] }
const rnd = Math.random

function buildOrbital(): Scn {
  const group = new THREE.Group()
  group.add(new THREE.HemisphereLight(0x6677ff, 0x110022, 0.5))
  const key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(3, 4, 5); group.add(key)
  const pA = new THREE.PointLight(0xff2bd6, 14, 14); pA.position.set(-3, 1, 2); group.add(pA)
  const pB = new THREE.PointLight(0x20e0ff, 14, 14); pB.position.set(3, -1, 2); group.add(pB)
  const geo = new THREE.IcosahedronGeometry(1.3, 3); const pos = geo.attributes.position as THREE.BufferAttribute
  const base = new Float32Array(pos.array as Float32Array)
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.6, flatShading: true, emissiveIntensity: 0.6 })
  const sculpt = new THREE.Mesh(geo, mat); group.add(sculpt)
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), new THREE.MeshBasicMaterial({ wireframe: true })); group.add(core)
  const rings: THREE.Mesh[] = []
  for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(2 + i * 0.45, 0.025, 8, 120), new THREE.MeshBasicMaterial()); r.rotation.set(rnd() * 3, rnd() * 3, 0); group.add(r); rings.push(r) }
  const N = 3000; const pp = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) { const rad = 2.8 + rnd() * 3.6; const a = rnd() * 6.283; const ph = Math.acos(2 * rnd() - 1); pp[i * 3] = rad * Math.sin(ph) * Math.cos(a); pp[i * 3 + 1] = rad * Math.cos(ph) * 0.8; pp[i * 3 + 2] = rad * Math.sin(ph) * Math.sin(a) }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3))
  const pm = new THREE.PointsMaterial({ size: 0.03, transparent: true, opacity: 0.8, depthWrite: false }); const pts = new THREE.Points(pg, pm); group.add(pts)
  return {
    group, cam: [0, 0.6, 6.4], target: [0, 0, 0],
    update: ({ t, b, col }) => {
      const arr = pos.array as Float32Array; const breath = Math.sin(t * 1.2) * 0.5 + 0.5
      for (let i = 0; i < base.length; i += 3) {
        const x = base[i], y = base[i + 1], zz = base[i + 2]; const l = Math.hypot(x, y, zz) || 1; const dx = x / l, dy = y / l, dz = zz / l
        const n1 = Math.sin(dx * 2.1 + t * 0.9) * Math.sin(dy * 2.3 - t * 0.7) * Math.sin(dz * 1.9 + t * 0.5)
        const n2 = Math.sin(dx * 7 + t * 3) * Math.sin(dy * 6.5 - t * 2.6) * Math.sin(dz * 7.3 + t * 3.3)
        const k = 1 + 0.06 * breath + b.bass * 0.55 * (0.55 + 0.45 * n1) + b.treble * 0.5 * Math.max(0, n2)
        arr[i] = x * k; arr[i + 1] = y * k; arr[i + 2] = zz * k
      }
      pos.needsUpdate = true; geo.computeVertexNormals()
      mat.color.copy(col[2]).lerp(col[0], Math.min(1, b.treble * 1.5 + 0.2)); mat.emissive.copy(col[2]).multiplyScalar(0.2 + b.bass * 0.3)
      ;(core.material as THREE.MeshBasicMaterial).color.copy(col[1]); pm.color.copy(col[1]); pA.color.copy(col[0]); pB.color.copy(col[1])
      sculpt.rotation.y = t * 0.25 + b.mid * 0.3; sculpt.rotation.x = Math.sin(t * 0.3) * 0.3
      core.rotation.y = -t * 0.8; core.rotation.x = t * 0.5; core.scale.setScalar(0.8 + b.mid * 0.8)
      rings.forEach((r, i) => { (r.material as THREE.MeshBasicMaterial).color.copy(col[i % 2]); r.rotation.z += 0.004 + b.treble * 0.04 * (i + 1); r.rotation.x += 0.002 * (i + 1); r.scale.setScalar(1 + b.bass * 0.35) })
      pts.rotation.y = t * 0.05 + b.mid * 0.2; pm.size = 0.03 + b.treble * 0.07; pA.intensity = 10 + b.bass * 14; pB.intensity = 10 + b.treble * 18
    },
  }
}

function buildTunnel(): Scn {
  const group = new THREE.Group(); const R = 40; const GAP = 3.5
  const og = new THREE.BufferGeometry(); const op: number[] = []
  for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.2832; op.push(Math.cos(a), Math.sin(a), 0) }
  og.setAttribute('position', new THREE.Float32BufferAttribute(op, 3))
  const rings: { l: THREE.LineLoop; z: number }[] = []
  for (let i = 0; i < R; i++) { const l = new THREE.LineLoop(og, new THREE.LineBasicMaterial()); l.position.z = 6 - i * GAP; group.add(l); rings.push({ l, z: l.position.z }) }
  const N = 900; const sp = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) { const a = rnd() * 6.283; const r = 1.5 + rnd() * 2.6; sp[i * 3] = Math.cos(a) * r; sp[i * 3 + 1] = Math.sin(a) * r; sp[i * 3 + 2] = 6 - rnd() * R * GAP }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3))
  const sm = new THREE.PointsMaterial({ size: 0.06, transparent: true, depthWrite: false }); group.add(new THREE.Points(sg, sm))
  return {
    group, cam: [0, 0, 6], target: [0, 0, -30],
    update: ({ t, dt, b, spec, col }) => {
      const speed = 12 + b.level * 30 + b.bass * 22
      rings.forEach((r, i) => {
        r.z += speed * dt; if (r.z > 7) r.z -= R * GAP
        r.l.position.z = r.z
        const w = 3.6 * (1 + b.bass * 0.5 * Math.sin(i * 0.55 - t * 4)); r.l.scale.set(w, w * (1 - b.mid * 0.25 * Math.sin(i - t * 3)), 1)
        r.l.rotation.z = r.z * 0.03 + t * 0.15
        const v = 0.35 + 0.65 * (spec[2 + i * 5] / 255); (r.l.material as THREE.LineBasicMaterial).color.copy(col[i % 2]).multiplyScalar(v)
      })
      const a = sg.attributes.position as THREE.BufferAttribute; const arr = a.array as Float32Array
      for (let i = 0; i < N; i++) { arr[i * 3 + 2] += speed * dt * 1.6; if (arr[i * 3 + 2] > 7) arr[i * 3 + 2] -= R * GAP }
      a.needsUpdate = true; sm.color.copy(col[2]); sm.size = 0.05 + b.treble * 0.1
    },
  }
}

function buildSingularity(): Scn {
  const group = new THREE.Group(); const N = 7000
  const rr = new Float32Array(N); const aa = new Float32Array(N); const yy = new Float32Array(N)
  for (let i = 0; i < N; i++) { rr[i] = 1.7 + Math.pow(rnd(), 1.6) * 5.5; aa[i] = rnd() * 6.283; yy[i] = (rnd() - 0.5) * 0.08 * rr[i] }
  const pos = new Float32Array(N * 3); const colr = new Float32Array(N * 3)
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); dg.setAttribute('color', new THREE.BufferAttribute(colr, 3))
  const dm = new THREE.PointsMaterial({ size: 0.045, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })
  const disk = new THREE.Points(dg, dm); disk.rotation.x = 0.35; group.add(disk)
  const halo = new THREE.Points(dg, dm); halo.rotation.x = Math.PI / 2 + 0.2; halo.scale.setScalar(0.62); group.add(halo)
  group.add(new THREE.Mesh(new THREE.SphereGeometry(1.05, 48, 32), new THREE.MeshBasicMaterial({ color: 0x000000 })))
  const photon = new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.022, 12, 160), new THREE.MeshBasicMaterial()); group.add(photon)
  const sp = new Float32Array(1800 * 3)
  for (let i = 0; i < 1800; i++) { const v = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(60 + rnd() * 40); sp.set([v.x, v.y, v.z], i * 3) }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3))
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, sizeAttenuation: true, transparent: true, opacity: 0.8 })); group.add(stars)
  const tmp = new THREE.Color()
  return {
    group, cam: [0, 2.4, 9.5], target: [0, 0, 0],
    update: ({ t, dt, b, col, cam }) => {
      const spin = 0.6 + b.mid * 3.2
      for (let i = 0; i < N; i++) {
        aa[i] += (2.2 / Math.pow(rr[i], 1.5)) * spin * dt
        pos[i * 3] = Math.cos(aa[i]) * rr[i]; pos[i * 3 + 1] = yy[i]; pos[i * 3 + 2] = Math.sin(aa[i]) * rr[i]
        const k = (rr[i] - 1.7) / 5.5; const dop = 0.4 + 0.6 * (0.5 + 0.5 * Math.cos(aa[i])); const br = dop * (0.5 + b.level * 1.2 + b.treble * 0.6)
        tmp.copy(col[1]).lerp(col[2], Math.min(1, k * 1.2)).lerp(col[0], Math.max(0, 0.5 - k) * b.treble * 2).multiplyScalar(br)
        colr[i * 3] = tmp.r; colr[i * 3 + 1] = tmp.g; colr[i * 3 + 2] = tmp.b
      }
      ;(dg.attributes.position as THREE.BufferAttribute).needsUpdate = true; (dg.attributes.color as THREE.BufferAttribute).needsUpdate = true
      dm.size = 0.04 + b.treble * 0.05; photon.quaternion.copy(cam.quaternion); (photon.material as THREE.MeshBasicMaterial).color.copy(col[0]).multiplyScalar(0.7 + b.treble)
      stars.rotation.y = t * 0.004
    },
  }
}

function buildTerrain(): Scn {
  const group = new THREE.Group(); const W = 56, D = 44, BARS = 48
  group.add(new THREE.HemisphereLight(0x8899ff, 0x110022, 0.6)); const dl = new THREE.DirectionalLight(0xffffff, 0.8); dl.position.set(4, 10, 8); group.add(dl)
  const geo = new THREE.PlaneGeometry(44, 32, W - 1, D - 1); geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position as THREE.BufferAttribute; const H = new Float32Array(W * D)
  const solid = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.65, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })); group.add(solid)
  const wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.55 })); group.add(wire)
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 1, 0.5), new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.3 }), BARS); group.add(bars)
  const dummy = new THREE.Object3D(); const tmp = new THREE.Color(); let acc = 0; let tt = 0
  return {
    group, cam: [0, 8, 24], target: [0, 1, 2],
    update: ({ t, dt, b, spec, col }) => {
      acc += dt; tt = t
      if (acc > 0.045) {
        acc = 0
        for (let r = D - 1; r > 0; r--) for (let c = 0; c < W; c++) H[r * W + c] = H[(r - 1) * W + c]
        for (let c = 0; c < W; c++) {
          const x = Math.abs((c / (W - 1)) * 2 - 1); const bin = 2 + Math.floor(Math.pow(x, 1.4) * 260); const v = Math.pow(spec[bin] / 255, 1.3)
          const m = (0.3 + 0.7 * x) * 3 * (0.5 + 0.5 * Math.sin(c * 0.7 + tt) * Math.sin(c * 0.23 - tt * 0.5)) * (1 + b.bass)
          H[c] = v * (3 + 5 * b.bass) + m
        }
        for (let r = 0; r < D; r++) for (let c = 0; c < W; c++) pos.setY(r * W + c, H[r * W + c])
        pos.needsUpdate = true; geo.computeVertexNormals()
      }
      ;(solid.material as THREE.MeshStandardMaterial).color.copy(col[2]).multiplyScalar(0.55); (wire.material as THREE.MeshBasicMaterial).color.copy(col[0])
      for (let i = 0; i < BARS; i++) {
        const bin = 1 + Math.floor(Math.pow(i / BARS, 1.8) * 420); const v = spec[bin] / 255; const h = 0.12 + v * 5
        dummy.position.set(-12 + (i / (BARS - 1)) * 24, h / 2, 17); dummy.scale.set(1, h, 1); dummy.updateMatrix(); bars.setMatrixAt(i, dummy.matrix)
        bars.setColorAt(i, tmp.copy(col[0]).lerp(col[1], i / BARS))
      }
      bars.instanceMatrix.needsUpdate = true; if (bars.instanceColor) bars.instanceColor.needsUpdate = true
    },
  }
}

export function Visualizer({ engine, scene, palette, look }: { engine: Engine; scene: number; palette: number; look: Look }) {
  const host = useRef<HTMLDivElement>(null)
  const hud = useRef<HTMLDivElement>(null)
  const ov = useRef<HTMLCanvasElement>(null)
  const sel = useRef({ scene, palette, look }); sel.current = { scene, palette, look }

  useEffect(() => {
    const el = host.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9
    el.prepend(renderer.domElement)
    const world = new THREE.Scene(); world.background = new THREE.Color(0x06040d); world.fog = new THREE.FogExp2(0x06040d, 0.02)
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400)
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = 0.08
    const scns = [buildOrbital(), buildTunnel(), buildSingularity(), buildTerrain()]
    scns.forEach((s) => { s.group.visible = false; world.add(s.group) })
    const col = [new THREE.Color(), new THREE.Color(), new THREE.Color()]
    let curScene = -1; let curPal = -1
    const octx = ov.current!.getContext('2d')!
    const resize = () => {
      const hr = vizCtl.hires; const w = hr ? hr[0] : Math.max(1, el.clientWidth), h = hr ? hr[1] : Math.max(1, el.clientHeight)
      renderer.setPixelRatio(hr ? 1 : Math.min(window.devicePixelRatio, 2)); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix()
      ov.current!.width = renderer.domElement.width; ov.current!.height = renderer.domElement.height
    }
    vizCtl.apply = resize
    const rgb = [new THREE.Color(), new THREE.Color()]; let flash = 0; let prevBass = 0
    const ro = new ResizeObserver(resize); ro.observe(el); resize()
    const sm = { bass: 0, mid: 0, treble: 0, level: 0 }; let last = performance.now(); let frame = 0; let raf = 0; let t = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt
      const s = sel.current
      if (s.palette !== curPal) { curPal = s.palette; const P = PALETTES[s.palette]; P.c.forEach((c, i) => col[i].set(c)); ;(world.background as THREE.Color).set(P.bg); world.fog!.color.set(P.bg) }
      if (s.scene !== curScene) {
        curScene = s.scene; scns.forEach((sc, i) => { sc.group.visible = i === curScene })
        const sc = scns[curScene]; camera.position.set(...sc.cam); controls.target.set(...sc.target); controls.update()
        ;(world.fog as THREE.FogExp2).density = curScene === 2 ? 0.0 : curScene === 1 ? 0.018 : 0.02
      }
      const b = engine.getBands(); const spec = engine.getSpectrum()
      sm.bass += (b.bass - sm.bass) * (b.bass > sm.bass ? 0.55 : 0.1); sm.mid += (b.mid - sm.mid) * (b.mid > sm.mid ? 0.4 : 0.1)
      sm.treble += (b.treble - sm.treble) * (b.treble > sm.treble ? 0.6 : 0.15); sm.level += (b.level - sm.level) * 0.2
      scns[curScene].update({ t, dt, b: sm, spec, col, cam: camera })
      controls.update()
      const lk = s.look; const rawBass = b.bass
      if (rawBass - prevBass > 0.12 && rawBass > 0.4) flash = 1
      prevBass = rawBass; flash *= 0.86
      const sh = lk.shake * sm.bass * 0.16 * (1 + camera.position.length() * 0.05); const ox = (rnd() - 0.5) * sh, oy = (rnd() - 0.5) * sh, oz = (rnd() - 0.5) * sh
      camera.position.x += ox; camera.position.y += oy; camera.position.z += oz
      renderer.render(world, camera)
      camera.position.x -= ox; camera.position.y -= oy; camera.position.z -= oz
      frame++
      rgb[0].copy(col[0]); rgb[1].copy(col[1])
      drawOverlay(octx, ov.current!.width, ov.current!.height, lk, spec, sm.bass, flash, [rgb[0].getStyle(), rgb[1].getStyle()])
      const cc = vizCtl.composite
      if (cc) { cc.drawImage(renderer.domElement, 0, 0, cc.canvas.width, cc.canvas.height); cc.drawImage(ov.current!, 0, 0, cc.canvas.width, cc.canvas.height) }
      if (frame % 6 === 0) {
        el.dataset.frames = String(frame); el.dataset.bass = sm.bass.toFixed(2); el.dataset.treble = sm.treble.toFixed(2); el.dataset.scene = String(curScene)
        if (hud.current) hud.current.textContent = SCENES[curScene] + ' · Graves ' + sm.bass.toFixed(2) + ' · Medios ' + sm.mid.toFixed(2) + ' · Agudos ' + sm.treble.toFixed(2)
      }
    }
    loop()
    return () => {
      vizCtl.apply = () => {}; cancelAnimationFrame(raf); ro.disconnect(); controls.dispose()
      world.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; if (mt) (Array.isArray(mt) ? mt : [mt]).forEach((x) => x.dispose()) })
      renderer.dispose(); if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement)
    }
  }, [engine])

  return (
    <div className="viz" ref={host} id="viz" style={{ ['--ar' as string]: String(look.aspect === 1 ? 9 / 16 : look.aspect === 2 ? 1 : 16 / 9) }}>
      <canvas ref={ov} className="ov" id="ov" /><div className="hud" ref={hud} id="hud">Visualizador listo</div>
    </div>
  )
}
